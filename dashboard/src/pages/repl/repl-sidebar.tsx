import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/rpc-client";
import { queryKeys } from "../../lib/query-keys";
import { Plus, Terminal, Trash2 } from "lucide-react";
import { cn, relativeTime } from "../../lib/utils";
import type { SessionInfo, Capability } from "../../lib/rpc-types";
import { CapabilityBuilder } from "../permissions/capability-builder";

interface ReplSidebarProps {
  sessions: SessionInfo[];
  selectedSession: string | null;
  onSelect: (id: string) => void;
}

export function ReplSidebar({
  sessions,
  selectedSession,
  onSelect,
}: ReplSidebarProps) {
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="w-64 shrink-0 flex flex-col border border-border rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-muted/30 border-b border-border flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Sessions
        </span>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="p-1 text-muted-foreground hover:text-foreground"
          title="New session"
        >
          <Plus size={14} />
        </button>
      </div>

      {showCreate && (
        <QuickCreate
          onCreated={(id) => {
            onSelect(id);
            setShowCreate(false);
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 ? (
          <div className="p-3 text-xs text-muted-foreground text-center">
            No sessions
          </div>
        ) : (
          sessions.map((s) => (
            <button
              key={s.sessionId}
              onClick={() => onSelect(s.sessionId)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 text-left border-b border-border transition-colors",
                selectedSession === s.sessionId
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-muted/30",
              )}
            >
              <Terminal size={14} className="text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium truncate">{s.name}</div>
                <div className="text-[10px] text-muted-foreground">
                  {s.fileCount} files &middot; {relativeTime(s.createdAt)}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function QuickCreate({
  onCreated,
  onCancel,
}: {
  onCreated: (id: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("repl-session");
  const [caps, setCaps] = useState<Capability[]>([
    { kind: "fs:read", pattern: "**" },
    { kind: "fs:write", pattern: "**" },
    { kind: "fs:delete", pattern: "**" },
  ]);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => api.sessions.create({ name, capabilities: caps }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
      onCreated(result.sessionId);
    },
  });

  return (
    <div className="p-3 border-b border-border space-y-2 bg-card">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="session name"
        className="w-full bg-background border border-border rounded px-2 py-1 text-xs text-foreground"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter") mutation.mutate();
          if (e.key === "Escape") onCancel();
        }}
      />
      <CapabilityBuilder capabilities={caps} onChange={setCaps} />
      <div className="flex gap-1">
        <button
          onClick={() => mutation.mutate()}
          disabled={!name || mutation.isPending}
          className="flex-1 px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
        >
          {mutation.isPending ? "..." : "Create"}
        </button>
        <button
          onClick={onCancel}
          className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}
