import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/PageShell";

export const Route = createFileRoute("/_authenticated/inspections")({
  head: () => ({ meta: [{ title: "Inspections — Snapsure" }] }),
  component: () => (
    <PageShell
      title="Inspections"
      subtitle="All entry, routine and exit inspections."
    />
  ),
});