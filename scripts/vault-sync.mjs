#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { runVault, walkMedia } from "./vault-encrypt.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mediaExtensions = /\.(jpe?g|png|webp|gif|heic|heif|mp4|mov|m4v)$/i;

function parseArgs(argv) {
  const options = {
    src: path.join(root, "photos"),
    out: path.join(root, "public", "vault"),
    state: path.join(root, ".vault-state.json"),
    limit: null,
    test: false,
    passwordEnv: null,
    fromTty: false,
    noReencode: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (["--src", "--out", "--state", "--limit", "--password-env"].includes(arg)) {
      const value = argv[++index];
      if (!value) throw new Error(`Missing value for ${arg}`);
      if (arg === "--src") options.src = path.resolve(value);
      else if (arg === "--out") options.out = path.resolve(value);
      else if (arg === "--state") options.state = path.resolve(value);
      else if (arg === "--password-env") options.passwordEnv = value;
      else {
        options.limit = Number(value);
        if (!Number.isInteger(options.limit) || options.limit < 1) throw new Error("--limit must be a positive integer");
      }
    } else if (arg === "--test") options.test = true;
    else if (arg === "--from-tty") options.fromTty = true;
    else if (arg === "--no-reencode") options.noReencode = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

async function readCache(filename) {
  try {
    const text = await fs.readFile(filename, "utf8");
    const cache = JSON.parse(text);
    if (!cache || typeof cache !== "object" || Array.isArray(cache)) throw new Error("Cache root is not an object");
    return { cache, text };
  } catch (error) {
    if (error.code === "ENOENT") return { cache: {}, text: null };
    throw new Error(`Unable to read ${filename}: ${error.message}`);
  }
}

async function fileSha256(filename) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest("hex");
}

function relativeKey(filename, sourceRoot) {
  return path.relative(sourceRoot, filename).split(path.sep).join("/");
}

function cacheEntries(cache) {
  return Object.entries(cache).filter(([, value]) =>
    value && Number.isFinite(value.size) && Number.isFinite(value.mtime) && /^[0-9a-f]{64}$/.test(value.sha256 ?? ""));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const files = (await walkMedia(options.src)).filter((filename) => mediaExtensions.test(filename));
  const { cache: oldCache, text: oldCacheText } = await readCache(options.state);
  const oldEntries = new Map(cacheEntries(oldCache));
  const currentKeys = new Set();
  const candidates = [];
  const nextCache = { ...Object.fromEntries(oldEntries) };

  for (const filename of files) {
    const key = relativeKey(filename, options.src);
    currentKeys.add(key);
    const stat = await fs.stat(filename);
    const prior = oldEntries.get(key);
    if (prior && prior.size === stat.size && prior.mtime === stat.mtimeMs) continue;
    candidates.push({ filename, key, size: stat.size, mtime: stat.mtimeMs });
  }

  for (const key of oldEntries.keys()) {
    if (!currentKeys.has(key)) delete nextCache[key];
  }
  const vaultPresent = await Promise.all([
    fs.access(path.join(options.out, "vault.json")).then(() => true, () => false),
    fs.access(path.join(options.out, "m.bin")).then(() => true, () => false),
  ]).then((result) => result.every(Boolean));
  if (!vaultPresent && oldEntries.size) {
    // A local cache cannot stand in for missing encrypted artifacts.
    for (const filename of files) {
      const key = relativeKey(filename, options.src);
      const stat = await fs.stat(filename);
      if (!candidates.some((entry) => entry.key === key)) candidates.push({ filename, key, size: stat.size, mtime: stat.mtimeMs });
      delete nextCache[key];
    }
  }

  const maxItems = options.limit ?? (options.test ? 3 : null);
  const selected = maxItems === null ? candidates : candidates.slice(0, maxItems);
  const changedEntries = [];
  for (const entry of selected) {
    entry.sha256 = await fileSha256(entry.filename);
    changedEntries.push(entry);
  }
  for (const entry of changedEntries) {
    nextCache[entry.key] = { size: entry.size, mtime: entry.mtime, sha256: entry.sha256 };
  }

  const knownHashes = new Set(Object.values(nextCache).map((entry) => entry?.sha256).filter(Boolean));
  const removedHashes = cacheEntries(oldCache)
    .map(([, entry]) => entry.sha256)
    .filter((sha256) => !knownHashes.has(sha256));
  const deleted = [...oldEntries.keys()].some((key) => !currentKeys.has(key));

  if (!selected.length && !deleted) {
    await runVault(options, { incremental: true, selectedPaths: [], verifyOnly: true });
    console.log("vault: nothing new");
    return;
  }

  await runVault({ ...options, src: options.src, out: options.out }, {
    incremental: true,
    selectedPaths: changedEntries.map((entry) => entry.filename),
    hashes: new Map(changedEntries.map((entry) => [entry.filename, entry.sha256])),
    removedHashes,
  });

  const nextText = `${JSON.stringify(nextCache, null, 2)}\n`;
  if (nextText !== oldCacheText) {
    await fs.mkdir(path.dirname(options.state), { recursive: true });
    await fs.writeFile(options.state, nextText);
  }
}

main().catch((error) => {
  console.error(`vault:sync failed: ${error.message}`);
  process.exitCode = 1;
});
