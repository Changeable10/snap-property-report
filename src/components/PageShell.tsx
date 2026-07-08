import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { BottomNav } from "./BottomNav";

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
  showNav = true,
}: PageShellProps) {
  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="border-b border-border px-5 pt-6 pb-4">
        <div className="mx-auto max-w-md">
          {showBack ? (
            <Link
              to="/"
              className="mb-2 inline-flex min-h-11 items-center gap-1 -ml-2 pr-3 pl-2 text-sm font-medium text-teal"
            >
              <ArrowLeft className="size-4" />
              Back
            </Link>
          ) : null}
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
      </header>
      <main className="mx-auto max-w-md px-5 py-6">
        {children ?? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            This screen is coming soon.
          </div>
        )}
      </main>
      {showNav ? <BottomNav /> : null}
    </div>
  );
}