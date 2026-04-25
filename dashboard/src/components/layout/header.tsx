import { useLocation } from "react-router";

const TITLES: Record<string, string> = {
  "/repl": "REPL Shell",
  "/audit": "Audit Dashboard",
  "/sessions": "Sessions",
  "/agents": "Agents",
  "/permissions": "Permissions",
  "/api": "API Reference",
  "/config": "Configuration",
};

export function Header() {
  const location = useLocation();
  const basePath = "/" + location.pathname.split("/")[1];
  const title = TITLES[basePath] ?? "BunShell";

  return (
    <header className="h-14 border-b border-border flex items-center px-6 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
      <h1 className="text-sm font-medium text-foreground">{title}</h1>
    </header>
  );
}
