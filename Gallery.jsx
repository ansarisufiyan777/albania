import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const IMAGE_RE = /\.(jpe?g|png|webp|gif|heic|heif)$/i;

/** Client-side gate only; not for sensitive data. */
const GALLERY_ACCESS_CODE = "albania2026";
const GALLERY_UNLOCK_KEY = "albania-gallery-unlocked";

function readGalleryUnlocked() {
  try {
    return sessionStorage.getItem(GALLERY_UNLOCK_KEY) === "1";
  } catch {
    return false;
  }
}

function setGalleryUnlocked() {
  try {
    sessionStorage.setItem(GALLERY_UNLOCK_KEY, "1");
  } catch {
    /* ignore */
  }
}

function withBase(rel) {
  const b = import.meta.env.BASE_URL || "/";
  const path = rel.replace(/^\//, "");
  return `${b.endsWith("/") ? b : `${b}/`}${path}`;
}

function ZoomLightbox({ slides, initialIndex, onClose }) {
  const [index, setIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const touchRef = useRef(null);
  const imgRef = useRef(null);

  const slide = slides[index];
  const slideUrl = slide ? withBase(slide.src) : "";
  const isImage = slide && !slide.video && IMAGE_RE.test(slide.src);

  useEffect(() => {
    setIndex(initialIndex);
    setScale(1);
    setTx(0);
    setTy(0);
  }, [initialIndex]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, slides.length]);

  const go = (d) => {
    setScale(1);
    setTx(0);
    setTy(0);
    setIndex((i) => (i + d + slides.length) % slides.length);
  };

  const onWheel = (e) => {
    if (!isImage) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -1 : 1;
    setScale((s) => Math.min(5, Math.max(1, s + delta * 0.18)));
  };

  const onTouchStart = (e) => {
    if (e.touches.length === 1) {
      touchRef.current = { x: e.touches[0].clientX, t: Date.now() };
    }
  };

  const onTouchEnd = (e) => {
    const start = touchRef.current;
    touchRef.current = null;
    if (!start || scale > 1.05) return;
    const x = e.changedTouches[0]?.clientX;
    if (x == null) return;
    const dx = x - start.x;
    if (Math.abs(dx) > 56 && Date.now() - start.t < 700) {
      if (dx > 0) go(-1);
      else go(1);
    }
  };

  if (!slide) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.92)",
        display: "flex",
        flexDirection: "column",
        touchAction: "none",
      }}
      onWheel={onWheel}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          color: "#fff",
          fontSize: 14,
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            background: "rgba(255,255,255,0.12)",
            border: "none",
            color: "#fff",
            borderRadius: 8,
            padding: "8px 14px",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Close
        </button>
        <span style={{ opacity: 0.85 }}>
          {index + 1} / {slides.length}
        </span>
        <div style={{ width: 72 }} />
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          minHeight: 0,
          padding: "0 48px",
        }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <button
          type="button"
          aria-label="Previous"
          onClick={() => go(-1)}
          style={{
            position: "absolute",
            left: 6,
            top: "50%",
            transform: "translateY(-50%)",
            background: "rgba(255,255,255,0.15)",
            border: "none",
            color: "#fff",
            fontSize: 28,
            width: 44,
            height: 44,
            borderRadius: "50%",
            cursor: "pointer",
            zIndex: 2,
          }}
        >
          ‹
        </button>
        <button
          type="button"
          aria-label="Next"
          onClick={() => go(1)}
          style={{
            position: "absolute",
            right: 6,
            top: "50%",
            transform: "translateY(-50%)",
            background: "rgba(255,255,255,0.15)",
            border: "none",
            color: "#fff",
            fontSize: 28,
            width: 44,
            height: 44,
            borderRadius: "50%",
            cursor: "pointer",
            zIndex: 2,
          }}
        >
          ›
        </button>

        <div
          style={{
            maxWidth: "100%",
            maxHeight: "100%",
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transform: isImage ? `translate(${tx}px, ${ty}px) scale(${scale})` : undefined,
            transition: scale === 1 ? "transform 0.15s ease-out" : "none",
          }}
        >
          {slide.video ? (
            <video
              key={slideUrl}
              src={slideUrl}
              controls
              autoPlay
              playsInline
              style={{ maxWidth: "100%", maxHeight: "85dvh", borderRadius: 8 }}
            />
          ) : (
            <img
              ref={imgRef}
              key={slideUrl}
              src={slideUrl}
              alt=""
              draggable={false}
              style={{
                maxWidth: "100%",
                maxHeight: "85dvh",
                objectFit: "contain",
                borderRadius: 8,
                userSelect: "none",
              }}
            />
          )}
        </div>
      </div>

      {isImage && (
        <div
          style={{
            textAlign: "center",
            color: "rgba(255,255,255,0.55)",
            fontSize: 12,
            padding: "8px 12px 16px",
          }}
        >
          Scroll to zoom (desktop) · swipe or arrows for prev/next
        </div>
      )}
    </div>
  );
}

