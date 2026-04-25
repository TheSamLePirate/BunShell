import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/rpc-client";
import { queryKeys } from "../lib/query-keys";

export function useHealth() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: api.health,
    refetchInterval: 10000,
    retry: 1,
  });
}
