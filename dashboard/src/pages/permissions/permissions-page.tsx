import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/rpc-client";
import { queryKeys } from "../../lib/query-keys";
import { CapabilityBuilder } from "./capability-builder";
import { Check, X, Shield } from "lucide-react";
import type { Capability } from "../../lib/rpc-types";

export function PermissionsPage() {
  const [capabilities, setCapabilities] = useState<Capability[]>([]);

  return (
    <div className="space-y-8">
      {/* Builder section */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
          <Shield size={16} />
          Capability Builder
        </h2>
        <p className="text-xs text-muted-foreground">
          Build capability sets for sessions and agents. Use presets or add
          individual capabilities.
        </p>
        <div className="border border-border rounded-lg p-4 bg-card">
          <CapabilityBuilder
            capabilities={capabilities}
            onChange={setCapabilities}
          />
        </div>
        {capabilities.length > 0 && (
          <details className="text-xs">
            <summary className="text-muted-foreground cursor-pointer hover:text-foreground">
              JSON output
            </summary>
            <pre className="mt-2 p-3 bg-background border border-border rounded-md font-mono overflow-auto max-h-48 text-foreground">
              {JSON.stringify(capabilities, null, 2)}
            </pre>
          </details>
        )}
      </section>

      {/* Plugin approval queue */}
      <PluginQueue />
    </div>
  );
}

function PluginQueue() {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: queryKeys.plugins.pending,
    queryFn: api.admin.pluginsPending,
    refetchInterval: 5000,
  });

  const approveMutation = useMutation({
    mutationFn: ({
      sessionId,
      pluginName,
    }: {
      sessionId: string;
      pluginName: string;
    }) => api.plugins.approve(sessionId, pluginName),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.plugins.pending }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({
      sessionId,
      pluginName,
    }: {
      sessionId: string;
      pluginName: string;
    }) => api.plugins.reject(sessionId, pluginName),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.plugins.pending }),
  });

  const plugins = data?.plugins ?? [];

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-foreground">
        Plugin Approval Queue ({plugins.length})
      </h2>
      {plugins.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm border border-border rounded-lg">
          No plugins pending approval.
        </div>
      ) : (
        <div className="space-y-2">
          {plugins.map((pl) => (
            <div
              key={`${pl.sessionId}-${pl.pluginName}`}
              className="border border-border rounded-lg p-4 bg-card"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-medium text-foreground">
                    {pl.pluginName}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Session: {pl.sessionName} ({pl.sessionId})
                  </p>
                  {pl.exports.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Exports: {pl.exports.join(", ")}
                    </p>
                  )}
                  {pl.errors.length > 0 && (
                    <div className="mt-1">
                      {pl.errors.map((err, i) => (
                        <p key={i} className="text-xs text-error">
                          {err}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() =>
                      approveMutation.mutate({
                        sessionId: pl.sessionId,
                        pluginName: pl.pluginName,
                      })
                    }
                    disabled={!pl.valid}
                    className="p-1.5 text-success hover:bg-success/10 rounded disabled:opacity-30"
                    title="Approve"
                  >
                    <Check size={16} />
                  </button>
                  <button
                    onClick={() =>
                      rejectMutation.mutate({
                        sessionId: pl.sessionId,
                        pluginName: pl.pluginName,
                      })
                    }
                    className="p-1.5 text-error hover:bg-error/10 rounded"
                    title="Reject"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
