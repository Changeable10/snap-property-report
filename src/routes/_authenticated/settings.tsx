import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { PageShell } from "@/components/PageShell";
import { supabase } from "@/integrations/supabase/client";
import { usePlan, PLAN_LABEL } from "@/lib/use-plan";
import { Link } from "@tanstack/react-router";
import { Users } from "lucide-react";

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