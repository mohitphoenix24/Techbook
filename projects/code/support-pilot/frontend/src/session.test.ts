import { afterEach, describe, expect, it, vi } from "vitest";
import { getToken, setToken } from "./session";

describe("session", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the token in sessionStorage and removes it on sign-out", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("sessionStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
    setToken("abc");
    expect(getToken()).toBe("abc");
    setToken(null);
    expect(getToken()).toBeNull();
  });

  it("does not crash when storage is blocked: you simply sign in again", () => {
    vi.stubGlobal("sessionStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } });
    expect(getToken()).toBeNull();
    expect(() => setToken("abc")).not.toThrow();
  });
});
