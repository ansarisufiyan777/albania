/**
 * Copies photos/ → public/gallery/ (JPEG/PNG/WebP/GIF + MP4/MOV),
 * then writes public/gallery-manifest.json for the /photos page.
 * Run: node scripts/generate-gallery-manifest.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const srcDir = path.join(root, "photos");
const galleryDir = path.join(root, "public", "gallery");
const manifestPath = path.join(root, "public", "gallery-manifest.json");

const MEDIA_RE = /\.(jpe?g|png|webp|gif|heic|heif|mp4|mov|m4v)$/i;

function copyRecursive(from, to) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const ent of fs.readdirSync(from, { withFileTypes: true })) {
    if (ent.name === ".DS_Store") continue;
    const s = path.join(from, ent.name);
    const d = path.join(to, ent.name);
    if (ent.isDirectory()) copyRecursive(s, d);
    else if (MEDIA_RE.test(ent.name)) fs.copyFileSync(s, d);
  }
}

function listGroups() {
  if (!fs.existsSync(galleryDir)) return [];
  const groups = [];
  for (const ent of fs.readdirSync(galleryDir, { withFileTypes: true })) {
    if (!ent.isDirectory() || ent.name.startsWith(".")) continue;
    const dateKey = ent.name;
    const dir = path.join(galleryDir, dateKey);
    const files = fs
      .readdirSync(dir)
      .filter((f) => MEDIA_RE.test(f))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((f) => ({
        file: f,
        video: /\.(mp4|mov|m4v)$/i.test(f),
      }));
    if (files.length) groups.push({ date: dateKey, files });
  }

  function parseDMY(key) {
    const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(key);
    if (!m) return 0;
    return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])).getTime();
  }
  groups.sort((a, b) => parseDMY(b.date) - parseDMY(a.date));
  return groups;
}

copyRecursive(srcDir, galleryDir);

const groups = listGroups().map((g) => ({
  date: g.date,
  items: g.files.map(({ file, video }) => ({
    src: `gallery/${g.date}/${file}`,
    video,
  })),
}));

fs.writeFileSync(manifestPath, JSON.stringify({ generated: new Date().toISOString(), groups }, null, 2));
console.log(`gallery-manifest: ${groups.length} day folders → ${manifestPath}`);
