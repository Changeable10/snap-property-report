import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { acceptTeamInviteToken } from "@/lib/team.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { ONBOARDED_KEY } from "@/components/Onboarding";

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
  const [mismatch, setMismatch] = useState(false);
  const [teamName, setTeamName] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        navigate({ to: "/auth", search: { redirect: `/invite/${token}` } as never });
        return;
      }
      try {
        const res = await accept({ data: { token } });
        setTeamName(res.teamName);
        try { localStorage.setItem(ONBOARDED_KEY, "true"); } catch { /* ignore */ }
        toast.success(res.teamName ? `You've joined ${res.teamName}!` : "You've joined the team!");
        setState("done");
        setTimeout(() => navigate({ to: "/" }), 1200);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to accept invite";
        if (/Sign in as /i.test(msg)) setMismatch(true);
        setMessage(msg);
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
  if (state === "error") {
    if (mismatch) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
          <Card className="max-w-md w-full">
            <CardContent className="p-8 text-center space-y-4">
              <AlertCircle className="h-12 w-12 text-amber-600 mx-auto" />
              <h1 className="text-xl font-semibold text-slate-900">Wrong account</h1>
              <p className="text-slate-600 text-sm">{message}</p>
              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  navigate({ to: "/auth", search: { redirect: `/invite/${token}` } as never });
                }}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-teal px-5 text-sm font-semibold text-teal-foreground hover:bg-teal-dark"
              >
                Switch account
              </button>
            </CardContent>
          </Card>
        </div>
      );
    }
    return <InviteError message={message} />;
  }
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center space-y-3">
          <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto" />
          <h1 className="text-xl font-semibold text-slate-900">
            {teamName ? `Welcome to ${teamName}` : "You're on the team"}
          </h1>
          <p className="text-slate-600 text-sm">Redirecting to your dashboard…</p>
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