import { useParams, useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/rpc-client";
import { queryKeys } from "../../lib/query-keys";
import { useState } from "react";
import { SessionExecutor } from "./session-executor";
import { VfsBrowser } from "./vfs-browser";
import { SessionLiveAudit } from "./session-live-audit";
import { cn, formatDuration, formatBytes, relativeTime } from "../../lib/utils";
import { ArrowLeft, Trash2 } from "lucide-react";

type Tab = "execute" | "files" | "audit";

export function SessionDetail() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [activeTab, setActiveTab] = useState<Tab>("execute");
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: detail, isLoading } = useQuery({
    queryKey: queryKeys.sessions.detail(sessionId!),
    queryFn: () => api.admin.sessionDetail(sessionId!),
    refetchInterval: 3000,
    enabled: !!sessionId,
  });

  async function handleDestroy() {
    if (!confirm(`Destroy session "${detail?.name}"?`)) return;
    await api.sessions.destroy(sessionId!);
    queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
    navigate("/sessions");
  }

  if (isLoading || !detail) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        Loading session...
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "execute", label: "Execute" },
    { key: "files", label: `Files (${detail.vfs.fileCount})` },
    { key: "audit", label: `Audit (${detail.auditSummary.totalEntries})` },
  ];

  return (
    <div className="space-y-4">
      {/* Back + Session info */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <button
            onClick={() => navigate("/sessions")}
            className="p-1.5 mt-0.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {detail.name}
            </h2>
            <p className="text-xs text-muted-foreground font-mono">
              {detail.sessionId}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>
              Executions:{" "}
              <span className="text-foreground">{detail.executions}</span>
            </span>
            <span>
              Timeout:{" "}
              <span className="text-foreground">
                {formatDuration(detail.timeout)}
              </span>
            </span>
            <span>
              VFS:{" "}
              <span className="text-foreground">
                {formatBytes(detail.vfs.totalBytes)}
              </span>
            </span>
            <span>
              Created:{" "}
              <span className="text-foreground">
                {relativeTime(detail.createdAt)}
              </span>
            </span>
          </div>
          <button
            onClick={handleDestroy}
            className="p-1.5 rounded-md text-muted-foreground hover:text-error hover:bg-error/10"
            title="Destroy session"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Capabilities */}
      <div className="flex flex-wrap gap-1.5">
        {detail.capabilities.map((cap, i) => (
          <span
            key={i}
            className="text-xs font-mono px-2 py-0.5 rounded bg-accent text-accent-foreground"
          >
            {cap.kind}
            {cap.constraint !== "*" && `: ${cap.constraint}`}
          </span>
        ))}
      </div>

      {/* Audit summary bar */}
      <div className="flex gap-3 text-xs">
        {Object.entries(detail.auditSummary.byResult).map(([result, count]) => (
          <span
            key={result}
            className={cn(
              "px-2 py-0.5 rounded font-medium",
              result === "success" && "bg-success/10 text-success",
              result === "denied" && "bg-denied/10 text-denied",
              result === "error" && "bg-error/10 text-error",
            )}
          >
            {count} {result}
          </span>
        ))}
        {Object.entries(detail.auditSummary.byCapability)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5)
          .map(([cap, count]) => (
            <span
              key={cap}
              className="px-2 py-0.5 rounded bg-muted text-muted-foreground"
            >
              {cap}: {count}
            </span>
          ))}
      </div>

      {/* Plugins status */}
      {(detail.plugins.loaded.length > 0 ||
        detail.plugins.pending.length > 0) && (
        <div className="flex flex-wrap gap-1.5 text-xs">
          {detail.plugins.loaded.map((pl) => (
            <span
              key={pl.name}
              className="px-2 py-0.5 rounded bg-success/10 text-success"
            >
              plugin:{pl.name} ({pl.exports.join(", ")})
            </span>
          ))}
          {detail.plugins.pending.map((pl) => (
            <span
              key={pl.name}
              className="px-2 py-0.5 rounded bg-denied/10 text-denied"
            >
              plugin:{pl.name} (pending)
            </span>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-border flex gap-0">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "px-4 py-2 text-sm border-b-2 transition-colors",
              activeTab === tab.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "execute" && <SessionExecutor sessionId={sessionId!} />}
      {activeTab === "files" && <VfsBrowser sessionId={sessionId!} />}
      {activeTab === "audit" && <SessionLiveAudit sessionId={sessionId!} />}
    </div>
  );
}
