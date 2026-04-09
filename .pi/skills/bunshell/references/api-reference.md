# BunShell API Reference

All functions are available in `bunshell_execute`. Use `ctx` as the first argument for capability-checked functions. Use `await` for async. 130+ functions total.

## Filesystem (fs:read, fs:write, fs:delete)

| Function | Signature | Returns |
|----------|-----------|---------|
| `ls` | `(ctx, path?, options?)` | `FileEntry[]` |
| `cat` | `(ctx, path)` | `string` |
| `stat` | `(ctx, path)` | `FileEntry` |
| `exists` | `(ctx, path)` | `boolean` |
| `mkdir` | `(ctx, path)` | `void` |
| `write` | `(ctx, path, data)` | `WriteResult` |
| `readJson` | `(ctx, path)` | `T` |
| `writeJson` | `(ctx, path, data)` | `WriteResult` |
| `rm` | `(ctx, path, opts?)` | `void` |
| `cp` | `(ctx, src, dest)` | `void` |
| `mv` | `(ctx, src, dest)` | `void` |
| `find` | `(ctx, path, pattern)` | `FileEntry[]` |
| `du` | `(ctx, path)` | `DiskUsage` |
| `chmod` | `(ctx, path, mode)` | `void` |
| `createSymlink` | `(ctx, target, path)` | `void` |
| `readLink` | `(ctx, path)` | `string` |
| `touch` | `(ctx, path)` | `void` |
| `append` | `(ctx, path, data)` | `void` |
| `truncate` | `(ctx, path, size?)` | `void` |
| `realPath` | `(ctx, path)` | `string` |
| `watchPath` | `(ctx, path, cb)` | `{ close() }` |
| `globFiles` | `(ctx, pattern, cwd?)` | `string[]` |

**LsOptions:** `{ recursive?, hidden?, glob?, sortBy?, order? }`

## Process (process:spawn)

| Function | Signature | Returns |
|----------|-----------|---------|
| `ps` | `(ctx)` | `ProcessInfo[]` |
| `kill` | `(ctx, pid, signal?)` | `boolean` |
| `spawn` | `(ctx, cmd, args?, opts?)` | `SpawnResult` |
| `exec` | `(ctx, cmd, args?)` | `string` |

## Network (net:fetch)

| Function | Signature | Returns |
|----------|-----------|---------|
| `netFetch` | `(ctx, url, opts?)` | `NetResponse<T>` |
| `ping` | `(ctx, host)` | `PingResult` |
| `download` | `(ctx, url, dest)` | `WriteResult` |
| `dig` | `(ctx, domain, type?)` | `DnsRecord[]` |
| `serve` | `(ctx, opts)` | `ServerHandle` |
| `wsConnect` | `(ctx, url)` | `TypedWebSocket` |

## Environment (env:read, env:write)

| Function | Signature | Returns |
|----------|-----------|---------|
| `env` | `(ctx)` | `EnvEntry[]` |
| `getEnv` | `(ctx, key)` | `string \| undefined` |
| `setEnv` | `(ctx, key, value)` | `void` |

## Text (no capability)

| Function | Signature | Returns |
|----------|-----------|---------|
| `grep` | `(ctx, pattern, path, opts?)` | `GrepMatch[]` |
| `sort` | `(text, opts?)` | `string` |
| `uniq` | `(text, opts?)` | `string` |
| `head` | `(text, n?)` | `string` |
| `tail` | `(text, n?)` | `string` |
| `wc` | `(text)` | `WcResult` |

## System

| Function | Signature | Returns |
|----------|-----------|---------|
| `uname` | `(ctx)` | `SystemInfo` |
| `uptime` | `(ctx)` | `number` |
| `whoami` | `(ctx)` | `string` |
| `hostname` | `(ctx)` | `string` |
| `df` | `(ctx)` | `DfEntry[]` |

## Crypto (no capability)

