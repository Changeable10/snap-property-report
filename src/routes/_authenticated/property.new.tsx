import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/PageShell";

export const Route = createFileRoute("/_authenticated/_authenticated/property/new")({
  head: () => ({ meta: [{ title: "Add property — Snapsure" }] }),
  component: () => (
    <PageShell
      title="Add property"
      subtitle="Enter address and details for the rental."
      showBack
    />
  ),
});