export default function Gallery({ onBack }) {
  const [unlocked, setUnlocked] = useState(readGalleryUnlocked);
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState(null);
  const codeRef = useRef(null);

  const [groups, setGroups] = useState(null);
  const [err, setErr] = useState(null);
  const [lightbox, setLightbox] = useState(null);

  const flatSlides = useMemo(() => {
    if (!groups) return [];
    const slides = [];
    for (const g of groups) {
      for (const item of g.items) slides.push(item);
    }
    return slides;
  }, [groups]);

  const openAt = useCallback(
    (globalIndex) => {
      setLightbox({ index: globalIndex });
    },
    [setLightbox]
  );

  useEffect(() => {
    if (!unlocked) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${import.meta.env.BASE_URL}gallery-manifest.json`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (!cancelled) setGroups(data.groups || []);
      } catch (e) {
        if (!cancelled) setErr(String(e.message));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [unlocked]);

  useEffect(() => {
    if (!unlocked && codeRef.current) codeRef.current.focus();
  }, [unlocked]);

  const submitCode = (e) => {
    e.preventDefault();
    const v = codeInput.trim();
    if (v === GALLERY_ACCESS_CODE) {
      setGalleryUnlocked();
      setCodeError(null);
      setCodeInput("");
      setUnlocked(true);
    } else {
      setCodeError("That code doesn’t match. Try again.");
    }
  };

  const offsets = useMemo(() => {
    if (!groups) return [];
    const o = [];
    let acc = 0;
    for (const g of groups) {
      o.push(acc);
      acc += g.items.length;
    }
    return o;
  }, [groups]);

  if (!unlocked) {
    return (
      <div style={{ fontFamily: "var(--font-sans)", minHeight: "100dvh", position: "relative" }}>
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(245, 247, 250, 0.92)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 1000,
          }}
        >
          <form
            onSubmit={submitCode}
            role="dialog"
            aria-modal="true"
            aria-labelledby="gallery-lock-title"
            style={{
              width: "100%",
              maxWidth: 400,
              background: "#fff",
              borderRadius: 12,
              padding: "24px 22px",
              boxShadow: "0 12px 40px rgba(0,0,0,0.12)",
              border: "1px solid #e8e8ed",
            }}
          >
            <h2 id="gallery-lock-title" style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700, color: "#1a1a1a" }}>
              Trip photos
            </h2>
            <p style={{ margin: "0 0 16px", fontSize: 14, color: "#666", lineHeight: 1.45 }}>
              Enter the shared code to open the gallery.
            </p>
            <label htmlFor="gallery-code" style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#333", marginBottom: 8 }}>
              Code
            </label>
            <input
              ref={codeRef}
              id="gallery-code"
              type="password"
              autoComplete="off"
              value={codeInput}
              onChange={(ev) => {
                setCodeInput(ev.target.value);
                if (codeError) setCodeError(null);
              }}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "10px 12px",
                fontSize: 16,
                borderRadius: 8,
                border: "1px solid #ccc",
                marginBottom: 12,
              }}
            />
            {codeError && (
              <p style={{ margin: "0 0 12px", fontSize: 13, color: "#b42318" }} role="alert">
                {codeError}
              </p>
            )}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="submit"
                style={{
                  background: "#1A5FA8",
                  border: "none",
                  color: "#fff",
                  borderRadius: 8,
                  padding: "10px 18px",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                Open gallery
              </button>
              <button
                type="button"
                onClick={onBack}
                style={{
                  background: "#EBF3FF",
                  border: "1px solid #BDD6F5",
                  color: "#1A5FA8",
                  borderRadius: 8,
                  padding: "10px 18px",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                ← Back to itinerary
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "var(--font-sans)", maxWidth: 900, margin: "0 auto", padding: "1.25rem 1rem 3rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: "1.5rem", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            background: "#EBF3FF",
            border: "1px solid #BDD6F5",
            color: "#1A5FA8",
            borderRadius: 8,
            padding: "8px 14px",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          ← Itinerary
        </button>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1a1a1a" }}>Trip photos</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#888" }}>By day · tap to open · swipe between shots · scroll to zoom</p>
        </div>
      </div>

      {err && (
        <div style={{ padding: 16, background: "#FEF0EF", border: "1px solid #F5C2C2", borderRadius: 8, color: "#712B13" }}>
          Could not load gallery list ({err}). Run <code style={{ fontSize: 12 }}>node scripts/generate-gallery-manifest.mjs</code> then{" "}
          <code style={{ fontSize: 12 }}>npm run build</code>.
        </div>
      )}

      {groups && groups.length === 0 && !err && (
        <div style={{ padding: 16, background: "#FAFAFA", border: "1px solid #E8E8ED", borderRadius: 8, color: "#555" }}>
          No photos yet. Put folders <code style={{ fontSize: 12 }}>DD-MM-YYYY</code> inside <code style={{ fontSize: 12 }}>photos/</code>, then run{" "}
          <code style={{ fontSize: 12 }}>node scripts/generate-gallery-manifest.mjs</code>.
        </div>
      )}

      {groups &&
        groups.map((g, gi) => (
          <section key={g.date} style={{ marginBottom: "2rem" }}>
            <h2
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: "#1a1a1a",
                margin: "0 0 12px",
                paddingBottom: 8,
                borderBottom: "1px solid #eee",
              }}
            >
              {g.date}
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                gap: 10,
              }}
            >
              {g.items.map((item, ii) => {
                const myIndex = offsets[gi] + ii;
                const thumbUrl = withBase(item.src);
                return (
                  <button
                    key={`${g.date}-${item.src}`}
                    type="button"
                    onClick={() => openAt(myIndex)}
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
                    {item.video ? (
                      <video src={thumbUrl} muted playsInline preload="metadata" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <img src={thumbUrl} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    )}
                    {item.video && (
                      <span
                        style={{
                          position: "absolute",
                          bottom: 6,
                          right: 6,
                          background: "rgba(0,0,0,0.65)",
                          color: "#fff",
                          fontSize: 10,
                          padding: "2px 6px",
                          borderRadius: 4,
                        }}
                      >
                        ▶
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        ))}

      {lightbox != null && flatSlides.length > 0 && (
        <ZoomLightbox slides={flatSlides} initialIndex={lightbox.index} onClose={() => setLightbox(null)} />
      )}
    </div>
  );
}
