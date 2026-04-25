import { Outlet } from "react-router";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { useHealth } from "../../hooks/use-health";

export function RootLayout() {
  const { isError } = useHealth();

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        {isError && (
          <div className="bg-destructive/20 border-b border-destructive/50 px-4 py-2 text-sm text-destructive-foreground">
            Server unreachable at{" "}
            {import.meta.env.VITE_BUNSHELL_URL ?? "http://127.0.0.1:7483"}
          </div>
        )}
        <Header />
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
