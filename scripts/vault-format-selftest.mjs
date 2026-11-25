import fs from "node:fs/promises";
import path from "node:path";
import { b64ToBytes, decryptManifest, decryptObject, deriveKekArgon2, importMasterKey, unwrapMasterKey } from "../src/crypto/format.js";

const vaultDir = path.resolve(process.argv[2] ?? "public/vault");
const password = process.env.TESTPW;
if (!password) throw new Error("Set TESTPW to the vault password");
const vault = JSON.parse(await fs.readFile(path.join(vaultDir, "vault.json"), "utf8"));
let rawMasterKey;
for (const slot of vault.slots) {
  try {
    const salt = b64ToBytes(slot.salt);
    rawMasterKey = await unwrapMasterKey(await deriveKekArgon2(password, salt, slot.kdf), slot, salt);
    break;
  } catch { /* try remaining slots */ }
}
if (!rawMasterKey) throw new Error("Unable to unlock test vault");
const masterKey = await importMasterKey(rawMasterKey);
const encryptedManifest = await fs.readFile(path.join(vaultDir, "m.bin"));
const manifestClear = await decryptObject(masterKey, encryptedManifest);
if (manifestClear[0] !== 0x7b) throw new Error("Manifest plaintext is not raw JSON (expected '{', not gzip)");
const jsonEnd = manifestClear.indexOf(0);
const rawManifest = JSON.parse(new TextDecoder().decode(manifestClear.subarray(0, jsonEnd < 0 ? manifestClear.length : jsonEnd)));
const manifest = await decryptManifest(masterKey, encryptedManifest);
if (!Array.isArray(manifest.groups)) throw new Error("Decrypted manifest has no groups array");
if (JSON.stringify(manifest) !== JSON.stringify(rawManifest)) throw new Error("decryptManifest does not match the raw JSON manifest plaintext");
const allItems = manifest.groups.flatMap((group) => group.items);
for (const [index, item] of allItems.entries()) {
  if (!Number.isInteger(item.thumbLen) || item.thumbLen <= 0 || item.thumbLen > 65536) {
    throw new Error(`Manifest item ${index} has invalid thumbLen: ${item.thumbLen}`);
  }
}
const item = allItems[0];
if (!item) throw new Error("Decrypted manifest has no media entries");
const encryptedObject = await fs.readFile(path.join(vaultDir, "o", `${item.full}.bin`));
const plaintext = await decryptObject(masterKey, encryptedObject);
if (plaintext.byteLength < item.len) throw new Error("Decrypted object length is shorter than manifest len");
console.log(`format self-test passed: raw JSON manifest groups=${manifest.groups.length}, entries=${allItems.length}, thumbLen=${allItems.map((entry) => entry.thumbLen).join(",")}, decrypted=${plaintext.byteLength} bytes`);
