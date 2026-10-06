import { fromMinorUnits } from "@/lib/money";
import { getCurrency } from "@/lib/currencies";
import { normalizeVoiceLanguages } from "@/lib/voice-languages";
import { serializeTxnTag, type TxnTagDTO } from "@/lib/tags";
import type { AttachmentDTO } from "@/lib/attachments";
import type { TransactionRow } from "@/lib/queries";
import type { WorkspaceSummary } from "@/lib/workspaces";
import type { WorkspaceUsage } from "@/lib/entitlements";
import type { PersonalPlan } from "@/lib/plans";
import type { OrganizationOverview } from "@/services/organizations";
import type { SpaceAccess, SpaceSummary } from "@/services/spaces";
import type {
  AddedPerson,
  SplitGroupDetail,
  SplitGroupSummary,
  SplitInvitation,
  SplitMemberView,
} from "@/services/split";
import type { SplitExpenseView, SplitSettlementView } from "@/services/split-ledger";
import type { SettlementSuggestion } from "@/lib/split-math";
import { fromBasisPoints } from "@/lib/split-math";
import type {
  Category,
  Profile,
  ProfileAccessLevel,
  SpaceRole,
  Tag,
  UserSettings,
  WorkspaceRole,
} from "@/db/schema";

/**
 * Row → API DTO mappers. Routes serialize through these so the wire shape
 * stays stable and matches the OpenAPI spec. The DB stores money as integer
 * minor units (the source of truth, `amountMinor`); we also emit `amount` as a
 * major-unit string so the Flutter client can display without re-deriving the
 * currency's decimal count.
 */

/**
 * Timestamps come back from drizzle as `Date` (`mode:'date'`), but every
 * serializer guards the same way so a driver that ever hands back a string
 * can't 500 one endpoint while the others keep working.
 */
function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

export type ApiTransaction = {
  id: string;
  type: "income" | "expense";
  amountMinor: number;
  amount: string;
  title: string | null;
  description: string | null;
  occurredOn: string;
  createdAt: string;
  category: { id: string; name: string | null; icon: string | null } | null;
  profile: { id: string; name: string | null; icon: string | null };
  /** Author attribution (who entered the row) — matters in shared workspaces. */
  user: { id: string; name: string | null; email: string | null };
  /** Files attached to the transaction (receipts/bills/invoices), oldest-first.
   * Fetch bytes via `GET /attachments/{id}/url`. Empty array when none. */
  attachments: AttachmentDTO[];
  /** The tags on this transaction, by name. Workspace-scoped entities, embedded
   * here (not just as ids) so a client can render the chips without a second
   * request. Empty array when none. */
  tags: TxnTagDTO[];
};

export function serializeTransaction(row: TransactionRow, currency: string): ApiTransaction {
  const decimals = getCurrency(currency).decimals;
  return {
    id: row.id,
    type: row.type,
    amountMinor: row.amountMinor,
    amount: fromMinorUnits(row.amountMinor, currency).toFixed(decimals),
    title: row.title,
    description: row.description,
    occurredOn: row.occurredOn,
    createdAt: toIso(row.createdAt),
    category: row.categoryId
      ? { id: row.categoryId, name: row.categoryName, icon: row.categoryIcon }
      : null,
    profile: { id: row.profileId, name: row.profileName, icon: row.profileIcon },
    user: { id: row.userId, name: row.userName, email: row.userEmail },
    attachments: row.attachments,
    tags: row.tags,
  };
}

export type ApiTag = TxnTagDTO;

export function serializeApiTag(row: Tag): ApiTag {
  return serializeTxnTag(row);
}

export type ApiCategory = {
  id: string;
  name: string;
  kind: "income" | "expense";
  icon: string | null;
  createdAt: string;
  updatedAt: string;
};

export function serializeCategory(c: Category): ApiCategory {
  return {
    id: c.id,
    name: c.name,
    kind: c.kind,
    icon: c.icon,
    createdAt: toIso(c.createdAt),
    updatedAt: toIso(c.updatedAt),
  };
}

/**
 * What the caller can do on a profile, in the words the app's UI uses:
 * `read` (viewer), `write` (editor — add/edit transactions), `admin` (manage
 * the profile). In a view-only workspace every profile reads `read`.
 */
export type ApiProfileAccess = "read" | "write" | "admin";

export function profileAccessFor(role: WorkspaceRole): ApiProfileAccess {
  return role === "admin" ? "admin" : role === "editor" ? "write" : "read";
}

export type ApiProfile = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  sortOrder: number;
  /** The space the profile lives in (6.5.0). */
  spaceId: string;
  /** The caller's effective access on this profile (6.5.0). */
  access: ApiProfileAccess;
  createdAt: string;
  updatedAt: string;
};

