import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { api } from "../../lib/rpc-client";
import { queryKeys } from "../../lib/query-keys";
import { X } from "lucide-react";
import { CapabilityBuilder } from "../permissions/capability-builder";
import type { Capability } from "../../lib/rpc-types";

export function SessionCreateDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [timeout, setTimeout_] = useState("30000");
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const mutation = useMutation({
    mutationFn: () =>
      api.sessions.create({
        name,
        capabilities,
        timeout: parseInt(timeout) || undefined,
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
      onClose();
      navigate(`/sessions/${result.sessionId}`);
    },
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-lg w-full max-w-2xl max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-medium text-foreground">
            Create Session
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Session Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-agent"
              className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm text-foreground"
            />
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Timeout (ms)
            </label>
            <input
              type="number"
              value={timeout}
              onChange={(e) => setTimeout_(e.target.value)}
              className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm text-foreground"
            />
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-2">
              Capabilities
            </label>
            <CapabilityBuilder
              capabilities={capabilities}
              onChange={setCapabilities}
            />
          </div>

          {mutation.error && (
            <div className="text-xs text-error">
              {(mutation.error as Error).message}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!name || capabilities.length === 0 || mutation.isPending}
            className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
          >
            {mutation.isPending ? "Creating..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
