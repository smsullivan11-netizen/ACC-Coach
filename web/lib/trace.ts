// Lap traces as stored by the upload (bundle.py): one value per metre of the lap; each channel is
// a base64 array of little-endian integers, real value = integer × scale. Safe in the browser.

export type EncodedChannel = { dtype: "int8" | "int16" | "int32"; scale: number; data: string };
export type EncodedTrace = { step_m: number; length: number; channels: Record<string, EncodedChannel> };

const ARRAYS = { int8: Int8Array, int16: Int16Array, int32: Int32Array };

export function decodeChannel(ch: EncodedChannel): Float64Array {
  const bin = atob(ch.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const ints = new ARRAYS[ch.dtype](bytes.buffer); // little-endian, like every PC and phone
  const out = new Float64Array(ints.length);
  for (let i = 0; i < ints.length; i++) out[i] = ints[i] * ch.scale;
  return out;
}

export type Trace = { dist: Float64Array; channels: Record<string, Float64Array> };

export function decodeTrace(t: EncodedTrace): Trace {
  const channels: Record<string, Float64Array> = {};
  for (const [name, ch] of Object.entries(t.channels)) channels[name] = decodeChannel(ch);
  const dist = new Float64Array(t.length);
  for (let i = 0; i < t.length; i++) dist[i] = i * t.step_m;
  return { dist, channels };
}
