import { describe, it, expect } from "bun:test";
import {
  sleep,
  interval,
  timeout,
  debounce,
  throttle,
  retry,
} from "../../src/wrappers/schedule";

describe("sleep", () => {
  it("resolves after delay", async () => {
    const start = Date.now();
    await sleep(50);
    expect(Date.now() - start).toBeGreaterThanOrEqual(40);
  });
});

describe("interval", () => {
  it("runs function repeatedly", async () => {
    let count = 0;
    const handle = interval(30, () => {
      count++;
    });
    await sleep(100);
    handle.stop();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it("stops when stop() is called", async () => {
    let count = 0;
    const handle = interval(10, () => {
      count++;
    });
    await sleep(50);
    handle.stop();
    const countAtStop = count;
    await sleep(50);
    expect(count).toBe(countAtStop);
  });
});

describe("timeout", () => {
  it("runs function after delay", async () => {
    let fired = false;
    timeout(30, () => {
      fired = true;
    });
    expect(fired).toBe(false);
    await sleep(60);
    expect(fired).toBe(true);
  });

  it("can be cancelled", async () => {
    let fired = false;
    const handle = timeout(30, () => {
      fired = true;
    });
    handle.cancel();
    await sleep(60);
    expect(fired).toBe(false);
  });
});

describe("debounce", () => {
  it("only fires once after rapid calls", async () => {
    let count = 0;
    const fn = debounce(50, () => {
      count++;
    });
    fn();
    fn();
    fn();
    fn();
    fn();
    await sleep(100);
    expect(count).toBe(1);
  });
});

describe("throttle", () => {
  it("fires at most once per interval", async () => {
    let count = 0;
    const fn = throttle(50, () => {
      count++;
    });
    fn();
    fn();
    fn();
    fn();
    fn();
    expect(count).toBe(1);
    await sleep(60);
    fn();
    expect(count).toBe(2);
  });
});

describe("retry", () => {
  it("returns on first success", async () => {
    let attempts = 0;
    const result = await retry(3, 10, async () => {
      attempts++;
      return "ok";
    });
    expect(result).toBe("ok");
    expect(attempts).toBe(1);
  });

  it("retries on failure", async () => {
    let attempts = 0;
    const result = await retry(3, 10, async () => {
      attempts++;
      if (attempts < 3) throw new Error("fail");
      return "ok";
    });
    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("throws after max attempts", async () => {
    await expect(
      retry(2, 10, async () => {
        throw new Error("always fails");
      }),
    ).rejects.toThrow("always fails");
  });
});
