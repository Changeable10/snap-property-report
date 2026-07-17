import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const [{ data: userData, error: userErr }, { data: sessionData }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.auth.getSession(),
    ]);
    if (userErr || !userData.user || !sessionData.session) {
      throw redirect({ to: "/auth" });
    }
    return { user: userData.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const { user } = Route.useRouteContext();
  return (
    <AppShell user={user}>
      <Outlet />
    </AppShell>
  );
}