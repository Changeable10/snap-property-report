import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin/feedback")({
  component: AdminFeedbackPage,
});

interface FeedbackRow {
  id: string;
  user_id: string | null;
  feedback_type: string | null;
  severity: string | null;
  raw_transcript: string | null;
  structured_summary: string | null;
  created_at: string | null;
}

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
  const {
    data: feedback,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["admin-feedback"],
    queryFn: async (): Promise<FeedbackRow[]> => {
      const { data, error } = await supabase
        .from("tester_feedback")
        .select("id,user_id,feedback_type,severity,raw_transcript,structured_summary,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
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
      ) : isError ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center text-sm text-destructive">
          Couldn't load feedback: {error instanceof Error ? error.message : "Unknown error"}
        </div>
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
                <TableHead>User ID</TableHead>
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
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {row.user_id ?? "—"}
                  </TableCell>
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
