import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/PageShell";

export const Route = createFileRoute("/inspection/$id/review")({
  head: () => ({ meta: [{ title: "Review — Snapsure" }] }),
  component: () => (
    <PageShell
      title="Review inspection"
      subtitle="Check AI-structured notes before generating the report."
      backTo="/"
    />
  ),
});