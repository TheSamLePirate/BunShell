import { describe, it, expect, afterAll } from "bun:test";
import {
  createContext,
  capabilities,
  CapabilityError,
} from "../../src/capabilities/index";
import { dbOpen, dbQuery, dbExec } from "../../src/wrappers/db";
import { rmSync } from "node:fs";
import { join } from "node:path";

const testDir = join(import.meta.dir, ".tmp-test-db");
const dbPath = join(testDir, "test.db");

import { mkdirSync } from "node:fs";
mkdirSync(testDir, { recursive: true });

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true });
});

const ctx = createContext({
  name: "db-test",
  capabilities: capabilities()
    .fsRead("**")
    .fsWrite("**")
    .dbQuery("**")
    .build()
    .capabilities.slice(),
});

describe("dbOpen", () => {
  it("opens and creates a database", () => {
    const db = dbOpen(ctx, dbPath);
    expect(db.path).toContain("test.db");
    db.close();
  });

  it("creates tables and inserts data", () => {
    const db = dbOpen(ctx, dbPath);
    db.run(
      "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT, age INTEGER)",
    );
    db.exec("INSERT INTO users (name, age) VALUES (?, ?)", ["Alice", 30]);
    db.exec("INSERT INTO users (name, age) VALUES (?, ?)", ["Bob", 25]);

    const users = db.query<{ id: number; name: string; age: number }>(
      "SELECT * FROM users ORDER BY name",
    );
    expect(users.length).toBe(2);
    expect(users[0]!.name).toBe("Alice");
    expect(users[0]!.age).toBe(30);
    expect(users[1]!.name).toBe("Bob");
    db.close();
  });

  it("get() returns a single row", () => {
    const db = dbOpen(ctx, dbPath);
    const user = db.get<{ name: string }>(
      "SELECT name FROM users WHERE age = ?",
      [30],
    );
    expect(user).toBeDefined();
    expect(user!.name).toBe("Alice");
    db.close();
  });

  it("get() returns null for no match", () => {
    const db = dbOpen(ctx, dbPath);
    const user = db.get("SELECT * FROM users WHERE age = ?", [999]);
    expect(user).toBeNull();
    db.close();
  });

  it("tables() lists table names", () => {
    const db = dbOpen(ctx, dbPath);
    const tables = db.tables();
    expect(tables).toContain("users");
    db.close();
  });

  it("exec() returns change count", () => {
    const db = dbOpen(ctx, dbPath);
    const result = db.exec("UPDATE users SET age = age + 1 WHERE name = ?", [
      "Alice",
    ]);
    expect(result.changes).toBe(1);
    db.close();
  });
});

describe("dbQuery / dbExec convenience", () => {
  it("dbQuery runs a one-off select", () => {
    const users = dbQuery<{ name: string }>(
      ctx,
      dbPath,
      "SELECT name FROM users ORDER BY name",
    );
    expect(users.length).toBe(2);
    expect(users[0]!.name).toBe("Alice");
  });

  it("dbExec runs a one-off mutation", () => {
    const result = dbExec(
      ctx,
      dbPath,
      "INSERT INTO users (name, age) VALUES (?, ?)",
      ["Charlie", 35],
    );
    expect(result.changes).toBe(1);

    const count = dbQuery<{ c: number }>(
      ctx,
      dbPath,
      "SELECT COUNT(*) as c FROM users",
    );
    expect(count[0]!.c).toBe(3);
  });
});

describe("db capability checks", () => {
  it("denies access without db:query capability", () => {
    const restricted = createContext({
      name: "no-db",
      capabilities: capabilities()
        .fsRead("**")
        .fsWrite("**")
        .build()
        .capabilities.slice(),
    });
    expect(() => dbOpen(restricted, dbPath)).toThrow(CapabilityError);
  });

  it("denies access to wrong path pattern", () => {
    const restricted = createContext({
      name: "wrong-path",
      capabilities: capabilities()
        .fsRead("**")
        .fsWrite("**")
        .dbQuery("/other/**")
        .build()
        .capabilities.slice(),
    });
    expect(() => dbOpen(restricted, dbPath)).toThrow(CapabilityError);
  });
});
