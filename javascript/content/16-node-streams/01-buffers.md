---
title: Buffers: working with binary data
level: intermediate
time: 30
summary: What a Buffer is (a fixed-size block of bytes, a Uint8Array), creating and converting buffers (utf8, hex, base64), reading and writing numbers, slicing without copying, concat, the multi-byte character trap, and the alloc vs allocUnsafe security point.
---

## Why do we need Buffers?

JavaScript strings are text. But files, network packets, images, audio and encrypted data are **bytes**. Node's **`Buffer`** is a **fixed-size chunk of memory** that holds raw bytes. It is a subclass of **`Uint8Array`**, with extra helpers for encodings and number reading.

```js run node title="Creating buffers"
const a = Buffer.from("héllo");                         // string -> bytes (UTF-8 by default)
const b = Buffer.from([72, 101, 108, 108, 111]);        // from an array of bytes
const c = Buffer.alloc(5);                              // 5 zero bytes
const d = Buffer.from("48656c6c6f", "hex");             // from hex text
const e = Buffer.from("SGVsbG8=", "base64");            // from base64 text

console.log(a, a.length, "string length:", "héllo".length);      // é takes TWO bytes in UTF-8
console.log(b.toString(), c, d.toString(), e.toString());
console.log(a instanceof Uint8Array, Buffer.isBuffer(a), Buffer.byteLength("héllo"), Buffer.byteLength("😀"));
```

Notice: a **string's length** counts characters (UTF-16 units); a **buffer's length** counts **bytes**. They differ for non-ASCII text.

## Converting between strings and bytes

```js run node title="Encodings"
const buf = Buffer.from("Hello, नमस्ते 😀");

console.log(buf.length, buf.toString("utf8"));
console.log(buf.toString("hex").slice(0, 24) + "...");
console.log(buf.toString("base64"));
console.log(Buffer.from("Hello").toString("base64url"), Buffer.from("Hello").toString("latin1"));

// base64 round trip, e.g. for embedding small files in JSON or data URLs
const encoded = Buffer.from("secret data").toString("base64");
console.log(encoded, Buffer.from(encoded, "base64").toString());
```

Supported encodings: `utf8` (default), `utf16le`, `latin1`/`binary`, `ascii`, `hex`, `base64`, `base64url`.

## Reading and writing bytes and numbers

```js run node title="Indexing, reading and writing numbers"
const buf = Buffer.alloc(8);

buf[0] = 255;                          // index access: a byte (0 to 255)
buf[1] = 256 + 7;                      // wraps around: stored as 7
buf.writeUInt16BE(0x1234, 2);          // big-endian 16-bit unsigned at offset 2
buf.writeInt16LE(-2, 4);               // little-endian signed
buf.writeUInt16LE(0xabcd, 6);

console.log(buf, buf[0], buf[1]);
console.log(buf.readUInt16BE(2).toString(16), buf.readInt16LE(4), buf.readUInt16LE(6).toString(16));

const header = Buffer.alloc(8);        // a tiny binary protocol: [type:1][flags:1][length:2][id:4]
header.writeUInt8(2, 0); header.writeUInt8(0b101, 1); header.writeUInt16BE(300, 2); header.writeUInt32BE(123456, 4);
console.log(header, { type: header[0], flags: header[1].toString(2), length: header.readUInt16BE(2), id: header.readUInt32BE(4) });
```

**Endianness:** **big-endian (BE)** stores the most significant byte first (network order); **little-endian (LE)** the least significant first (most CPUs). Always use the one your protocol says.

## Slicing: `subarray` shares memory, `slice` of a copy does not

```js run node title="subarray is a VIEW, Buffer.from(buf) is a COPY"
const original = Buffer.from("abcdef");

const view = original.subarray(1, 4);            // no copy: shares the same memory
view[0] = 88;                                     // 'X'
console.log(original.toString(), view.toString());

const copy = Buffer.from(original);               // a real copy
copy[0] = 90;                                     // 'Z'
console.log(original.toString(), copy.toString());

const arrayCopy = Uint8Array.prototype.slice.call(original, 0, 3);   // slice on a plain Uint8Array copies
console.log(arrayCopy);
```

`buf.slice()` on a Buffer is **deprecated** because, unlike `Array.prototype.slice`, it returned a view. Use `subarray` for a view and `Buffer.from(buf.subarray(...))` for a copy.

## Joining and comparing

```js run node title="concat, compare, equals, indexOf"
const parts = [Buffer.from("Hel"), Buffer.from("lo, "), Buffer.from("world")];
const joined = Buffer.concat(parts);                       // one allocation: do this instead of += in a loop
console.log(joined.toString(), joined.length);

console.log(Buffer.compare(Buffer.from("a"), Buffer.from("b")), joined.equals(Buffer.from("Hello, world")));
console.log(joined.indexOf("world"), joined.includes("lo"), joined.toString("utf8", 0, 5));
console.log([...Buffer.from("AB")], Array.from(Buffer.from("AB").entries()));
console.log(JSON.stringify(Buffer.from("hi")), Buffer.from(JSON.parse(JSON.stringify(Buffer.from("hi")))).toString());
```

## The multi-byte character trap in chunks

When you read a file or socket in **chunks**, a multi-byte character can be **split across two chunks**. Decoding each chunk separately **corrupts** it.

