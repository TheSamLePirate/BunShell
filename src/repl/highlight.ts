/**
 * Regex-based TypeScript syntax highlighter for terminal output.
 *
 * Segments input into protected regions (strings, comments) and
 * code regions, then applies ANSI colors to each token type.
 * Zero dependencies — pure regex + ANSI escape codes.
 *
 * @module
 */

// ---------------------------------------------------------------------------
// ANSI colors
// ---------------------------------------------------------------------------

const H = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  magenta: "\x1b[35m",
  red: "\x1b[31m",
  white: "\x1b[37m",
};

// ---------------------------------------------------------------------------
// Token patterns
// ---------------------------------------------------------------------------

/** Master regex: splits input into protected regions (strings, comments) and code. */
const PROTECTED_RE =
  /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|`(?:[^`\\]|\\.)*`|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g;

/** Capability kind strings — highlighted distinctly inside quotes. */
const CAPABILITY_KINDS = new Set([
  "fs:read",
  "fs:write",
  "fs:delete",
  "process:spawn",
  "net:fetch",
  "net:listen",
  "env:read",
  "env:write",
  "db:query",
  "net:connect",
  "os:interact",
  "secret:read",
  "secret:write",
  "docker:run",
  // plugin:* kinds are dynamic template literals — matched by prefix below
]);

/** TypeScript/JavaScript keywords. */
const KEYWORDS_RE =
  /\b(const|let|var|await|async|function|if|else|for|while|return|import|from|export|new|typeof|instanceof|class|interface|type|extends|implements|in|of|switch|case|default|break|continue|throw|try|catch|finally|void|delete|yield)\b/g;

/** BunShell API function names. */
const API_RE =
  /\b(ls|cat|stat|exists|mkdir|write|readJson|writeJson|rm|cp|mv|find|du|chmod|createSymlink|readLink|touch|append|truncate|realPath|watchPath|globFiles|ps|kill|spawn|exec|netFetch|ping|download|dig|serve|wsConnect|env|getEnv|setEnv|grep|sort|uniq|head|tail|wc|uname|uptime|whoami|hostname|df|hash|hmac|randomBytes|randomUUID|randomInt|encrypt|decrypt|tar|untar|zip|unzip|gzip|gunzip|lineStream|tailStream|pipeSpawn|streamSpawn|parseJSON|formatJSON|parseCSV|formatCSV|parseTOML|base64Encode|base64Decode|base64DecodeString|dbOpen|dbQuery|dbExec|gitStatus|gitLog|gitDiff|gitBranch|gitAdd|gitCommit|gitPush|gitPull|gitClone|gitStash|openUrl|openFile|notify|clipboard|sleep|interval|timeout|debounce|throttle|retry|currentUser|users|groups|pipe|filter|map|reduce|take|skip|sortBy|groupBy|unique|flatMap|tap|count|first|last|pluck|from|fromFile|fromJSON|fromCommand|toFile|toJSON|toStdout|collect|streamPipe|sFilter|sMap|sFlatMap|sTake|sSkip|sTap|sUnique|sPluck|sChunk|sScan|sThrottle|sTakeWhile|sSkipWhile|sToArray|sReduce|sCount|sFirst|sForEach|sToFile|fromArray|fromReadable|fromLines|toTable|toBarChart|toSparkline|toHistogram|runAgent|createContext|capabilities|createSecretStore|deriveKey|createStateStore|authBearer|authBasic|authedFetch|oauth2DeviceFlow|cookieJar|secretFromEnv|createAuditLogger|consoleSink|jsonlSink|streamSink|dockerRun|dockerExec|dockerVfsRun|dockerBuild|dockerPull|dockerImages|dockerPs|dockerStop|dockerRm|dockerLogs|dockerSpawnBackground|dockerRunStreaming|dockerRunProxied|startEgressProxy|createLiveMount|validatePlugin|createPluginRegistry|cmuxDetect|cmuxIdentify|cmuxListWorkspaces|cmuxNewWorkspace|cmuxSelectWorkspace|cmuxCloseWorkspace|cmuxRenameWorkspace|cmuxListWindows|cmuxNewWindow|cmuxFocusWindow|cmuxNewSplit|cmuxListPanes|cmuxListSurfaces|cmuxFocusPane|cmuxCloseSurface|cmuxTree|cmuxSend|cmuxSendKey|cmuxReadScreen|cmuxNotify|cmuxClearNotifications|cmuxSetStatus|cmuxClearStatus|cmuxSetProgress|cmuxClearProgress|cmuxLog|cmuxClearLog|cmuxSidebarState|cmuxBrowserOpen|cmuxBrowserNavigate|cmuxBrowserClick|cmuxBrowserFill|cmuxBrowserSnapshot|cmuxBrowserScreenshot|cmuxBrowserEval|cmuxBrowserWait|cmuxBrowserGet|cmuxSetBuffer|cmuxPasteBuffer|cmuxPing|cmuxDisplayMessage|cmuxVersion)\b/g;

/** Boolean, null, undefined. */
const BOOL_RE = /\b(true|false|null|undefined|NaN|Infinity)\b/g;

/** Numbers (int, float, hex, octal, binary, bigint). */
const NUMBER_RE =
  /\b(0x[0-9a-fA-F]+|0o[0-7]+|0b[01]+|\d+(\.\d+)?([eE][+-]?\d+)?n?)\b/g;

/** Type names (capitalized identifiers, often after : or as). */
const TYPE_RE = /(?<=:\s*|as\s+|<)\b([A-Z][a-zA-Z0-9]*(?:<[^>]*>)?(\[\])?)\b/g;

/** Arrow operator and comparison operators. */
const OPERATOR_RE = /(=>|===|!==|==|!=|>=|<=|&&|\|\||\?\?|\.\.\.)/g;

// ---------------------------------------------------------------------------
// Highlighter
// ---------------------------------------------------------------------------

/**
 * Apply syntax highlighting to a line of TypeScript code.
 * Returns the same string with ANSI color codes injected.
 *
 * @example
 * ```ts
 * console.log(highlightCode('const x: number = await ls(ctx, ".")'));
 * // "const" in bold blue, "number" in magenta, "ls" in cyan, string in green
 * ```
 */
export function highlightCode(code: string): string {
  if (code.length === 0) return code;

  // Step 1: Split into protected (strings/comments) and code segments
  const segments: Array<{ text: string; protected: boolean }> = [];
  let lastIndex = 0;

  for (const match of code.matchAll(PROTECTED_RE)) {
    const start = match.index;
    // Code before this protected region
    if (start > lastIndex) {
      segments.push({ text: code.slice(lastIndex, start), protected: false });
    }
    segments.push({ text: match[0], protected: true });
    lastIndex = start + match[0].length;
  }
  // Remaining code after last protected region
  if (lastIndex < code.length) {
    segments.push({ text: code.slice(lastIndex), protected: false });
  }

  // Step 2: Color each segment
  const colored = segments.map((seg) => {
    if (seg.protected) {
      return colorProtected(seg.text);
    }
    return colorCode(seg.text);
  });

  return colored.join("");
}

/**
 * Color a protected region (string or comment).
 */
function colorProtected(text: string): string {
  // Comments → dim
  if (text.startsWith("//") || text.startsWith("/*")) {
    return `${H.dim}${text}${H.reset}`;
  }

  // Check if the string content is a capability kind (static or plugin:*)
  const inner = text.slice(1, -1);
  if (CAPABILITY_KINDS.has(inner) || inner.startsWith("plugin:")) {
    const quote = text[0];
    return `${H.yellow}${quote}${H.bold}${inner}${H.reset}${H.yellow}${quote}${H.reset}`;
  }

  // Regular string → green
  return `${H.green}${text}${H.reset}`;
}

/**
 * Color a code region by applying regex patterns in priority order.
 */
function colorCode(text: string): string {
  // Use a replacer chain. Each regex replaces matches with ANSI-wrapped
  // versions. To avoid double-coloring, we use a placeholder system:
  // replace with \x00N\x00 markers, then expand at the end.
  const replacements: string[] = [];

  function mark(colored: string): string {
    const idx = replacements.length;
    replacements.push(colored);
    // Encode index as letters (a=0, b=1, ...) to avoid NUMBER_RE matching digits
    const encoded = idx
      .toString(36)
      .split("")
      .map((c) => String.fromCharCode(c.charCodeAt(0) + 0x100))
      .join("");
    return `\u00A7${encoded}\u00A7`;
  }

  let result = text;

  // Order matters: more specific patterns first

  // 1. Type annotations (after : or as or in <>) — magenta italic
  result = result.replace(TYPE_RE, (m) =>
    mark(`${H.magenta}${H.italic}${m}${H.reset}`),
  );

  // 2. Keywords — bold blue
  result = result.replace(KEYWORDS_RE, (m) =>
    mark(`${H.bold}${H.blue}${m}${H.reset}`),
  );

  // 3. BunShell API names — cyan
  result = result.replace(API_RE, (m) => mark(`${H.cyan}${m}${H.reset}`));

  // 4. Booleans / null / undefined — yellow
  result = result.replace(BOOL_RE, (m) => mark(`${H.yellow}${m}${H.reset}`));

  // 5. Numbers — yellow
  result = result.replace(NUMBER_RE, (m) => mark(`${H.yellow}${m}${H.reset}`));

  // 6. Operators — dim
  result = result.replace(OPERATOR_RE, (m) => mark(`${H.dim}${m}${H.reset}`));

  // Expand markers (§encoded§ placeholders)
  const MARKER_RE = /\u00A7([^\u00A7]+)\u00A7/g;
  result = result.replace(MARKER_RE, (_, encoded: string) => {
    const decoded = encoded
      .split("")
      .map((c) => String.fromCharCode(c.charCodeAt(0) - 0x100))
      .join("");
    return replacements[parseInt(decoded, 36)]!;
  });

  return result;
}
