import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Home as HomeIcon,
  ClipboardList,
  ShieldCheck,
  Tag,
  Wrench,
  FileText,
  Settings as SettingsIcon,
  Users,
} from "lucide-react";
import logoUrl from "@/assets/snapsure-logo.png.asset.json";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { PLAN_LABEL, usePlan } from "@/lib/use-plan";
import { cn } from "@/lib/utils";
import { useMyTeam } from "@/lib/use-team";

interface NavItem {
  to: string;
  label: string;
  icon: typeof HomeIcon;
  match?: string; // pathname used to compute active state (defaults to `to`)
  badge?: number;
}

function useCounts() {
  const properties = useQuery({
    queryKey: ["nav-count", "properties"],
    queryFn: async () => {
      const { count } = await supabase
        .from("properties")
        .select("id", { count: "exact", head: true });
      return count ?? 0;
    },
    staleTime: 60_000,
  });
  const inspections = useQuery({
    queryKey: ["nav-count", "inspections"],
    queryFn: async () => {
      const { count } = await supabase
        .from("inspections")
        .select("id", { count: "exact", head: true })
        .eq("status", "in_progress");
      return count ?? 0;
    },
    staleTime: 60_000,
  });
  const maintenance = useQuery({
    queryKey: ["nav-count", "maintenance"],
    queryFn: async () => {
      const { count } = await supabase
        .from("inspection_items")
        .select("id", { count: "exact", head: true })
        .eq("maintenance_required", true)
        .eq("maintenance_resolved", false);
      return count ?? 0;
    },
    staleTime: 60_000,
  });
  return {
    properties: properties.data,
    inspections: inspections.data,
    maintenance: maintenance.data,
  };
}

function initialsFrom(email: string | undefined, name: string | undefined) {
  const src = (name ?? email ?? "?").trim();
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const second = parts[1]?.[0] ?? "";
  return (first + second).toUpperCase();
}

interface SidebarProps {
  user: { id: string; email?: string; user_metadata?: { name?: string; full_name?: string } } | null;
}

export function Sidebar({ user }: SidebarProps) {
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
  const counts = useCounts();
  const { data: plan } = usePlan(user?.id ?? "");
  const { data: teamData } = useMyTeam(!!user?.id);
  const team = teamData?.team ?? null;
  const myRole = teamData?.myRole ?? null;
  const isOwner = !!user?.id && team?.owner_id === user.id;
  // For non-owner team members, show team + role instead of a personal plan.
  const showTeamBadge = !!team && !isOwner;
  const displayName =
    user?.user_metadata?.name ??
    user?.user_metadata?.full_name ??
    (user?.email ? user.email.split("@")[0] : "You");
  const initials = initialsFrom(user?.email, displayName);

  const today: NavItem[] = [
    { to: "/", label: "Today", icon: LayoutDashboard, match: "/" },
  ];
  const properties: NavItem[] = [
    { to: "/", label: "All properties", icon: HomeIcon, match: "/properties", badge: counts.properties },
    { to: "/inspections", label: "Inspections", icon: ClipboardList, match: "/inspections", badge: counts.inspections },
    { to: "/inspections", label: "Compliance", icon: ShieldCheck, match: "/compliance" },
    { to: "/inspections", label: "Listings", icon: Tag, match: "/listings" },
  ];
  const records: NavItem[] = [
    { to: "/maintenance", label: "Maintenance", icon: Wrench, match: "/maintenance", badge: counts.maintenance },
    { to: "/inspections", label: "Reports", icon: FileText, match: "/reports" },
  ];
  const agencyItems: NavItem[] =
    plan === "agency"
      ? [{ to: "/team", label: "Team", icon: Users, match: "/team" }]
      : [];

  return (
    <aside
      className="fixed inset-y-0 left-0 z-30 hidden w-[250px] flex-col border-r border-white/[0.06] md:flex"
      style={{ background: "var(--color-sidebar-bg)" }}
      aria-label="Primary"
    >
      <div className="flex h-16 items-center px-5">
        <Link to="/" className="flex items-center">
          <img
            src={logoUrl.url}
            alt="Snapsure"
            width={640}
            height={213}
            className="h-7 w-auto"
          />
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        <NavSection items={today} currentPath={currentPath} />
        <NavSection label="Properties" items={properties} currentPath={currentPath} />
        <NavSection label="Records" items={records} currentPath={currentPath} />
        {agencyItems.length > 0 ? (
          <NavSection label="Agency" items={agencyItems} currentPath={currentPath} />
        ) : null}
      </nav>

      <div className="border-t border-white/[0.06] p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <div
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
            style={{ background: "linear-gradient(135deg, #0055E0, #00C4B0)" }}
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-white">{displayName}</p>
            <p className="truncate text-[11px]" style={{ color: "var(--color-sidebar-text)" }}>
              {showTeamBadge
                ? `${team!.name} · ${roleLabel(myRole)}`
                : plan
                  ? PLAN_LABEL[plan]
                  : "Free"}
            </p>
          </div>
          <Link
            to="/settings"
            className="grid size-8 shrink-0 place-items-center rounded-lg text-[color:var(--color-sidebar-text)] transition-colors hover:bg-[color:var(--color-sidebar-hover)] hover:text-white"
            aria-label="Settings"
          >
            <SettingsIcon className="size-4" />
          </Link>
        </div>
      </div>
    </aside>
  );
}

function roleLabel(role: string | null): string {
  if (!role) return "Member";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function NavSection({
  label,
  items,
  currentPath,
}: {
  label?: string;
  items: NavItem[];
  currentPath: string;
}) {
  return (
    <div className="mt-4 first:mt-2">
      {label ? (
        <p
          className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--color-sidebar-text)" }}
        >
          {label}
        </p>
      ) : null}
      <ul className="flex flex-col gap-0.5">
        {items.map((item, i) => {
          const match = item.match ?? item.to;
          const active = match === "/" ? currentPath === "/" : currentPath === match;
          const Icon = item.icon;
          return (
            <li key={`${item.label}-${i}`}>
              <Link
                to={item.to}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                  active
                    ? "text-white"
                    : "text-[color:var(--color-sidebar-text)] hover:bg-[color:var(--color-sidebar-hover)] hover:text-white",
                )}
                style={active ? { background: "#0055E0" } : undefined}
              >
                <Icon className="size-4 shrink-0" />
                <span className="flex-1 truncate">{item.label}</span>
                {typeof item.badge === "number" && item.badge > 0 ? (
                  <span
                    className={cn(
                      "rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                      active
                        ? "bg-white/20 text-white"
                        : "bg-white/[0.08] text-white/70",
                    )}
                  >
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}