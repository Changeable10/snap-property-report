import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/PageShell";

export const Route = createFileRoute("/_authenticated/inspection/$id/capture")({
  head: () => ({ meta: [{ title: "Capture — Snapsure" }] }),
  component: () => (
    <PageShell
      title="Room capture"
      subtitle="Photograph and voice-record each room."
      showBack
      showNav={false}
    />
  ),
});