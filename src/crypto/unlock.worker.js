import { b64ToBytes, deriveKekArgon2, importMasterKey, unwrapMasterKey } from "./format.js";

self.onmessage = async ({ data }) => {
  if (data?.type !== "unlock") return;

  const { password, vault } = data;
  if (typeof password !== "string" || !vault || !Array.isArray(vault.slots)) {
    self.postMessage({ type: "error", message: "Invalid vault data" });
    return;
  }

  for (const slot of vault.slots) {
    let kekRaw;
    let rawMasterKey;
    try {
      const salt = b64ToBytes(slot.salt);
      kekRaw = await deriveKekArgon2(password, salt, slot.kdf);
      rawMasterKey = await unwrapMasterKey(kekRaw, slot, salt);
      const masterKey = await importMasterKey(rawMasterKey);
      self.postMessage({ type: "unlocked", masterKey });
      return;
    } catch {
      // A slot's AES-GCM authentication tag rejects an incorrect password; try other slots.
    } finally {
      kekRaw?.fill(0);
      rawMasterKey?.fill(0);
    }
  }

  self.postMessage({ type: "error", message: "Incorrect password" });
};
