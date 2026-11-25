import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { decryptManifest, decryptObject } from "./src/crypto/format.js";

const BASE_URL = import.meta.env.BASE_URL || "/";
const withBase = (path) => `${BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`}${path.replace(/^\//, "")}`;

function isVideo(item) {
  return item.kind === "video" || item.mime?.startsWith("video/");
}

function trimToLength(bytes, length) {
  if (!Number.isSafeInteger(length) || length < 0 || length > bytes.byteLength) {
    throw new Error("Invalid media length in gallery manifest");
  }
  return bytes.subarray(0, length);
}

function thumbnailBytes(padded, length) {
  if (Number.isSafeInteger(length) && length > 0 && length <= padded.byteLength) {
    return padded.subarray(0, length);
  }

  // Older manifests may not include thumbLen. Thumbnail payloads are zero-padded,
  // so remove trailing padding when possible; keep the full buffer as a safe fallback.
  let end = padded.byteLength;
  while (end > 0 && padded[end - 1] === 0) end -= 1;
  return end > 0 ? padded.subarray(0, end) : padded;
}

function Thumbnail({ item, masterKey, onOpen, index }) {
  const buttonRef = useRef(null);
  const [src, setSrc] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const node = buttonRef.current;
    if (!node) return undefined;
    let cancelled = false;
    let objectUrl = "";

    const load = async () => {
      try {
        const response = await fetch(withBase(`vault/o/${item.thumb}.bin`));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const encrypted = new Uint8Array(await response.arrayBuffer());
        const padded = await decryptObject(masterKey, encrypted);
        const bytes = thumbnailBytes(padded, item.thumbLen);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: "image/webp" }));
        setSrc(objectUrl);
      } catch {
        if (!cancelled) setFailed(true);
      }
    };

    let observer;
    if ("IntersectionObserver" in window) {
      observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          load();
        }
      }, { rootMargin: "160px" });
      observer.observe(node);
    } else {
      load();
    }

    return () => {
      cancelled = true;
      observer?.disconnect();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [item.thumb, item.thumbLen, masterKey]);

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={() => onOpen(index)}
      aria-label={isVideo(item) ? "Open video" : "Open photo"}
      style={{
        padding: 0,
        border: "none",
        borderRadius: 10,
        overflow: "hidden",
        cursor: "pointer",
        background: "#e8e8e8",
        aspectRatio: "1",
        position: "relative",
      }}
    >
      {src ? (
        <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      ) : (
        <span aria-hidden="true" style={{ display: "block", width: "100%", height: "100%", background: failed ? "#eee" : "#e8e8e8" }} />
      )}
      {isVideo(item) && (
        <span style={{ position: "absolute", bottom: 6, right: 6, background: "rgba(0,0,0,0.65)", color: "#fff", fontSize: 10, padding: "2px 6px", borderRadius: 4 }}>
          ▶
        </span>
      )}
    </button>
  );
}

