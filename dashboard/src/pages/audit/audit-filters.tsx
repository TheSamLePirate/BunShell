import { useUIStore } from "../../stores/ui-store";
import { CAPABILITY_KINDS } from "../../lib/rpc-types";
import { X } from "lucide-react";

export function AuditFilters() {
  const filters = useUIStore((s) => s.auditFilters);
  const setFilters = useUIStore((s) => s.setAuditFilters);
  const clear = useUIStore((s) => s.clearAuditFilters);

  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg border border-border bg-card">
      <select
        value={filters.capability ?? ""}
        onChange={(e) =>
          setFilters({ capability: e.target.value || undefined })
        }
        className="bg-background border border-border rounded-md px-3 py-1.5 text-sm text-foreground"
      >
        <option value="">All capabilities</option>
        {CAPABILITY_KINDS.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>

      <select
        value={filters.result ?? ""}
        onChange={(e) => setFilters({ result: e.target.value || undefined })}
        className="bg-background border border-border rounded-md px-3 py-1.5 text-sm text-foreground"
      >
        <option value="">All results</option>
        <option value="success">Success</option>
        <option value="denied">Denied</option>
        <option value="error">Error</option>
      </select>

      <input
        type="text"
        placeholder="Session ID..."
        value={filters.sessionId ?? ""}
        onChange={(e) => setFilters({ sessionId: e.target.value || undefined })}
        className="bg-background border border-border rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground w-48"
      />

      <input
        type="text"
        placeholder="Operation..."
        value={filters.operation ?? ""}
        onChange={(e) => setFilters({ operation: e.target.value || undefined })}
        className="bg-background border border-border rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground w-36"
      />

      {hasFilters && (
        <button
          onClick={clear}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <X size={12} />
          Clear
        </button>
      )}
    </div>
  );
}