/** `role` is the caller's effective role on this profile (`profileRolesFor` / `getEffectiveProfileRole`). */
export function serializeProfile(p: Profile, role: WorkspaceRole): ApiProfile {
  return {
    id: p.id,
    name: p.name,
    icon: p.icon,
    color: p.color,
    sortOrder: p.sortOrder,
    spaceId: p.spaceId,
    access: profileAccessFor(role),
    createdAt: toIso(p.createdAt),
    updatedAt: toIso(p.updatedAt),
  };
}

/** One member's per-profile override (`GET/PUT /profiles/{id}/overrides`). */
export type ApiProfileOverride = { userId: string; access: ProfileAccessLevel };

export function serializeProfileOverride(o: {
  userId: string;
  access: ProfileAccessLevel;
}): ApiProfileOverride {
  return { userId: o.userId, access: o.access };
}

/** A space — the middle of workspace → space → profile, and the unit of sharing. */
export type ApiSpace = {
  id: string;
  name: string;
  icon: string | null;
  position: number;
  /** Every profile in the space (what the per-space cap counts), not just the visible ones. */
  profileCount: number;
  /** "admin" for workspace admins; else the caller's space role, or null (reached via an override/grant). */
  role: WorkspaceRole | null;
};

export function serializeSpace(s: SpaceSummary): ApiSpace {
  return {
    id: s.id,
    name: s.name,
    icon: s.icon,
    position: s.position,
    profileCount: s.profileCount,
    role: s.role,
  };
}

/** The "Members & access" view of one space (admin). */
export type ApiSpaceAccess = {
  space: { id: string; name: string; icon: string | null; workspaceId: string };
  members: {
    userId: string;
    name: string | null;
    email: string | null;
    workspaceRole: WorkspaceRole;
    /** null when not in the space — and always null for admins, who see every space. */
    spaceRole: SpaceRole | null;
    isOwner: boolean;
  }[];
  profiles: { id: string; name: string; icon: string | null }[];
  overrides: { profileId: string; userId: string; access: ProfileAccessLevel }[];
  /** Whether the plan lets overrides be changed (Plus/Pro). Existing ones always apply. */
  canEditOverrides: boolean;
};

export function serializeSpaceAccess(a: SpaceAccess): ApiSpaceAccess {
  return {
    space: {
      id: a.space.id,
      name: a.space.name,
      icon: a.space.icon,
      workspaceId: a.space.workspaceId,
    },
    members: a.members.map((m) => ({
      userId: m.userId,
      name: m.name,
      email: m.email,
      workspaceRole: m.workspaceRole,
      spaceRole: m.spaceRole,
      isOwner: m.isOwner,
    })),
    profiles: a.profiles.map((p) => ({ id: p.id, name: p.name, icon: p.icon })),
    overrides: a.overrides.map((o) => ({
      profileId: o.profileId,
      userId: o.userId,
      access: o.access,
    })),
    canEditOverrides: a.canEditOverrides,
  };
}

/**
 * User settings that follow the user across workspaces. Currency + number format
 * moved to the workspace (see `ApiWorkspace`) — they are no longer here.
 */
export type ApiSettings = {
  theme: string;
  inputMode: string;
  /** ISO 639-1 codes voice entry is told to expect (normalized; never empty). */
  voiceLanguages: string[];
};

export function serializeSettings(s: UserSettings): ApiSettings {
  return {
    theme: s.theme,
    inputMode: s.inputMode,
    voiceLanguages: normalizeVoiceLanguages(s.voiceLanguages),
  };
}

/**
 * A workspace the caller can open, including its currency + number format
 * (which every member shares). `currencyDetail` saves the client re-deriving the
 * decimal count. `role` is null when access is via a per-profile grant only.
 */
export type ApiWorkspace = {
  id: string;
  name: string;
  /** Emoji shown beside the name; null when unset. */
  icon: string | null;
  role: WorkspaceSummary["role"];
  currency: string;
  locale: string;
  currencyDetail: { code: string; symbol: string; decimals: number };
  /** The workspace's plan — every limit is per workspace (6.5.0). */
  plan: PersonalPlan;
  /** The organisation that holds it (6.5.0). */
  organizationId: string;
};

export function serializeWorkspace(w: WorkspaceSummary): ApiWorkspace {
  const c = getCurrency(w.currency);
  return {
    id: w.id,
    name: w.name,
    icon: w.icon,
    role: w.role,
    currency: w.currency,
    locale: w.locale,
    currencyDetail: { code: c.code, symbol: c.symbol, decimals: c.decimals },
    plan: w.plan,
    organizationId: w.organizationId,
  };
}

