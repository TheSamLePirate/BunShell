import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/rpc-client";
import { queryKeys } from "../../lib/query-keys";
import { Play, Loader2, Trash2 } from "lucide-react";
import { formatDuration } from "../../lib/utils";
import { useAuditStream } from "../../hooks/use-audit-stream";
import { AuditEntryCard } from "../audit/audit-entry-card";
import type { ExecResult } from "../../lib/rpc-types";

export function SessionExecutor({ sessionId }: { sessionId: string }) {
  const [code, setCode] = useState("");
  const [history, setHistory] = useState<
    Array<{ code: string; result?: ExecResult; error?: string }>
  >([]);
  const queryClient = useQueryClient();

  // Live audit stream scoped to this session
  const {
    entries: liveEntries,
    connected,
    clear: clearLive,
  } = useAuditStream({
    sessionId,
  });

  const mutation = useMutation({
    mutationFn: () => api.sessions.execute(sessionId, code),
    onSuccess: (result) => {
      setHistory((prev) => [{ code, result }, ...prev]);
      setCode("");
      // Refresh session detail (execution count, VFS changes, audit count)
      queryClient.invalidateQueries({
        queryKey: queryKeys.sessions.detail(sessionId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.sessions.vfs(sessionId, "/"),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.stats });
    },
    onError: (err) => {
      setHistory((prev) => [{ code, error: (err as Error).message }, ...prev]);
      queryClient.invalidateQueries({
        queryKey: queryKeys.sessions.detail(sessionId),
      });
    },
  });

  return (
    <div className="flex gap-4">
      {/* Left: editor + results */}
      <div className="flex-1 space-y-4 min-w-0">
        {/* Editor */}
        <div className="border border-border rounded-lg overflow-hidden">
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={`// TypeScript — try:\n//   ls("/")\n//   write("/hello.txt", "world")\n//   cat("/hello.txt")`}
            className="w-full bg-background text-foreground font-mono text-sm p-3 min-h-36 resize-y focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                if (code.trim()) mutation.mutate();
              }
            }}
          />
          <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-t border-border">
            <span className="text-xs text-muted-foreground">
              {navigator.platform.includes("Mac") ? "Cmd" : "Ctrl"}+Enter to
              execute
            </span>
            <button
              onClick={() => mutation.mutate()}
              disabled={!code.trim() || mutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
            >
              {mutation.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Play size={14} />
              )}
              Execute
            </button>
          </div>
        </div>

        {/* Execution history */}
        {history.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-medium text-muted-foreground">
                Execution History ({history.length})
              </h3>
              <button
                onClick={() => setHistory([])}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <Trash2 size={10} />
                Clear
              </button>
            </div>
            {history.map((item, i) => (
              <div key={i} className="border border-border rounded-lg">
                <div className="px-3 py-1.5 bg-muted/30 border-b border-border flex items-center justify-between">
                  <code className="text-xs text-muted-foreground truncate flex-1">
                    {item.code}
                  </code>
                  {item.result && (
                    <span className="text-xs text-muted-foreground ml-2 shrink-0">
                      {formatDuration(item.result.duration)}
                    </span>
                  )}
                </div>
                {item.result ? (
                  <div className="p-3">
                    <div className="flex items-center gap-3 mb-2 text-xs text-muted-foreground">
                      <span className="px-1.5 py-0.5 rounded bg-success/10 text-success">
                        {item.result.type}
                      </span>
                      <span>{item.result.auditEntries} audit entries</span>
                    </div>
                    <pre className="text-sm font-mono text-foreground bg-background rounded p-2 overflow-auto max-h-48">
                      {typeof item.result.value === "string"
                        ? item.result.value
                        : JSON.stringify(item.result.value, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <div className="p-3 text-sm text-error">{item.error}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right: live audit feed */}
      <div className="w-80 shrink-0 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium text-muted-foreground">
            Live Activity
          </h3>
          <div className="flex items-center gap-2">
            {connected && (
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            )}
            {liveEntries.length > 0 && (
              <button
                onClick={clearLive}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>
        </div>
        <div className="border border-border rounded-lg overflow-hidden max-h-[calc(100vh-280px)] overflow-y-auto">
          {liveEntries.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">
              Execute code to see live audit entries here
            </div>
          ) : (
            <div className="p-1.5 space-y-1">
              {liveEntries.map((entry, i) => (
                <AuditEntryCard key={`${entry.timestamp}-${i}`} entry={entry} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
