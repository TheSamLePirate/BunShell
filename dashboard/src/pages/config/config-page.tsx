import { useHealth } from "../../hooks/use-health";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/rpc-client";
import { queryKeys } from "../../lib/query-keys";
import { formatDuration } from "../../lib/utils";
import { Server, Activity, Clock, Database } from "lucide-react";

export function ConfigPage() {
  const { data: health, isError } = useHealth();
  const { data: stats } = useQuery({
    queryKey: queryKeys.stats,
    queryFn: api.admin.stats,
    refetchInterval: 10000,
  });

  return (
    <div className="space-y-6">
      {/* Server status */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
          <Server size={16} />
          Server Status
        </h2>
        <div className="border border-border rounded-lg p-4 bg-card">
          <div className="flex items-center gap-3 mb-4">
            <div
              className={`w-3 h-3 rounded-full ${isError ? "bg-error" : "bg-success"}`}
            />
            <span className="text-sm text-foreground">
              {isError ? "Offline" : "Online"}
            </span>
            {health && (
              <span className="text-xs text-muted-foreground">
                {health.name} v{health.version} ({health.protocol})
              </span>
            )}
          </div>

          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatusCard
                icon={Clock}
                label="Uptime"
                value={formatDuration(stats.uptime)}
              />
              <StatusCard
                icon={Database}
                label="Active Sessions"
                value={String(stats.activeSessions)}
              />
              <StatusCard
                icon={Activity}
                label="Total Executions"
                value={stats.totalExecutions.toLocaleString()}
              />
              <StatusCard
                icon={Activity}
                label="Audit Entries"
                value={stats.totalAuditEntries.toLocaleString()}
              />
            </div>
          )}
        </div>
      </section>

      {/* Capability breakdown */}
      {stats && stats.capabilityBreakdown.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-foreground">
            Capability Usage
          </h2>
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-left">
                  <th className="px-4 py-2 font-medium text-muted-foreground">
                    Capability
                  </th>
                  <th className="px-4 py-2 font-medium text-muted-foreground text-right">
                    Total
                  </th>
                  <th className="px-4 py-2 font-medium text-muted-foreground text-right">
                    Denied
                  </th>
                  <th className="px-4 py-2 font-medium text-muted-foreground text-right">
                    Errors
                  </th>
                </tr>
              </thead>
              <tbody>
                {stats.capabilityBreakdown
                  .sort((a, b) => b.count - a.count)
                  .map((cap) => (
                    <tr key={cap.capability} className="border-t border-border">
                      <td className="px-4 py-2 font-mono text-xs text-foreground">
                        {cap.capability}
                      </td>
                      <td className="px-4 py-2 text-right text-foreground">
                        {cap.count}
                      </td>
                      <td className="px-4 py-2 text-right text-denied">
                        {cap.denied || "-"}
                      </td>
                      <td className="px-4 py-2 text-right text-error">
                        {cap.errors || "-"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Recent errors */}
      {stats && stats.recentErrors.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-foreground">Recent Errors</h2>
          <div className="space-y-1.5">
            {stats.recentErrors.map((err, i) => (
              <div
                key={i}
                className="border border-border rounded-md p-3 bg-card"
              >
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-muted-foreground">
                    {new Date(err.timestamp).toLocaleString()}
                  </span>
                  <span className="font-mono text-foreground">
                    {err.capability}
                  </span>
                  <span className="text-foreground">{err.operation}</span>
                </div>
                <p className="text-xs text-error mt-1">{err.error}</p>
                <p className="text-xs text-muted-foreground">
                  Session: {err.sessionName}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function StatusCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Server;
  label: string;
  value: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon size={12} />
        {label}
      </div>
      <div className="text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}