function ZoomLightbox({ slides, initialIndex, onClose, getFullUrl }) {
  const [index, setIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [url, setUrl] = useState("");
  const [loadError, setLoadError] = useState(false);
  const touchRef = useRef(null);
  const slide = slides[index];
  const video = slide ? isVideo(slide) : false;

  useEffect(() => {
    setIndex(initialIndex);
    setScale(1);
    setTx(0);
    setTy(0);
  }, [initialIndex]);

  useEffect(() => {
    let cancelled = false;
    setUrl("");
    setLoadError(false);
    getFullUrl(slide)
      .then((nextUrl) => { if (!cancelled) setUrl(nextUrl); })
      .catch(() => { if (!cancelled) setLoadError(true); });
    return () => { cancelled = true; };
  }, [slide, getFullUrl]);

  const go = useCallback((delta) => {
    setScale(1);
    setTx(0);
    setTy(0);
    setIndex((current) => (current + delta + slides.length) % slides.length);
  }, [slides.length]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") go(-1);
      if (event.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  const onWheel = (event) => {
    if (video) return;
    event.preventDefault();
    setScale((current) => Math.min(5, Math.max(1, current + (event.deltaY > 0 ? -0.18 : 0.18))));
  };

  const onTouchStart = (event) => {
    if (event.touches.length === 1) touchRef.current = { x: event.touches[0].clientX, t: Date.now() };
  };
  const onTouchEnd = (event) => {
    const start = touchRef.current;
    touchRef.current = null;
    if (!start || scale > 1.05) return;
    const x = event.changedTouches[0]?.clientX;
    if (x != null && Math.abs(x - start.x) > 56 && Date.now() - start.t < 700) go(x > start.x ? -1 : 1);
  };

  if (!slide) return null;
  return (
    <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.92)", display: "flex", flexDirection: "column", touchAction: "none" }} onWheel={onWheel}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", color: "#fff", fontSize: 14, flexShrink: 0 }}>
        <button type="button" onClick={onClose} style={{ background: "rgba(255,255,255,0.12)", border: "none", color: "#fff", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontWeight: 600 }}>Close</button>
        <span style={{ opacity: 0.85 }}>{index + 1} / {slides.length}</span>
        <div style={{ width: 72 }} />
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", minHeight: 0, padding: "0 48px" }} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <button type="button" aria-label="Previous" onClick={() => go(-1)} style={{ position: "absolute", left: 6, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", fontSize: 28, width: 44, height: 44, borderRadius: "50%", cursor: "pointer", zIndex: 2 }}>‹</button>
        <button type="button" aria-label="Next" onClick={() => go(1)} style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", fontSize: 28, width: 44, height: 44, borderRadius: "50%", cursor: "pointer", zIndex: 2 }}>›</button>
        {loadError ? (
          <p role="alert" style={{ color: "#fff" }}>This item could not be decrypted or loaded.</p>
        ) : !url ? (
          <p role="status" style={{ color: "#fff" }}>Loading…</p>
        ) : video ? (
          <video key={url} src={url} controls autoPlay playsInline style={{ maxWidth: "100%", maxHeight: "85dvh", borderRadius: 8 }} />
        ) : (
          <img key={url} src={url} alt="" draggable={false} style={{ maxWidth: "100%", maxHeight: "85dvh", objectFit: "contain", borderRadius: 8, userSelect: "none", transform: `translate(${tx}px, ${ty}px) scale(${scale})`, transition: scale === 1 ? "transform 0.15s ease-out" : "none" }} />
        )}
      </div>
      {!video && <div style={{ textAlign: "center", color: "rgba(255,255,255,0.55)", fontSize: 12, padding: "8px 12px 16px" }}>Scroll to zoom (desktop) · swipe or arrows for prev/next</div>}
    </div>
  );
}

function errorMessage(error) {
  if (error?.kind === "missing") return "The encrypted gallery is not available yet.";
  if (error?.kind === "password") return "Incorrect password. Please try again.";
  if (error?.kind === "corrupt") return "The encrypted gallery is incomplete or corrupt. Please try again later.";
  return "Could not unlock the gallery. Check your connection and try again.";
}

