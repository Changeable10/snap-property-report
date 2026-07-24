import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { UserTypeCapture, getUserType } from "@/components/UserTypeCapture";

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
  const [userType, setUserType] = useState(() => getUserType(user));

  if (!userType) {
    return <UserTypeCapture user={user} onDone={setUserType} />;
  }

  return (
    <AppShell user={user}>
      <Outlet />
    </AppShell>
  );
}
