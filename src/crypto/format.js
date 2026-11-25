import { argon2id } from "hash-wasm";

export const MAGIC = "AGV1";
export const VERSION = 1;
export const LOG2_CHUNK = 20;
export const CHUNK_SIZE = 1 << LOG2_CHUNK;
export const HEADER_SIZE = 32;
const TAG_SIZE = 16;
const encoder = new TextEncoder();

function webCrypto() {
  if (!globalThis.crypto?.subtle) throw new Error("Web Crypto API is unavailable");
  return globalThis.crypto;
}

function concatBytes(...parts) {
  const size = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

function asBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw new TypeError("Expected an ArrayBuffer or Uint8Array");
}

export function bytesToB64(bytes) {
  const u8 = asBytes(bytes);
  if (typeof btoa === "function") {
    let binary = "";
    for (let i = 0; i < u8.length; i += 0x8000) {
      binary += String.fromCharCode(...u8.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  }
  if (typeof Buffer !== "undefined") return Buffer.from(u8).toString("base64");
  throw new Error("No base64 encoder is available");
}

export function b64ToBytes(value) {
  if (typeof value !== "string") throw new TypeError("Base64 value must be a string");
  if (typeof atob === "function") {
    const binary = atob(value);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(value, "base64"));
  throw new Error("No base64 decoder is available");
}

export function u64be(value) {
  const out = new Uint8Array(8);
  const view = new DataView(out.buffer);
  view.setBigUint64(0, BigInt(value), false);
  return out;
}

export function readU64be(bytes, offset = 0) {
  const u8 = asBytes(bytes);
  if (offset < 0 || offset + 8 > u8.byteLength) throw new RangeError("u64be read is out of bounds");
  return new DataView(u8.buffer, u8.byteOffset + offset, 8).getBigUint64(0, false);
}

export function parseHeader(input) {
  const bytes = asBytes(input);
  if (bytes.byteLength < HEADER_SIZE) throw new Error("Truncated AGV1 object header");
  if (bytes[0] !== 0x41 || bytes[1] !== 0x47 || bytes[2] !== 0x56 || bytes[3] !== 0x31) {
    throw new Error("Invalid AGV1 object magic");
  }
  return {
    version: bytes[4],
    log2Chunk: bytes[5],
    objectId: bytes.slice(8, 24),
  };
}

export async function deriveKekArgon2(password, saltU8, kdf) {
  if (!kdf || kdf.alg !== "argon2id") throw new Error("Unsupported key derivation algorithm");
  const derived = await argon2id({
    password: String(password).normalize("NFC"),
    salt: asBytes(saltU8),
    parallelism: kdf.p,
    iterations: kdf.t,
    memorySize: kdf.m,
    hashLength: 32,
    outputType: "binary",
  });
  return asBytes(derived);
}

function slotAad(kdf, saltU8) {
  const orderedKdf = JSON.stringify({ alg: kdf.alg, m: kdf.m, t: kdf.t, p: kdf.p });
  return concatBytes(encoder.encode("agv1/slot"), encoder.encode(orderedKdf), asBytes(saltU8));
}

export async function unwrapMasterKey(kekRaw, slot, saltU8) {
  const key = await webCrypto().subtle.importKey("raw", asBytes(kekRaw), { name: "AES-GCM" }, false, ["decrypt"]);
  const raw = await webCrypto().subtle.decrypt(
    { name: "AES-GCM", iv: b64ToBytes(slot.nonce), additionalData: slotAad(slot.kdf, saltU8), tagLength: 128 },
    key,
    b64ToBytes(slot.wrapped),
  );
  return new Uint8Array(raw);
}

export async function importMasterKey(rawMk) {
  return webCrypto().subtle.importKey("raw", asBytes(rawMk), "HKDF", false, ["deriveKey"]);
}

export async function deriveObjectKey(masterKey, objectIdU8) {
  const info = concatBytes(encoder.encode("agv1/obj/"), asBytes(objectIdU8));
  return webCrypto().subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info },
    masterKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function decryptObject(masterKey, input) {
  const data = asBytes(input);
  const { version, log2Chunk, objectId } = parseHeader(data);
  if (version !== VERSION || log2Chunk !== LOG2_CHUNK) throw new Error("Unsupported AGV1 object version or chunk size");
  const key = await deriveObjectKey(masterKey, objectId);
  const plaintext = [];
  let offset = HEADER_SIZE;
  let chunkIndex = 0n;
  while (offset < data.byteLength) {
    const remaining = data.byteLength - offset;
    const encryptedSize = Math.min(CHUNK_SIZE + TAG_SIZE, remaining);
    if (encryptedSize < TAG_SIZE || (remaining > CHUNK_SIZE + TAG_SIZE && encryptedSize !== CHUNK_SIZE + TAG_SIZE)) {
      throw new Error("Malformed AGV1 encrypted chunk");
    }
    const final = offset + encryptedSize === data.byteLength;
    const nonce = new Uint8Array(12);
    nonce.set(u64be(chunkIndex), 4);
    const aad = concatBytes(data.subarray(0, HEADER_SIZE), u64be(chunkIndex), Uint8Array.of(final ? 1 : 0));
    const clear = await webCrypto().subtle.decrypt(
      { name: "AES-GCM", iv: nonce, additionalData: aad, tagLength: 128 },
      key,
      data.subarray(offset, offset + encryptedSize),
    );
    plaintext.push(new Uint8Array(clear));
    offset += encryptedSize;
    chunkIndex += 1n;
  }
  if (chunkIndex === 0n) throw new Error("AGV1 object contains no authenticated chunks");
  return concatBytes(...plaintext);
}

export async function gunzip(input) {
  const bytes = asBytes(input);
  if (typeof DecompressionStream === "function") {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  throw new Error("No gzip decompressor is available");
}

export async function decryptManifest(masterKey, data) {
  const clear = await decryptObject(masterKey, data);
  let end = clear.byteLength;
  while (end > 0 && clear[end - 1] === 0) end -= 1;
  return JSON.parse(new TextDecoder().decode(clear.subarray(0, end)));
}
