#!/usr/bin/env node
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { execFile as execFileCallback } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import {
  CHUNK_SIZE,
  HEADER_SIZE,
  LOG2_CHUNK,
  MAGIC,
  VERSION,
  b64ToBytes,
  bytesToB64,
  decryptManifest,
  deriveKekArgon2,
  decryptObject,
  importMasterKey,
  parseHeader,
  u64be,
  unwrapMasterKey,
} from "../src/crypto/format.js";

const execFile = promisify(execFileCallback);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const DEFAULT_KDF = Object.freeze({ alg: "argon2id", m: 65536, t: 3, p: 1 });
const MEDIA_EXT = /\.(jpe?g|png|webp|gif|heic|heif|mp4|mov|m4v)$/i;
const VIDEO_EXT = /\.(mp4|mov|m4v)$/i;
const encoder = new TextEncoder();

export function parseVaultArgs(argv) {
  const options = { src: path.join(root, "photos"), out: path.join(root, "public", "vault"), noReencode: false, limit: null, test: false, passwordEnv: null, fromTty: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--src" || arg === "--out" || arg === "--limit" || arg === "--password-env") {
      const value = argv[++i];
      if (!value) throw new Error(`Missing value for ${arg}`);
      if (arg === "--src") options.src = path.resolve(value);
      if (arg === "--out") options.out = path.resolve(value);
      if (arg === "--limit") {
        options.limit = Number(value);
        if (!Number.isInteger(options.limit) || options.limit < 1) throw new Error("--limit must be a positive integer");
      }
      if (arg === "--password-env") options.passwordEnv = value;
    } else if (arg === "--no-reencode") options.noReencode = true;
    else if (arg === "--from-tty") options.fromTty = true;
    else if (arg === "--test") options.test = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function promptFromTty(label) {
  const fd = fsSync.openSync("/dev/tty", "r+");
  let echoDisabled = false;
  let savedTerminalMode = null;
  const restoreEcho = () => {
    if (!echoDisabled) return;
    try {
      if (savedTerminalMode) execFileSync("stty", [savedTerminalMode], { stdio: [fd, fd, fd] });
      else execFileSync("stty", ["echo"], { stdio: [fd, fd, fd] });
    } catch { /* best-effort terminal restoration */ }
    echoDisabled = false;
  };
  const signalHandlers = new Map();
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    const handler = () => {
      restoreEcho();
      try { fsSync.closeSync(fd); } catch { /* already closed */ }
      process.exit(128 + ({ SIGINT: 2, SIGTERM: 15, SIGHUP: 1 })[signal]);
    };
    signalHandlers.set(signal, handler);
    process.once(signal, handler);
  }
  const onExit = () => restoreEcho();
  process.once("exit", onExit);
  try {
    fsSync.writeSync(fd, label);
    savedTerminalMode = execFileSync("stty", ["-g"], { encoding: "utf8", stdio: [fd, "pipe", fd] }).trim();
    echoDisabled = true;
    execFileSync("stty", ["-echo"], { stdio: [fd, fd, fd] });
    const chunks = [];
    const byte = Buffer.alloc(1);
    while (true) {
      const count = fsSync.readSync(fd, byte, 0, 1, null);
      if (!count || byte[0] === 10 || byte[0] === 13) break;
      if (byte[0] === 3) throw new Error("Password entry cancelled");
      chunks.push(byte[0]);
    }
    restoreEcho();
    fsSync.writeSync(fd, "\n");
    return new TextDecoder().decode(Uint8Array.from(chunks));
  } finally {
    restoreEcho();
    process.removeListener("exit", onExit);
    for (const [signal, handler] of signalHandlers) process.removeListener(signal, handler);
    try { fsSync.closeSync(fd); } catch { /* already closed */ }
  }
}

