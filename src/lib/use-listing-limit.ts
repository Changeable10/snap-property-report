import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Plan } from "@/lib/use-plan";

export const LISTING_MONTHLY_LIMIT: Record<Plan, number> = {
  free: 1,
  professional: 5,
  portfolio: Infinity,
  agency: Infinity,
};

export function useListingsThisMonth(userId: string | undefined) {
  return useQuery({
    queryKey: ["listings-this-month", userId],
    enabled: !!userId,
    queryFn: async (): Promise<number> => {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const { count } = await supabase
        .from("listings")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId!)
        .gte("created_at", since.toISOString());
      return count ?? 0;
    },
  });
}