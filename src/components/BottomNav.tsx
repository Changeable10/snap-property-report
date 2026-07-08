import { Link } from "@tanstack/react-router";
import { Home, ClipboardList, Settings as SettingsIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { to: "/", label: "Home", icon: Home, exact: true },
  { to: "/inspections", label: "Inspections", icon: ClipboardList, exact: false },
  { to: "/settings", label: "Settings", icon: SettingsIcon, exact: false },
] as const;

export function BottomNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75"
      aria-label="Primary"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around px-2 pb-[env(safe-area-inset-bottom)]">
        {tabs.map(({ to, label, icon: Icon, exact }) => (
          <li key={to} className="flex-1">
            <Link
              to={to}
              activeOptions={{ exact }}
              className={cn(
                "flex min-h-11 flex-col items-center justify-center gap-1 rounded-lg py-2 text-xs font-medium text-muted-foreground transition-colors",
                "data-[status=active]:text-teal",
              )}
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={cn(
                      "size-6",
                      isActive ? "stroke-[2.25]" : "stroke-2",
                    )}
                  />
                  <span>{label}</span>
                </>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}