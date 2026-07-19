import { X, Check } from "lucide-react";
import { usePaddleCheckout } from "@/hooks/usePaddleCheckout";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
}

const PLANS = [
  {
    id: "professional",
    name: "Professional",
    price: "NZ$29",
    priceId: "professional_monthly",
    features: ["Up to 5 properties", "Unlimited inspections", "AI photo analysis"],
    cta: "Upgrade",
    highlight: true,
  },
  {
    id: "portfolio",
    name: "Portfolio",
    price: "NZ$99",
    priceId: "portfolio_monthly",
    features: ["Up to 20 properties", "Unlimited inspections", "Priority support"],
    cta: "Upgrade",
    highlight: false,
  },
  {
    id: "agency",
    name: "Agency",
    price: "NZ$199",
    priceId: "agency_monthly",
    features: ["Unlimited properties", "Team access", "Dedicated success manager"],
    cta: "Contact us",
    highlight: false,
  },
] as const;

export function UpgradeModal({ open, onClose, title, description }: UpgradeModalProps) {
  const { openCheckout, loading } = usePaddleCheckout();
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUser({ id: data.user.id, email: data.user.email ?? undefined });
    });
  }, []);
  if (!open) return null;

  async function handleUpgrade(plan: (typeof PLANS)[number]) {
    if (plan.id === "agency") {
      window.location.href = "mailto:hello@snapsure.app?subject=Agency plan enquiry";
      return;
    }
    if (!user) return;
    await openCheckout({
      priceId: plan.priceId,
      customerEmail: user.email,
      customData: { userId: user.id },
      successUrl: `${window.location.origin}/settings?upgraded=true`,
    });
  }
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-y-auto rounded-t-3xl bg-background p-6 shadow-xl sm:rounded-2xl sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent"
        >
          <X className="size-5" />
        </button>

        <h2 className="pr-10 text-xl font-semibold text-foreground sm:text-2xl">
          {title ?? "Upgrade to add more properties"}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {description ??
            "The free plan includes one property with unlimited inspections. Upgrade to Professional to manage up to 5 properties, or Portfolio for up to 20."}
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`flex flex-col rounded-2xl border p-4 ${
                plan.highlight ? "border-teal bg-teal-light/40" : "border-border bg-card"
              }`}
            >
              <p className="text-sm font-semibold text-foreground">{plan.name}</p>
              <p className="mt-1 text-xl font-bold text-foreground">
                {plan.price}
                <span className="text-xs font-normal text-muted-foreground">/mo</span>
              </p>
              <ul className="mt-3 flex flex-1 flex-col gap-1.5 text-xs text-muted-foreground">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-1.5">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-teal" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => handleUpgrade(plan)}
                disabled={loading || (plan.id !== "agency" && !user)}
                className={`mt-4 flex min-h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold transition-colors disabled:opacity-60 ${
                  plan.highlight
                    ? "bg-teal text-teal-foreground hover:bg-teal-dark"
                    : "border border-input bg-card text-foreground hover:bg-accent"
                }`}
              >
                {loading ? "Loading…" : plan.cta}
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 self-center text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Stay on free plan
        </button>
      </div>
    </div>
  );
}