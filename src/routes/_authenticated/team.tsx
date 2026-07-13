import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, UserPlus, X, Check, Pencil } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { usePlan } from "@/lib/use-plan";
import { UpgradeModal } from "@/components/UpgradeModal";
import { useMyTeam } from "@/lib/use-team";
import {
  createMyTeam,
  inviteTeamMember,
  updateMemberRole,
  removeMember,
  updateTeamName,
} from "@/lib/team.functions";

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({ meta: [{ title: "Team — Snapsure" }] }),
  component: TeamPage,
});

function TeamPage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: plan, isLoading: planLoading } = usePlan(user.id);
  const isAgency = plan === "agency";
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  useEffect(() => {
    if (!planLoading && !isAgency) setUpgradeOpen(true);
  }, [planLoading, isAgency]);

  const { data, isLoading, refetch } = useMyTeam(isAgency);
  const createTeam = useServerFn(createMyTeam);

  const [creating, setCreating] = useState(false);
  const [teamNameDraft, setTeamNameDraft] = useState("");
  const [editingName, setEditingName] = useState(false);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [busy, setBusy] = useState(false);

  const invokeInvite = useServerFn(inviteTeamMember);
  const invokeUpdateRole = useServerFn(updateMemberRole);
  const invokeRemove = useServerFn(removeMember);
  const invokeRename = useServerFn(updateTeamName);

  if (!isAgency) {
    return (
      <PageShell title="Team" subtitle="Manage your agency team">
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Team management is available on the Agency plan.
          </p>
        </div>
        <UpgradeModal open={upgradeOpen} onClose={() => { setUpgradeOpen(false); navigate({ to: "/settings" }); }} />
      </PageShell>
    );
  }

  if (isLoading) {
    return <PageShell title="Team"><div className="text-sm text-muted-foreground">Loading…</div></PageShell>;
  }

  const team = data?.team ?? null;
  const members = data?.members ?? [];
  const myRole = data?.myRole ?? null;
  const canManage = myRole === "owner" || myRole === "admin";
  const isOwner = myRole === "owner";

  if (!team) {
    return (
      <PageShell title="Team" subtitle="Create your team to invite members">
        <div className="rounded-2xl border border-border bg-card p-6">
          <label className="block text-sm font-medium text-foreground">Team name</label>
          <input
            type="text"
            value={teamNameDraft}
            onChange={(e) => setTeamNameDraft(e.target.value)}
            placeholder="e.g. Acme Property Management"
            className="mt-2 block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={!teamNameDraft.trim() || creating}
            onClick={async () => {
              setCreating(true);
              try {
                await createTeam({ data: { name: teamNameDraft.trim() } });
                await refetch();
                toast.success("Team created");
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Failed to create team");
              } finally {
                setCreating(false);
              }
            }}
            className="mt-4 inline-flex min-h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {creating ? "Creating…" : "Create team"}
          </button>
        </div>
      </PageShell>
    );
  }

  const activeCount = members.filter((m) => m.status === "active").length;

  async function handleInvite() {
    if (!inviteEmail.trim()) return;
    setBusy(true);
    try {
      await invokeInvite({
        data: { teamId: team!.id, email: inviteEmail.trim(), role: inviteRole },
      });
      setInviteEmail("");
      setInviteRole("member");
      setInviteOpen(false);
      toast.success("Invite sent");
      await refetch();
      qc.invalidateQueries({ queryKey: ["my-team"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to invite");
    } finally {
      setBusy(false);
    }
  }

  async function handleRoleChange(memberId: string, role: "admin" | "member") {
    try {
      await invokeUpdateRole({ data: { memberId, role } });
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update role");
    }
  }

  async function handleRemove(memberId: string) {
    if (!confirm("Remove this team member?")) return;
    try {
      await invokeRemove({ data: { memberId } });
      await refetch();
      toast.success("Member removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove");
    }
  }

  async function handleRenameTeam() {
    if (!teamNameDraft.trim()) return;
    try {
      await invokeRename({ data: { teamId: team!.id, name: teamNameDraft.trim() } });
      setEditingName(false);
      await refetch();
      toast.success("Team renamed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to rename");
    }
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <PageShell title="Team" subtitle={`${activeCount} active member${activeCount === 1 ? "" : "s"}`}>
      {/* Team name row */}
      <div className="mb-4 flex items-center justify-between rounded-xl border border-input bg-card px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">Team</p>
          {editingName ? (
            <div className="mt-1 flex items-center gap-2">
              <input
                type="text"
                value={teamNameDraft}
                onChange={(e) => setTeamNameDraft(e.target.value)}
                className="flex-1 rounded-lg border border-input bg-background px-2 py-1 text-sm"
              />
              <button onClick={handleRenameTeam} className="rounded-lg bg-primary p-1.5 text-primary-foreground">
                <Check className="size-4" />
              </button>
              <button onClick={() => setEditingName(false)} className="rounded-lg border border-input p-1.5">
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <p className="mt-1 text-sm font-semibold text-foreground">{team.name}</p>
          )}
        </div>
        {isOwner && !editingName ? (
          <button
            onClick={() => { setTeamNameDraft(team.name); setEditingName(true); }}
            className="ml-3 inline-flex items-center gap-1 text-xs font-medium text-primary"
          >
            <Pencil className="size-3.5" /> Edit
          </button>
        ) : null}
      </div>

      {/* Members */}
      <div className="rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="text-sm font-semibold text-foreground">Members</h2>
          {canManage ? (
            <button
              onClick={() => setInviteOpen(true)}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground"
            >
              <UserPlus className="size-3.5" /> Invite
            </button>
          ) : null}
        </div>
        <ul className="divide-y divide-border">
          {members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {m.invited_email}
                </p>
                <p className="text-xs text-muted-foreground">
                  {m.role} · {m.status === "active" ? "Active" : m.status === "invited" ? "Invited" : "Removed"}
                </p>
              </div>
              {m.status === "invited" ? (
                <button
                  type="button"
                  onClick={() => {
                    const link = `${origin}/auth?invite=${encodeURIComponent(m.invited_email)}`;
                    navigator.clipboard.writeText(link);
                    toast.success("Invite link copied");
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-input px-2 py-1 text-xs font-medium"
                >
                  <Copy className="size-3" /> Copy link
                </button>
              ) : null}
              {canManage && m.role !== "owner" ? (
                <>
                  <select
                    value={m.role}
                    onChange={(e) => handleRoleChange(m.id, e.target.value as "admin" | "member")}
                    className="rounded-lg border border-input bg-background px-2 py-1 text-xs"
                  >
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                  </select>
                  <button
                    onClick={() => handleRemove(m.id)}
                    className="rounded-lg border border-input p-1.5 text-muted-foreground hover:bg-accent"
                    aria-label="Remove"
                  >
                    <X className="size-4" />
                  </button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      {inviteOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setInviteOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-background p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-foreground">Invite team member</h3>
            <label className="mt-4 block text-xs font-medium text-muted-foreground">Email</label>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="teammate@example.com"
              className="mt-1 block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
            <label className="mt-3 block text-xs font-medium text-muted-foreground">Role</label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as "admin" | "member")}
              className="mt-1 block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setInviteOpen(false)}
                className="rounded-xl border border-input px-4 py-2 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleInvite}
                disabled={busy || !inviteEmail.trim()}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {busy ? "Sending…" : "Send invite"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}