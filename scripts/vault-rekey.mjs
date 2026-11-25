#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { StringDecoder } from "node:string_decoder";
import { b64ToBytes, bytesToB64, deriveKekArgon2, unwrapMasterKey } from "../src/crypto/format.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDefault = path.join(root, "public", "vault");
const KDF = { alg: "argon2id", m: 65536, t: 3, p: 1 };
const encoder = new TextEncoder();

function parseArgs(args) {
  let action = null;
  let out = outDefault;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--add" || args[i] === "--remove") {
      if (action) throw new Error("Choose only one of --add or --remove");
      action = args[i].slice(2);
    } else if (args[i] === "--out") {
      if (!args[i + 1]) throw new Error("Missing directory after --out");
      out = path.resolve(args[++i]);
    } else throw new Error(`Unknown argument: ${args[i]}`);
  }
  return { action, out };
}

async function prompt(label, hidden = true) {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) throw new Error("Password changes require an interactive TTY");
  process.stdout.write(label);
  return new Promise((resolve, reject) => {
    let value = "";
    const input = process.stdin;
    const decoder = new StringDecoder("utf8");
    const onData = (data) => {
      for (const char of decoder.write(data)) {
        if (char === "\u0003") {
          cleanup();
          reject(new Error("Cancelled"));
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
    const cleanup = () => {
      input.setRawMode(false);
      input.pause();
      input.removeListener("data", onData);
      process.stdout.write("\n");
    };
    input.setRawMode(true);
    input.resume();
    input.on("data", onData);
  });
}

function randomBytes(length) {
  const out = new Uint8Array(length);
  globalThis.crypto.getRandomValues(out);
  return out;
}

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function slotAad(kdf, salt) {
  return concat(encoder.encode("agv1/slot"), encoder.encode(JSON.stringify({ alg: kdf.alg, m: kdf.m, t: kdf.t, p: kdf.p })), salt);
}

async function unlock(vault, password) {
  let lastError;
  for (const slot of vault.slots ?? []) {
    try {
      const salt = b64ToBytes(slot.salt);
      const kek = await deriveKekArgon2(password, salt, slot.kdf);
      const masterKey = await unwrapMasterKey(kek, slot, salt);
      if (masterKey.byteLength !== 32) throw new Error("Invalid master key length");
      return masterKey;
    } catch (error) { lastError = error; }
  }
  throw new Error(`Could not unlock vault with that password${lastError ? ` (${lastError.message})` : ""}`);
}

async function makeSlot(password, masterKey) {
  const kdf = { ...KDF };
  const salt = randomBytes(16);
  const nonce = randomBytes(12);
  const kek = await deriveKekArgon2(password, salt, kdf);
  const cryptoKey = await crypto.subtle.importKey("raw", kek, { name: "AES-GCM" }, false, ["encrypt"]);
  const wrapped = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: slotAad(kdf, salt), tagLength: 128 }, cryptoKey, masterKey);
  return { kdf, salt: bytesToB64(salt), nonce: bytesToB64(nonce), wrapped: bytesToB64(new Uint8Array(wrapped)) };
}

async function main() {
  const { action, out } = parseArgs(process.argv.slice(2));
  if (!action) throw new Error("Specify --add or --remove");
  const vaultPath = path.join(out, "vault.json");
  const vault = JSON.parse(await fs.readFile(vaultPath, "utf8"));
  if (!Array.isArray(vault.slots) || vault.slots.length === 0) throw new Error("Vault has no password slots");
  const currentPassword = await prompt("Current vault password: ");
  const masterKey = await unlock(vault, currentPassword);
  if (action === "add") {
    const newPassword = await prompt("New vault password: ");
    if (!newPassword) throw new Error("Password cannot be empty");
    const confirmation = await prompt("Confirm new password: ");
    if (newPassword !== confirmation) throw new Error("Passwords do not match");
    vault.slots.push(await makeSlot(newPassword, masterKey));
  } else {
    process.stdout.write(`Password slots: ${vault.slots.map((_, index) => index).join(", ")}\n`);
    const indexValue = await prompt("Slot index to remove: ", false);
    const index = Number(indexValue);
    if (!Number.isInteger(index) || index < 0 || index >= vault.slots.length) throw new Error("Invalid slot index");
    if (vault.slots.length === 1) throw new Error("Cannot remove the last password slot");
    vault.slots.splice(index, 1);
  }
  await fs.writeFile(vaultPath, `${JSON.stringify(vault, null, 2)}\n`);
  console.log(`vault: ${action === "add" ? "added password slot" : "removed password slot"}; encrypted objects unchanged`);
}

main().catch((error) => {
  console.error(`vault:rekey failed: ${error.message}`);
  process.exitCode = 1;
});