| Function | Signature | Returns |
|----------|-----------|---------|
| `hash` | `(data, algo?)` | `HashResult` |
| `hmac` | `(data, key, algo?)` | `HashResult` |
| `randomBytes` | `(n)` | `Uint8Array` |
| `randomUUID` | `()` | `string` |
| `randomInt` | `(min, max)` | `number` |
| `encrypt` | `(data, key)` | `EncryptResult` |
| `decrypt` | `(ciphertext, key, iv, tag)` | `string` |

## Archive (fs:read + fs:write)

| Function | Signature | Returns |
|----------|-----------|---------|
| `tar` | `(ctx, paths, dest)` | `WriteResult` |
| `untar` | `(ctx, archive, dest)` | `ExtractResult` |
| `zip` | `(ctx, paths, dest)` | `WriteResult` |
| `unzip` | `(ctx, archive, dest)` | `ExtractResult` |
| `gzip` | `(ctx, path)` | `WriteResult` |
| `gunzip` | `(ctx, path)` | `WriteResult` |

## Data (no capability)

| Function | Signature | Returns |
|----------|-----------|---------|
| `parseJSON` | `(text)` | `T` |
| `formatJSON` | `(data, indent?)` | `string` |
| `parseCSV` | `(text, opts?)` | `Record[]` |
| `formatCSV` | `(rows, opts?)` | `string` |
| `parseTOML` | `(text)` | `T` |
| `base64Encode` | `(data)` | `string` |
| `base64Decode` | `(text)` | `Uint8Array` |
| `base64DecodeString` | `(text)` | `string` |

## Database (db:query)

| Function | Signature | Returns |
|----------|-----------|---------|
| `dbOpen` | `(ctx, path)` | `TypedDatabase` |
| `dbQuery` | `(ctx, path, sql, params?)` | `T[]` |
| `dbExec` | `(ctx, path, sql, params?)` | `{ changes }` |

## Git (process:spawn → git)

| Function | Signature | Returns |
|----------|-----------|---------|
| `gitStatus` | `(ctx)` | `GitStatus` |
| `gitLog` | `(ctx, opts?)` | `GitCommit[]` |
| `gitDiff` | `(ctx, ref?)` | `GitDiffEntry[]` |
| `gitBranch` | `(ctx)` | `GitBranches` |
| `gitAdd` | `(ctx, paths)` | `void` |
| `gitCommit` | `(ctx, message)` | `{ hash }` |
| `gitPush` | `(ctx, remote?, branch?)` | `string` |
| `gitPull` | `(ctx, remote?, branch?)` | `string` |
| `gitClone` | `(ctx, url, dest)` | `string` |
| `gitStash` | `(ctx, action?)` | `string` |

## Docker (docker:run)

| Function | Signature | Returns |
|----------|-----------|---------|
| `dockerRun` | `(ctx, image, opts?)` | `DockerRunResult` |
| `dockerExec` | `(ctx, image, script, opts?)` | `DockerRunResult` |
| `dockerVfsRun` | `(ctx, vfs, image, opts)` | `DockerVfsRunResult` |
| `dockerBuild` | `(ctx, path, tag, opts?)` | `DockerBuildResult` |
| `dockerPull` | `(ctx, image)` | `DockerRunResult` |
| `dockerImages` | `(ctx)` | `DockerImage[]` |
| `dockerPs` | `(ctx)` | `DockerContainer[]` |
| `dockerStop` | `(ctx, id, timeout?)` | `boolean` |
| `dockerRm` | `(ctx, id, force?)` | `boolean` |
| `dockerLogs` | `(ctx, id, opts?)` | `string` |
| `dockerSpawnBackground` | `(ctx, image, opts?)` | `DockerDaemonHandle` |
| `dockerRunStreaming` | `(ctx, image, opts?)` | `DockerStream` |
| `dockerRunProxied` | `(ctx, image, opts?)` | `DockerRunResult & { proxyStats }` |
| `startEgressProxy` | `(ctx, opts?)` | `EgressProxyHandle` |

