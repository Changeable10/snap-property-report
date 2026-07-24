import { useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Home, Building2, Users, Building, FlaskConical, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { displayNameFromUser } from "@/lib/display-name";
import { welcomeEmailHtml } from "@/lib/email-templates";

export type UserType =
  "self_managing_landlord" | "portfolio_landlord" | "property_manager" | "agency" | "tester";

const USER_TYPES: { value: UserType; label: string; icon: typeof Home }[] = [
  { value: "self_managing_landlord", label: "Self-managing landlord", icon: Home },
  { value: "portfolio_landlord", label: "Portfolio landlord", icon: Building2 },
  { value: "property_manager", label: "Property manager", icon: Users },
  { value: "agency", label: "Agency", icon: Building },
  { value: "tester", label: "Tester / evaluating", icon: FlaskConical },
];

export function getUserType(user: User): UserType | null {
  const value = (user.user_metadata as { user_type?: string } | undefined)?.user_type;
  return USER_TYPES.some((t) => t.value === value) ? (value as UserType) : null;
}

export function UserTypeCapture({
  user,
  onDone,
}: {
  user: User;
  onDone: (type: UserType) => void;
}) {
  const [saving, setSaving] = useState<UserType | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSelect(value: UserType) {
    setSaving(value);
    setError(null);
    const { error } = await supabase.auth.updateUser({ data: { user_type: value } });
    if (error) {
      setError(error.message);
      setSaving(null);
      return;
    }
    sendWelcomeEmail();
    onDone(value);
  }

  function sendWelcomeEmail() {
    if (!user.email) return;
    const name = displayNameFromUser(user) ?? user.email.split("@")[0];
    supabase.functions
      .invoke("send-email", {
        body: {
          to: user.email,
          subject: "Welcome to Snapsure — here's how to get started",
          body: welcomeEmailHtml({ name, origin: window.location.origin }),
        },
      })
      .catch(() => {
        /* best-effort — never block onboarding on email delivery */
      });
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">
        What kind of user are you?
      </h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        This helps us tailor Snapsure to how you work.
      </p>
      <div className="mt-8 flex w-full max-w-sm flex-col gap-3">
        {USER_TYPES.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            disabled={saving !== null}
            onClick={() => handleSelect(value)}
            className="flex min-h-14 items-center gap-3 rounded-xl border border-input bg-card px-4 text-left text-sm font-semibold text-foreground transition-colors hover:border-teal hover:bg-teal-light disabled:opacity-60"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-teal-light text-teal-dark">
              {saving === value ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Icon className="size-4" />
              )}
            </span>
            {label}
          </button>
        ))}
      </div>
      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
