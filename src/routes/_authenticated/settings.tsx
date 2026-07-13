import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageShell } from "@/components/PageShell";
import { supabase } from "@/integrations/supabase/client";
import { usePlan, PLAN_LABEL } from "@/lib/use-plan";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Snapsure" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const { data: plan } = usePlan(user.id);
  const current = plan ?? "free";
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