import { NavLink } from "react-router";
import {
  Activity,
  Monitor,
  Bot,
  Shield,
  Settings,
  PanelLeftClose,
  PanelLeft,
  Terminal,
  BookOpen,
} from "lucide-react";
import { useHealth } from "../../hooks/use-health";
import { useUIStore } from "../../stores/ui-store";
import { cn } from "../../lib/utils";

const NAV_ITEMS = [
  { to: "/repl", icon: Terminal, label: "REPL" },
  { to: "/audit", icon: Activity, label: "Audit" },
  { to: "/sessions", icon: Monitor, label: "Sessions" },
  { to: "/agents", icon: Bot, label: "Agents" },
  { to: "/permissions", icon: Shield, label: "Permissions" },
  { to: "/api", icon: BookOpen, label: "API Reference" },
  { to: "/config", icon: Settings, label: "Config" },
];

export function Sidebar() {
  const { data: health, isError } = useHealth();
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggle = useUIStore((s) => s.toggleSidebar);

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-border bg-card h-screen sticky top-0 transition-all",
        collapsed ? "w-16" : "w-56",
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 h-14 border-b border-border">
        {!collapsed && (
          <span className="font-semibold text-sm tracking-tight">BunShell</span>
        )}
        <div className="flex-1" />
        <button
          onClick={toggle}
          className="p-1.5 rounded-md hover:bg-accent text-muted-foreground"
        >
          {collapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

      {/* Health indicator */}
      <div className="px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "w-2 h-2 rounded-full",
              isError ? "bg-error" : "bg-success",
            )}
          />
          {!collapsed && (
            <span className="text-xs text-muted-foreground">
              {isError ? "Offline" : `${health?.sessions ?? 0} sessions`}
            </span>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-4 py-2 text-sm transition-colors",
                isActive
                  ? "text-foreground bg-accent"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
              )
            }
          >
            <Icon size={18} />
            {!collapsed && label}
          </NavLink>
        ))}
      </nav>

      {/* Version */}
      {!collapsed && (
        <div className="px-4 py-3 border-t border-border">
          <span className="text-xs text-muted-foreground">
            v{health?.version ?? "0.1.0"}
          </span>
        </div>
      )}
    </aside>
  );
}
