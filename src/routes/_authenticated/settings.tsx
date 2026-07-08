import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/PageShell";

export const Route = createFileRoute("/_authenticated/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Snapsure" }] }),
  component: () => (
    <PageShell title="Settings" subtitle="Manage your account and preferences." />
  ),
});