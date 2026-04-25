import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/rpc-client";
import { queryKeys } from "../../lib/query-keys";
import {
  File,
  Folder,
  ChevronRight,
  Plus,
  Save,
  Trash2,
  FolderPlus,
  Download,
  Edit3,
  X,
} from "lucide-react";
import { formatBytes } from "../../lib/utils";

export function VfsBrowser({ sessionId }: { sessionId: string }) {
  const [currentPath, setCurrentPath] = useState("/");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [showNewFile, setShowNewFile] = useState(false);
  const [showNewDir, setShowNewDir] = useState(false);
  const [newName, setNewName] = useState("");
  const [newFileContent, setNewFileContent] = useState("");

  const queryClient = useQueryClient();

  const { data: listing } = useQuery({
    queryKey: queryKeys.sessions.vfs(sessionId, currentPath),
    queryFn: () => api.sessions.fs.list(sessionId, currentPath),
    enabled: !!sessionId,
  });

  const { data: fileContent } = useQuery({
    queryKey: ["vfs-content", sessionId, selectedFile],
    queryFn: () => api.sessions.fs.read(sessionId, selectedFile!),
    enabled: !!selectedFile,
  });

  const writeMutation = useMutation({
    mutationFn: ({ path, content }: { path: string; content: string }) =>
      api.sessions.fs.write(sessionId, path, content),
    onSuccess: () => {
      invalidateVfs();
      setEditing(false);
    },
  });

  // Write to VFS to create dir (write a .keep file inside)
  const mkdirMutation = useMutation({
    mutationFn: (path: string) =>
      api.sessions.execute(sessionId, `mkdir("${path}")`),
    onSuccess: () => invalidateVfs(),
  });

  const deleteMutation = useMutation({
    mutationFn: (path: string) =>
      api.sessions.execute(sessionId, `rm("${path}", { recursive: true })`),
    onSuccess: () => {
      invalidateVfs();
      if (selectedFile === deleteMutation.variables) {
        setSelectedFile(null);
      }
    },
  });

  function invalidateVfs() {
    queryClient.invalidateQueries({
      queryKey: queryKeys.sessions.vfs(sessionId, currentPath),
    });
    queryClient.invalidateQueries({
      queryKey: ["vfs-content", sessionId, selectedFile],
    });
    queryClient.invalidateQueries({
      queryKey: queryKeys.sessions.detail(sessionId),
    });
  }

  const entries = listing?.entries ?? [];
  const dirs = entries
    .filter((e) => !e.isFile)
    .sort((a, b) => a.name.localeCompare(b.name));
  const files = entries
    .filter((e) => e.isFile)
    .sort((a, b) => a.name.localeCompare(b.name));

  const parts = currentPath.split("/").filter(Boolean);

  function handleCreateFile() {
    if (!newName) return;
    const path =
      currentPath === "/" ? `/${newName}` : `${currentPath}/${newName}`;
    writeMutation.mutate(
      { path, content: newFileContent },
      {
        onSuccess: () => {
          setShowNewFile(false);
          setNewName("");
          setNewFileContent("");
          setSelectedFile(path);
        },
      },
    );
  }

  function handleCreateDir() {
    if (!newName) return;
    const path =
      currentPath === "/" ? `/${newName}` : `${currentPath}/${newName}`;
    mkdirMutation.mutate(path, {
      onSuccess: () => {
        setShowNewDir(false);
        setNewName("");
      },
    });
  }

  function handleSaveEdit() {
    if (!selectedFile) return;
    writeMutation.mutate({ path: selectedFile, content: editContent });
  }

  function startEditing() {
    if (fileContent) {
      setEditContent(fileContent.content);
      setEditing(true);
    }
  }

  async function handleDownloadSnapshot() {
    const result = await api.sessions.fs.snapshot(sessionId);
    const blob = new Blob([JSON.stringify(result.snapshot, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vfs-snapshot-${sessionId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex gap-4 min-h-64">
      {/* File tree */}
      <div className="w-72 shrink-0 border border-border rounded-lg overflow-hidden flex flex-col">
        {/* Toolbar */}
        <div className="px-2 py-1.5 bg-muted/30 border-b border-border flex items-center gap-1">
          <button
            onClick={() => setShowNewFile(true)}
            className="p-1 text-muted-foreground hover:text-foreground"
            title="New file"
          >
            <Plus size={14} />
          </button>
          <button
            onClick={() => setShowNewDir(true)}
            className="p-1 text-muted-foreground hover:text-foreground"
            title="New directory"
          >
            <FolderPlus size={14} />
          </button>
          <button
            onClick={handleDownloadSnapshot}
            className="p-1 text-muted-foreground hover:text-foreground"
            title="Download VFS snapshot"
          >
            <Download size={14} />
          </button>
          <div className="flex-1" />
          {/* Breadcrumb */}
          <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground overflow-hidden">
            <button
              onClick={() => {
                setCurrentPath("/");
                setSelectedFile(null);
              }}
              className="hover:text-foreground shrink-0"
            >
              /
            </button>
            {parts.map((part, i) => (
              <span key={i} className="flex items-center gap-0.5 shrink-0">
                <ChevronRight size={8} />
                <button
                  onClick={() => {
                    setCurrentPath("/" + parts.slice(0, i + 1).join("/"));
                    setSelectedFile(null);
                  }}
                  className="hover:text-foreground"
                >
                  {part}
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* New file form */}
        {showNewFile && (
          <div className="p-2 border-b border-border bg-card space-y-1">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="filename.txt"
              className="w-full bg-background border border-border rounded px-2 py-1 text-xs text-foreground"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateFile();
                if (e.key === "Escape") setShowNewFile(false);
              }}
            />
            <textarea
              value={newFileContent}
              onChange={(e) => setNewFileContent(e.target.value)}
              placeholder="File content (optional)"
              className="w-full bg-background border border-border rounded px-2 py-1 text-xs text-foreground font-mono resize-none h-16"
            />
            <div className="flex gap-1">
              <button
                onClick={handleCreateFile}
                disabled={!newName}
                className="flex-1 px-2 py-0.5 text-xs bg-primary text-primary-foreground rounded disabled:opacity-50"
              >
                Create
              </button>
              <button
                onClick={() => {
                  setShowNewFile(false);
                  setNewName("");
                }}
                className="px-2 py-0.5 text-xs text-muted-foreground"
              >
                <X size={12} />
              </button>
            </div>
          </div>
        )}

        {/* New dir form */}
        {showNewDir && (
          <div className="p-2 border-b border-border bg-card space-y-1">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="directory-name"
              className="w-full bg-background border border-border rounded px-2 py-1 text-xs text-foreground"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateDir();
                if (e.key === "Escape") setShowNewDir(false);
              }}
            />
            <div className="flex gap-1">
              <button
                onClick={handleCreateDir}
                disabled={!newName}
                className="flex-1 px-2 py-0.5 text-xs bg-primary text-primary-foreground rounded disabled:opacity-50"
              >
                Create
              </button>
              <button
                onClick={() => {
                  setShowNewDir(false);
                  setNewName("");
                }}
                className="px-2 py-0.5 text-xs text-muted-foreground"
              >
                <X size={12} />
              </button>
            </div>
          </div>
        )}

        {/* File list */}
        <div className="flex-1 overflow-y-auto divide-y divide-border">
          {currentPath !== "/" && (
            <button
              onClick={() => {
                const parent = "/" + parts.slice(0, -1).join("/");
                setCurrentPath(parent || "/");
                setSelectedFile(null);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/30"
            >
              <Folder size={14} />
              ..
            </button>
          )}
          {dirs.map((d) => (
            <div key={d.path} className="flex items-center group">
              <button
                onClick={() => {
                  setCurrentPath(d.path);
                  setSelectedFile(null);
                }}
                className="flex-1 flex items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-muted/30"
              >
                <Folder size={14} className="text-blue-400" />
                {d.name}
              </button>
              <button
                onClick={() => {
                  if (confirm(`Delete directory "${d.name}"?`))
                    deleteMutation.mutate(d.path);
                }}
                className="p-1 mr-1 text-muted-foreground hover:text-error opacity-0 group-hover:opacity-100"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          {files.map((f) => (
            <div
              key={f.path}
              className={`flex items-center group ${
                selectedFile === f.path ? "bg-accent" : ""
              }`}
            >
              <button
                onClick={() => {
                  setSelectedFile(f.path);
                  setEditing(false);
                }}
                className="flex-1 flex items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-muted/30 min-w-0"
              >
                <File size={14} className="text-muted-foreground shrink-0" />
                <span className="truncate flex-1 text-left">{f.name}</span>
                <span className="text-muted-foreground shrink-0">
                  {formatBytes(f.size)}
                </span>
              </button>
              <button
                onClick={() => {
                  if (confirm(`Delete "${f.name}"?`))
                    deleteMutation.mutate(f.path);
                }}
                className="p-1 mr-1 text-muted-foreground hover:text-error opacity-0 group-hover:opacity-100"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          {entries.length === 0 && (
            <div className="px-3 py-4 text-xs text-muted-foreground text-center">
              Empty directory
            </div>
          )}
        </div>
      </div>

      {/* File content / editor */}
      <div className="flex-1 border border-border rounded-lg overflow-hidden flex flex-col">
        {selectedFile && fileContent ? (
          <>
            <div className="px-3 py-2 bg-muted/30 border-b border-border flex items-center gap-2">
              <span className="text-xs font-mono text-muted-foreground flex-1 truncate">
                {selectedFile}
              </span>
              <span className="text-xs text-muted-foreground shrink-0">
                {formatBytes(fileContent.size)}
              </span>
              {editing ? (
                <>
                  <button
                    onClick={handleSaveEdit}
                    disabled={writeMutation.isPending}
                    className="flex items-center gap-1 px-2 py-0.5 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
                  >
                    <Save size={12} />
                    {writeMutation.isPending ? "Saving..." : "Save"}
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="p-1 text-muted-foreground hover:text-foreground"
                  >
                    <X size={14} />
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={startEditing}
                    className="p-1 text-muted-foreground hover:text-foreground"
                    title="Edit file"
                  >
                    <Edit3 size={14} />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete "${selectedFile}"?`)) {
                        deleteMutation.mutate(selectedFile);
                      }
                    }}
                    className="p-1 text-muted-foreground hover:text-error"
                    title="Delete file"
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </div>
            {editing ? (
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="flex-1 p-3 text-sm font-mono text-foreground bg-background resize-none focus:outline-none"
                spellCheck={false}
              />
            ) : (
              <pre className="flex-1 p-3 text-sm font-mono text-foreground overflow-auto">
                {fileContent.content}
              </pre>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            Select a file to view or edit
          </div>
        )}
      </div>
    </div>
  );
}
