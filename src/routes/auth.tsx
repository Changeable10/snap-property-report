import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({ meta: [{ title: "Sign in — Snapsure" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    redirect: typeof s.redirect === "string" ? s.redirect : undefined,
  }),
  component: AuthPage,
});

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47a5.54 5.54 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.82Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.88-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.26v3.09A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28V6.63H1.26A12 12 0 0 0 0 12c0 1.94.46 3.77 1.26 5.37l4.01-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.6 4.59 1.79l3.44-3.44A11.98 11.98 0 0 0 12 0 12 12 0 0 0 1.26 6.63l4.01 3.09C6.22 6.88 8.87 4.77 12 4.77Z"
      />
    </svg>
  );
}

function AuthPage() {
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup" | "magiclink">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [authed, setAuthed] = useState(false);
  const [inviteTeam, setInviteTeam] = useState<string | null>(null);

  const inviteToken =
    redirect && redirect.startsWith("/invite/") ? redirect.slice("/invite/".length) : null;

  const redirectTo = redirect ? `${window.location.origin}${redirect}` : window.location.origin;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setAuthed(true);
    });
  }, []);

  useEffect(() => {
    if (!inviteToken) return;
    (async () => {
      try {
        const res = await fetch(`/api/public/invite-token/${encodeURIComponent(inviteToken)}`);
        if (!res.ok) return;
        const j = (await res.json()) as { invitedEmail?: string; teamName?: string | null };
        if (j.invitedEmail) setEmail(j.invitedEmail);
        if (j.teamName) setInviteTeam(j.teamName);
      } catch {
        /* ignore */
      }
    })();
  }, [inviteToken]);

  if (authed) {
    if (redirect) return <Navigate to={redirect as never} />;
    return <Navigate to="/" />;
  }

  async function handleGoogleSignIn() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (error) throw error;
      // Browser is redirected to Google by Supabase; nothing else to do here.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start Google sign-in");
      setLoading(false);
    }
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) throw error;
      setMessage("Check your email for a magic link to sign in.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send magic link");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (mode === "signup" && password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectTo },
        });
        if (error) throw error;
        // If session is present (auto-confirm), go to redirect. Otherwise ask to confirm.
        const { data: sess } = await supabase.auth.getSession();
        if (sess.session && redirect) {
          navigate({ to: redirect as never });
          return;
        }
        setMessage("Check your email to confirm your account, then sign in.");
        setMode("signin");
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (!data.session) {
          setError("Sign-in did not return a session. Please try again.");
          return;
        }
        navigate({ to: (redirect ?? "/") as never });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Snapsure</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin"
              ? "Sign in to your account"
              : mode === "signup"
                ? "Create your account"
                : "Sign in with a magic link"}
          </p>
        </div>
        {inviteToken ? (
          <div className="mb-4 rounded-xl border border-teal/30 bg-teal/10 px-4 py-3 text-sm text-foreground">
            Sign in or create an account to accept your
            {inviteTeam ? (
              <>
                {" "}
                invitation to <span className="font-semibold">{inviteTeam}</span>
              </>
            ) : (
              <> team invitation</>
            )}
            .
          </div>
        ) : null}

        {mode !== "magiclink" ? (
          <>
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-input bg-card px-5 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-accent disabled:opacity-60"
            >
              <GoogleIcon />
              Continue with Google
            </button>
            <div className="my-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                or
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
          </>
        ) : null}

        {mode === "magiclink" ? (
          <form onSubmit={handleMagicLink} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm font-medium">
              Email
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="min-h-11 rounded-xl border border-input bg-card px-3 text-base"
                autoComplete="email"
              />
            </label>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {message ? <p className="text-sm text-teal-dark">{message}</p> : null}
            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex min-h-12 items-center justify-center rounded-xl bg-teal px-5 text-sm font-semibold text-teal-foreground shadow-sm transition-colors hover:bg-teal-dark disabled:opacity-60"
            >
              {loading ? "Sending…" : "Send magic link"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setError(null);
                setMessage(null);
              }}
              className="mt-1 w-full text-center text-sm text-muted-foreground"
            >
              Back to password sign-in
            </button>
          </form>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-sm font-medium">
                Email
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="min-h-11 rounded-xl border border-input bg-card px-3 text-base"
                  autoComplete="email"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium">
                Password
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="min-h-11 rounded-xl border border-input bg-card px-3 text-base"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                />
              </label>
              {mode === "signup" ? (
                <label className="flex flex-col gap-1 text-sm font-medium">
                  Confirm password
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="min-h-11 rounded-xl border border-input bg-card px-3 text-base"
                    autoComplete="new-password"
                  />
                </label>
              ) : null}
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              {message ? <p className="text-sm text-teal-dark">{message}</p> : null}
              <button
                type="submit"
                disabled={loading}
                className="mt-2 flex min-h-12 items-center justify-center rounded-xl bg-teal px-5 text-sm font-semibold text-teal-foreground shadow-sm transition-colors hover:bg-teal-dark disabled:opacity-60"
              >
                {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
              </button>
            </form>
            {mode === "signin" ? (
              <button
                type="button"
                onClick={() => {
                  setMode("magiclink");
                  setConfirmPassword("");
                  setError(null);
                  setMessage(null);
                }}
                className="mt-3 w-full text-center text-sm text-muted-foreground"
              >
                Use a <span className="font-semibold text-teal">magic link</span> instead
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setConfirmPassword("");
                setError(null);
                setMessage(null);
              }}
              className="mt-4 w-full text-center text-sm text-muted-foreground"
            >
              {mode === "signin" ? (
                <>
                  Don't have an account? <span className="font-semibold text-teal">Sign up</span>
                </>
              ) : (
                <>
                  Already have an account? <span className="font-semibold text-teal">Sign in</span>
                </>
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
