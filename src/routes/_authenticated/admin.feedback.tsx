import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageShell } from "@/components/PageShell";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useIsAdmin } from "@/lib/use-plan";
import { getAllFeedback } from "@/lib/admin-feedback.functions";

export const Route = createFileRoute("/_authenticated/admin/feedback")({
  component: AdminFeedbackPage,
});

const TYPE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  bug: "destructive",
  feature: "default",
  confusion: "secondary",
  general: "outline",
};

const SEVERITY_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  critical: "destructive",
  high: "destructive",
  medium: "secondary",
  low: "outline",
};

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function AdminFeedbackPage() {
  const { user } = Route.useRouteContext();
  const { data: isAdmin, isLoading: adminLoading } = useIsAdmin(user.id);
  const fn = useServerFn(getAllFeedback);
  const { data: feedback, isLoading } = useQuery({
    queryKey: ["admin-feedback"],
    queryFn: () => fn(),
    enabled: !!isAdmin,
  });

  if (!adminLoading && !isAdmin) {
    return <Navigate to="/" />;
  }

  return (
    <PageShell
      title="Tester feedback"
      subtitle="Voice feedback captured from testers, newest first"
    >
      {isLoading || adminLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !feedback || feedback.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No feedback yet.
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Summary</TableHead>
                <TableHead>Transcript</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {feedback.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {formatDateTime(row.created_at)}
                  </TableCell>
                  <TableCell className="text-sm">{row.user_email ?? "—"}</TableCell>
                  <TableCell>
                    {row.feedback_type ? (
                      <Badge variant={TYPE_VARIANT[row.feedback_type] ?? "outline"}>
                        {row.feedback_type}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    {row.severity ? (
                      <Badge variant={SEVERITY_VARIANT[row.severity] ?? "outline"}>
                        {row.severity}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="max-w-xs text-sm">
                    {row.structured_summary ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-sm text-sm text-muted-foreground">
                    {row.raw_transcript ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </PageShell>
  );
}
