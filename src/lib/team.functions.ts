import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---- Get my team (owned or member of) ----
export const getMyTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // Team the user owns
    const owned = await supabase
      .from("teams")
      .select("*")
      .eq("owner_id", userId)
      .maybeSingle();
    if (owned.error) throw owned.error;

    let team = owned.data;

    // Team the user is an active member of (not owner)
    if (!team) {
      const membership = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", userId)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      if (membership.error) throw membership.error;
      if (membership.data) {
        const t = await supabase
          .from("teams")
          .select("*")
          .eq("id", membership.data.team_id)
          .maybeSingle();
        if (t.error) throw t.error;
        team = t.data;
      }
    }

    if (!team) return { team: null, members: [], myRole: null as string | null };

    const members = await supabase
      .from("team_members")
      .select("*")
      .eq("team_id", team.id)
      .order("created_at", { ascending: true });
    if (members.error) throw members.error;

    const myMembership = (members.data ?? []).find((m) => m.user_id === userId);
    const myRole = team.owner_id === userId ? "owner" : (myMembership?.role ?? null);

    return { team, members: members.data ?? [], myRole };
  });

// ---- Create team for the current user (Agency) ----
export const createMyTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ name: z.string().trim().min(1).max(80) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;

    // Ensure user does not already own a team
    const existing = await supabase
      .from("teams")
      .select("id")
      .eq("owner_id", userId)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return { teamId: existing.data.id };

    const insert = await supabase
      .from("teams")
      .insert({ name: data.name, owner_id: userId, plan: "agency" })
      .select("id")
      .single();
    if (insert.error) throw insert.error;

    const email = (claims.email as string | undefined) ?? "";
    await supabase.from("team_members").insert({
      team_id: insert.data.id,
      user_id: userId,
      invited_email: email || `${userId}@user`,
      role: "owner",
      status: "active",
      joined_at: new Date().toISOString(),
    });

    return { teamId: insert.data.id };
  });

// ---- Update team name ----
export const updateTeamName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ teamId: z.string().uuid(), name: z.string().trim().min(1).max(80) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("teams")
      .update({ name: data.name })
      .eq("id", data.teamId);
    if (error) throw error;
    return { ok: true };
  });

// ---- Invite member ----
export const inviteTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        teamId: z.string().uuid(),
        email: z.string().trim().toLowerCase().email().max(255),
        role: z.enum(["admin", "member"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("team_members")
      .insert({
        team_id: data.teamId,
        invited_email: data.email,
        role: data.role,
        status: "invited",
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id };
  });

// ---- Update member role ----
export const updateMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        memberId: z.string().uuid(),
        role: z.enum(["admin", "member"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("team_members")
      .update({ role: data.role })
      .eq("id", data.memberId);
    if (error) throw error;
    return { ok: true };
  });

// ---- Remove member ----
export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ memberId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // Cannot remove owner via RLS anyway, but be explicit
    const { data: row } = await supabase
      .from("team_members")
      .select("role")
      .eq("id", data.memberId)
      .maybeSingle();
    if (row?.role === "owner") throw new Error("Cannot remove the team owner");
    const { error } = await supabase.from("team_members").delete().eq("id", data.memberId);
    if (error) throw error;
    return { ok: true };
  });

// ---- Claim any pending invites for the signed-in user (matched by email) ----
export const claimTeamInvites = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId, claims } = context;
    const email = (claims.email as string | undefined)?.toLowerCase();
    if (!email) return { claimed: 0 };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("team_members")
      .update({
        user_id: userId,
        status: "active",
        joined_at: new Date().toISOString(),
      })
      .ilike("invited_email", email)
      .eq("status", "invited")
      .select("id");
    if (error) throw error;
    return { claimed: data?.length ?? 0 };
  });