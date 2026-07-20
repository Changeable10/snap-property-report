import { X, Check } from "lucide-react";
import { usePaddleCheckout } from "@/hooks/usePaddleCheckout";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

export type TopUpPack = "staging" | "enhancement" | "listing";

const TOP_UP_PACKS: Record<TopUpPack, { title: string; description: string; price: string }> = {
  staging: {
    title: "Staging pack",
    description: "10 virtual staging images",
    price: "NZ$5",
  },
  enhancement: {
    title: "Enhancement pack",
    description: "25 image enhancements",
    price: "NZ$5",
  },
  listing: {
    title: "Listing pack",
    description: "5 extra listings",
    price: "NZ$10",
  },
};

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  topUp?: TopUpPack;
}

const PLANS = [
  {
    id: "professional",
    name: "Professional",
    price: "NZ$39.95",
    priceId: "professional_monthly",
    features: [
      "Up to 10 properties",
      "5 listings/month",
      "AI photo analysis",
      "Voice-to-report",
    ],
    cta: "Upgrade",
    highlight: true,
  },
  {
    id: "portfolio",
    name: "Portfolio",
    price: "NZ$59.95",
    priceId: "portfolio_monthly",
    features: [
      "Up to 25 properties",
      "Unlimited listings",
      "3 team members",
      "Report branding",
    ],
    cta: "Upgrade",
    highlight: false,
  },
  {
    id: "agency",
    name: "Agency",
    price: "NZ$99.95",
    priceId: "agency_monthly",
    features: [
      "Up to 100 properties",
      "Unlimited listings",
      "10 team members",
      "White-label reports",
      "Rex CRM integration",
    ],
    cta: "Upgrade",
    highlight: false,
  },
] as const;

export function UpgradeModal({ open, onClose, title, description, topUp }: UpgradeModalProps) {
  const { openCheckout, loading } = usePaddleCheckout();
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [topUpNotice, setTopUpNotice] = useState(false);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUser({ id: data.user.id, email: data.user.email ?? undefined });
    });
  }, []);
  if (!open) return null;

  async function handleUpgrade(plan: (typeof PLANS)[number]) {
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
            "The free plan includes one property with unlimited inspections. Upgrade to Professional for up to 10 properties, Portfolio for 25, or Agency for 100."}
        </p>

        <p className="mt-6 text-sm font-semibold text-foreground">Upgrade your plan</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
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
                disabled={loading || !user}
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

        {topUp ? (
          <div className="mt-6">
            <p className="text-sm font-semibold text-foreground">Or buy a top-up</p>
            <p className="mt-1 text-xs text-muted-foreground">
              A one-off credit pack — no plan change required.
            </p>
            <div className="mt-3 flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">{TOP_UP_PACKS[topUp].title}</p>
                <p className="text-xs text-muted-foreground">
                  {TOP_UP_PACKS[topUp].description} — {TOP_UP_PACKS[topUp].price}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTopUpNotice(true)}
                className="min-h-10 rounded-xl border border-input bg-background px-4 text-sm font-semibold text-foreground hover:bg-accent"
              >
                Buy
              </button>
            </div>
            {topUpNotice ? (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <p className="font-semibold">Coming soon</p>
                <p className="mt-1">
                  Top-up packs aren't available for self-serve purchase yet. Email{" "}
                  <a href="mailto:hello@snapsure.app" className="font-semibold underline">
                    hello@snapsure.app
                  </a>{" "}
                  and we'll add credits to your account.
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

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