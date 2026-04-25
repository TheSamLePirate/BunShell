import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/rpc-client";
import { queryKeys } from "../../lib/query-keys";
import { Activity, ShieldAlert, XCircle, CheckCircle } from "lucide-react";
import { formatDuration } from "../../lib/utils";

export function AuditStats() {
  const { data: stats } = useQuery({
    queryKey: queryKeys.stats,
    queryFn: api.admin.stats,
    refetchInterval: 5000,
  });

  if (!stats) return null;

  const cards = [
    {
      label: "Total Events",
      value: stats.totalAuditEntries.toLocaleString(),
      icon: Activity,
      color: "text-foreground",
    },
    {
      label: "Sessions",
      value: `${stats.activeSessions} active`,
      icon: CheckCircle,
      color: "text-success",
    },
    {
      label: "Executions",
      value: stats.totalExecutions.toLocaleString(),
      icon: Activity,
      color: "text-blue-400",
    },
    {
      label: "Uptime",
      value: formatDuration(stats.uptime),
      icon: ShieldAlert,
      color: "text-muted-foreground",
    },
  ];

  const denied = stats.capabilityBreakdown.reduce(
    (sum, c) => sum + c.denied,
    0,
  );
  const errors = stats.capabilityBreakdown.reduce(
    (sum, c) => sum + c.errors,
    0,
  );

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-lg border border-border bg-card p-4"
        >
          <div className="flex items-center gap-2 mb-1">
            <card.icon size={14} className={card.color} />
            <span className="text-xs text-muted-foreground">{card.label}</span>
          </div>
          <div className="text-lg font-semibold text-foreground">
            {card.value}
          </div>
        </div>
      ))}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-1">
          <ShieldAlert size={14} className="text-denied" />
          <span className="text-xs text-muted-foreground">Denied</span>
        </div>
        <div className="text-lg font-semibold text-denied">{denied}</div>
      </div>
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-1">
          <XCircle size={14} className="text-error" />
          <span className="text-xs text-muted-foreground">Errors</span>
        </div>
        <div className="text-lg font-semibold text-error">{errors}</div>
      </div>
    </div>
  );
}
