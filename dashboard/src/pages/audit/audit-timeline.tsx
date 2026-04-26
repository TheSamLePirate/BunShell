import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/rpc-client";
import { queryKeys } from "../../lib/query-keys";
import { useUIStore } from "../../stores/ui-store";
import { useAuditStream } from "../../hooks/use-audit-stream";
import { AuditEntryCard } from "./audit-entry-card";
import { Loader2, Radio } from "lucide-react";
import type { AuditEntryDTO } from "../../lib/rpc-types";

export function AuditTimeline() {
  const filters = useUIStore((s) => s.auditFilters);

  // Polling for historical data
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.audit.global(filters as Record<string, unknown>),
    queryFn: () => api.admin.auditQuery({ ...filters, limit: 200 }),
    refetchInterval: 3000,
  });

  // SSE for real-time new entries
  const { entries: liveEntries, connected } = useAuditStream(filters);

  // Merge: live entries first, then polled entries (deduplicated by timestamp+operation)
  const polledEntries = data?.entries ?? [];
  const seen = new Set<string>();
  const merged: AuditEntryDTO[] = [];

  for (const e of liveEntries) {
    const key = `${e.timestamp}-${e.sessionId}-${e.operation}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(e);
    }
  }
  for (const e of polledEntries) {
    const key = `${e.timestamp}-${e.sessionId}-${e.operation}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(e);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-foreground">
          Timeline
          {data && (
            <span className="text-muted-foreground font-normal ml-2">
              ({data.total} total)
            </span>
          )}
        </h2>
        <div className="flex items-center gap-2">
          {connected && (
            <span className="flex items-center gap-1 text-xs text-success">
              <Radio size={12} className="animate-pulse" />
              Live
            </span>
          )}
          {isLoading && (
            <Loader2 size={14} className="animate-spin text-muted-foreground" />
          )}
        </div>
      </div>

      {merged.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No audit entries yet. Create a session and execute some code.
        </div>
      ) : (
        <div className="space-y-1.5">
          {merged.map((entry, i) => (
            <AuditEntryCard key={`${entry.timestamp}-${i}`} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