/** The caller's personal organisation and the workspaces in it. */
export type ApiOrganization = {
  id: string;
  name: string;
  kind: "personal" | "business";
  owner: { id: string; name: string | null; email: string | null };
  workspaces: {
    id: string;
    name: string;
    icon: string | null;
    plan: PersonalPlan;
    /** An extra free workspace (the owner has an older free one) — view-only until upgraded. */
    readOnly: boolean;
    /** Whether the caller can open it (send it as `X-Workspace-Id`). */
    canOpen: boolean;
  }[];
};

export function serializeOrganization(o: OrganizationOverview): ApiOrganization {
  return {
    id: o.id,
    name: o.name,
    kind: o.kind,
    owner: { id: o.owner.id, name: o.owner.name, email: o.owner.email },
    workspaces: o.workspaces.map((w) => ({
      id: w.id,
      name: w.name,
      icon: w.icon,
      plan: w.plan,
        readOnly: w.readOnly,
      canOpen: w.canOpen,
    })),
  };
}

/** A counted limit: how much is in use against the plan's cap. */
export type ApiMeter = { used: number; limit: number };

/** Everything the plan allows the current workspace, and how much of it is used. */
export type ApiUsage = {
  plan: PersonalPlan;
  readOnly: boolean;
  ai: {
    used: number;
    limit: number;
    remaining: number;
    topUpRemaining: number;
    /** ISO 8601 — the first instant of next month (UTC). */
    resetsAt: string;
  };
  storage: { usedBytes: number; limitBytes: number };
  members: ApiMeter;
  spaces: ApiMeter;
  categories: ApiMeter;
  tags: ApiMeter;
  profilesPerSpace: number;
  voice: boolean;
  profileLevelAccess: boolean;
};

export function serializeUsage(u: WorkspaceUsage): ApiUsage {
  const meter = (m: { used: number; limit: number }): ApiMeter => ({ used: m.used, limit: m.limit });
  return {
    plan: u.plan,
    readOnly: u.readOnly,
    ai: {
      used: u.ai.used,
      limit: u.ai.limit,
      remaining: u.ai.remaining,
      topUpRemaining: u.ai.topUpRemaining,
      resetsAt: u.ai.resetsAt,
    },
    storage: { usedBytes: u.storage.usedBytes, limitBytes: u.storage.limitBytes },
    members: meter(u.members),
    spaces: meter(u.spaces),
    categories: meter(u.categories),
    tags: meter(u.tags),
    profilesPerSpace: u.profilesPerSpace,
    voice: u.voice,
    profileLevelAccess: u.profileLevelAccess,
  };
}

/* -------------------------------------------------------------------------- */
/* Split (6.9.0) — user-scoped groups, every amount in the group's currency    */
/* -------------------------------------------------------------------------- */

/** A major-unit string for minor units, at the currency's decimals ("-12.50" when owed). */
function majorString(minor: number, currency: string): string {
  return fromMinorUnits(minor, currency).toFixed(getCurrency(currency).decimals);
}

export type ApiSplitGroup = {
  id: string;
  name: string;
  icon: string | null;
  currency: string;
  isCreator: boolean;
  peopleCount: number;
  /** The caller's balance: positive = is owed, negative = owes. */
  myBalanceMinor: number;
  myBalance: string;
  createdAt: string;
};

export function serializeSplitGroup(g: SplitGroupSummary): ApiSplitGroup {
  return {
    id: g.id,
    name: g.name,
    icon: g.icon,
    currency: g.currency,
    isCreator: g.isCreator,
    peopleCount: g.peopleCount,
    myBalanceMinor: g.myNetMinor,
    myBalance: majorString(g.myNetMinor, g.currency),
    createdAt: toIso(g.createdAt),
  };
}

export type ApiSplitMember = {
  id: string;
  name: string;
  /** Only for the group's creator, and on the caller's own row; null otherwise. */
  email: string | null;
  status: "invited" | "joined" | "left";
  isCreator: boolean;
  isYou: boolean;
  balanceMinor: number;
  balance: string;
  /** Creator only (null for everyone else): whether their one invite email went. */
  invitedByEmail: boolean | null;
};

export function serializeSplitMember(m: SplitMemberView, currency: string): ApiSplitMember {
  return {
    id: m.id,
    name: m.name,
    email: m.email,
    status: m.status,
    isCreator: m.isCreator,
    isYou: m.isYou,
    balanceMinor: m.netMinor,
    balance: majorString(m.netMinor, currency),
    invitedByEmail: m.invitedByEmail,
  };
}

export type ApiSplitSuggestion = {
  fromMemberId: string;
  toMemberId: string;
  amountMinor: number;
  amount: string;
};

