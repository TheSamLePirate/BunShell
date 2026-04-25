import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/rpc-client";
import { queryKeys } from "../../lib/query-keys";
import { useNavigate } from "react-router";
import { Plus, Trash2, ExternalLink } from "lucide-react";
import { relativeTime } from "../../lib/utils";
import { useState } from "react";
import { SessionCreateDialog } from "./session-create-dialog";

export function SessionsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.sessions.all,
    queryFn: api.sessions.list,
    refetchInterval: 5000,
  });

  const destroyMutation = useMutation({
    mutationFn: (sessionId: string) => api.sessions.destroy(sessionId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all }),
  });

  const sessions = data?.sessions ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-foreground">
          Active Sessions ({sessions.length})
        </h2>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
        >
          <Plus size={14} />
          New Session
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          Loading...
        </div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No active sessions. Create one to get started.
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-left">
                <th className="px-4 py-2 font-medium text-muted-foreground">
                  Name
                </th>
                <th className="px-4 py-2 font-medium text-muted-foreground">
                  Session ID
                </th>
                <th className="px-4 py-2 font-medium text-muted-foreground">
                  Files
                </th>
                <th className="px-4 py-2 font-medium text-muted-foreground">
                  Created
                </th>
                <th className="px-4 py-2 font-medium text-muted-foreground w-24">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr
                  key={s.sessionId}
                  className="border-t border-border hover:bg-muted/30 cursor-pointer"
                  onClick={() => navigate(`/sessions/${s.sessionId}`)}
                >
                  <td className="px-4 py-2 font-medium text-foreground">
                    {s.name}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                    {s.sessionId}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {s.fileCount}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {relativeTime(s.createdAt)}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/sessions/${s.sessionId}`);
                        }}
                        className="p-1 text-muted-foreground hover:text-foreground"
                        title="Open"
                      >
                        <ExternalLink size={14} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          destroyMutation.mutate(s.sessionId);
                        }}
                        className="p-1 text-muted-foreground hover:text-error"
                        title="Destroy"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <SessionCreateDialog onClose={() => setShowCreate(false)} />
      )}
    </div>
  );
}
