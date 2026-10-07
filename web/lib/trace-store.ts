import "server-only";
import { deflateSync, inflateSync } from "node:zlib";
import { decodeChannel, type EncodedChannel } from "./trace";

// How lap traces are stored in the database: each channel's integers as wrapping differences
// between consecutive samples, deflated, then base64 (`enc: "dz"`), about 3.5× smaller than the
// bundle's plain base64 (Brands Hatch lap: 82 KB → 23 KB). Bundles from the app keep the plain
// format (lib/trace.ts); packing happens at import, and the browser always receives plain channels.

type Stored = EncodedChannel & { enc?: "dz" };
const ARRAYS = { int8: Int8Array, int16: Int16Array, int32: Int32Array };

const ints = (bytes: Uint8Array, dtype: EncodedChannel["dtype"]) => {
  const copy = new Uint8Array(bytes);   // aligned copy for the typed array (little-endian, like the bundle)
  return new ARRAYS[dtype](copy.buffer);
};

/** Plain bundle channel → stored channel. */
export function packChannel(ch: EncodedChannel): Stored {
  const a = ints(Buffer.from(ch.data, "base64"), ch.dtype);
  const d = new ARRAYS[ch.dtype](a.length);
  for (let i = 0; i < a.length; i++) d[i] = a[i] - (i ? a[i - 1] : 0);   // wraps to the type's width
  return { dtype: ch.dtype, scale: ch.scale, enc: "dz", data: deflateSync(Buffer.from(d.buffer), { level: 9 }).toString("base64") };
}

/** Stored channel (packed or not) → plain bundle channel. */
export function unpackChannel(ch: Stored): EncodedChannel {
  if (ch.enc !== "dz") return ch;
  const d = ints(inflateSync(Buffer.from(ch.data, "base64")), ch.dtype);
  const a = new ARRAYS[ch.dtype](d.length);
  for (let i = 0; i < d.length; i++) a[i] = (i ? a[i - 1] : 0) + d[i];   // wrapping sum undoes the wrapping difference
  return { dtype: ch.dtype, scale: ch.scale, data: Buffer.from(a.buffer).toString("base64") };
}

export const packChannels = (chs: Record<string, EncodedChannel>) =>
  Object.fromEntries(Object.entries(chs).map(([k, v]) => [k, (v as Stored).enc === "dz" ? v : packChannel(v)]));
export const unpackChannels = (chs: Record<string, Stored>) =>
  Object.fromEntries(Object.entries(chs).map(([k, v]) => [k, unpackChannel(v)]));

/** Values of a stored channel (server side). */
export const decodeStored = (ch: Stored) => decodeChannel(unpackChannel(ch));

/** Values → plain bundle channel (int32 × scale), the way bundle.py writes them. */
export function encodeChannel(values: ArrayLike<number>, scale: number): EncodedChannel {
  const a = new Int32Array(values.length);
  for (let i = 0; i < values.length; i++) a[i] = Math.round(values[i] / scale);
  return { dtype: "int32", scale, data: Buffer.from(a.buffer).toString("base64") };
}
