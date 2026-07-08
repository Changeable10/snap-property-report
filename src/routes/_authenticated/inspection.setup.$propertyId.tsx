import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/PageShell";

export const Route = createFileRoute("/inspection/setup/$propertyId")({
  head: () => ({ meta: [{ title: "Inspection setup — Snapsure" }] }),
  component: () => (
    <PageShell
      title="Inspection setup"
      subtitle="Choose inspection type and rooms to capture."
      showBack
    />
  ),
});