import { useState } from "react";
import { useNavigate } from "react-router";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { AuditEntryDTO } from "../../lib/rpc-types";
import { cn, formatDuration, relativeTime } from "../../lib/utils";

const RESULT_STYLES = {
  success: "border-l-success text-success",
  denied: "border-l-denied text-denied",
  error: "border-l-error text-error",
} as const;

const RESULT_BG = {
  success: "bg-success/10",
  denied: "bg-denied/10",
  error: "bg-error/10",
} as const;

export function AuditEntryCard({ entry }: { entry: AuditEntryDTO }) {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();

  return (
    <div
      className={cn(
        "border border-border rounded-md border-l-4 transition-colors",
        RESULT_STYLES[entry.result],
      )}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-3 py-2 text-left"
      >
        {expanded ? (
          <ChevronDown size={14} className="text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight size={14} className="text-muted-foreground shrink-0" />
        )}

        <span className="text-xs text-muted-foreground font-mono w-20 shrink-0">
          {relativeTime(entry.timestamp)}
        </span>

        <span
          className={cn(
            "text-xs font-mono px-1.5 py-0.5 rounded shrink-0",
            RESULT_BG[entry.result],
          )}
        >
          {entry.capability}
        </span>

        <span className="text-sm text-foreground font-medium truncate">
          {entry.operation}
        </span>

        <span className="flex-1" />

        <span className="text-xs text-muted-foreground truncate max-w-32">
          {entry.sessionName}
        </span>

        {entry.duration != null && (
          <span className="text-xs text-muted-foreground font-mono shrink-0">
            {formatDuration(entry.duration)}
          </span>
        )}

        <span
          className={cn(
            "text-xs font-medium uppercase px-1.5 py-0.5 rounded shrink-0",
            RESULT_BG[entry.result],
          )}
        >
          {entry.result}
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-3 pt-1 border-t border-border space-y-2">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
            <div>
              <span className="text-muted-foreground">Session: </span>
              <button
                onClick={() => navigate(`/sessions/${entry.sessionId}`)}
                className="font-mono text-blue-400 hover:underline"
              >
                {entry.sessionId}
              </button>
            </div>
            <div>
              <span className="text-muted-foreground">Timestamp: </span>
              <span className="font-mono text-foreground">
                {new Date(entry.timestamp).toLocaleString()}
              </span>
            </div>
            {entry.error && (
              <div className="col-span-2">
                <span className="text-muted-foreground">Error: </span>
                <span className="text-error">{entry.error}</span>
              </div>
            )}
            {entry.parentId && (
              <div>
                <span className="text-muted-foreground">Parent: </span>
                <span className="font-mono text-foreground">
                  {entry.parentId}
                </span>
              </div>
            )}
          </div>
          {Object.keys(entry.args).length > 0 && (
            <div>
              <span className="text-xs text-muted-foreground">Args:</span>
              <pre className="mt-1 text-xs font-mono bg-background rounded p-2 overflow-auto max-h-40 text-foreground">
                {JSON.stringify(entry.args, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