async function promptHidden(label) {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) throw new Error("A TTY is required to enter a password interactively; use --password-env only for --test/--limit verification runs");
  process.stdout.write(label);
  return new Promise((resolve, reject) => {
    let value = "";
    const stdin = process.stdin;
    const decoder = new StringDecoder("utf8");
    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      process.stdout.write("\n");
    };
    const onData = (buffer) => {
      for (const char of decoder.write(buffer)) {
        if (char === "\u0003") {
          cleanup();
          reject(new Error("Password entry cancelled"));
          return;
        }
        if (char === "\r" || char === "\n") {
          cleanup();
          resolve(value);
          return;
        }
        if (char === "\b" || char === "\u007f") value = Array.from(value).slice(0, -1).join("");
        else if (char >= " ") value += char;
      }
    };
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

async function obtainPassword(options, confirm = false) {
  if (options.passwordEnv && (options.test || options.limit !== null)) {
    const password = process.env[options.passwordEnv];
    if (!password) throw new Error(`Password environment variable ${options.passwordEnv} is not set`);
    return password;
  }
  if (options.passwordEnv) throw new Error("--password-env is allowed only with --test or --limit");
  if (options.fromTty) {
    const first = promptFromTty("Vault password: ");
    if (!first) throw new Error("Password cannot be empty");
    if (confirm && first !== promptFromTty("Confirm password: ")) throw new Error("Passwords do not match");
    return first;
  }
  const first = await promptHidden("Vault password: ");
  if (!first) throw new Error("Password cannot be empty");
  if (confirm) {
    const second = await promptHidden("Confirm password: ");
    if (first !== second) throw new Error("Passwords do not match");
  }
  return first;
}

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

function hex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function aadForSlot(kdf, salt) {
  return concat(encoder.encode("agv1/slot"), encoder.encode(JSON.stringify({ alg: kdf.alg, m: kdf.m, t: kdf.t, p: kdf.p })), salt);
}

function concat(...parts) {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

async function createSlot(password, masterKey) {
  const kdf = { ...DEFAULT_KDF };
  const salt = randomBytes(16);
  const nonce = randomBytes(12);
  const kekRaw = await deriveKekArgon2(password, salt, kdf);
  const kek = await crypto.subtle.importKey("raw", kekRaw, { name: "AES-GCM" }, false, ["encrypt"]);
  const wrapped = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: aadForSlot(kdf, salt), tagLength: 128 }, kek, masterKey);
  return { kdf, salt: bytesToB64(salt), nonce: bytesToB64(nonce), wrapped: bytesToB64(new Uint8Array(wrapped)) };
}

