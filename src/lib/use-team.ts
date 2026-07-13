import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyTeam } from "@/lib/team.functions";

export function useMyTeam(enabled = true) {
  const fn = useServerFn(getMyTeam);
  return useQuery({
    queryKey: ["my-team"],
    queryFn: () => fn(),
    enabled,
    staleTime: 30_000,
  });
}