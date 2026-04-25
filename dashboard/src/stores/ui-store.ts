import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface AuditFilters {
  sessionId?: string;
  capability?: string;
  operation?: string;
  result?: string;
  since?: string;
  until?: string;
}

interface UIStore {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  auditFilters: AuditFilters;
  setAuditFilters: (filters: Partial<AuditFilters>) => void;
  clearAuditFilters: () => void;
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      auditFilters: {},
      setAuditFilters: (filters) =>
        set((state) => ({
          auditFilters: { ...state.auditFilters, ...filters },
        })),
      clearAuditFilters: () => set({ auditFilters: {} }),
    }),
    { name: "bunshell-ui" },
  ),
);
