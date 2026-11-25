#!/usr/bin/env python3
"""
Organize trip photos/videos in one of two ways:

1) Default (itinerary): <out>/<NN_label>/<location>/relative/path
   Uses itinerary.json legs (date ranges) + GPS -> place name.

2) --by-date: <out>/DD-MM-YYYY/relative/path
   One folder per calendar day (no location subfolders). No itinerary file.
   Date from Spotlight kMDItemContentCreationDate in --timezone.

Uses Spotlight (mdls). Itinerary mode uses reverse geocoding (OSM Nominatim;
cache in <out>/.geocode_cache.json) unless --no-geocode.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo


@dataclass(frozen=True)
class Leg:
    start: date
    end: date
    label: str
    sort_index: int

    def contains(self, d: date) -> bool:
        return self.start <= d <= self.end


_MDLS_INT = re.compile(r"^\s*(\w+)\s*=\s*(.+)\s*$")


def parse_mdls(path: Path) -> dict[str, str]:
    r = subprocess.run(
        ["mdls", str(path)],
        capture_output=True,
        text=True,
        check=False,
    )
    if r.returncode != 0:
        return {}
    out: dict[str, str] = {}
    for line in r.stdout.splitlines():
        m = _MDLS_INT.match(line)
        if not m:
            continue
        k, v = m.group(1), m.group(2).strip()
        if k in (
            "kMDItemContentCreationDate",
            "kMDItemLatitude",
            "kMDItemLongitude",
        ):
            out[k] = v
    return out


def parse_creation(raw: str) -> datetime | None:
    raw = raw.strip().split("\n")[0].strip()
    if not raw or raw == "(null)":
        return None
    # e.g. 2026-05-06 13:24:06 +0000
    for fmt in ("%Y-%m-%d %H:%M:%S %z", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(raw[: len("2026-05-06 13:24:06 +0000")], fmt)
        except ValueError:
            continue
    try:
        return datetime.strptime(raw[:19], "%Y-%m-%d %H:%M:%S").replace(tzinfo=ZoneInfo("UTC"))
    except ValueError:
        return None


def parse_float(raw: str) -> float | None:
    try:
        return float(str(raw).strip().split()[0])
    except (ValueError, IndexError):
        return None


def safe_name(s: str, max_len: int = 48) -> str:
    s = re.sub(r"\s+", "_", s.strip())
    s = re.sub(r"[^\w.\-]+", "", s, flags=re.UNICODE)
    return (s or "unknown")[:max_len]


def load_itinerary(path: Path) -> tuple[str, list[Leg]]:
    data: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
    tz = data.get("timezone") or "UTC"
    legs_raw = data.get("legs") or []
    legs: list[Leg] = []
    for idx, row in enumerate(legs_raw):
        start = date.fromisoformat(row["start"])
        end = date.fromisoformat(row["end"])
        label = str(row.get("label") or f"leg_{idx+1}")
        legs.append(Leg(start=start, end=end, label=label, sort_index=idx))
    if not legs:
        sys.exit("itinerary.json must include a non-empty 'legs' array")
    return tz, legs


def pick_leg(legs: list[Leg], d: date) -> Leg | None:
    for leg in legs:
        if leg.contains(d):
            return leg
    return None


def reverse_geocode(
    lat: float,
    lon: float,
    cache: dict[str, str],
    session: str,
    pause_sec: float,
) -> str:
    key = f"{round(lat, 3)!s},{round(lon, 3)!s}"
    if key in cache:
        return cache[key]
    params = urllib.parse.urlencode(
        {"lat": lat, "lon": lon, "format": "json", "addressdetails": "1"}
    )
    url = f"https://nominatim.openstreetmap.org/reverse?{params}"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": session},
    )
    time.sleep(pause_sec)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode())
    except (urllib.error.URLError, json.JSONDecodeError, TimeoutError):
        cache[key] = f"lat{lat:.2f}_lon{lon:.2f}"
        return cache[key]
    addr = data.get("address") or {}
    label = (
        addr.get("city")
        or addr.get("town")
        or addr.get("village")
        or addr.get("municipality")
        or addr.get("county")
        or addr.get("state")
        or (data.get("display_name") or "").split(",")[0].strip()
        or "unknown"
    )
    cache[key] = safe_name(label)
    return cache[key]


def main() -> None:
    here = Path(__file__).resolve().parent
    ap = argparse.ArgumentParser(
        description="Organize media by itinerary or by calendar date, then location"
    )
    ap.add_argument(
        "--src",
        type=Path,
        default=here / "photos",
        help="Source tree (default: ./photos next to this script)",
    )
    ap.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Output root (default: ./organized or ./organized_by_date with --by-date)",
    )
    ap.add_argument(
        "--by-date",
        action="store_true",
        help="Group by calendar day only: DD-MM-YYYY/... (no itinerary, no location subfolders)",
    )
    ap.add_argument(
        "--timezone",
        default=None,
        metavar="IANA",
        help="Calendar-day timezone (default: Europe/Tirane with --by-date; else from itinerary)",
    )
    ap.add_argument(
        "--itinerary",
        type=Path,
        default=here / "itinerary.json",
        help="itinerary.json path (ignored with --by-date)",
    )
    ap.add_argument("--no-geocode", action="store_true", help="Skip network; use lat_lon folders")
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--copy", action="store_true", help="Copy files into output (originals stay put)")
    g.add_argument(
        "--move",
        action="store_true",
        help="Move files into output (removes from source tree; cannot be used with --dry-run meaningfully for safety)",
    )
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if args.out is None:
        args.out = here / ("organized_by_date" if args.by_date else "organized")

    legs: list[Leg] | None = None
    if args.by_date:
        tz_name = args.timezone or "Europe/Tirane"
        try:
            tz = ZoneInfo(tz_name)
        except Exception:
            print(f"Bad timezone {tz_name!r}; using UTC", file=sys.stderr)
            tz = ZoneInfo("UTC")
    else:
        if not args.itinerary.is_file():
            fallback = args.itinerary.parent / "itinerary.example.json"
            if fallback.is_file():
                print(f"Using {fallback} (create itinerary.json to customize)", file=sys.stderr)
                args.itinerary = fallback
            else:
                print(
                    f"Missing {args.itinerary}. Use --by-date or copy itinerary.example.json.",
                    file=sys.stderr,
                )
                sys.exit(1)

        file_tz, legs = load_itinerary(args.itinerary)
        tz_name = args.timezone or file_tz or "UTC"
        try:
            tz = ZoneInfo(tz_name)
        except Exception:
            print(f"Bad timezone {tz_name!r}; using UTC", file=sys.stderr)
            tz = ZoneInfo("UTC")

    cache_path = args.out / ".geocode_cache.json"
    cache: dict[str, str] = {}
    if cache_path.is_file():
        cache = json.loads(cache_path.read_text(encoding="utf-8"))

    exts = {
        ".jpg",
        ".jpeg",
        ".heic",
        ".heif",
        ".png",
        ".tif",
        ".tiff",
        ".bmp",
        ".mov",
        ".mp4",
        ".m4v",
        ".pdf",
    }

    args.out.mkdir(parents=True, exist_ok=True)
    geocode_agent = "TripPhotoOrganizer/1.0 (personal use; adjust if public)"

    candidates = sorted(
        p
        for p in args.src.rglob("*")
        if p.is_file() and p.name != ".DS_Store" and p.suffix.lower() in exts
    )

    count = 0
    for path in candidates:
        meta = parse_mdls(path)
        raw_date = meta.get("kMDItemContentCreationDate", "")
        cre = parse_creation(raw_date)
        if cre is None:
            local_d = None
        else:
            if cre.tzinfo is None:
                cre = cre.replace(tzinfo=ZoneInfo("UTC"))
            local_d = cre.astimezone(tz).date()

        lat = parse_float(meta.get("kMDItemLatitude", ""))
        lon = parse_float(meta.get("kMDItemLongitude", ""))

        if args.by_date:
            if local_d is None:
                top_dir = "no_date"
            else:
                top_dir = local_d.strftime("%d-%m-%Y")
        else:
            assert legs is not None
            if local_d is None:
                top_dir = "99_no_date"
            else:
                leg = pick_leg(legs, local_d)
                if leg is None:
                    top_dir = f"98_unmatched_date_{local_d.strftime('%d-%m-%Y')}"
                else:
                    top_dir = f"{leg.sort_index + 1:02d}_{safe_name(leg.label)}"

        rel_within_src = path.relative_to(args.src)
        if args.by_date:
            dest = args.out / top_dir / rel_within_src
        else:
            if lat is None or lon is None:
                loc_dir = "_no_gps"
            elif args.no_geocode:
                loc_dir = safe_name(f"lat{lat:.2f}_lon{lon:.2f}")
            else:
                loc_dir = reverse_geocode(lat, lon, cache, geocode_agent, 1.05)
            dest = args.out / top_dir / loc_dir / rel_within_src
        dest.parent.mkdir(parents=True, exist_ok=True)

        if args.dry_run:
            print(f"{path} -> {dest}")
            count += 1
            continue

        if dest.exists() or dest.is_symlink():
            dest.unlink()
        if args.move:
            shutil.move(str(path), str(dest))
        elif args.copy:
            shutil.copy2(path, dest)
        else:
            try:
                dest.symlink_to(path.resolve())
            except OSError:
                shutil.copy2(path, dest)
        count += 1

    if args.move and not args.dry_run:
        for d in sorted(args.src.rglob("*"), key=lambda p: len(p.parts), reverse=True):
            if d.is_dir():
                try:
                    d.rmdir()
                except OSError:
                    pass

    if not args.dry_run:
        if not args.by_date:
            cache_path.write_text(json.dumps(cache, indent=2, sort_keys=True), encoding="utf-8")

    mode = "moved" if args.move else ("copied" if args.copy else "linked")
    print(f"Done. {count} files {mode}. Output: {args.out}")


if __name__ == "__main__":
    main()
