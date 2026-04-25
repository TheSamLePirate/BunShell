import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/rpc-client";
import { queryKeys } from "../../lib/query-keys";
import { Plus, Play, Trash2, Rocket } from "lucide-react";
import { relativeTime, formatDuration } from "../../lib/utils";
import { CapabilityBuilder } from "../permissions/capability-builder";
import type { Capability, AuditEntryDTO } from "../../lib/rpc-types";
import { useNavigate } from "react-router";

export function AgentsPage() {
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-foreground">
          Agent Configurations
        </h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
        >
          <Plus size={14} />
          New Config
        </button>
      </div>

      {showForm && <AgentConfigForm onClose={() => setShowForm(false)} />}
      <ConfigList />
      <AgentRunner />
    </div>
  );
}

function AgentConfigForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [timeout, setTimeout_] = useState("30000");
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      api.admin.configSave({
        name,
        capabilities,
        timeout: parseInt(timeout) || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.configs.all });
      onClose();
    },
  });

  return (
    <div className="border border-border rounded-lg p-4 bg-card space-y-4">
      <h3 className="text-sm font-medium text-foreground">
        New Agent Configuration
      </h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            Name
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
      <div className="flex justify-end gap-2">
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
          {mutation.isPending ? "Saving..." : "Save Config"}
        </button>
      </div>
    </div>
  );
}

function ConfigList() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: queryKeys.configs.all,
    queryFn: api.admin.configList,
  });

  const deleteMutation = useMutation({
    mutationFn: (configId: string) => api.admin.configDelete(configId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.configs.all }),
  });

  const launchMutation = useMutation({
    mutationFn: (configId: string) => api.admin.configLaunch(configId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
      navigate(`/sessions/${result.sessionId}`);
    },
  });

  const configs = data?.configs ?? [];

  if (configs.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm border border-border rounded-lg">
        No saved configurations.
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/50 text-left">
            <th className="px-4 py-2 font-medium text-muted-foreground">
              Name
            </th>
            <th className="px-4 py-2 font-medium text-muted-foreground">
              Capabilities
            </th>
            <th className="px-4 py-2 font-medium text-muted-foreground">
              Updated
            </th>
            <th className="px-4 py-2 font-medium text-muted-foreground w-28">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {configs.map((c) => (
            <tr
              key={c.configId}
              className="border-t border-border hover:bg-muted/30"
            >
              <td className="px-4 py-2 font-medium text-foreground">
                {c.name}
              </td>
              <td className="px-4 py-2 text-muted-foreground">
                {c.capabilityCount}
              </td>
              <td className="px-4 py-2 text-muted-foreground">
                {relativeTime(c.updatedAt)}
              </td>
              <td className="px-4 py-2">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => launchMutation.mutate(c.configId)}
                    className="p-1 text-muted-foreground hover:text-success"
                    title="Launch as session"
                  >
                    <Rocket size={14} />
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(c.configId)}
                    className="p-1 text-muted-foreground hover:text-error"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AgentRunner() {
  const [name, setName] = useState("quick-agent");
  const [script, setScript] = useState("");
  const [capabilities, setCapabilities] = useState<Capability[]>([
    { kind: "fs:read", pattern: "**" },
    { kind: "fs:write", pattern: "**" },
  ]);
  const [result, setResult] = useState<{
    success: boolean;
    output: unknown;
    auditTrail: AuditEntryDTO[];
    duration: number;
    error?: string;
  } | null>(null);

  const mutation = useMutation({
    mutationFn: () => api.admin.agentRun({ name, script, capabilities }),
    onSuccess: (data) => setResult(data),
  });

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
        <Play size={16} />
        Run Agent
      </h2>
      <div className="border border-border rounded-lg p-4 bg-card space-y-3">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Agent name"
          className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm text-foreground"
        />
        <textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          placeholder={`// Agent script (default export function)\nexport default async function(ctx) {\n  // Your code here\n}`}
          className="w-full bg-background text-foreground font-mono text-sm p-3 min-h-32 resize-y border border-border rounded-md"
        />
        <CapabilityBuilder
          capabilities={capabilities}
          onChange={setCapabilities}
        />
        <button
          onClick={() => mutation.mutate()}
          disabled={!script.trim() || mutation.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
        >
          <Play size={14} />
          {mutation.isPending ? "Running..." : "Run Agent"}
        </button>
      </div>

      {result && (
        <div className="border border-border rounded-lg p-4 bg-card space-y-2">
          <div className="flex items-center gap-3 text-sm">
            <span className={result.success ? "text-success" : "text-error"}>
              {result.success ? "Success" : "Failed"}
            </span>
            <span className="text-muted-foreground">
              {formatDuration(result.duration)}
            </span>
            <span className="text-muted-foreground">
              {result.auditTrail.length} audit entries
            </span>
          </div>
          {result.error && <p className="text-sm text-error">{result.error}</p>}
          {result.output != null && (
            <pre className="text-sm font-mono bg-background rounded p-2 overflow-auto max-h-40 text-foreground">
              {JSON.stringify(result.output, null, 2)}
            </pre>
          )}
        </div>
      )}
    </section>
  );
}