## OS (os:interact)

| Function | Signature | Returns |
|----------|-----------|---------|
| `openUrl` | `(ctx, url)` | `void` |
| `openFile` | `(ctx, path)` | `void` |
| `notify` | `(ctx, title, body)` | `void` |
| `clipboard` | `(ctx)` | `ClipboardHandle` |

## Scheduling (no capability)

| Function | Signature | Returns |
|----------|-----------|---------|
| `sleep` | `(ms)` | `Promise<void>` |
| `interval` | `(ms, fn)` | `IntervalHandle` |
| `timeout` | `(ms, fn)` | `TimeoutHandle` |
| `debounce` | `(ms, fn)` | `Function` |
| `throttle` | `(ms, fn)` | `Function` |
| `retry` | `(attempts, delay, fn)` | `T` |

## Pipe (Eager)

| Function | Signature |
|----------|-----------|
| `pipe` | `(source, ...stages)` |
| `filter` | `(pred)` |
| `map` | `(fn)` |
| `reduce` | `(fn, init)` |
| `take` | `(n)` |
| `skip` | `(n)` |
| `sortBy` | `(key, order?)` |
| `groupBy` | `(key)` |
| `unique` | `(key?)` |
| `flatMap` | `(fn)` |
| `pluck` | `(key)` |
| `count` | `()` |
| `first` | `()` |
| `last` | `()` |
| `toTable` | `(opts?)` |
| `toBarChart` | `(valueField?, labelField?, opts?)` |
| `toSparkline` | `(valueField?)` |
| `toHistogram` | `(valueField?, opts?)` |
| `toFile` | `(ctx, path)` |
| `toJSON` | `(ctx, path)` |

## Stream Pipe (Lazy, O(1) Memory)

| Function | Signature |
|----------|-----------|
| `streamPipe` | `(source, ...stages)` |
| `sFilter` | `(pred)` |
| `sMap` | `(fn)` |
| `sFlatMap` | `(fn)` |
| `sTake` | `(n)` |
| `sSkip` | `(n)` |
| `sChunk` | `(n)` |
| `sScan` | `(fn, init)` |
| `sThrottle` | `(ms)` |
| `sTakeWhile` | `(pred)` |
| `sSkipWhile` | `(pred)` |
| `sToArray` | `(stream)` |
| `sReduce` | `(stream, fn, init)` |
| `sCount` | `(stream)` |
| `sFirst` | `(stream)` |
| `sForEach` | `(stream, fn)` |
| `sToFile` | `(stream, path)` |

## cmux Terminal Multiplexer (os:interact)

### Detection & Utility

| Function | Signature | Returns |
|----------|-----------|---------|
| `cmuxDetect` | `(ctx)` | `boolean` |
| `cmuxIdentify` | `(ctx)` | `CmuxIdentity` |
| `cmuxPing` | `(ctx)` | `boolean` |
| `cmuxVersion` | `(ctx)` | `string` |
| `cmuxDisplayMessage` | `(ctx, text)` | `void` |

### Workspaces

| Function | Signature | Returns |
|----------|-----------|---------|
| `cmuxListWorkspaces` | `(ctx)` | `CmuxWorkspace[]` |
| `cmuxNewWorkspace` | `(ctx, opts?)` | `string` |
| `cmuxSelectWorkspace` | `(ctx, id)` | `void` |
| `cmuxCloseWorkspace` | `(ctx, id)` | `void` |
| `cmuxRenameWorkspace` | `(ctx, title, id?)` | `void` |

### Windows

| Function | Signature | Returns |
|----------|-----------|---------|
| `cmuxListWindows` | `(ctx)` | `CmuxWindow[]` |
| `cmuxNewWindow` | `(ctx)` | `string` |
| `cmuxFocusWindow` | `(ctx, id)` | `void` |

