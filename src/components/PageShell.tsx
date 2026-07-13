import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

interface PageShellProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  children?: ReactNode;
  showNav?: boolean;
}

export function PageShell({
  title,
  subtitle,
  showBack,
  children,
}: PageShellProps) {
  return (
    <div>
      <header className="mb-6 border-b border-border pb-4">
        <div>
          {showBack ? (
            <Link
              to="/"
              className="mb-2 inline-flex min-h-11 items-center gap-1 -ml-2 pr-3 pl-2 text-sm font-medium text-primary"
            >
              <ArrowLeft className="size-4" />
              Back
            </Link>
          ) : null}
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
      </header>
      {children ?? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            This screen is coming soon.
          </div>
        )}
    </div>
  );
}