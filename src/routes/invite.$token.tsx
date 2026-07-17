import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { acceptTeamInviteToken } from "@/lib/team.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/invite/$token")({
  head: () => ({
    meta: [
      { title: "Team Invitation — Snapsure" },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: () => <InviteError message="Something went wrong accepting this invite." />,
  notFoundComponent: () => <InviteError message="Invite not found." />,
  component: InvitePage,
});

function InvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const accept = useServerFn(acceptTeamInviteToken);
  const [state, setState] = useState<"loading" | "done" | "error">("loading");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        sessionStorage.setItem("snapsure.pending_invite", token);
        navigate({ to: "/auth", search: { next: `/invite/${token}` } as never });
        return;
      }
      try {
        await accept({ data: { token } });
        sessionStorage.removeItem("snapsure.pending_invite");
        setState("done");
        setTimeout(() => navigate({ to: "/team" as never }), 1500);
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Failed to accept invite");
        setState("error");
      }
    })();
  }, [token, accept, navigate]);

  if (state === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
      </div>
    );
  }
  if (state === "error") return <InviteError message={message} />;
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center space-y-3">
          <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto" />
          <h1 className="text-xl font-semibold text-slate-900">You're on the team</h1>
          <p className="text-slate-600 text-sm">Redirecting to your team page…</p>
        </CardContent>
      </Card>
    </div>
  );
}

function InviteError({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center space-y-3">
          <AlertCircle className="h-12 w-12 text-red-600 mx-auto" />
          <h1 className="text-xl font-semibold text-slate-900">Invite problem</h1>
          <p className="text-slate-600 text-sm">{message}</p>
        </CardContent>
      </Card>
    </div>
  );
}