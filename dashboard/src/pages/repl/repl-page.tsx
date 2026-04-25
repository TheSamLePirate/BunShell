import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/rpc-client";
import { queryKeys } from "../../lib/query-keys";
import { useState } from "react";
import { ReplTerminal } from "./repl-terminal";
import { ReplSidebar } from "./repl-sidebar";
import type { SessionInfo } from "../../lib/rpc-types";

export function ReplPage() {
  const [selectedSession, setSelectedSession] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: queryKeys.sessions.all,
    queryFn: api.sessions.list,
    refetchInterval: 5000,
  });

  const sessions = data?.sessions ?? [];
  const session = sessions.find(
    (s: SessionInfo) => s.sessionId === selectedSession,
  );

  return (
    <div className="flex gap-4 h-[calc(100vh-8rem)]">
      {/* Main REPL area */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedSession && session ? (
          <ReplTerminal
            sessionId={selectedSession}
            sessionName={session.name}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center border border-border rounded-lg border-dashed">
            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                Select a session from the sidebar or create a new one
              </p>
              <p className="text-xs text-muted-foreground">
                The REPL gives you a live TypeScript shell into any BunShell
                session
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Session picker sidebar */}
      <ReplSidebar
        sessions={sessions}
        selectedSession={selectedSession}
        onSelect={setSelectedSession}
      />
    </div>
  );
}