export default function Gallery({ onBack }) {
  const [password, setPassword] = useState("");
  const [unlockError, setUnlockError] = useState(null);
  const [unlocking, setUnlocking] = useState(false);
  const [masterKey, setMasterKey] = useState(null);
  const [groups, setGroups] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const passwordRef = useRef(null);
  const fullUrlCache = useRef(new Map());
  const cacheGeneration = useRef(0);

  const clearFullUrlCache = useCallback(() => {
    cacheGeneration.current += 1;
    for (const { url } of fullUrlCache.current.values()) URL.revokeObjectURL(url);
    fullUrlCache.current.clear();
  }, []);

  useEffect(() => {
    if (!masterKey) passwordRef.current?.focus();
  }, [masterKey]);

  useEffect(() => () => clearFullUrlCache(), [clearFullUrlCache]);

  const unlock = async (event) => {
    event.preventDefault();
    if (!password || unlocking) return;
    const submittedPassword = password;
    setPassword("");
    setUnlockError(null);
    setUnlocking(true);
    let worker;
    try {
      let vaultResponse;
      try {
        vaultResponse = await fetch(withBase("vault/vault.json"));
      } catch (error) {
        throw { kind: "network", cause: error };
      }
      if (vaultResponse.status === 404) throw { kind: "missing" };
      if (!vaultResponse.ok) throw { kind: "corrupt" };

      let vault;
      try {
        vault = await vaultResponse.json();
        if (vault?.v !== 1 || !Array.isArray(vault.slots) || vault.slots.length === 0 || !/^[0-9a-f]{32}$/i.test(vault.manifestId)) {
          throw new Error("Invalid vault descriptor");
        }
      } catch (error) {
        throw { kind: "corrupt", cause: error };
      }

      const key = await new Promise((resolve, reject) => {
        worker = new Worker(new URL("./src/crypto/unlock.worker.js", import.meta.url), { type: "module" });
        worker.onmessage = ({ data }) => {
          if (data?.type === "unlocked" && data.masterKey) resolve(data.masterKey);
          else if (data?.type === "error") reject({ kind: data.message === "Incorrect password" ? "password" : "corrupt" });
          else reject({ kind: "corrupt" });
        };
        worker.onerror = () => reject({ kind: "corrupt" });
        worker.postMessage({ type: "unlock", password: submittedPassword, vault });
      });

      let manifestResponse;
      try {
        manifestResponse = await fetch(withBase("vault/m.bin"));
      } catch (error) {
        throw { kind: "network", cause: error };
      }
      if (manifestResponse.status === 404) throw { kind: "missing" };
      if (!manifestResponse.ok) throw { kind: "corrupt" };
      let manifest;
      try {
        manifest = await decryptManifest(key, new Uint8Array(await manifestResponse.arrayBuffer()));
        if (!manifest || !Array.isArray(manifest.groups) || manifest.groups.some((group) => !Array.isArray(group.items))) throw new Error("Invalid gallery manifest");
      } catch (error) {
        throw { kind: "corrupt", cause: error };
      }
      setMasterKey(key);
      setGroups(manifest.groups);
    } catch (error) {
      setUnlockError(error?.kind || "network");
    } finally {
      worker?.terminate();
      setUnlocking(false);
    }
  };

  const flatSlides = useMemo(() => (groups || []).flatMap((group) => group.items), [groups]);
  const offsets = useMemo(() => {
    let offset = 0;
    return (groups || []).map((group) => {
      const start = offset;
      offset += group.items.length;
      return start;
    });
  }, [groups]);

  const getFullUrl = useCallback(async (item) => {
    const cached = fullUrlCache.current.get(item.full);
    if (cached) {
      fullUrlCache.current.delete(item.full);
      fullUrlCache.current.set(item.full, cached);
      return cached.url;
    }
    const generation = cacheGeneration.current;
    const response = await fetch(withBase(`vault/o/${item.full}.bin`));
    if (!response.ok) throw new Error(`Could not fetch encrypted object (${response.status})`);
    const padded = await decryptObject(masterKey, new Uint8Array(await response.arrayBuffer()));
    const bytes = trimToLength(padded, item.len);
    if (generation !== cacheGeneration.current) throw new Error("Gallery closed");
    const url = URL.createObjectURL(new Blob([bytes], { type: item.mime || "application/octet-stream" }));
    fullUrlCache.current.set(item.full, { url });
    while (fullUrlCache.current.size > 4) {
      const oldestId = fullUrlCache.current.keys().next().value;
      const oldest = fullUrlCache.current.get(oldestId);
      URL.revokeObjectURL(oldest.url);
      fullUrlCache.current.delete(oldestId);
    }
    return url;
  }, [masterKey]);

  const closeLightbox = useCallback(() => {
    setLightbox(null);
    clearFullUrlCache();
  }, [clearFullUrlCache]);

  if (!masterKey) {
    return (
      <div style={{ fontFamily: "var(--font-sans)", minHeight: "100dvh", position: "relative" }}>
        <div style={{ position: "fixed", inset: 0, background: "rgba(245, 247, 250, 0.92)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 1000 }}>
          <form onSubmit={unlock} role="dialog" aria-modal="true" aria-labelledby="gallery-lock-title" style={{ width: "100%", maxWidth: 400, background: "#fff", borderRadius: 12, padding: "24px 22px", boxShadow: "0 12px 40px rgba(0,0,0,0.12)", border: "1px solid #e8e8ed" }}>
            <h2 id="gallery-lock-title" style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700, color: "#1a1a1a" }}>Trip photos</h2>
            <p style={{ margin: "0 0 16px", fontSize: 14, color: "#666", lineHeight: 1.45 }}>Enter the gallery password to decrypt your photos on this device.</p>
            <label htmlFor="gallery-password" style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#333", marginBottom: 8 }}>Password</label>
            <input ref={passwordRef} id="gallery-password" type="password" autoComplete="current-password" value={password} disabled={unlocking} onChange={(event) => { setPassword(event.target.value); if (unlockError) setUnlockError(null); }} style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", fontSize: 16, borderRadius: 8, border: "1px solid #ccc", marginBottom: 12 }} />
            {unlockError && <p role="alert" style={{ margin: "0 0 12px", fontSize: 13, color: "#b42318" }}>{errorMessage({ kind: unlockError })}</p>}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="submit" disabled={unlocking || !password} style={{ background: "#1A5FA8", border: "none", color: "#fff", borderRadius: 8, padding: "10px 18px", cursor: unlocking ? "wait" : "pointer", fontWeight: 600, fontSize: 14 }}>{unlocking ? "Decrypting…" : "Open gallery"}</button>
              <button type="button" onClick={onBack} style={{ background: "#EBF3FF", border: "1px solid #BDD6F5", color: "#1A5FA8", borderRadius: 8, padding: "10px 18px", cursor: "pointer", fontWeight: 600, fontSize: 14 }}>← Back to itinerary</button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "var(--font-sans)", maxWidth: 900, margin: "0 auto", padding: "1.25rem 1rem 3rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: "1.5rem", flexWrap: "wrap" }}>
        <button type="button" onClick={onBack} style={{ background: "#EBF3FF", border: "1px solid #BDD6F5", color: "#1A5FA8", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontWeight: 600, fontSize: 14 }}>← Itinerary</button>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1a1a1a" }}>Trip photos</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#888" }}>By day · tap to open · swipe between shots · scroll to zoom</p>
        </div>
      </div>

      {groups.length === 0 && <div style={{ padding: 16, background: "#FAFAFA", border: "1px solid #E8E8ED", borderRadius: 8, color: "#555" }}>No photos are included in this gallery.</div>}

      {groups.map((group, groupIndex) => (
        <section key={`${group.label}-${groupIndex}`} style={{ marginBottom: "2rem" }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a", margin: "0 0 12px", paddingBottom: 8, borderBottom: "1px solid #eee" }}>{group.label}</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
            {group.items.map((item, itemIndex) => (
              <Thumbnail key={`${item.thumb}-${itemIndex}`} item={item} masterKey={masterKey} index={offsets[groupIndex] + itemIndex} onOpen={(index) => setLightbox({ index })} />
            ))}
          </div>
        </section>
      ))}

      {lightbox != null && flatSlides.length > 0 && <ZoomLightbox slides={flatSlides} initialIndex={lightbox.index} onClose={closeLightbox} getFullUrl={getFullUrl} />}
    </div>
  );
}
