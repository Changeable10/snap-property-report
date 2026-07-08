import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/PageShell";

export const Route = createFileRoute("/inspection/$id/sign")({
  head: () => ({ meta: [{ title: "Sign — Snapsure" }] }),
  component: () => (
    <PageShell
      title="Signature"
      subtitle="Collect signatures to finalise the inspection."
      showBack
      showNav={false}
    />
  ),
});