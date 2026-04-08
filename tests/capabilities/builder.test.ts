import { describe, it, expect } from "bun:test";
import { capabilities } from "../../src/capabilities/index";

// ---------------------------------------------------------------------------
// Builder API
// ---------------------------------------------------------------------------

describe("capabilities() builder", () => {
  it("builds an empty set", () => {
    const set = capabilities().build();
    expect(set.capabilities.length).toBe(0);
  });

  it("chains fsRead", () => {
    const set = capabilities().fsRead("/tmp/**").build();
    expect(set.has("fs:read")).toBe(true);
    expect(set.capabilities.length).toBe(1);
  });

  it("chains fsWrite", () => {
    const set = capabilities().fsWrite("/tmp/**").build();
    expect(set.has("fs:write")).toBe(true);
  });

  it("chains fsDelete", () => {
    const set = capabilities().fsDelete("/tmp/**").build();
    expect(set.has("fs:delete")).toBe(true);
  });

  it("chains spawn", () => {
    const set = capabilities().spawn(["git", "bun"]).build();
    expect(set.has("process:spawn")).toBe(true);
  });

  it("chains netFetch without ports", () => {
    const set = capabilities().netFetch(["api.github.com"]).build();
    expect(set.has("net:fetch")).toBe(true);
  });

  it("chains netFetch with ports", () => {
    const set = capabilities().netFetch(["api.github.com"], [443]).build();
    expect(set.has("net:fetch")).toBe(true);
    const cap = set.getAll("net:fetch")[0] as {
      allowedPorts?: readonly number[];
    };
    expect(cap.allowedPorts).toEqual([443]);
  });

  it("chains netListen", () => {
    const set = capabilities().netListen(3000).build();
    expect(set.has("net:listen")).toBe(true);
  });

  it("chains envRead", () => {
    const set = capabilities().envRead(["PATH", "HOME"]).build();
    expect(set.has("env:read")).toBe(true);
  });

  it("chains envWrite", () => {
    const set = capabilities().envWrite(["NODE_ENV"]).build();
    expect(set.has("env:write")).toBe(true);
  });

  it("chains multiple capabilities fluently", () => {
    const set = capabilities()
      .fsRead("/tmp/**")
      .fsWrite("/tmp/**")
      .spawn(["git"])
      .netFetch(["api.github.com"])
      .envRead(["PATH"])
      .build();

    expect(set.capabilities.length).toBe(5);
    expect(set.has("fs:read")).toBe(true);
    expect(set.has("fs:write")).toBe(true);
    expect(set.has("process:spawn")).toBe(true);
    expect(set.has("net:fetch")).toBe(true);
    expect(set.has("env:read")).toBe(true);
  });

  it("add() inserts a raw capability", () => {
    const set = capabilities()
      .add({ kind: "fs:read", pattern: "/custom/**" })
      .build();
    expect(set.has("fs:read")).toBe(true);
  });

  it("toArray() returns capabilities without creating a set", () => {
    const arr = capabilities().fsRead("/tmp/**").spawn(["git"]).toArray();
    expect(arr.length).toBe(2);
    expect(arr[0]!.kind).toBe("fs:read");
    expect(arr[1]!.kind).toBe("process:spawn");
  });

  it("multiple calls accumulate capabilities", () => {
    const set = capabilities()
      .fsRead("/a/**")
      .fsRead("/b/**")
      .fsRead("/c/**")
      .build();
    expect(set.getAll("fs:read").length).toBe(3);
  });

  it("built set actually enforces capabilities", () => {
    const set = capabilities().fsRead("/tmp/**").build();

    expect(set.check({ kind: "fs:read", pattern: "/tmp/ok" }).allowed).toBe(
      true,
    );
    expect(set.check({ kind: "fs:read", pattern: "/etc/nope" }).allowed).toBe(
      false,
    );
  });
});
