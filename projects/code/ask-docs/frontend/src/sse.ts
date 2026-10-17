// Server-Sent Events over fetch.
//
// The browser's built-in EventSource only supports GET requests, but a chat needs to POST the
// user's message. So we read the response body ourselves and split it into events.

export interface SSEMessage {
  event: string;
  data: string;
}

// region: parse-block
/** One event block ("event: x\ndata: y") → { event, data }. Returns null for comments and empty blocks. */
export function parseEventBlock(block: string): SSEMessage | null {
  let event = "message";
  const data: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (line === "" || line.startsWith(":")) continue;          // blank line or comment (":" keep-alive pings)
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
    if (field === "event") event = value;
    else if (field === "data") data.push(value);                 // several data lines are joined with \n
  }
  return data.length ? { event, data: data.join("\n") } : null;
}
// endregion: parse-block

// region: parse-stream
/**
 * Turn a streaming response body into SSE messages.
 * Network chunks do not respect event boundaries: one chunk may hold half an event or three events.
 * So we buffer text and cut it at every blank line.
 */
export async function* parseSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<SSEMessage> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });        // stream: true keeps split UTF-8 characters intact
      let boundary: RegExpMatchArray | null;
      while ((boundary = buffer.match(/\r?\n\r?\n/))) {
        const block = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index! + boundary[0].length);
        const message = parseEventBlock(block);
        if (message) yield message;
      }
    }
    const rest = parseEventBlock(buffer);                        // a final event without the closing blank line
    if (rest) yield rest;
  } finally {
    reader.releaseLock();
  }
}
// endregion: parse-stream
