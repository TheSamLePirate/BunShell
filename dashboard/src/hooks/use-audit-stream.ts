import { useEffect, useRef, useCallback, useState } from "react";
import type { AuditEntryDTO } from "../lib/rpc-types";

// SSE connects directly to BunShell — NOT through the Vite proxy.
// Vite's http-proxy kills long-lived streaming connections ("socket hang up").
// In production (dashboard served by BunShell itself) a relative URL works
// because /events is on the same origin. In dev (vite on :5173), we need
// an absolute URL so EventSource bypasses vite's proxy.
const BUNSHELL_URL =
  import.meta.env.VITE_BUNSHELL_URL ??
  (import.meta.env.PROD ? "" : "http://127.0.0.1:7483");

const MAX_BACKOFF = 30_000;

export function useAuditStream(filters?: {
  sessionId?: string;
  capability?: string;
  result?: string;
}) {
  const [entries, setEntries] = useState<AuditEntryDTO[]>([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const backoffRef = useRef(1000);

  useEffect(() => {
    function connect() {
      const params = new URLSearchParams();
      if (filters?.sessionId) params.set("sessionId", filters.sessionId);
      if (filters?.capability) params.set("capability", filters.capability);
      if (filters?.result) params.set("result", filters.result);

      const qs = params.toString();
      const url = qs
        ? `${BUNSHELL_URL}/events?${qs}`
        : `${BUNSHELL_URL}/events`;

      const es = new EventSource(url);
      esRef.current = es;

      es.onopen = () => {
        setConnected(true);
        backoffRef.current = 1000; // reset on success
      };

      es.onmessage = (event) => {
        try {
          const entry = JSON.parse(event.data) as AuditEntryDTO;
          setEntries((prev) => [entry, ...prev].slice(0, 500));
        } catch {
          // Skip malformed events
        }
      };

      es.onerror = () => {
        setConnected(false);
        es.close();
        // Exponential backoff: 1s → 2s → 4s → 8s → ... → 30s max
        const delay = backoffRef.current;
        backoffRef.current = Math.min(delay * 2, MAX_BACKOFF);
        reconnectRef.current = setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      esRef.current?.close();
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    };
  }, [filters?.sessionId, filters?.capability, filters?.result]);

  const clear = useCallback(() => setEntries([]), []);

  return { entries, connected, clear };
}
