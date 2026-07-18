import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, Home, Tag } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { supabase } from "@/integrations/supabase/client";
import { usePlan, PLAN_LABEL, type Plan } from "@/lib/use-plan";
import {
  DOWNGRADE_PROPERTY_LIMIT,
  DOWNGRADE_LISTING_LIMIT,
  isDowngrade,
} from "@/lib/downgrade-limits";
import { usePaddleCheckout } from "@/hooks/usePaddleCheckout";

const VALID: Plan[] = ["free", "professional", "portfolio", "agency"];

export const Route = createFileRoute("/_authenticated/downgrade")({
  head: () => ({ meta: [{ title: "Change plan — Snapsure" }] }),
  validateSearch: (search: Record<string, unknown>) => {
    const raw = String(search.plan ?? "");
    const plan = (VALID as string[]).includes(raw) ? (raw as Plan) : ("free" as Plan);
    return { plan };
  },
  component: DowngradePage,
});

type Prop = {
  id: string;
  address: string;
  suburb: string | null;
  created_at: string;
};

type Listing = {
  id: string;
  title: string | null;
  status: string;
  created_at: string;
  property: { address: string } | null;
};

function DowngradePage() {
  const { user } = Route.useRouteContext();
  const { plan: targetPlan } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: currentPlan } = usePlan(user.id);
  const current: Plan = currentPlan ?? "free";
  const { openCheckout, loading: checkoutLoading } = usePaddleCheckout();

  const [selectedProps, setSelectedProps] = useState<Set<string>>(new Set());
  const [selectedListings, setSelectedListings] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const { data: properties } = useQuery({
    queryKey: ["downgrade-properties", user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id,address,suburb,created_at")
        .is("archived_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Prop[];
    },
  });

  const { data: listings } = useQuery({
    queryKey: ["downgrade-listings", user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select("id,title,status,created_at,property:properties(address)")
        .is("archived_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Listing[];
    },
  });

  const { data: activeInspectionPropIds } = useQuery({
    queryKey: ["downgrade-active-inspection-props", user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inspections")
        .select("property_id,status")
        .in("status", ["in_progress", "completed", "signed"]);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.property_id as string));
    },
  });

  const propLimit = DOWNGRADE_PROPERTY_LIMIT[targetPlan];
  const listLimit = DOWNGRADE_LISTING_LIMIT[targetPlan];
  const propCount = properties?.length ?? 0;
  const propsToArchive = Math.max(0, propCount - propLimit);
  const listCount = listings?.length ?? 0;
  const listsToArchive = Math.max(0, listCount - listLimit);

  const notDowngrade = !isDowngrade(current, targetPlan);

  const propsRemaining = Math.max(0, propsToArchive - selectedProps.size);
  const listsRemaining = Math.max(0, listsToArchive - selectedListings.size);
  const canConfirm =
    propsRemaining === 0 && listsRemaining === 0 && (propsToArchive > 0 || listsToArchive > 0);

  const propTargetLabel = useMemo(
    () => (propLimit === Infinity ? "unlimited" : String(propLimit)),
    [propLimit],
  );
  const listTargetLabel = useMemo(
    () => (listLimit === Infinity ? "unlimited" : String(listLimit)),
    [listLimit],
  );

  function toggle(set: Set<string>, id: string, cap: number) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else if (next.size < cap) next.add(id);
    else return set;
    return next;
  }

  async function handleConfirm() {
    if (!canConfirm || submitting) return;
    setSubmitting(true);
    try {
      const nowIso = new Date().toISOString();
      const reason = `downgrade_to_${targetPlan}`;
      if (selectedProps.size > 0) {
        const { error } = await supabase
          .from("properties")
          .update({ archived_at: nowIso, archive_reason: reason })
          .in("id", Array.from(selectedProps));
        if (error) throw error;
      }
      if (selectedListings.size > 0) {
        const { error } = await supabase
          .from("listings")
          .update({ archived_at: nowIso, archive_reason: reason })
          .in("id", Array.from(selectedListings));
        if (error) throw error;
      }
      queryClient.invalidateQueries();
      toast.success("Selected items archived. Retained for 90 days before deletion.");

      if (targetPlan === "free") {
        toast.message(
          "Cancel your current subscription from the payments portal to complete the switch to Free.",
        );
        navigate({ to: "/settings" });
        return;
      }
      const priceId = `${targetPlan}_monthly`;
      await openCheckout({
        priceId,
        customerEmail: user.email ?? undefined,
        customData: { userId: user.id },
        successUrl: `${window.location.origin}/settings?upgraded=true`,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not archive selection");
    } finally {
      setSubmitting(false);
    }
  }

  if (notDowngrade) {
    return (
      <PageShell title="Change plan">
        <div className="rounded-2xl border border-border bg-card p-6">
          <p className="text-sm text-foreground">
            {PLAN_LABEL[targetPlan]} is not a downgrade from your current plan
            ({PLAN_LABEL[current]}). Use the upgrade flow instead.
          </p>
          <Link
            to="/settings"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary"
          >
            <ArrowLeft className="size-4" /> Back to settings
          </Link>
        </div>
      </PageShell>
    );
  }

  const nothingToArchive = propsToArchive === 0 && listsToArchive === 0;

  return (
    <PageShell
      title={`Downgrade to ${PLAN_LABEL[targetPlan]}`}
      subtitle={`Currently on ${PLAN_LABEL[current]}`}
    >
      {nothingToArchive ? (
        <div className="rounded-2xl border border-border bg-card p-6">
          <p className="text-sm text-foreground">
            You're already within the {PLAN_LABEL[targetPlan]} limits
            ({propTargetLabel} properties, {listTargetLabel} listings / 30 days).
            You can safely switch plans.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={submitting || checkoutLoading}
              className="min-h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {targetPlan === "free" ? "Continue to portal" : "Continue to checkout"}
            </button>
            <Link
              to="/settings"
              className="min-h-11 rounded-xl border border-input bg-card px-5 py-2.5 text-sm font-semibold text-foreground"
            >
              Cancel downgrade
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-5 shrink-0" />
              <div className="text-sm">
                <p className="font-semibold">Selection required to downgrade</p>
                {propsToArchive > 0 ? (
                  <p className="mt-1">
                    You have <b>{propCount}</b> properties. The {PLAN_LABEL[targetPlan]}{" "}
                    plan allows <b>{propTargetLabel}</b>. Select{" "}
                    <b>{propsToArchive}</b> to archive.
                  </p>
                ) : null}
                {listsToArchive > 0 ? (
                  <p className="mt-1">
                    You have <b>{listCount}</b> active listings. The{" "}
                    {PLAN_LABEL[targetPlan]} plan allows <b>{listTargetLabel}</b> per 30
                    days. Select <b>{listsToArchive}</b> to archive.
                  </p>
                ) : null}
                <p className="mt-2 text-xs">
                  Archived items are hidden from your dashboard and retained for 90 days
                  before permanent deletion.
                </p>
              </div>
            </div>
          </div>

          {propsToArchive > 0 ? (
            <section className="mt-5">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Home className="size-4" /> Properties
                </h2>
                <span className="text-xs font-medium text-muted-foreground">
                  {propsRemaining > 0
                    ? `${propsRemaining} more to archive`
                    : "Ready to continue"}
                </span>
              </div>
              <ul className="flex flex-col gap-2">
                {(properties ?? []).map((p) => {
                  const checked = selectedProps.has(p.id);
                  const disabled = !checked && selectedProps.size >= propsToArchive;
                  const hasActive = activeInspectionPropIds?.has(p.id) ?? false;
                  return (
                    <li key={p.id}>
                      <label
                        className={`flex items-start gap-3 rounded-xl border p-3 transition-colors ${
                          checked
                            ? "border-primary bg-primary/5"
                            : disabled
                              ? "border-border bg-muted/30 opacity-60"
                              : "border-border bg-card hover:bg-accent/40"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() =>
                            setSelectedProps((s) => toggle(s, p.id, propsToArchive))
                          }
                          className="mt-1 size-4"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {p.address}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {p.suburb ?? ""}
                          </p>
                        </div>
                        {hasActive ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900"
                            title="Has active or signed inspections"
                          >
                            <AlertTriangle className="size-3" /> Inspection
                          </span>
                        ) : null}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {listsToArchive > 0 ? (
            <section className="mt-6">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Tag className="size-4" /> Listings
                </h2>
                <span className="text-xs font-medium text-muted-foreground">
                  {listsRemaining > 0
                    ? `${listsRemaining} more to archive`
                    : "Ready to continue"}
                </span>
              </div>
              <ul className="flex flex-col gap-2">
                {(listings ?? []).map((l) => {
                  const checked = selectedListings.has(l.id);
                  const disabled = !checked && selectedListings.size >= listsToArchive;
                  return (
                    <li key={l.id}>
                      <label
                        className={`flex items-start gap-3 rounded-xl border p-3 transition-colors ${
                          checked
                            ? "border-primary bg-primary/5"
                            : disabled
                              ? "border-border bg-muted/30 opacity-60"
                              : "border-border bg-card hover:bg-accent/40"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() =>
                            setSelectedListings((s) => toggle(s, l.id, listsToArchive))
                          }
                          className="mt-1 size-4"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {l.title ?? l.property?.address ?? "Listing"}
                          </p>
                          <p className="truncate text-xs text-muted-foreground capitalize">
                            {l.status}
                          </p>
                        </div>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          <div className="sticky bottom-0 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-background/95 p-3 backdrop-blur">
            <Link
              to="/settings"
              className="min-h-11 rounded-xl border border-input bg-card px-4 py-2.5 text-sm font-semibold text-foreground"
            >
              Cancel downgrade
            </Link>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!canConfirm || submitting || checkoutLoading}
              className="min-h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {submitting
                ? "Archiving…"
                : targetPlan === "free"
                  ? "Archive & continue"
                  : `Archive & switch to ${PLAN_LABEL[targetPlan]}`}
            </button>
          </div>
        </>
      )}
    </PageShell>
  );
}