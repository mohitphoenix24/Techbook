import { describe, expect, it } from "vitest";
import { parseEventBlock, parseSSE } from "./sse";

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      chunks.forEach((c) => controller.enqueue(encoder.encode(c)));
      controller.close();
    },
  });
}

async function collect(body: ReadableStream<Uint8Array>) {
  const out = [];
  for await (const m of parseSSE(body)) out.push(m);
  return out;
}

describe("parseEventBlock", () => {
  it("reads event and data", () => {
    expect(parseEventBlock('event: delta\ndata: {"text":"Hi"}')).toEqual({ event: "delta", data: '{"text":"Hi"}' });
  });
  it("defaults the event name to message", () => {
    expect(parseEventBlock("data: hello")).toEqual({ event: "message", data: "hello" });
  });
  it("joins multi-line data and ignores comments", () => {
    expect(parseEventBlock(": ping\nevent: x\ndata: a\ndata: b")).toEqual({ event: "x", data: "a\nb" });
  });
  it("returns null when there is no data", () => {
    expect(parseEventBlock(": just a comment")).toBeNull();
  });
});

describe("parseSSE", () => {
  it("handles several events in one chunk", async () => {
    const msgs = await collect(streamOf("event: a\ndata: 1\n\nevent: b\ndata: 2\n\n"));
    expect(msgs.map((m) => m.event)).toEqual(["a", "b"]);
  });
  it("handles an event split across chunks", async () => {
    const msgs = await collect(streamOf("event: de", "lta\nda", "ta: 42\n", "\nevent: done\ndata: {}\n\n"));
    expect(msgs).toEqual([{ event: "delta", data: "42" }, { event: "done", data: "{}" }]);
  });
  it("keeps multi-byte characters that are split between chunks", async () => {
    const bytes = new TextEncoder().encode("event: d\ndata: नमस्ते 👋\n\n");
    const body = new ReadableStream<Uint8Array>({
      start(c) { c.enqueue(bytes.slice(0, 15)); c.enqueue(bytes.slice(15)); c.close(); },
    });
    expect((await collect(body))[0].data).toBe("नमस्ते 👋");
  });
  it("emits a trailing event even without the final blank line", async () => {
    expect(await collect(streamOf("event: done\ndata: {}"))).toEqual([{ event: "done", data: "{}" }]);
  });
  it("understands CRLF line endings", async () => {
    expect((await collect(streamOf("event: a\r\ndata: 1\r\n\r\n")))[0]).toEqual({ event: "a", data: "1" });
  });
});
