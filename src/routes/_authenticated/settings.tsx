import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { PageShell } from "@/components/PageShell";
import { supabase } from "@/integrations/supabase/client";
import { usePlan, PLAN_LABEL, useIsAdmin, useAdminTestPlan, setAdminTestPlan, type Plan } from "@/lib/use-plan";
import { Link } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getPropertiesDebug } from "@/lib/debug.functions";
import { displayNameFromUser } from "@/lib/display-name";
import { UpgradePlanModal } from "@/components/UpgradePlanModal";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Snapsure" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    upgraded: search.upgraded === "true" || search.upgraded === true ? true : undefined,
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const queryClient = useQueryClient();
  const { data: plan } = usePlan(user.id);
  const current = plan ?? "free";
  const UPGRADE_ORDER: Plan[] = ["free", "portfolio", "professional", "agency"];
  const upgradeTargets = UPGRADE_ORDER.slice(UPGRADE_ORDER.indexOf(current) + 1) as Exclude<Plan, "free">[];
  const [upgradeTarget, setUpgradeTarget] = useState<Exclude<Plan, "free"> | null>(null);
  const [displayName, setDisplayName] = useState<string>(displayNameFromUser(user) ?? "");
  const [savingName, setSavingName] = useState(false);
  async function saveDisplayName() {
    setSavingName(true);
    const trimmed = displayName.trim();
    const { error } = await supabase.auth.updateUser({
      data: { display_name: trimmed || null },
    });
    setSavingName(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(trimmed ? "Display name saved" : "Display name cleared");
    queryClient.invalidateQueries({ queryKey: ["resolved-display-name"] });
  }
  const { data: isAdmin } = useIsAdmin(user.id);
  const testPlan = useAdminTestPlan();
  const runDebug = useServerFn(getPropertiesDebug);
  const { data: debug } = useQuery({
    queryKey: ["debug-properties", user.id],
    enabled: !!isAdmin,
    queryFn: () => runDebug(),
  });
  const { data: myClientCount } = useQuery({
    queryKey: ["debug-my-client-count", user.id],
    enabled: !!isAdmin,
    queryFn: async () => {
      const { count } = await supabase
        .from("properties")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);
      return count ?? 0;
    },
  });
  useEffect(() => {
    if (!search.upgraded) return;
    toast.success(`You're now on the ${PLAN_LABEL[current]} plan`);
    queryClient.invalidateQueries({ queryKey: ["subscription", user.id] });
    navigate({ to: "/settings", replace: true });
  }, [search.upgraded, current, navigate, queryClient, user.id]);
  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }
  return (
    <PageShell title="Settings" subtitle={user.email ?? undefined}>
      <div className="mb-4 rounded-xl border border-input bg-card p-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
          Display name
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Steve Anderson"
            className="min-h-11 rounded-lg border border-input bg-background px-3 text-base text-foreground"
          />
        </label>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Shown as the inspector or assessor on reports and signatures.
        </p>
        <button
          type="button"
          onClick={saveDisplayName}
          disabled={savingName}
          className="mt-3 flex min-h-10 items-center justify-center rounded-lg bg-teal px-4 text-sm font-semibold text-teal-foreground hover:bg-teal-dark disabled:opacity-60"
        >
          {savingName ? "Saving…" : "Save"}
        </button>
      </div>
      <div className="mb-4 flex items-center justify-between rounded-xl border border-input bg-card px-4 py-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Current plan</p>
          <p className="text-sm font-semibold text-foreground">{PLAN_LABEL[current]}</p>
          {import.meta.env.DEV ? (
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">User ID: {user.id}</p>
          ) : null}
        </div>
        {current === "free" ? (
          <a
            href="/upgrade?plan=professional"
            className="text-sm font-semibold text-teal hover:text-teal-dark"
          >
            Upgrade
          </a>
        ) : null}
      </div>
      {current !== "free" ? (
        <div className="mb-4 rounded-xl border border-input bg-card p-4">
          <p className="text-sm font-semibold text-foreground">Switch to a lower plan</p>
          <p className="mt-1 text-xs text-muted-foreground">
            If your current data exceeds the target plan's limits, you'll be asked to
            archive properties or listings before the switch completes.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(["free", "portfolio", "professional", "agency"] as const)
              .filter((p) => RANK[p] < RANK[current])
              .map((p) => (
                <Link
                  key={p}
                  to="/downgrade"
                  search={{ plan: p }}
                  className="rounded-lg border border-input bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent"
                >
                  Switch to {PLAN_LABEL[p]}
                </Link>
              ))}
          </div>
        </div>
      ) : null}
      {upgradeTargets.length > 0 ? (
        <div className="mb-4 rounded-xl border border-input bg-card p-4">
          <p className="text-sm font-semibold text-foreground">Upgrade your plan</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Unlock more properties and features.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {upgradeTargets.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setUpgradeTarget(p)}
                className="rounded-lg border border-teal bg-teal/10 px-3 py-1.5 text-xs font-semibold text-teal hover:bg-teal/20"
              >
                Upgrade to {PLAN_LABEL[p]}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <UpgradePlanModal
        open={!!upgradeTarget}
        plan={upgradeTarget}
        onClose={() => setUpgradeTarget(null)}
      />
      {isAdmin && import.meta.env.DEV ? (
        <div className="mb-4 rounded-xl border border-slate-300 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">Debug: properties</p>
          <div className="mt-2 space-y-1 font-mono text-[11px] text-slate-700">
            <div>auth.uid(): {user.id}</div>
            <div>properties where user_id = you (via RLS client): {myClientCount ?? "…"}</div>
            <div>properties where user_id = you (admin bypass): {debug?.mine ?? "…"}</div>
            <div>properties total (admin bypass): {debug?.total ?? "…"}</div>
          </div>
          {debug && debug.total !== (debug.mine ?? 0) ? (
            <div className="mt-3">
              <p className="text-[11px] font-semibold text-slate-900">user_id counts on properties:</p>
              <pre className="mt-1 overflow-auto rounded bg-white p-2 font-mono text-[11px] text-slate-700">
{JSON.stringify(debug.byUser, null, 2)}
              </pre>
              <p className="mt-2 text-[11px] font-semibold text-slate-900">team_id counts on properties:</p>
              <pre className="mt-1 overflow-auto rounded bg-white p-2 font-mono text-[11px] text-slate-700">
{JSON.stringify(debug.byTeam, null, 2)}
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}
      {current === "agency" ? (
        <Link
          to="/team"
          className="mb-4 flex items-center justify-between rounded-xl border border-input bg-card px-4 py-3 transition-colors hover:bg-accent"
        >
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
              <Users className="size-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Team</p>
              <p className="text-xs text-muted-foreground">Invite and manage members</p>
            </div>
          </div>
          <span className="text-xs font-medium text-primary">Open →</span>
        </Link>
      ) : null}
      {isAdmin ? (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">Admin: Test as plan</p>
          <p className="mt-1 text-xs text-amber-800">
            Override the plan used for gating checks. Stored locally on this device.
          </p>
          <select
            value={testPlan ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              setAdminTestPlan(v ? (v as Plan) : null);
            }}
            className="mt-3 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-foreground"
          >
            <option value="">Use actual plan ({PLAN_LABEL[current]})</option>
            <option value="free">Free</option>
            <option value="professional">Professional</option>
            <option value="portfolio">Portfolio</option>
            <option value="agency">Agency</option>
          </select>
        </div>
      ) : null}
      <button
        type="button"
        onClick={signOut}
        className="flex min-h-12 w-full items-center justify-center rounded-xl border border-input bg-card px-5 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
      >
        Sign out
      </button>
    </PageShell>
  );
}