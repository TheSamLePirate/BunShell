import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/rpc-client";
import { queryKeys } from "../../lib/query-keys";
import { useAuditStream } from "../../hooks/use-audit-stream";
import { AuditEntryCard } from "../audit/audit-entry-card";
import { Radio, Loader2, Filter } from "lucide-react";
import { useState } from "react";
import { CAPABILITY_KINDS } from "../../lib/rpc-types";
import type { AuditEntryDTO } from "../../lib/rpc-types";

export function SessionLiveAudit({ sessionId }: { sessionId: string }) {
  const [capFilter, setCapFilter] = useState<string>("");
  const [resultFilter, setResultFilter] = useState<string>("");

  // Polling for historical data — uses admin.audit.query for full detail
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.audit.global({
      sessionId,
      capability: capFilter || undefined,
      result: resultFilter || undefined,
    }),
    queryFn: () =>
      api.admin.auditQuery({
        sessionId,
        capability: capFilter || undefined,
        result: resultFilter || undefined,
        limit: 200,
      }),
    refetchInterval: 2000,
  });

  // SSE for real-time entries scoped to this session
  const { entries: liveEntries, connected } = useAuditStream({
    sessionId,
    capability: capFilter || undefined,
    result: resultFilter || undefined,
  });

  // Merge live + polled, deduplicate
  const polledEntries = data?.entries ?? [];
  const seen = new Set<string>();
  const merged: AuditEntryDTO[] = [];

  for (const e of liveEntries) {
    const key = `${e.timestamp}-${e.operation}-${e.capability}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(e);
    }
  }
  for (const e of polledEntries) {
    const key = `${e.timestamp}-${e.operation}-${e.capability}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(e);
    }
  }

  const successCount = merged.filter((e) => e.result === "success").length;
  const deniedCount = merged.filter((e) => e.result === "denied").length;
  const errorCount = merged.filter((e) => e.result === "error").length;

  return (
    <div className="space-y-3">
      {/* Header with status + filters */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-medium text-foreground">
            Live Audit Trail
          </h3>
          {connected ? (
            <span className="flex items-center gap-1 text-xs text-success">
              <Radio size={12} className="animate-pulse" />
              Live
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">Polling</span>
          )}
          {isLoading && (
            <Loader2 size={14} className="animate-spin text-muted-foreground" />
          )}
        </div>

        {/* Quick stats */}
        <div className="flex items-center gap-2 text-xs">
          {successCount > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-success/10 text-success">
              {successCount} success
            </span>
          )}
          {deniedCount > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-denied/10 text-denied">
              {deniedCount} denied
            </span>
          )}
          {errorCount > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-error/10 text-error">
              {errorCount} error
            </span>
          )}
          <span className="text-muted-foreground">{merged.length} total</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <Filter size={14} className="text-muted-foreground" />
        <select
          value={capFilter}
          onChange={(e) => setCapFilter(e.target.value)}
          className="bg-background border border-border rounded-md px-2 py-1 text-xs text-foreground"
        >
          <option value="">All capabilities</option>
          {CAPABILITY_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <select
          value={resultFilter}
          onChange={(e) => setResultFilter(e.target.value)}
          className="bg-background border border-border rounded-md px-2 py-1 text-xs text-foreground"
        >
          <option value="">All results</option>
          <option value="success">Success</option>
          <option value="denied">Denied</option>
          <option value="error">Error</option>
        </select>
      </div>

      {/* Entries */}
      {merged.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm border border-border rounded-lg border-dashed">
          No audit entries yet. Execute code to see activity here in real-time.
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
