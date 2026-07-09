import { cn } from "@/lib/utils";
import type { Condition } from "@/lib/mock-data";

const FALLBACK_STYLE = "bg-muted text-muted-foreground ring-border";

const styles: Record<Condition, string> = {
  good: "bg-condition-good/15 text-condition-good ring-condition-good/30",
  fair: "bg-condition-fair/15 text-condition-fair ring-condition-fair/30",
  poor: "bg-condition-poor/15 text-condition-poor ring-condition-poor/40",
  damaged: "bg-condition-damaged/15 text-condition-damaged ring-condition-damaged/40",
};

const labels: Record<Condition, string> = {
  good: "Good",
  fair: "Fair",
  poor: "Poor",
  damaged: "Damaged",
};

interface ConditionBadgeProps {
  condition: Condition | string | null | undefined;
  className?: string;
}

export function ConditionBadge({ condition, className }: ConditionBadgeProps) {
  const key = (condition ?? "") as Condition;
  const style = styles[key] ?? FALLBACK_STYLE;
  const label = labels[key] ?? (condition ? String(condition) : "Unknown");
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
        style,
        className,
      )}
    >
      {label}
    </span>
  );
}