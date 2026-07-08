import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/PageShell";

export const Route = createFileRoute("/inspection/$id/report")({
  head: () => ({ meta: [{ title: "Report — Snapsure" }] }),
  component: () => (
    <PageShell
      title="Report preview"
      subtitle="Compliant NZ tenancy inspection report."
      showBack
    />
  ),
});