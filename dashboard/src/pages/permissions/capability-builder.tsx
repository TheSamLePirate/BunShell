import { useState } from "react";
import { Plus, X } from "lucide-react";
import {
  CAPABILITY_KINDS,
  type Capability,
  type CapabilityKind,
} from "../../lib/rpc-types";

const PRESETS = {
  "Read-only": [
    { kind: "fs:read" as const, pattern: "**" },
    { kind: "env:read" as const, allowedKeys: ["*"] },
  ],
  "Network Only": [
    { kind: "net:fetch" as const, allowedDomains: ["*"] },
    { kind: "env:read" as const, allowedKeys: ["*"] },
  ],
  Full: [
    { kind: "fs:read" as const, pattern: "*" },
    { kind: "fs:write" as const, pattern: "*" },
    { kind: "fs:delete" as const, pattern: "*" },
    { kind: "process:spawn" as const, allowedBinaries: ["*"] },
    { kind: "net:fetch" as const, allowedDomains: ["*"] },
    { kind: "env:read" as const, allowedKeys: ["*"] },
    { kind: "env:write" as const, allowedKeys: ["*"] },
    { kind: "docker:run" as const, allowedImages: ["*"] },
  ],
};

interface CapabilityBuilderProps {
  capabilities: Capability[];
  onChange: (caps: Capability[]) => void;
}

export function CapabilityBuilder({
  capabilities,
  onChange,
}: CapabilityBuilderProps) {
  const [selectedKind, setSelectedKind] = useState<CapabilityKind>("fs:read");
  const [paramValue, setParamValue] = useState("");

  function addCapability() {
    if (!paramValue.trim() && needsParam(selectedKind)) return;

    const cap = buildCapability(selectedKind, paramValue.trim());
    onChange([...capabilities, cap]);
    setParamValue("");
  }

  function removeCapability(index: number) {
    onChange(capabilities.filter((_, i) => i !== index));
  }

  function applyPreset(name: keyof typeof PRESETS) {
    onChange(PRESETS[name]);
  }

  return (
    <div className="space-y-3">
      {/* Presets */}
      <div className="flex gap-2">
        {(Object.keys(PRESETS) as Array<keyof typeof PRESETS>).map((name) => (
          <button
            key={name}
            onClick={() => applyPreset(name)}
            className="px-2 py-1 text-xs border border-border rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            {name}
          </button>
        ))}
      </div>

      {/* Add capability */}
      <div className="flex gap-2">
        <select
          value={selectedKind}
          onChange={(e) => {
            setSelectedKind(e.target.value as CapabilityKind);
            setParamValue("");
          }}
          className="bg-background border border-border rounded-md px-2 py-1.5 text-sm text-foreground"
        >
          {CAPABILITY_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
          <option value="plugin:custom">plugin:custom</option>
        </select>

        {needsParam(selectedKind) && (
          <input
            type="text"
            value={paramValue}
            onChange={(e) => setParamValue(e.target.value)}
            placeholder={getPlaceholder(selectedKind)}
            className="flex-1 bg-background border border-border rounded-md px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCapability();
              }
            }}
          />
        )}

        <button
          onClick={addCapability}
          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-accent text-accent-foreground rounded-md hover:bg-accent/80"
        >
          <Plus size={14} />
          Add
        </button>
      </div>

      {/* Current capabilities */}
      {capabilities.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {capabilities.map((cap, i) => (
            <span
              key={i}
              className="flex items-center gap-1 text-xs font-mono px-2 py-1 rounded bg-accent text-accent-foreground"
            >
              {capLabel(cap)}
              <button
                onClick={() => removeCapability(i)}
                className="hover:text-error"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function needsParam(kind: CapabilityKind): boolean {
  return kind !== "os:interact";
}

function getPlaceholder(kind: CapabilityKind): string {
  if (kind.startsWith("fs:") || kind === "db:query")
    return "glob pattern, e.g. **";
  if (kind === "process:spawn") return "binary names, e.g. git,bun";
  if (kind === "net:fetch") return "domains, e.g. api.github.com";
  if (kind === "net:listen") return "port number, e.g. 3000";
  if (kind === "net:connect") return "hosts, e.g. localhost:5432";
  if (kind.startsWith("env:") || kind.startsWith("secret:"))
    return "key patterns, e.g. *";
  if (kind === "docker:run") return "image names, e.g. ubuntu:latest";
  return "value";
}

function buildCapability(kind: CapabilityKind, param: string): Capability {
  if (kind === "os:interact") return { kind };
  if (kind.startsWith("fs:") || kind === "db:query")
    return { kind, pattern: param || "**" };
  if (kind === "process:spawn")
    return { kind, allowedBinaries: param.split(",").map((s) => s.trim()) };
  if (kind === "net:fetch")
    return { kind, allowedDomains: param.split(",").map((s) => s.trim()) };
  if (kind === "net:listen") return { kind, port: parseInt(param) || 0 };
  if (kind === "net:connect")
    return { kind, allowedHosts: param.split(",").map((s) => s.trim()) };
  if (kind.startsWith("env:") || kind.startsWith("secret:"))
    return { kind, allowedKeys: param.split(",").map((s) => s.trim()) };
  if (kind === "docker:run")
    return { kind, allowedImages: param.split(",").map((s) => s.trim()) };
  return { kind, pluginName: param };
}

function capLabel(cap: Capability): string {
  const parts: string[] = [cap.kind];
  if (cap.pattern) parts.push(cap.pattern);
  if (cap.allowedBinaries) parts.push(cap.allowedBinaries.join(","));
  if (cap.allowedDomains) parts.push(cap.allowedDomains.join(","));
  if (cap.allowedKeys) parts.push(cap.allowedKeys.join(","));
  if (cap.allowedImages) parts.push(cap.allowedImages.join(","));
  if (cap.allowedHosts) parts.push(cap.allowedHosts.join(","));
  if (cap.port !== undefined) parts.push(String(cap.port));
  if (cap.pluginName) parts.push(cap.pluginName);
  return parts.join(": ");
}
