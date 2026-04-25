import { useState, useMemo } from "react";
import { SIGNATURES, getCategories, getByCategory } from "../../lib/signatures";
import { Search, BookOpen } from "lucide-react";
import { cn } from "../../lib/utils";

export function ApiReferencePage() {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const categories = useMemo(() => getCategories(), []);

  const filtered = useMemo(() => {
    let results = selectedCategory
      ? getByCategory(selectedCategory)
      : SIGNATURES;
    if (search) {
      const lower = search.toLowerCase();
      results = results.filter(
        (s) =>
          s.name.toLowerCase().includes(lower) ||
          s.description.toLowerCase().includes(lower) ||
          s.category.toLowerCase().includes(lower),
      );
    }
    return results;
  }, [search, selectedCategory]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <BookOpen size={18} className="text-muted-foreground" />
        <h2 className="text-sm font-medium text-foreground">
          API Reference ({SIGNATURES.length} functions)
        </h2>
      </div>

      {/* Search + category filter */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search functions..."
            className="w-full bg-background border border-border rounded-md pl-9 pr-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {/* Category pills */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setSelectedCategory(null)}
          className={cn(
            "px-2 py-1 text-xs rounded-md border transition-colors",
            !selectedCategory
              ? "bg-primary text-primary-foreground border-primary"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          All ({SIGNATURES.length})
        </button>
        {categories.map((cat) => {
          const count = getByCategory(cat).length;
          return (
            <button
              key={cat}
              onClick={() =>
                setSelectedCategory(selectedCategory === cat ? null : cat)
              }
              className={cn(
                "px-2 py-1 text-xs rounded-md border transition-colors",
                selectedCategory === cat
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {cat} ({count})
            </button>
          );
        })}
      </div>

      {/* Function list */}
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 text-left">
              <th className="px-4 py-2 font-medium text-muted-foreground w-40">
                Function
              </th>
              <th className="px-4 py-2 font-medium text-muted-foreground">
                Signature
              </th>
              <th className="px-4 py-2 font-medium text-muted-foreground w-48">
                Description
              </th>
              <th className="px-4 py-2 font-medium text-muted-foreground w-28">
                Category
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((sig) => (
              <tr
                key={sig.name}
                className="border-t border-border hover:bg-muted/30"
              >
                <td className="px-4 py-1.5 font-mono text-xs text-cyan-400 font-medium">
                  {sig.name}
                </td>
                <td className="px-4 py-1.5 font-mono text-xs text-muted-foreground">
                  {sig.signature}
                </td>
                <td className="px-4 py-1.5 text-xs text-foreground">
                  {sig.description}
                </td>
                <td className="px-4 py-1.5">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-accent-foreground">
                    {sig.category}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No functions matching &quot;{search}&quot;
          </div>
        )}
      </div>
    </div>
  );
}
