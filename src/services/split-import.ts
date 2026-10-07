import "server-only";
import { and, eq, gt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { splitExpenses, splitGroups, splitMembers, splitShares, users } from "@/db/schema";
import { parseOrThrow } from "@/lib/api-response";
import type { SessionUser } from "@/lib/auth";
import { CONVERTED_FROM_MAX_ACCOUNT_AGE_DAYS, type ConvertedFrom } from "@/lib/attribution";
import { findUserById } from "@/lib/directory";
import { emailKey } from "@/lib/email-key";
import { conflict, isUniqueViolation, tooManyRequests, validationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { mapImportExpense } from "@/lib/split-import";
import { splitExpenseSchema, splitImportSchema, SPLIT_MEMBER_NAME_MAX } from "@/lib/validation";
import { emailNewInvitees } from "@/services/split-invites";
import { groupMembers, insertPeople, type AddedPerson, type JoinedContext } from "@/services/split";
import { planExpense, percentFor } from "@/services/split-ledger";
import { actorEventsToday, lockActor, logActorEvents, SPLIT_GROUPS_PER_DAY } from "@/services/split-rate";

/**
 * Bring a group in from the free split calculator (`/tools/split-bill-calculator`)
 * after the visitor signs up — the server half of `/app/split/import`.
 *
 * One transaction: the group, its people and every expense land together or
 * not at all, so a refusal halfway (a full inbox, a sum that doesn't add up)
 * never leaves a half-made group behind. It goes through the same rules as
 * building the group by hand, using the same code:
 * - the daily cap on new groups (`SPLIT_GROUPS_PER_DAY`, counted in the rate log);
 * - `insertPeople` for everyone else — the 50-person cap, the per-day adds, the
 *   open-invitations-per-inbox cap, "you're already in the group";
 * - `splitExpenseSchema` + `planExpense` for every expense — the app's own
 *   validation and its own share maths, after the draft's person keys are
 *   swapped for member ids (`lib/split-import.ts`).
 * The caller becomes the creator, exactly as with "New group". Invite emails
 * go out only after the commit, as `createGroup` does.
 */

export type SplitImportResult = { groupId: string; added: AddedPerson[]; expenses: number };

/** The creator's label: their account name, else the name the draft gave them. */
function creatorName(account: string | null | undefined, draft: string): string {
  return (account?.trim() || draft.trim()).slice(0, SPLIT_MEMBER_NAME_MAX);
}

export async function importSplitDraft(
  user: Pick<SessionUser, "id">,
  input: unknown,
): Promise<SplitImportResult> {
  const data = parseOrThrow(splitImportSchema, input);
  const account = await findUserById(user.id);
  const creatorEmail = account?.email?.trim().toLowerCase() ?? null;
  const db = getDb();

  const result = await db
    .transaction(async (tx) => {
      await lockActor(tx, user.id);
      if ((await actorEventsToday(tx, user.id, "group_created")) >= SPLIT_GROUPS_PER_DAY) {
        throw tooManyRequests(`You can start up to ${SPLIT_GROUPS_PER_DAY} groups a day — try again tomorrow`);
      }
      await logActorEvents(tx, user.id, "group_created", 1);

      const [group] = await tx
        .insert(splitGroups)
        .values({
          name: data.name,
          icon: data.icon?.trim() ? data.icon.trim() : null,
          currency: data.currency,
          createdBy: user.id,
        })
        .returning();
      const [me] = await tx
        .insert(splitMembers)
        .values({
          groupId: group!.id,
          userId: user.id,
          email: creatorEmail,
          emailKey: creatorEmail ? emailKey(creatorEmail) : null,
          displayName: creatorName(account?.name, data.me.name),
          status: "joined",
          joinedAt: new Date(),
        })
        .returning();

      const people = await insertPeople(
        tx,
        group!,
        creatorEmail,
        data.people.map((p) => ({ email: p.email, name: p.name })),
        user.id,
      );
      // `insertPeople` answers in the order it was given people, and a new
      // group has nobody "already" in it — so the i-th answer is the i-th person.
      const idByRef = new Map<string, string>([[data.me.ref, me!.id]]);
      data.people.forEach((p, i) => idByRef.set(p.ref, people.added[i]!.memberId));

      const ctx: JoinedContext = {
        group: group!,
        me: me!,
        viewer: { userId: user.id, memberId: me!.id, isCreator: true },
      };
      const members = await groupMembers(group!.id, tx);
      const planned = data.expenses.map((raw, i) => {
        const mapped = mapImportExpense(raw, (ref) => idByRef.get(ref));
        if (!mapped) throw validationError(`Expense ${i + 1} names someone who isn't in the group`);
        const expense = parseOrThrow(splitExpenseSchema, mapped);
        return { expense, plan: planExpense(ctx, members, expense) };
      });

      // One row per expense (each needs its id back), then every share at once.
      const shareRows: (typeof splitShares.$inferInsert)[] = [];
      for (const { expense, plan } of planned) {
        const [row] = await tx
          .insert(splitExpenses)
          .values({
            groupId: group!.id,
            title: expense.title,
            amountMinor: plan.totalMinor,
            paidByMemberId: expense.paidBy,
            splitType: expense.splitType,
            occurredOn: expense.occurredOn,
            createdBy: user.id,
          })
          .returning({ id: splitExpenses.id });
        for (const s of plan.shares) {
          shareRows.push({
            expenseId: row!.id,
            memberId: s.memberId,
            amountMinor: s.amountMinor,
            percentBp: percentFor(plan.spec, s.memberId),
          });
        }
      }
      if (shareRows.length) await tx.insert(splitShares).values(shareRows);

      await tagConvertedSignup(tx, user.id, "tool:split");
      return { groupId: group!.id, added: people.added, pendingIds: people.pendingIds, expenses: planned.length };
    })
    .catch((err: unknown) => {
      // Someone's account is already bound to another row of the group.
      if (isUniqueViolation(err)) throw conflict("That person is already in the group");
      throw err;
    });

  await emailNewInvitees(user.id, result.groupId, result.pendingIds);
  logger.info(
    `Split group brought in from the free calculator with ${result.added.length} people invited and ${result.expenses} expenses`,
    {
      event: "split.draft_imported",
      groupId: result.groupId,
      invited: result.added.length,
      expenses: result.expenses,
    },
  );
  return { groupId: result.groupId, added: result.added, expenses: result.expenses };
}

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/**
 * Record on `users.acquisition` that this account came from a free tool
 * (`convertedFrom`, the rule documented in `lib/attribution.ts`) — once, and
 * only for an account young enough that the tool is plausibly why it exists.
 * Server-side on purpose, like `invitedVia`: the import is the proof.
 */
async function tagConvertedSignup(tx: Tx, userId: string, from: ConvertedFrom): Promise<void> {
  await tx
    .update(users)
    .set({
      acquisition: sql`
        coalesce(${users.acquisition}, '{}'::jsonb) || jsonb_build_object(
          'convertedFrom', ${from}::text,
          'convertedAt', ${new Date().toISOString()}::text
        )`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(users.id, userId),
        sql`${users.acquisition} ->> 'convertedFrom' is null`,
        gt(users.createdAt, new Date(Date.now() - CONVERTED_FROM_MAX_ACCOUNT_AGE_DAYS * 24 * 60 * 60 * 1000)),
      ),
    );
}
