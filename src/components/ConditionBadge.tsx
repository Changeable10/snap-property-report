import { cn } from "@/lib/utils";
import type { Condition } from "@/lib/mock-data";

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
  condition: Condition;
  className?: string;
}

export function ConditionBadge({ condition, className }: ConditionBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
        styles[condition],
        className,
      )}
    >
      {labels[condition]}
    </span>
  );
}