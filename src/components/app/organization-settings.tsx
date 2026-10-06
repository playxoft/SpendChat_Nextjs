"use client";

import * as React from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { renameOrganization } from "@/actions/organizations";
import { switchWorkspace } from "@/actions/workspaces";
import { ORGANIZATION_NAME_MAX } from "@/lib/validation";
import type { PersonalPlan } from "@/lib/plans";
import { useLoadingOverlay } from "./loading-overlay";
import { PlanBadge } from "./plan-badge";
import { usePlan } from "./upgrade-dialog";

/**
 * Settings → Organisation: the top of organisation → workspace → space →
 * profile. Every account has one personal organisation holding the workspaces
 * it owns; plans belong to each workspace, so this page is mostly a list —
 * each workspace with its plan, whether it's view-only, and a way to open it.
 */

/** The shape `getMyOrganization` returns (kept structural — services are server-only). */
export type OrganizationData = {
  id: string;
  name: string;
  owner: { id: string; name: string | null; email: string | null };
  workspaces: {
    id: string;
    name: string;
    icon: string | null;
    plan: PersonalPlan;
    grandfathered: boolean;
    readOnly: boolean;
    canOpen: boolean;
  }[];
};

export function OrganizationSettings({
  organization,
  currentWorkspaceId,
}: {
  organization: OrganizationData;
  currentWorkspaceId: string;
}) {
  const router = useRouter();
  const { run } = useLoadingOverlay();
  const { reportFailure, showUpgrade } = usePlan();
  const [pending, startTransition] = useTransition();
  const [name, setName] = React.useState(organization.name);
  const changed = name.trim() !== organization.name && name.trim().length > 0;

  function handleRename(e: React.FormEvent) {
    e.preventDefault();
    if (!changed) return;
    startTransition(async () => {
      const res = await renameOrganization(name.trim());
      if (res.ok) {
        toast.success("Organisation renamed");
        router.refresh();
      } else {
        reportFailure(res);
      }
    });
  }

  function open(id: string) {
    if (id === currentWorkspaceId) {
      router.push("/app");
      return;
    }
    run(
      async () => {
        const res = await switchWorkspace(id);
        if (res.ok) {
          router.push("/app");
          router.refresh();
        } else {
          reportFailure(res);
        }
      },
      "Switching workspace…",
      { variant: "spinner" },
    );
  }

  const owner = organization.owner;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Organisation</CardTitle>
          <CardDescription>
            Your organisation holds every workspace you own. Each workspace has its own plan.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <form onSubmit={handleRename} className="flex max-w-md items-end gap-2">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Label htmlFor="organization-name">Name</Label>
              <Input
                id="organization-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={ORGANIZATION_NAME_MAX}
              />
            </div>
            <Button type="submit" variant="secondary" disabled={pending || !changed}>
              Save
            </Button>
          </form>
          <div className="space-y-1">
            <p className="text-sm font-medium">Owner</p>
            <p className="text-sm">
              {owner.name ?? owner.email ?? "You"}
              {owner.name && owner.email && (
                <span className="text-muted-foreground"> · {owner.email}</span>
              )}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Workspaces</CardTitle>
          <CardDescription>
            You can have one free workspace. Each extra one needs its own Plus or Pro plan —
            until then it&apos;s view-only, and nothing in it is deleted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {organization.workspaces.length === 0 ? (
            <p className="text-sm text-muted-foreground">No workspaces yet.</p>
          ) : (
            <ul className="divide-y">
              {organization.workspaces.map((w) => {
                const current = w.id === currentWorkspaceId;
                return (
                  <li key={w.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent">
                      {w.icon ? (
                        <span aria-hidden className="text-base leading-none">
                          {w.icon}
                        </span>
                      ) : (
                        <Building2 aria-hidden className="size-4" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        <span className="truncate">{w.name}</span>
                        <PlanBadge plan={w.plan} />
                        {w.readOnly && <Badge variant="outline">View-only</Badge>}
                        {current && (
                          <span className="text-xs font-normal text-muted-foreground">
                            Current
                          </span>
                        )}
                      </p>
                      {w.readOnly ? (
                        <p className="text-xs text-muted-foreground">
                          An extra free workspace — upgrade it to keep adding.{" "}
                          <button
                            type="button"
                            className="underline underline-offset-2 hover:text-foreground"
                            onClick={() =>
                              showUpgrade({
                                limit: "freeWorkspaces",
                                plan: w.plan,
                                upgradeTo: "plus",
                              })
                            }
                          >
                            See what&apos;s included
                          </button>
                        </p>
                      ) : w.grandfathered ? (
                        <p className="text-xs text-muted-foreground">
                          Grandfathered — it keeps everything it had while plans roll out.
                        </p>
                      ) : null}
                    </div>
                    {w.canOpen && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => open(w.id)}
                        aria-label={`Open ${w.name}`}
                      >
                        Open
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
