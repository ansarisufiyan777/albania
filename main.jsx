import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import Gallery from "./Gallery.jsx";
import TripPage from "./index.jsx";

function getView(pathname) {
  const p = (pathname || "/").replace(/\/$/, "") || "/";
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  if (!base) return p.endsWith("/photos") || p === "/photos" ? "photos" : "trip";
  if (p === `${base}/photos` || p.endsWith("/photos")) return "photos";
  return "trip";
}

function Root() {
  const [view, setView] = useState(() => getView(window.location.pathname));

  useEffect(() => {
    const onPop = () => setView(getView(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    const id = "gallery-route-robots";
    const wantNoIndex = view === "photos";
    let el = document.getElementById(id);
    if (wantNoIndex) {
      if (!el) {
        el = document.createElement("meta");
        el.id = id;
        el.name = "robots";
        document.head.appendChild(el);
      }
      el.setAttribute("content", "noindex, nofollow");
    } else if (el) {
      el.remove();
    }
  }, [view]);

  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  const navigatePhotos = () => {
    const url = base ? `${base}/photos` : "/photos";
    window.history.pushState({}, "", url);
    setView("photos");
  };
  const navigateHome = () => {
    const url = base ? `${base}/` : "/";
    window.history.pushState({}, "", url || "/");
    setView("trip");
  };

  return view === "photos" ? <Gallery onBack={navigateHome} /> : <TripPage onOpenPhotos={navigatePhotos} />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