async function unlock(vault, password) {
  let lastError;
  for (const slot of vault.slots ?? []) {
    try {
      const salt = b64ToBytes(slot.salt);
      const kek = await deriveKekArgon2(password, salt, slot.kdf);
      const mk = await unwrapMasterKey(kek, slot, salt);
      if (mk.byteLength !== 32) throw new Error("Invalid master key length");
      return mk;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Could not unlock vault with that password${lastError ? ` (${lastError.message})` : ""}`);
}

export async function walkMedia(directory) {
  const result = [];
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    for (const entry of entries) {
      if (entry.name === ".DS_Store" || entry.name.startsWith(".")) continue;
      const filename = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(filename);
      else if (entry.isFile() && MEDIA_EXT.test(entry.name)) result.push(filename);
    }
  }
  await walk(directory);
  return result.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function folderLabel(sourcePath, sourceRoot) {
  const relativeDir = path.relative(sourceRoot, path.dirname(sourcePath));
  return relativeDir === "." ? "Unsorted" : path.basename(relativeDir);
}

function mimeFor(filename, noReencode) {
  if (!noReencode) return VIDEO_EXT.test(filename) ? "video/mp4" : "image/jpeg";
  const ext = path.extname(filename).toLowerCase();
  return ({
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif",
    ".heic": "image/heic", ".heif": "image/heif", ".mp4": "video/mp4", ".mov": "video/quicktime", ".m4v": "video/x-m4v",
  })[ext] ?? "application/octet-stream";
}

async function encodeImage(source, noReencode) {
  const image = sharp(source, { failOn: "error" }).rotate();
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) throw new Error(`Could not read image dimensions: ${source}`);
  const full = noReencode
    ? new Uint8Array(await fs.readFile(source))
    : new Uint8Array(await image.resize({ width: 2560, height: 2560, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer());
  const dimensions = noReencode ? metadata : await sharp(full).metadata();
  const thumbnail = new Uint8Array(await sharp(source).rotate().resize({ width: 400, height: 400, fit: "inside", withoutEnlargement: true }).webp({ quality: 72 }).toBuffer());
  const rotated = noReencode && metadata.orientation >= 5 && metadata.orientation <= 8;
  return { full, thumbnail, w: rotated ? dimensions.height : dimensions.width, h: rotated ? dimensions.width : dimensions.height };
}

async function encodeVideo(source, tempDir, noReencode) {
  const probe = await execFile("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", source], { maxBuffer: 1024 * 1024 });
  const streams = JSON.parse(probe.stdout).streams ?? [];
  if (!streams.length) throw new Error(`No video stream found: ${source}`);
  const metadata = streams[0];
  const scale = Math.min(1, 1920 / metadata.width);
  const outputWidth = Math.floor(metadata.width * scale / 2) * 2;
  const outputHeight = Math.floor(metadata.height * scale / 2) * 2;
  let full;
  let finalWidth = metadata.width;
  let finalHeight = metadata.height;
  if (noReencode) {
    full = new Uint8Array(await fs.readFile(source));
  } else {
    const output = path.join(tempDir, `${randomHex()}.mp4`);
    await execFile("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", source, "-vf", "scale='min(1920,iw)':-2", "-c:v", "libx264", "-crf", "23", "-preset", "medium", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", output], { maxBuffer: 4 * 1024 * 1024 });
    full = new Uint8Array(await fs.readFile(output));
    const finalProbe = await execFile("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", output], { maxBuffer: 1024 * 1024 });
    const outputStream = JSON.parse(finalProbe.stdout).streams?.[0];
    if (outputStream) {
      finalWidth = outputStream.width;
      finalHeight = outputStream.height;
    }
    await fs.unlink(output);
  }
  const posterPath = path.join(tempDir, `${randomHex()}.png`);
  await execFile("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-ss", "1", "-i", source, "-frames:v", "1", "-vf", "scale='min(400,iw)':-2", posterPath], { maxBuffer: 4 * 1024 * 1024 });
  try { await fs.access(posterPath); }
  catch {
    // Very short clips may end before the requested one-second poster timestamp.
    await execFile("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", source, "-frames:v", "1", "-vf", "scale='min(400,iw)':-2", posterPath], { maxBuffer: 4 * 1024 * 1024 });
  }
  let thumbnail = new Uint8Array(await sharp(posterPath).webp({ quality: 72 }).toBuffer());
  await fs.unlink(posterPath);
  if (thumbnail.byteLength > 65536) {
    thumbnail = new Uint8Array(await sharp(thumbnail).resize({ width: 400, height: 400, fit: "inside" }).webp({ quality: 55 }).toBuffer());
  }
  return { full, thumbnail, w: noReencode ? metadata.width : (finalWidth || outputWidth), h: noReencode ? metadata.height : (finalHeight || outputHeight) };
}

function randomHex() {
  return hex(randomBytes(16));
}

function padFull(plaintext) {
  const paddedLength = (Math.floor(plaintext.byteLength / 16) + 1) * 16;
  const padded = new Uint8Array(paddedLength);
  padded.set(plaintext);
  return padded;
}

function padThumbnail(plaintext) {
  if (plaintext.byteLength > 65536) throw new Error(`Thumbnail exceeds 65536 bytes (${plaintext.byteLength})`);
  const padded = new Uint8Array(65536);
  padded.set(plaintext);
  return padded;
}

async function encryptObject(masterKey, plaintext, occupiedIds = new Set()) {
  let objectId, id;
  do {
    objectId = randomBytes(16);
    id = hex(objectId);
  } while (occupiedIds.has(id));
  occupiedIds.add(id);
  const header = new Uint8Array(HEADER_SIZE);
  header.set(encoder.encode(MAGIC), 0);
  header[4] = VERSION;
  header[5] = LOG2_CHUNK;
  header.set(objectId, 8);
  const info = concat(encoder.encode("agv1/obj/"), objectId);
  const key = await crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info }, masterKey, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const encryptedChunks = [];
  const count = Math.max(1, Math.ceil(plaintext.byteLength / CHUNK_SIZE));
  for (let index = 0; index < count; index += 1) {
    const start = index * CHUNK_SIZE;
    const clear = plaintext.subarray(start, Math.min(start + CHUNK_SIZE, plaintext.byteLength));
    const nonce = new Uint8Array(12);
    nonce.set(u64be(BigInt(index)), 4);
    const aad = concat(header, u64be(BigInt(index)), Uint8Array.of(index === count - 1 ? 1 : 0));
    encryptedChunks.push(new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: aad, tagLength: 128 }, key, clear)));
  }
  return { id, bytes: concat(header, ...encryptedChunks) };
}

async function readExistingManifest(outDir, vault, masterKey) {
  try {
    const raw = await fs.readFile(path.join(outDir, "m.bin"));
    const oldManifest = await decryptManifest(await importMasterKey(masterKey), raw);
    return { oldManifest, oldBytes: new Uint8Array(raw) };
  } catch (error) {
    if (vault.manifestId) throw new Error(`Unable to read existing encrypted manifest: ${error.message}`);
    return { oldManifest: null, oldBytes: null };
  }
}

export async function runVault(options, sync = {}) {
  const sources = await walkMedia(options.src);
  const removedHashes = new Set(sync.removedHashes ?? []);
  if (!sources.length && !sync.incremental) throw new Error(`No supported media files found under ${options.src}`);
  const requestedLimit = options.limit ?? (options.test ? 3 : null);
  const selected = sync.selectedPaths
    ? sync.selectedPaths
    : (requestedLimit === null ? sources : sources.slice(0, requestedLimit));
  if (!selected.length && !removedHashes.size) {
    if (sync.verifyOnly) {
      try {
        const vault = JSON.parse(await fs.readFile(path.join(options.out, "vault.json"), "utf8"));
        const password = await obtainPassword(options, false);
        await unlock(vault, password);
      } catch (error) {
        if (error.code === "ENOENT") return { changed: false };
        throw error;
      }
    }
    return { changed: false };
  }
  const isSubset = requestedLimit !== null;
  await fs.mkdir(path.join(options.out, "o"), { recursive: true });

  const vaultPath = path.join(options.out, "vault.json");
  let vault = null;
  try { vault = JSON.parse(await fs.readFile(vaultPath, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
  const hadVault = Boolean(vault);
  const password = await obtainPassword(options, !vault);
  let rawMasterKey;
  if (vault) {
    try { rawMasterKey = await unlock(vault, password); }
    catch { throw new Error("Could not unlock existing vault: password is incorrect or vault metadata is corrupt"); }
  } else {
    rawMasterKey = randomBytes(32);
    vault = { v: 1, manifestId: randomHex(), slots: [] };
    vault.slots.push(await createSlot(password, rawMasterKey));
  }
  const masterKey = await importMasterKey(rawMasterKey);
  const { oldManifest, oldBytes } = hadVault
    ? await readExistingManifest(options.out, vault, rawMasterKey)
    : { oldManifest: null, oldBytes: null };
  const previousByHash = new Map();
  for (const group of oldManifest?.groups ?? []) {
    for (const item of group.items ?? []) previousByHash.set(item.sha256, item);
  }
  const occupiedIds = new Set();
  for (const item of previousByHash.values()) {
    for (const id of [item.full, item.thumb]) if (id) occupiedIds.add(id);
  }

  const groupsByLabel = new Map();
  const processedHashes = new Set();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agv-encrypt-"));
  const counters = { processed: 0, reused: 0, bytesBefore: 0, bytesAfter: 0 };
  try {
    for (const source of selected) {
      const original = new Uint8Array(await fs.readFile(source));
      const originalHash = sync.hashes?.get(source) ?? createHash("sha256").update(original).digest("hex");
      processedHashes.add(originalHash);
      counters.bytesBefore += original.byteLength;
      const label = folderLabel(source, options.src);
      let group = groupsByLabel.get(label);
      if (!group) groupsByLabel.set(label, group = { label, items: [] });
      const previous = previousByHash.get(originalHash);
      if (previous) {
        group.items.push({ ...previous });
        counters.reused += 1;
        counters.bytesAfter += previous.len ?? 0;
        continue;
      }
      const isVideo = VIDEO_EXT.test(source);
      // The self-test mode keeps full payloads byte-identical to their source so the
      // required source SHA-256 check can be exercised without a 1.2 GB run.
      const noReencode = options.noReencode || options.test;
      const encoded = isVideo ? await encodeVideo(source, tempDir, noReencode) : await encodeImage(source, noReencode);
      const fullPlain = padFull(encoded.full);
      const thumbLen = encoded.thumbnail.byteLength;
      const thumbPlain = padThumbnail(encoded.thumbnail);
      const full = await encryptObject(masterKey, fullPlain, occupiedIds);
      const thumb = await encryptObject(masterKey, thumbPlain, occupiedIds);
      await fs.writeFile(path.join(options.out, "o", `${full.id}.bin`), full.bytes);
      await fs.writeFile(path.join(options.out, "o", `${thumb.id}.bin`), thumb.bytes);
      group.items.push({
        full: full.id,
        thumb: thumb.id,
        kind: isVideo ? "video" : "photo",
        mime: mimeFor(source, noReencode),
        len: encoded.full.byteLength,
        thumbLen,
        w: encoded.w,
        h: encoded.h,
        sha256: originalHash,
      });
      counters.processed += 1;
      counters.bytesAfter += encoded.full.byteLength;
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }

  if (sync.incremental) {
    for (const oldGroup of oldManifest?.groups ?? []) {
      for (const item of oldGroup.items ?? []) {
        if (removedHashes.has(item.sha256) || processedHashes.has(item.sha256)) continue;
        let group = groupsByLabel.get(oldGroup.label);
        if (!group) groupsByLabel.set(oldGroup.label, group = { label: oldGroup.label, items: [] });
        group.items.push({ ...item });
      }
    }
  } else if (isSubset) {
    for (const oldGroup of oldManifest?.groups ?? []) {
      for (const item of oldGroup.items ?? []) {
        if (processedHashes.has(item.sha256)) continue;
        let group = groupsByLabel.get(oldGroup.label);
        if (!group) groupsByLabel.set(oldGroup.label, group = { label: oldGroup.label, items: [] });
        group.items.push({ ...item });
      }
    }
  }

  const groups = [...groupsByLabel.values()].sort((a, b) => b.label.localeCompare(a.label, undefined, { numeric: true }));
  const manifest = { groups };
  const manifestJson = JSON.stringify(manifest);
  const oldJson = oldManifest ? JSON.stringify(oldManifest) : null;
  let manifestBytes;
  if (oldJson === manifestJson && oldBytes) {
    manifestBytes = oldBytes;
  } else {
    const existingNames = await fs.readdir(path.join(options.out, "o"));
    const used = new Set([...occupiedIds, ...existingNames.map((name) => name.replace(/\.bin$/, ""))]);
    vault.manifestId = randomHex();
    while (used.has(vault.manifestId)) vault.manifestId = randomHex();
    const packed = padFull(new TextEncoder().encode(manifestJson));
    const encryptedManifest = await encryptObject(masterKey, packed, used);
    vault.manifestId = encryptedManifest.id;
    manifestBytes = encryptedManifest.bytes;
  }

  await fs.writeFile(path.join(options.out, "m.bin"), manifestBytes);
  const referenced = new Set([vault.manifestId]);
  for (const group of groups) for (const item of group.items) {
    referenced.add(item.full);
    referenced.add(item.thumb);
  }
  const objectDir = path.join(options.out, "o");
  for (const entry of await fs.readdir(objectDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".bin")) continue;
    const id = entry.name.slice(0, -4);
    if (!referenced.has(id)) await fs.unlink(path.join(objectDir, entry.name));
  }
  await fs.writeFile(vaultPath, `${JSON.stringify(vault, null, 2)}\n`);

  const allItems = groups.flatMap((group) => group.items);
  if (allItems.length) {
    const sample = allItems[Math.floor(Math.random() * allItems.length)];
    const samplePath = path.join(objectDir, `${sample.full}.bin`);
    const clear = await decryptObject(masterKey, await fs.readFile(samplePath));
    if (hex(parseHeader(await fs.readFile(samplePath)).objectId) !== sample.full) throw new Error("Self-test failed: encrypted object's id does not match the manifest");
    if (clear.byteLength < sample.len) throw new Error("Self-test failed: decrypted media is shorter than its recorded length");
    const digest = createHash("sha256").update(clear.subarray(0, sample.len)).digest("hex");
    if ((options.noReencode || options.test) && digest !== sample.sha256) throw new Error("Self-test failed: decrypted media SHA-256 does not match the manifest");
    if (!sample.sha256 || !/^[0-9a-f]{64}$/.test(sample.sha256)) throw new Error("Self-test failed: manifest source SHA-256 is invalid");
    console.log((options.noReencode || options.test)
      ? "vault self-test passed: decrypted object SHA-256 matches its manifest entry"
      : "vault self-test passed: authenticated decryption and length; source SHA-256 cannot equal re-encoded object bytes");
  }
  console.log(`vault: processed=${counters.processed}, reused=${counters.reused}, files=${selected.length}, bytes-before=${counters.bytesBefore}, bytes-after=${counters.bytesAfter}, objects=${(await fs.readdir(objectDir)).filter((name) => name.endsWith(".bin")).length + 1}`);
  return { changed: true, processed: counters.processed, reused: counters.reused };
}

async function main() {
  await runVault(parseVaultArgs(process.argv.slice(2)));
}

const launchedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (launchedDirectly) main().catch((error) => {
  console.error(`vault:encrypt failed: ${error.message}`);
  process.exitCode = 1;
});
