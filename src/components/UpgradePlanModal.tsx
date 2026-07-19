import { X, Check } from "lucide-react";
import type { Plan } from "@/lib/use-plan";

type UpgradePlan = Exclude<Plan, "free">;

const PLAN_INFO: Record<UpgradePlan, { name: string; price: string; features: string[] }> = {
  portfolio: {
    name: "Portfolio",
    price: "NZ$29/mo",
    features: ["Up to 3 properties", "Unlimited inspections", "AI photo analysis"],
  },
  professional: {
    name: "Professional",
    price: "NZ$99/mo",
    features: ["Up to 5 properties", "Unlimited inspections", "Priority support"],
  },
  agency: {
    name: "Agency",
    price: "NZ$199/mo",
    features: ["Up to 20 properties", "Team access", "White-label reports"],
  },
};

interface UpgradePlanModalProps {
  open: boolean;
  plan: UpgradePlan | null;
  onClose: () => void;
}

export function UpgradePlanModal({ open, plan, onClose }: UpgradePlanModalProps) {
  if (!open || !plan) return null;
  const info = PLAN_INFO[plan];
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative flex w-full max-w-md flex-col rounded-t-3xl bg-background p-6 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
        >
          <X className="size-5" />
        </button>
        <h2 className="pr-10 text-xl font-semibold text-foreground">
          Upgrade to {info.name}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{info.price}</p>
        <ul className="mt-4 flex flex-col gap-2 text-sm text-foreground">
          {info.features.map((f) => (
            <li key={f} className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-teal" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">Coming soon</p>
          <p className="mt-1 text-xs">
            Self-serve upgrades aren't live yet. Email{" "}
            <a
              href="mailto:hello@snapsure.app?subject=Upgrade%20to%20{info.name}"
              className="font-semibold underline"
            >
              hello@snapsure.app
            </a>{" "}
            to switch to {info.name} and we'll get you set up.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 flex min-h-10 items-center justify-center rounded-xl border border-input bg-card px-4 text-sm font-semibold text-foreground hover:bg-accent"
        >
          Close
        </button>
      </div>
    </div>
  );
}