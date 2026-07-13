import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Plan } from "@/lib/use-plan";

export const STAGING_MONTHLY_LIMIT: Record<Plan, number> = {
  free: 0,
  professional: 10,
  portfolio: 50,
  agency: Infinity,
};

export function useStagingThisMonth(userId: string | undefined) {
  return useQuery({
    queryKey: ["staging-this-month", userId],
    enabled: !!userId,
    queryFn: async (): Promise<number> => {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const { count } = await supabase
        .from("staging_usage")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId!)
        .gte("created_at", since.toISOString());
      return count ?? 0;
    },
  });
}

export const STAGING_STYLES: { key: string; label: string }[] = [
  { key: "modern", label: "Modern" },
  { key: "scandinavian", label: "Scandinavian" },
  { key: "minimalist", label: "Minimalist" },
  { key: "industrial", label: "Industrial" },
  { key: "farmhouse", label: "Farmhouse" },
  { key: "coastal", label: "Coastal" },
  { key: "traditional", label: "Traditional" },
  { key: "contemporary", label: "Contemporary" },
];