function serializeSplitSuggestion(s: SettlementSuggestion, currency: string): ApiSplitSuggestion {
  return {
    fromMemberId: s.fromMemberId,
    toMemberId: s.toMemberId,
    amountMinor: s.amountMinor,
    amount: majorString(s.amountMinor, currency),
  };
}

export type ApiSplitGroupDetail = {
  id: string;
  name: string;
  icon: string | null;
  currency: string;
  createdAt: string;
  updatedAt: string;
  me: { memberId: string; isCreator: boolean };
  members: ApiSplitMember[];
  suggestions: ApiSplitSuggestion[];
  peopleCount: number;
  maxPeople: number;
  hasActivity: boolean;
};

export function serializeSplitGroupDetail(d: SplitGroupDetail): ApiSplitGroupDetail {
  const currency = d.group.currency;
  return {
    id: d.group.id,
    name: d.group.name,
    icon: d.group.icon,
    currency,
    createdAt: toIso(d.group.createdAt),
    updatedAt: toIso(d.group.updatedAt),
    me: d.me,
    members: d.members.map((m) => serializeSplitMember(m, currency)),
    suggestions: d.suggestions.map((s) => serializeSplitSuggestion(s, currency)),
    peopleCount: d.peopleCount,
    maxPeople: d.maxPeople,
    hasActivity: d.hasActivity,
  };
}

export type ApiSplitAddedPerson = AddedPerson;

/** What happened to each person an add named (returned to the creator only). */
export function serializeSplitAdded(added: AddedPerson[]): ApiSplitAddedPerson[] {
  return added.map((a) => ({ memberId: a.memberId, email: a.email, delivery: a.delivery }));
}

export type ApiSplitExpense = {
  id: string;
  title: string;
  amountMinor: number;
  amount: string;
  splitType: "equal" | "exact" | "percent";
  occurredOn: string;
  createdAt: string;
  updatedAt: string;
  paidBy: { memberId: string; name: string };
  shares: {
    memberId: string;
    name: string;
    amountMinor: number;
    amount: string;
    /** Percent splits only: the percent entered (e.g. 33.34). */
    percent: number | null;
  }[];
  canEdit: boolean;
  myShare: {
    shareId: string;
    amountMinor: number;
    amount: string;
    added: boolean;
    addedAt: string | null;
  } | null;
};

export function serializeSplitExpense(e: SplitExpenseView, currency: string): ApiSplitExpense {
  return {
    id: e.id,
    title: e.title,
    amountMinor: e.amountMinor,
    amount: majorString(e.amountMinor, currency),
    splitType: e.splitType,
    occurredOn: e.occurredOn,
    createdAt: toIso(e.createdAt),
    updatedAt: toIso(e.updatedAt),
    paidBy: e.paidBy,
    shares: e.shares.map((s) => ({
      memberId: s.memberId,
      name: s.name,
      amountMinor: s.amountMinor,
      amount: majorString(s.amountMinor, currency),
      percent: s.percentBp === null ? null : fromBasisPoints(s.percentBp),
    })),
    canEdit: e.canEdit,
    myShare: e.myShare
      ? {
          shareId: e.myShare.shareId,
          amountMinor: e.myShare.amountMinor,
          amount: majorString(e.myShare.amountMinor, currency),
          added: e.myShare.added,
          addedAt: e.myShare.addedAt ? toIso(e.myShare.addedAt) : null,
        }
      : null,
  };
}

export type ApiSplitSettlement = {
  id: string;
  from: { memberId: string; name: string };
  to: { memberId: string; name: string };
  amountMinor: number;
  amount: string;
  settledOn: string;
  createdAt: string;
  canDelete: boolean;
};

export function serializeSplitSettlement(s: SplitSettlementView, currency: string): ApiSplitSettlement {
  return {
    id: s.id,
    from: s.from,
    to: s.to,
    amountMinor: s.amountMinor,
    amount: majorString(s.amountMinor, currency),
    settledOn: s.settledOn,
    createdAt: toIso(s.createdAt),
    canDelete: s.canDelete,
  };
}

export type ApiSplitInvitation = {
  memberId: string;
  groupId: string;
  groupName: string;
  groupIcon: string | null;
  currency: string;
  inviterName: string | null;
  peopleCount: number;
  invitedAt: string;
};

export function serializeSplitInvitation(i: SplitInvitation): ApiSplitInvitation {
  return {
    memberId: i.memberId,
    groupId: i.groupId,
    groupName: i.groupName,
    groupIcon: i.groupIcon,
    currency: i.currency,
    inviterName: i.inviterName,
    peopleCount: i.peopleCount,
    invitedAt: toIso(i.invitedAt),
  };
}
