import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageShell } from "@/components/PageShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Snapsure" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }
  return (
    <PageShell title="Settings" subtitle={user.email ?? undefined}>
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