### Panes, Splits & Surfaces

| Function | Signature | Returns |
|----------|-----------|---------|
| `cmuxNewSplit` | `(ctx, direction, surfaceId?)` | `string` |
| `cmuxListPanes` | `(ctx, workspaceId?)` | `CmuxPane[]` |
| `cmuxListSurfaces` | `(ctx)` | `CmuxSurface[]` |
| `cmuxFocusPane` | `(ctx, paneId, workspaceId?)` | `void` |
| `cmuxCloseSurface` | `(ctx, surfaceId?)` | `void` |
| `cmuxTree` | `(ctx, opts?)` | `string` |

### Input & Output

| Function | Signature | Returns |
|----------|-----------|---------|
| `cmuxSend` | `(ctx, text, surfaceId?)` | `void` |
| `cmuxSendKey` | `(ctx, key, surfaceId?)` | `void` |
| `cmuxReadScreen` | `(ctx, opts?)` | `CmuxScreenContent` |

### Notifications

| Function | Signature | Returns |
|----------|-----------|---------|
| `cmuxNotify` | `(ctx, { title, body, subtitle? })` | `void` |
| `cmuxClearNotifications` | `(ctx)` | `void` |

### Sidebar (Status, Progress, Log)

| Function | Signature | Returns |
|----------|-----------|---------|
| `cmuxSetStatus` | `(ctx, key, value, opts?)` | `void` |
| `cmuxClearStatus` | `(ctx, key)` | `void` |
| `cmuxSetProgress` | `(ctx, value, label?)` | `void` |
| `cmuxClearProgress` | `(ctx)` | `void` |
| `cmuxLog` | `(ctx, message, opts?)` | `void` |
| `cmuxClearLog` | `(ctx)` | `void` |
| `cmuxSidebarState` | `(ctx, workspaceId?)` | `unknown` |

### Browser Automation

| Function | Signature | Returns |
|----------|-----------|---------|
| `cmuxBrowserOpen` | `(ctx, url, opts?)` | `string` |
| `cmuxBrowserNavigate` | `(ctx, surfaceId, url)` | `void` |
| `cmuxBrowserClick` | `(ctx, surfaceId, selector)` | `void` |
| `cmuxBrowserFill` | `(ctx, surfaceId, selector, text)` | `void` |
| `cmuxBrowserSnapshot` | `(ctx, surfaceId, opts?)` | `string` |
| `cmuxBrowserScreenshot` | `(ctx, surfaceId, outPath)` | `void` |
| `cmuxBrowserEval` | `(ctx, surfaceId, expression)` | `string` |
| `cmuxBrowserWait` | `(ctx, surfaceId, opts)` | `void` |
| `cmuxBrowserGet` | `(ctx, surfaceId, property, selector?)` | `string` |

### Clipboard / Buffers

| Function | Signature | Returns |
|----------|-----------|---------|
| `cmuxSetBuffer` | `(ctx, text, name?)` | `void` |
| `cmuxPasteBuffer` | `(ctx, opts?)` | `void` |

## 14 Capability Types

| Kind | Controls | Enforcement |
|------|----------|-------------|
| `fs:read` | File/directory reads | Glob pattern |
| `fs:write` | File writes | Glob pattern |
| `fs:delete` | File deletion | Glob pattern |
| `process:spawn` | Binary execution | Allowed list |
| `net:fetch` | HTTP requests | Domain list |
| `net:listen` | Server ports | Port number |
| `env:read` | Env variable reads | Key list |
| `env:write` | Env variable writes | Key list |
| `db:query` | SQLite access | Path pattern |
| `net:connect` | Raw TCP/UDP | Host + port list |
| `os:interact` | Desktop ops | Boolean |
| `secret:read` | Secret reads | Key pattern |
| `secret:write` | Secret writes | Key pattern |
| `docker:run` | Container images | Image list + globs |
