/**
 * SQLite database wrappers — Bun-native typed database access.
 *
 * Requires db:query capability matching the database file path.
 *
 * @module
 */

import { Database, type SQLQueryBindings } from "bun:sqlite";
import type { CapabilityContext } from "../capabilities/types";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A managed database handle with capability checks. */
export interface TypedDatabase {
  /** Run a SELECT query and return typed rows. */
  query<T = Record<string, unknown>>(
    sql: string,
    params?: SQLQueryBindings[],
  ): T[];

  /** Run an INSERT/UPDATE/DELETE and return change count. */
  exec(sql: string, params?: SQLQueryBindings[]): { changes: number };

  /** Run multiple statements (e.g., migrations). */
  run(sql: string): void;

  /** Get a single row or undefined. */
  get<T = Record<string, unknown>>(
    sql: string,
    params?: SQLQueryBindings[],
  ): T | undefined;

  /** List all table names. */
  tables(): string[];

  /** Close the database connection. */
  close(): void;

  /** The file path of this database. */
  readonly path: string;
}

// ---------------------------------------------------------------------------
// dbOpen
// ---------------------------------------------------------------------------

/**
 * Open a SQLite database with capability checks.
 * Requires db:query capability matching the database path.
 * Also requires fs:read and fs:write for the database file.
 *
 * @example
 * ```ts
 * const db = dbOpen(ctx, "/tmp/app.db");
 * db.exec("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT)");
 * db.exec("INSERT INTO users (name) VALUES (?)", ["Alice"]);
 * const users = db.query<{ id: number; name: string }>("SELECT * FROM users");
 * db.close();
 * ```
 */
export function dbOpen(ctx: CapabilityContext, path: string): TypedDatabase {
  const absPath = resolve(path);
  ctx.caps.demand({ kind: "db:query", pattern: absPath });
  ctx.caps.demand({ kind: "fs:read", pattern: absPath });
  ctx.caps.demand({ kind: "fs:write", pattern: absPath });
  ctx.audit.log("db:query", { op: "dbOpen", path: absPath });

  const db = new Database(absPath, { create: true });
  db.exec("PRAGMA journal_mode = WAL");

  return {
    path: absPath,

    query<T = Record<string, unknown>>(
      sql: string,
      params?: SQLQueryBindings[],
    ): T[] {
      ctx.audit.log("db:query", {
        op: "query",
        sql: sql.slice(0, 200),
        path: absPath,
      });
      const stmt = db.prepare(sql);
      return (params ? stmt.all(...params) : stmt.all()) as T[];
    },

    exec(sql: string, params?: SQLQueryBindings[]): { changes: number } {
      ctx.audit.log("db:query", {
        op: "exec",
        sql: sql.slice(0, 200),
        path: absPath,
      });
      const stmt = db.prepare(sql);
      const result = params ? stmt.run(...params) : stmt.run();
      return { changes: result.changes };
    },

    run(sql: string): void {
      ctx.audit.log("db:query", {
        op: "run",
        sql: sql.slice(0, 200),
        path: absPath,
      });
      db.exec(sql);
    },

    get<T = Record<string, unknown>>(
      sql: string,
      params?: SQLQueryBindings[],
    ): T | undefined {
      ctx.audit.log("db:query", {
        op: "get",
        sql: sql.slice(0, 200),
        path: absPath,
      });
      const stmt = db.prepare(sql);
      return (params ? stmt.get(...params) : stmt.get()) as T | undefined;
    },

    tables(): string[] {
      ctx.audit.log("db:query", { op: "tables", path: absPath });
      const rows = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        )
        .all() as Array<{ name: string }>;
      return rows.map((r) => r.name);
    },

    close(): void {
      ctx.audit.log("db:query", { op: "close", path: absPath });
      db.close();
    },
  };
}

// ---------------------------------------------------------------------------
// Convenience: dbQuery / dbExec (open, run, close)
// ---------------------------------------------------------------------------

/**
 * Open a database, run a SELECT, close it. For one-off queries.
 *
 * @example
 * ```ts
 * const users = dbQuery<{ name: string }>(ctx, "/tmp/app.db", "SELECT * FROM users");
 * ```
 */
export function dbQuery<T = Record<string, unknown>>(
  ctx: CapabilityContext,
  path: string,
  sql: string,
  params?: SQLQueryBindings[],
): T[] {
  const db = dbOpen(ctx, path);
  try {
    return db.query<T>(sql, params);
  } finally {
    db.close();
  }
}

/**
 * Open a database, run an exec statement, close it. For one-off mutations.
 *
 * @example
 * ```ts
 * dbExec(ctx, "/tmp/app.db", "INSERT INTO users (name) VALUES (?)", ["Bob"]);
 * ```
 */
export function dbExec(
  ctx: CapabilityContext,
  path: string,
  sql: string,
  params?: SQLQueryBindings[],
): { changes: number } {
  const db = dbOpen(ctx, path);
  try {
    return db.exec(sql, params);
  } finally {
    db.close();
  }
}
