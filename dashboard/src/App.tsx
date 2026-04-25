import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RootLayout } from "./components/layout/root-layout";
import { AuditPage } from "./pages/audit/audit-page";
import { SessionsPage } from "./pages/sessions/sessions-page";
import { SessionDetail } from "./pages/sessions/session-detail";
import { AgentsPage } from "./pages/agents/agents-page";
import { PermissionsPage } from "./pages/permissions/permissions-page";
import { ConfigPage } from "./pages/config/config-page";
import { ReplPage } from "./pages/repl/repl-page";
import { ApiReferencePage } from "./pages/api-reference/api-reference-page";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2000,
      refetchOnWindowFocus: true,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<RootLayout />}>
            <Route index element={<Navigate to="/repl" replace />} />
            <Route path="repl" element={<ReplPage />} />
            <Route path="audit" element={<AuditPage />} />
            <Route path="sessions" element={<SessionsPage />} />
            <Route path="sessions/:sessionId" element={<SessionDetail />} />
            <Route path="agents" element={<AgentsPage />} />
            <Route path="permissions" element={<PermissionsPage />} />
            <Route path="api" element={<ApiReferencePage />} />
            <Route path="config" element={<ConfigPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
