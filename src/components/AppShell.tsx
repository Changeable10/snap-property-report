import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";
import { AdminTestBanner } from "./AdminTestBanner";
import { useServerFn } from "@tanstack/react-start";
import { claimTeamInvites } from "@/lib/team.functions";

interface AppShellProps {
  user: User | null;
  children: ReactNode;
}

export function AppShell({ user, children }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const claim = useServerFn(claimTeamInvites);
  useEffect(() => {
    if (!user?.id) return;
    const key = `snapsure-invite-claimed-${user.id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    claim().catch(() => {
      /* silent — best-effort */
    });
  }, [user?.id, claim]);
  return (
    <div className="min-h-screen bg-background">
      <Sidebar user={user as never} />

      {/* Mobile top bar */}
      <header
        className="sticky top-0 z-30 flex h-14 items-center justify-between px-4 md:hidden"
        style={{ background: "var(--color-sidebar-bg)" }}
      >
        <Link to="/" className="flex items-center">
          <img src="/snapsure-logo.png" alt="Snapsure" className="h-6 w-auto" />
        </Link>
        <button
          type="button"
          onClick={() => setDrawerOpen((v) => !v)}
          className="grid size-10 place-items-center rounded-lg text-white/80 hover:bg-white/10"
          aria-label={drawerOpen ? "Close menu" : "Open menu"}
        >
          {drawerOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </header>

      {/* Mobile drawer (simple overlay of the sidebar contents) */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
          />
          <div
            className="absolute inset-y-0 left-0 w-[260px]"
            onClick={() => setDrawerOpen(false)}
          >
            <Sidebar user={user as never} forceShow />
          </div>
        </div>
      ) : null}

      <div className="md:pl-[250px]">
        <AdminTestBanner userId={user?.id} />
        <main className="mx-auto w-full max-w-[1200px] px-4 pb-24 pt-4 md:px-8 md:pb-10 md:pt-7">
          {children}
        </main>
      </div>

      <BottomNav />
    </div>
  );
}