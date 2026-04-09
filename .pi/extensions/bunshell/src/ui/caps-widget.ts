/**
 * BunShell capability widget — pi-tui Component.
 *
 * Renders a styled box showing agent name, active capabilities,
 * and operation count. Updates in real-time as tools execute.
 */

import type { LoadedEnvironment } from "../../../../../src/config/loader";

// Types from pi-tui (the widget factory receives these)
interface Theme {
  fg(color: string, text: string): string;
  bg(color: string, text: string): string;
  bold(text: string): string;
}

interface Component {
  render(width: number): string[];
  invalidate(): void;
  dispose?(): void;
}

// Box drawing
const B = { tl: "╭", tr: "╮", bl: "╰", br: "╯", h: "─", v: "│" };

/**
 * Create a pi-tui component factory for the BunShell widget.
 */
export function createCapsWidgetFactory(env: LoadedEnvironment) {
  let opCount = 0;
  let lastAction = "";

  return {
    /** Update the widget state (call + requestRender from extension). */
    setOpCount(n: number): void {
      opCount = n;
    },
    setLastAction(action: string): void {
      lastAction = action;
    },

    /** The factory function for ctx.ui.setWidget(). */
    factory: (
      _tui: unknown,
      theme: Theme,
    ): Component & { dispose?(): void } => {
      return {
        invalidate(): void {},

        render(width: number): string[] {
          const inner = width - 4;
          const lines: string[] = [];

          // Top border with title
          const title = theme.bold(theme.fg("accent", " BunShell "));
          const titlePlain = " BunShell ".length;
          const topLine =
            theme.fg("borderAccent", B.tl + B.h + " ") +
            title +
            theme.fg(
              "borderAccent",
              " " + B.h.repeat(Math.max(0, width - 6 - titlePlain)) + B.tr,
            );
          lines.push(topLine);

          // Agent name + status
          const nameLine =
            theme.fg("borderAccent", B.v) +
            " " +
            theme.fg("accent", env.name) +
            theme.fg("dim", " │ ") +
            theme.fg("success", `${opCount} ops`) +
            (lastAction ? theme.fg("dim", ` │ ${lastAction}`) : "") +
            " ".repeat(
              Math.max(
                0,
                inner -
                  env.name.length -
                  8 -
                  (lastAction ? lastAction.length + 3 : 0),
              ),
            ) +
            theme.fg("borderAccent", B.v);
          lines.push(nameLine);

          // Separator
          lines.push(
            theme.fg("borderAccent", B.v) +
              theme.fg("dim", " " + "─".repeat(inner) + " ") +
              theme.fg("borderAccent", B.v),
          );

          // Capability lines
          const caps = env.ctx.caps.capabilities;
          const capGroups = new Map<string, string[]>();

          for (const cap of caps) {
            const kind = cap.kind;
            const category = kind.split(":")[0] ?? kind;

            if (!capGroups.has(category)) capGroups.set(category, []);

            if ("pattern" in cap) {
              capGroups
                .get(category)!
                .push((cap as { pattern: string }).pattern);
            } else if ("allowedBinaries" in cap) {
              capGroups
                .get(category)!
                .push(
                  ...(cap as { allowedBinaries: readonly string[] })
                    .allowedBinaries,
                );
            } else if ("allowedDomains" in cap) {
              capGroups
                .get(category)!
                .push(
                  ...(cap as { allowedDomains: readonly string[] })
                    .allowedDomains,
                );
            } else if ("allowedImages" in cap) {
              capGroups
                .get(category)!
                .push(
                  ...(cap as { allowedImages: readonly string[] })
                    .allowedImages,
                );
            } else if ("allowedKeys" in cap) {
              capGroups
                .get(category)!
                .push(
                  ...(cap as { allowedKeys: readonly string[] }).allowedKeys,
                );
            } else if ("pluginName" in cap) {
              capGroups
                .get(category)!
                .push((cap as { pluginName: string }).pluginName);
            }
          }

          const colorMap: Record<string, string> = {
            fs: "success",
            process: "warning",
            net: "accent",
            env: "text",
            db: "accent",
            docker: "accent",
            secret: "error",
            os: "muted",
            plugin: "accent",
          };

          for (const [category, values] of capGroups) {
            const color = colorMap[category] ?? "dim";
            const kinds = caps
              .filter((c) => c.kind.startsWith(category + ":"))
              .map((c) => c.kind.split(":")[1]);
            const uniqueKinds = [...new Set(kinds)];

            const label = theme.fg(color, theme.bold(category));
            const kindStr = theme.fg("dim", ":" + uniqueKinds.join(","));
            const valStr = theme.fg(
              "muted",
              " " + values.slice(0, 4).join(" "),
            );
            const overflow =
              values.length > 4
                ? theme.fg("dim", ` +${values.length - 4}`)
                : "";

            const content = " " + label + kindStr + valStr + overflow;
            const contentPlain =
              category.length +
              1 +
              uniqueKinds.join(",").length +
              1 +
              values.slice(0, 4).join(" ").length +
              (values.length > 4 ? ` +${values.length - 4}`.length : 0);
            const padLen = Math.max(0, inner - contentPlain);

            lines.push(
              theme.fg("borderAccent", B.v) +
                content +
                " ".repeat(padLen) +
                " " +
                theme.fg("borderAccent", B.v),
            );
          }

          // Bottom border
          lines.push(
            theme.fg("borderAccent", B.bl + B.h.repeat(width - 2) + B.br),
          );

          return lines;
        },
      };
    },
  };
}
