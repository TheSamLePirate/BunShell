import { AuditStats } from "./audit-stats";
import { AuditFilters } from "./audit-filters";
import { AuditTimeline } from "./audit-timeline";

export function AuditPage() {
  return (
    <div className="space-y-6">
      <AuditStats />
      <AuditFilters />
      <AuditTimeline />
    </div>
  );
}