```js run node title="Splitting a character across chunks"
const { StringDecoder } = require("node:string_decoder");

const bytes = Buffer.from("नमस्ते");                      // each Devanagari letter uses 3 bytes in UTF-8
const chunk1 = bytes.subarray(0, 4);                      // cuts the second letter in half
const chunk2 = bytes.subarray(4);

console.log("naive   :", chunk1.toString() + chunk2.toString());      // broken characters (U+FFFD)
const decoder = new StringDecoder("utf8");
console.log("decoder :", decoder.write(chunk1) + decoder.write(chunk2) + decoder.end());    // correct

console.log("best    :", Buffer.concat([chunk1, chunk2]).toString());       // concat first, then decode
```

Rule: **collect the buffers** and decode **once**, or use `StringDecoder`, or call `stream.setEncoding("utf8")` (which uses a decoder).

## Memory, pooling and security: `alloc` vs `allocUnsafe`

| Call | Memory is... | Use |
|---|---|---|
| `Buffer.alloc(n)` | **zero-filled** (safe, slightly slower) | default choice |
| `Buffer.allocUnsafe(n)` | **not cleared**: may contain **old data from other parts of the process** (secrets!) | only if you fill all of it immediately, for speed |
| `Buffer.from(...)` | copy of the input | |
| `new Buffer(...)` | **deprecated and unsafe**: do not use | |

Small allocations come from a shared **8 KB pool** (`Buffer.poolSize`). That is why a tiny `Buffer.from("a").buffer.byteLength` can be 8192.

```js run node title="allocUnsafe can leak old memory (never send it as is)" nondet
const safe = Buffer.alloc(16);
const fast = Buffer.allocUnsafe(16);
console.log("alloc is all zeros:", safe.every((b) => b === 0));
console.log("allocUnsafe may not be zeros (undefined content):", typeof fast.readUInt8(0));
console.log(Buffer.poolSize, Buffer.from("a").buffer.byteLength >= 8192 || "not pooled");
```

## Buffer and TypedArray / ArrayBuffer / web APIs

```js run node title="Interop with typed arrays and TextEncoder"
const buf = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);

const view = new Uint32Array(buf.buffer, buf.byteOffset, 2);            // reinterpret the SAME memory as two 32-bit ints
console.log(view.length, view[0].toString(16));

const bytes = new TextEncoder().encode("héllo");                          // standard (works in browsers too): a Uint8Array
console.log(bytes, new TextDecoder().decode(bytes), Buffer.from(bytes).equals(Buffer.from("héllo")));
console.log(btoa("hello"), atob("aGVsbG8="));                             // browser-compatible base64 for simple strings
```

In the browser there is no `Buffer`: use `Uint8Array`, `TextEncoder/TextDecoder` and `DataView`. `Buffer` is Node-only (bundlers can polyfill it).

:::interview What is a Buffer in Node.js? Why is it needed, and what are the pitfalls?
"A Buffer is a fixed-size block of raw bytes outside the normal JS heap, a Uint8Array subclass with helpers for encodings (utf8, hex, base64) and for reading and writing binary numbers with a chosen endianness. It is needed because files, sockets, images and crypto deal in bytes, not strings. Pitfalls: string length is not byte length for non-ASCII text; decoding chunks one by one can split multi-byte characters, so concat first or use StringDecoder; `subarray` shares memory while `Buffer.from(buf)` copies; `Buffer.allocUnsafe` can expose old memory, so I use `Buffer.alloc` unless I overwrite everything; and the old `new Buffer()` is deprecated."
:::

## More interview questions on this topic

:::qa What is the difference between `Buffer.alloc` and `Buffer.allocUnsafe`? {level=medium}
**Say this:** "`alloc` zero-fills the memory. `allocUnsafe` skips the clearing, so it is faster but may expose leftover data from earlier memory use, so it must be completely overwritten before use."

**In simple words:** A clean sheet vs a reused sheet with old writing on it.
:::

:::qa Why can `buffer.toString()` on a chunk produce garbage characters? {level=hard}
**Say this:** "A multi-byte UTF-8 character may be split between two chunks; decoding the first chunk alone gives replacement characters. Concatenate before decoding or use `StringDecoder`."

**In simple words:** A letter was cut in half at the chunk edge.
:::

:::qa How do you convert a string to base64 and back? {level=easy}
**Say this:** "`Buffer.from(str).toString('base64')` and `Buffer.from(b64, 'base64').toString()`."

**In simple words:** String → bytes → base64 text, and the reverse.
:::

:::qa What is the relationship between Buffer and Uint8Array? {level=medium}
**Say this:** "Buffer extends Uint8Array, so it works with typed-array APIs, and adds Node-specific methods like `toString(encoding)`, `readUInt32BE`, and `concat`."

**In simple words:** A Buffer is a Uint8Array with extra powers.
:::

```quiz
? What is `Buffer.byteLength("é")` in UTF-8?
- 1
+ 2
- 4
> é is two bytes.
? Which method shares memory with the original buffer?
+ subarray
- Buffer.from(buf)
- Buffer.concat
> subarray returns a view.
? Why avoid `Buffer.allocUnsafe` for data sent to clients?
- It is slower
+ It may contain old data from other parts of memory
- It does not support UTF-8
> Always overwrite it fully or use alloc.
```

:::keypoints
- **Buffer** = fixed-size bytes (a `Uint8Array` subclass). Create with `from`, `alloc`; convert with `toString(encoding)`; encodings utf8, hex, base64, base64url.
- Read/write numbers with `readUInt16BE` etc.; mind **endianness**.
- `subarray` **shares**; `Buffer.from(buf)` **copies**; `Buffer.concat` to join.
- Decode chunked text with `StringDecoder` or concat first. Use **`alloc`**, not `allocUnsafe`/`new Buffer`.
- Browsers: `Uint8Array`, `TextEncoder`, `DataView`.
:::
