import { Link } from "@tanstack/react-router";
import { LayoutDashboard, Building2, ClipboardList, Settings as SettingsIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { to: "/", label: "Today", icon: LayoutDashboard, exact: true },
  { to: "/", label: "Properties", icon: Building2, exact: true },
  { to: "/inspections", label: "Inspections", icon: ClipboardList, exact: false },
  { to: "/settings", label: "Settings", icon: SettingsIcon, exact: false },
] as const;

export function BottomNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card md:hidden"
      aria-label="Primary"
    >
      <ul className="flex items-stretch justify-around px-2 pb-[env(safe-area-inset-bottom)]">
        {tabs.map(({ to, label, icon: Icon, exact }, i) => (
          <li key={`${to}-${i}`} className="flex-1">
            <Link
              to={to}
              activeOptions={{ exact }}
              className={cn(
                "flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg py-2 text-[11px] font-medium text-muted-foreground transition-colors",
                "data-[status=active]:text-primary",
              )}
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={cn(
                      "size-5",
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