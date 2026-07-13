import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "sonner";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { PageShell } from "@/components/PageShell";
import { supabase } from "@/integrations/supabase/client";
import { usePlan, PLAN_LABEL, useIsAdmin, useAdminTestPlan, setAdminTestPlan, type Plan } from "@/lib/use-plan";
import { Link } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getPropertiesDebug } from "@/lib/debug.functions";

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
      <div className="mb-4 flex items-center justify-between rounded-xl border border-input bg-card px-4 py-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Current plan</p>
          <p className="text-sm font-semibold text-foreground">{PLAN_LABEL[current]}</p>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">User ID: {user.id}</p>
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
      {isAdmin ? (
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