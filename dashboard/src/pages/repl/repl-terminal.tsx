import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/rpc-client";
import { queryKeys } from "../../lib/query-keys";
import { highlightCode } from "../../lib/highlighter";
import { getSignature, getCompletions } from "../../lib/signatures";
import { formatDuration } from "../../lib/utils";
import { useAuditStream } from "../../hooks/use-audit-stream";
import { Radio } from "lucide-react";
import type { ExecResult } from "../../lib/rpc-types";

interface OutputEntry {
  type: "input" | "result" | "error" | "info";
  text: string;
  html?: string;
  meta?: { type: string; duration: number; auditEntries: number };
}

export function ReplTerminal({
  sessionId,
  sessionName,
}: {
  sessionId: string;
  sessionName: string;
}) {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState<OutputEntry[]>([
    {
      type: "info",
      text: `BunShell REPL — session: ${sessionName}\nType expressions to evaluate. Use Shift+Enter for multi-line.\n.help for commands, .caps for capabilities, .audit for trail\n`,
    },
  ]);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [completionIdx, setCompletionIdx] = useState(0);

  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();

  const { entries: liveAudit, connected } = useAuditStream({ sessionId });

  // Auto-scroll output
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output, liveAudit]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, [sessionId]);

  const execMutation = useMutation({
    mutationFn: (code: string) => api.sessions.execute(sessionId, code),
    onSuccess: (result: ExecResult, code: string) => {
      const valueStr =
        typeof result.value === "string"
          ? result.value
          : JSON.stringify(result.value, null, 2);
      setOutput((prev) => [
        ...prev,
        { type: "input", text: code, html: highlightCode(code) },
        {
          type: "result",
          text: valueStr ?? "undefined",
          meta: {
            type: result.type,
            duration: result.duration,
            auditEntries: result.auditEntries,
          },
        },
      ]);
      queryClient.invalidateQueries({
        queryKey: queryKeys.sessions.detail(sessionId),
      });
    },
    onError: (err: Error, code: string) => {
      setOutput((prev) => [
        ...prev,
        { type: "input", text: code, html: highlightCode(code) },
        { type: "error", text: err.message },
      ]);
    },
  });

  const execute = useCallback(
    (code: string) => {
      const trimmed = code.trim();
      if (!trimmed) return;

      // Dot commands
      if (trimmed === ".help") {
        setOutput((prev) => [
          ...prev,
          {
            type: "info",
            text: `.help    — Show this help
.caps    — Show session capabilities
.audit   — Show recent audit entries
.clear   — Clear output
.vars    — Show user variables

Available: 230+ typed functions (ls, cat, write, spawn, netFetch, dockerRun, ...)
Use Tab for autocompletion, arrow keys for history.`,
          },
        ]);
        setInput("");
        return;
      }
      if (trimmed === ".clear") {
        setOutput([]);
        setInput("");
        return;
      }
      if (trimmed === ".caps") {
        api.admin.sessionDetail(sessionId).then((detail) => {
          const capText = detail.capabilities
            .map((c) => `  ${c.kind}: ${c.constraint}`)
            .join("\n");
          setOutput((prev) => [
            ...prev,
            {
              type: "info",
              text: `Capabilities (${detail.capabilities.length}):\n${capText}`,
            },
          ]);
        });
        setInput("");
        return;
      }
      if (trimmed === ".audit") {
        api.admin.auditQuery({ sessionId, limit: 20 }).then((result) => {
          const lines = result.entries
            .map(
              (e) =>
                `  [${e.result}] ${e.capability} ${e.operation}${e.duration != null ? ` (${formatDuration(e.duration)})` : ""}`,
            )
            .join("\n");
          setOutput((prev) => [
            ...prev,
            {
              type: "info",
              text: `Recent audit (${result.total} total):\n${lines || "  (empty)"}`,
            },
          ]);
        });
        setInput("");
        return;
      }
      if (trimmed === ".vars") {
        execMutation.mutate(
          "Object.keys(this).filter(k => !['ctx','audit','vfs','console','JSON','Math','Date','Array','Object','String','Number','Boolean','RegExp','Map','Set','Promise','Error','Buffer','URL','parseInt','parseFloat','isNaN','isFinite','setTimeout','clearTimeout','TextEncoder','TextDecoder','Uint8Array','performance'].includes(k))",
        );
        setInput("");
        return;
      }

      setHistory((prev) => [trimmed, ...prev]);
      setHistoryIdx(-1);
      setInput("");
      execMutation.mutate(trimmed);
    },
    [sessionId, execMutation],
  );

  // Signature detection — derived from input, no state needed
  const signatureHint = useMemo(() => {
    const match = input.match(/(\w+)\s*\([^)]*$/);
    if (match) {
      const sig = getSignature(match[1]);
      if (sig) return `${sig.name}${sig.signature} — ${sig.description}`;
    }
    return null;
  }, [input]);

  // Completions — derived from input
  const currentCompletions = useMemo(() => {
    const wordMatch = input.match(/(\w+)$/);
    if (wordMatch && wordMatch[1].length >= 2) {
      return getCompletions(wordMatch[1]).map((m) => m.name);
    }
    return [];
  }, [input]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Tab completion
    if (e.key === "Tab" && currentCompletions.length > 0) {
      e.preventDefault();
      const wordMatch = input.match(/(\w+)$/);
      if (wordMatch) {
        const selected =
          currentCompletions[completionIdx % currentCompletions.length];
        setInput(input.slice(0, -wordMatch[1].length) + selected);
        setCompletionIdx(0);
      }
      return;
    }

    // Tab cycle
    if (e.key === "Tab" && currentCompletions.length > 1) {
      e.preventDefault();
      setCompletionIdx((prev) => (prev + 1) % currentCompletions.length);
      return;
    }

    // Enter: execute (Shift+Enter for newline)
    if (e.key === "Enter" && !e.shiftKey) {
      // Check for unclosed braces/parens
      const opens = (input.match(/[{([]/g) || []).length;
      const closes = (input.match(/[})\]]/g) || []).length;
      if (opens > closes) return; // Allow newline for multi-line

      e.preventDefault();
      execute(input);
      return;
    }

    // History navigation
    if (e.key === "ArrowUp" && !e.shiftKey) {
      const cursorAtStart =
        e.currentTarget.selectionStart === 0 &&
        e.currentTarget.selectionEnd === 0;
      if (cursorAtStart || !input.includes("\n")) {
        e.preventDefault();
        if (historyIdx < history.length - 1) {
          const newIdx = historyIdx + 1;
          setHistoryIdx(newIdx);
          setInput(history[newIdx]);
        }
      }
      return;
    }
    if (e.key === "ArrowDown" && !e.shiftKey) {
      const cursorAtEnd = e.currentTarget.selectionStart === input.length;
      if (cursorAtEnd || !input.includes("\n")) {
        e.preventDefault();
        if (historyIdx > 0) {
          const newIdx = historyIdx - 1;
          setHistoryIdx(newIdx);
          setInput(history[newIdx]);
        } else {
          setHistoryIdx(-1);
          setInput("");
        }
      }
      return;
    }

    // Ctrl+L clear
    if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      setOutput([]);
      return;
    }

    // Ctrl+K kill to end
    if (e.key === "k" && e.ctrlKey) {
      e.preventDefault();
      const pos = e.currentTarget.selectionStart;
      setInput(input.slice(0, pos));
      return;
    }

    // Ctrl+U kill to start
    if (e.key === "u" && e.ctrlKey) {
      e.preventDefault();
      const pos = e.currentTarget.selectionStart;
      setInput(input.slice(pos));
      return;
    }
  }

  return (
    <div className="flex-1 flex flex-col border border-border rounded-lg overflow-hidden bg-[#0d0d0f]">
      {/* Status bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-[#16161a] border-b border-border text-xs">
        <span className="px-1.5 py-0.5 rounded bg-success/20 text-success font-medium">
          BunShell
        </span>
        <span className="text-muted-foreground">{sessionName}</span>
        <span className="flex-1" />
        {connected && (
          <span className="flex items-center gap-1 text-success">
            <Radio size={10} className="animate-pulse" />
            Live
          </span>
        )}
        {execMutation.isPending && (
          <span className="text-yellow-400 animate-pulse">executing...</span>
        )}
        <span className="text-muted-foreground font-mono">
          {liveAudit.length} events
        </span>
      </div>

      {/* Output area */}
      <div
        ref={outputRef}
        className="flex-1 overflow-y-auto p-3 font-mono text-sm space-y-1 min-h-0"
        onClick={() => inputRef.current?.focus()}
      >
        {output.map((entry, i) => (
          <OutputLine key={i} entry={entry} />
        ))}

        {/* Live audit feed (inline, dimmed) */}
        {liveAudit.slice(0, 5).map((e, i) => (
          <div
            key={`live-${i}`}
            className="text-[11px] text-muted-foreground/50 pl-2"
          >
            <span
              className={
                e.result === "success"
                  ? "text-success/40"
                  : e.result === "denied"
                    ? "text-denied/40"
                    : "text-error/40"
              }
            >
              [{e.result}]
            </span>{" "}
            {e.capability} {e.operation}
            {e.duration != null && (
              <span className="text-muted-foreground/30">
                {" "}
                {formatDuration(e.duration)}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Signature hint */}
      {signatureHint && (
        <div className="px-3 py-1 bg-[#1a1a2e] border-t border-border text-xs font-mono text-blue-300/80 truncate">
          {signatureHint}
        </div>
      )}

      {/* Completions */}
      {currentCompletions.length > 1 && (
        <div className="px-3 py-1 bg-[#1a1a2e] border-t border-border flex flex-wrap gap-2 text-xs font-mono">
          {currentCompletions.slice(0, 20).map((c, i) => (
            <span
              key={c}
              className={
                i === completionIdx % currentCompletions.length
                  ? "text-foreground bg-accent px-1 rounded"
                  : "text-muted-foreground"
              }
            >
              {c}
            </span>
          ))}
          {currentCompletions.length > 20 && (
            <span className="text-muted-foreground/50">
              +{currentCompletions.length - 20} more
            </span>
          )}
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-border flex items-start bg-[#0d0d0f]">
        <span className="text-success font-mono text-sm px-3 py-2 select-none shrink-0">
          {input.includes("\n") ? "..." : ">"}
        </span>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-transparent text-foreground font-mono text-sm py-2 pr-3 resize-none focus:outline-none min-h-[2rem]"
          rows={Math.min(input.split("\n").length, 10)}
          spellCheck={false}
          autoComplete="off"
          placeholder="Type expression..."
        />
      </div>
    </div>
  );
}

function OutputLine({ entry }: { entry: OutputEntry }) {
  switch (entry.type) {
    case "input":
      return (
        <div className="flex items-start gap-2">
          <span className="text-success shrink-0 select-none">&gt;</span>
          {entry.html ? (
            <pre
              className="text-foreground whitespace-pre-wrap break-all repl-highlight"
              dangerouslySetInnerHTML={{ __html: entry.html }}
            />
          ) : (
            <pre className="text-foreground whitespace-pre-wrap break-all">
              {entry.text}
            </pre>
          )}
        </div>
      );
    case "result":
      return (
        <div className="pl-4">
          {entry.meta && (
            <div className="text-[10px] text-muted-foreground/60 mb-0.5">
              {entry.meta.type} &middot; {formatDuration(entry.meta.duration)}{" "}
              &middot; {entry.meta.auditEntries} audit
            </div>
          )}
          <pre className="text-cyan-300 whitespace-pre-wrap break-all">
            {entry.text}
          </pre>
        </div>
      );
    case "error":
      return (
        <div className="pl-4">
          <pre className="text-error whitespace-pre-wrap break-all">
            {entry.text}
          </pre>
        </div>
      );
    case "info":
      return (
        <pre className="text-muted-foreground whitespace-pre-wrap pl-2 border-l-2 border-border">
          {entry.text}
        </pre>
      );
  }
}
