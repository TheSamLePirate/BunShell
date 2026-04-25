// Web-based TypeScript syntax highlighter — mirrors src/repl/highlight.ts
// Returns HTML spans instead of ANSI codes.

const PROTECTED_RE =
  /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|`(?:[^`\\]|\\.)*`|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g;

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
]);

const KEYWORDS_RE =
  /\b(const|let|var|await|async|function|if|else|for|while|return|import|from|export|new|typeof|instanceof|class|interface|type|extends|implements|in|of|switch|case|default|break|continue|throw|try|catch|finally|void|delete|yield)\b/g;

const API_RE =
  /\b(ls|cat|stat|exists|mkdir|write|readJson|writeJson|rm|cp|mv|find|du|chmod|createSymlink|readLink|touch|append|truncate|realPath|watchPath|globFiles|ps|kill|spawn|exec|netFetch|ping|download|dig|serve|wsConnect|env|getEnv|setEnv|grep|sort|uniq|head|tail|wc|uname|uptime|whoami|hostname|df|hash|hmac|randomBytes|randomUUID|randomInt|encrypt|decrypt|tar|untar|zip|unzip|gzip|gunzip|lineStream|tailStream|pipeSpawn|streamSpawn|parseJSON|formatJSON|parseCSV|formatCSV|parseTOML|base64Encode|base64Decode|base64DecodeString|dbOpen|dbQuery|dbExec|gitStatus|gitLog|gitDiff|gitBranch|gitAdd|gitCommit|gitPush|gitPull|gitClone|gitStash|openUrl|openFile|notify|clipboard|sleep|interval|timeout|debounce|throttle|retry|currentUser|users|groups|pipe|filter|map|reduce|take|skip|sortBy|groupBy|unique|flatMap|tap|count|first|last|pluck|toTable|toBarChart|toSparkline|toHistogram|runAgent|createContext|capabilities|dockerRun|dockerExec|dockerVfsRun|dockerBuild|dockerPull|dockerImages|dockerPs|dockerStop|dockerRm|dockerLogs|dockerSpawnBackground|dockerRunStreaming|dockerRunProxied|startEgressProxy|validatePlugin|createPluginRegistry|createSecretStore|deriveKey|createStateStore|authBearer|authedFetch|secretFromEnv)\b/g;

const BOOL_RE = /\b(true|false|null|undefined|NaN|Infinity)\b/g;
const NUMBER_RE =
  /\b(0x[0-9a-fA-F]+|0o[0-7]+|0b[01]+|\d+(\.\d+)?([eE][+-]?\d+)?n?)\b/g;
const TYPE_RE = /(?<=:\s*|as\s+|<)\b([A-Z][a-zA-Z0-9]*(?:<[^>]*>)?(\[\])?)\b/g;
const OPERATOR_RE = /(=>|===|!==|==|!=|>=|<=|&&|\|\||\?\?|\.\.\.)/g;

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function span(cls: string, text: string): string {
  return `<span class="${cls}">${esc(text)}</span>`;
}

export function highlightCode(code: string): string {
  if (!code) return "";

  const segments: Array<{ text: string; isProtected: boolean }> = [];
  let lastIndex = 0;

  for (const match of code.matchAll(PROTECTED_RE)) {
    const start = match.index;
    if (start > lastIndex) {
      segments.push({ text: code.slice(lastIndex, start), isProtected: false });
    }
    segments.push({ text: match[0], isProtected: true });
    lastIndex = start + match[0].length;
  }
  if (lastIndex < code.length) {
    segments.push({ text: code.slice(lastIndex), isProtected: false });
  }

  return segments
    .map((seg) => {
      if (seg.isProtected) return colorProtected(seg.text);
      return colorCode(seg.text);
    })
    .join("");
}

function colorProtected(text: string): string {
  if (text.startsWith("//") || text.startsWith("/*")) {
    return span("hl-comment", text);
  }
  const inner = text.slice(1, -1);
  if (CAPABILITY_KINDS.has(inner) || inner.startsWith("plugin:")) {
    const q = esc(text[0]);
    return `<span class="hl-string">${q}</span><span class="hl-cap-kind">${esc(inner)}</span><span class="hl-string">${q}</span>`;
  }
  return span("hl-string", text);
}

function colorCode(text: string): string {
  const replacements: string[] = [];

  function mark(html: string): string {
    const idx = replacements.length;
    replacements.push(html);
    return `\u00A7${idx}\u00A7`;
  }

  let result = esc(text);

  result = result.replace(TYPE_RE, (m) => mark(span("hl-type", m)));
  result = result.replace(KEYWORDS_RE, (m) => mark(span("hl-keyword", m)));
  result = result.replace(API_RE, (m) => mark(span("hl-api", m)));
  result = result.replace(BOOL_RE, (m) => mark(span("hl-bool", m)));
  result = result.replace(NUMBER_RE, (m) => mark(span("hl-number", m)));
  result = result.replace(OPERATOR_RE, (m) => mark(span("hl-operator", m)));

   
  const MARKER_RE = /\u00A7(\d+)\u00A7/g;
  result = result.replace(MARKER_RE, (_, idx) => replacements[parseInt(idx)]!);
  return result;
}
