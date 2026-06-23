#!/usr/bin/env python3
"""
calibrate.py — BUILD-TIME calibration for Bellwether.  (Never runs in the browser.)

For each product category it:
  1. Fetches daily Wikipedia pageviews for a proxy article (demand attention proxy).
  2. Fetches daily historical max temperature (ERA5) for a basket of reference cities.
  3. Deseasonalises both series (subtract day-of-year mean) to isolate the
     weather-driven residual.
  4. Regresses demand residual ~ temperature anomaly  ->  elasticity (slope) + r2.
  5. Writes data/coefficients.json (elasticity, r2, direction, scatter sample).

It also computes per-metro climatological normals (day-of-year mean daily max)
from ~5 years of ERA5 and writes data/normals.json.

Usage:
    pip install requests numpy
    python scripts/calibrate.py                 # all categories, default window
    python scripts/calibrate.py --years 5

Honesty notes (surface these, don't hide them):
  * Pageviews are a DEMAND PROXY, not sales.
  * Elasticity is a national average applied per-metro to the local anomaly.
  * If a category's r2 is weak (<0.3), swap the proxy article (see CANDIDATES).
"""
import argparse
import json
import math
import os
import sys
import time
from datetime import date, timedelta

try:
    import requests
except ImportError:
    sys.exit("Install deps first:  pip install requests numpy")
try:
    import numpy as np
except ImportError:
    sys.exit("Install deps first:  pip install requests numpy")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
UA = "Bellwether/1.0 (hackathon; nathaniel.jeffrey@gmail.com)"

# Reference basket for the *national* demand<->weather regression.
REFERENCE_CITIES = [
    ("New York", 40.71, -74.01),
    ("Los Angeles", 34.05, -118.24),
    ("Chicago", 41.88, -87.63),
    ("Houston", 29.76, -95.37),
    ("Atlanta", 33.75, -84.39),
    ("Denver", 39.74, -104.99),
    ("Seattle", 47.61, -122.33),
    ("Miami", 25.76, -80.19),
]

# Category -> (label, driver var, expected direction, candidate proxy articles).
# MUST stay in sync with the product ids in data/categories.json (the gallery);
# calibration keeps the best-r² proxy from each candidate list and overwrites
# data/coefficients.json. All lines are temperature-driven.
CATEGORIES = {
    # heat-driven (positive elasticity)
    "ice_cream": ("Ice Cream", "temperature_2m_max", "positive",
                  ["Ice_cream", "Gelato", "Soft_serve"]),
    "freezer_pops": ("Freezer Pops", "temperature_2m_max", "positive",
                     ["Ice_pop", "Popsicle", "Ice_cream"]),
    "cold_brew": ("Cold Brew Coffee", "temperature_2m_max", "positive",
                  ["Iced_coffee", "Cold_brew_coffee", "Frappé_coffee"]),
    "electrolyte": ("Electrolyte Mix", "temperature_2m_max", "positive",
                    ["Sports_drink", "Gatorade", "Electrolyte"]),
    "sparkling": ("Sparkling Water", "temperature_2m_max", "positive",
                  ["Carbonated_water", "Sparkling_water", "Club_soda"]),
    "sunscreen": ("Sunscreen", "temperature_2m_max", "positive",
                  ["Sunscreen", "Sunburn", "Sun_tanning"]),
    "swimwear": ("Swimwear", "temperature_2m_max", "positive",
                 ["Swimsuit", "Swimwear", "Bikini"]),
    "bug_spray": ("Insect Repellent", "temperature_2m_max", "positive",
                  ["Insect_repellent", "Mosquito", "DEET"]),
    "portable_ac": ("Portable AC", "temperature_2m_max", "positive",
                    ["Air_conditioning", "Heat_wave", "Evaporative_cooler"]),
    "garden_centre": ("Garden Centre", "temperature_2m_max", "positive",
                      ["Gardening", "Garden_centre", "Vegetable_gardening"]),
    # cold-driven (negative elasticity)
    "soup": ("Soup", "temperature_2m_max", "negative",
             ["Soup", "Stew", "Broth"]),
    "hot_cocoa": ("Hot Cocoa", "temperature_2m_max", "negative",
                  ["Hot_chocolate", "Mulled_wine", "Cocoa_solids"]),
    "herbal_tea": ("Herbal Tea", "temperature_2m_max", "negative",
                   ["Herbal_tea", "Tea", "Masala_chai"]),
    "lip_balm": ("Lip Balm", "temperature_2m_max", "negative",
                 ["Lip_balm", "Chapped_lips", "Lip_gloss"]),
    "slow_cooker": ("Slow Cooker", "temperature_2m_max", "negative",
                    ["Slow_cooker", "Casserole", "Pot_roast"]),
    "firewood": ("Firewood & Logs", "temperature_2m_max", "negative",
                 ["Firewood", "Fireplace", "Wood_fuel"]),
}


def daterange(years):
    end = date.today() - timedelta(days=5)        # ERA5 has a short lag
    start = end - timedelta(days=int(365.25 * years))
    return start, end


def fetch_pageviews(article, start, end):
    url = ("https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/"
           f"en.wikipedia/all-access/all-agents/{article}/daily/"
           f"{start:%Y%m%d}/{end:%Y%m%d}")
    r = requests.get(url, headers={"User-Agent": UA}, timeout=60)
    r.raise_for_status()
    items = r.json().get("items", [])
    out = {}
    for it in items:
        ts = it["timestamp"][:8]
        out[date(int(ts[:4]), int(ts[4:6]), int(ts[6:8]))] = float(it["views"])
    return out


def fetch_archive_tmax(lat, lon, start, end, driver):
    url = "https://archive-api.open-meteo.com/v1/archive"
    params = {
        "latitude": lat, "longitude": lon,
        "start_date": start.isoformat(), "end_date": end.isoformat(),
        "daily": driver, "temperature_unit": "celsius", "timezone": "UTC",
    }
    r = requests.get(url, params=params, timeout=120)
    r.raise_for_status()
    d = r.json()["daily"]
    out = {}
    for t, v in zip(d["time"], d[driver]):
        if v is None:
            continue
        y, m, dd = map(int, t.split("-"))
        out[date(y, m, dd)] = float(v)
    return out


def deseasonalize(series):
    """series: dict[date->value] -> dict[date->residual] (minus day-of-year mean)."""
    by_doy = {}
    for d, v in series.items():
        by_doy.setdefault(d.timetuple().tm_yday, []).append(v)
    doy_mean = {k: float(np.mean(v)) for k, v in by_doy.items()}
    return {d: v - doy_mean[d.timetuple().tm_yday] for d, v in series.items()}, doy_mean


def regress(x, y):
    x = np.asarray(x); y = np.asarray(y)
    A = np.vstack([x, np.ones_like(x)]).T
    slope, intercept = np.linalg.lstsq(A, y, rcond=None)[0]
    pred = slope * x + intercept
    ss_res = float(np.sum((y - pred) ** 2))
    ss_tot = float(np.sum((y - np.mean(y)) ** 2))
    r2 = 1 - ss_res / ss_tot if ss_tot > 0 else 0.0
    return float(slope), float(r2)


def calibrate_category(cat_id, meta, start, end):
    label, driver, direction, candidates = meta
    print(f"\n== {label} ({cat_id}) ==")

    # Weather anomaly: average deseasonalised tmax across the reference basket.
    temp_resid_by_date = {}
    counts = {}
    for name, lat, lon in REFERENCE_CITIES:
        print(f"   archive {name} ...")
        raw = fetch_archive_tmax(lat, lon, start, end, driver)
        resid, _ = deseasonalize(raw)
        for d, v in resid.items():
            temp_resid_by_date[d] = temp_resid_by_date.get(d, 0.0) + v
            counts[d] = counts.get(d, 0) + 1
        time.sleep(0.5)
    temp_anom = {d: temp_resid_by_date[d] / counts[d] for d in temp_resid_by_date}

    best = None
    for article in candidates:
        print(f"   pageviews {article} ...")
        try:
            pv = fetch_pageviews(article, start, end)
        except Exception as e:
            print(f"      skip ({e})")
            continue
        # log pageviews tame heavy-tailed spikes, then deseasonalise.
        pv_log = {d: math.log(v + 1) for d, v in pv.items()}
        pv_resid, _ = deseasonalize(pv_log)
        common = sorted(set(pv_resid) & set(temp_anom))
        if len(common) < 200:
            print(f"      only {len(common)} overlapping days, skip")
            continue
        x = [temp_anom[d] for d in common]
        # express demand residual in % (resid of log ~ fractional change) * 100
        y = [pv_resid[d] * 100 for d in common]
        slope, r2 = regress(x, y)
        print(f"      elasticity={slope:+.2f} %/°C   r2={r2:.3f}   n={len(common)}")
        cand = (article, slope, r2, x, y)
        if best is None or r2 > best[2]:
            best = cand
        time.sleep(0.3)

    if best is None:
        raise RuntimeError(f"No usable proxy for {cat_id}")
    article, slope, r2, x, y = best
    # downsample scatter to ~150 points
    idx = np.linspace(0, len(x) - 1, min(150, len(x))).astype(int)
    scatter = [[round(float(x[i]), 2), round(float(y[i]), 2)] for i in idx]
    print(f"   -> chose {article}: elasticity={slope:+.2f} r2={r2:.3f}")
    return {
        "label": label, "proxy_article": article, "driver": driver,
        "elasticity": round(slope, 3), "r2": round(r2, 3),
        "direction": "positive" if slope >= 0 else "negative",
        "n_days": len(x), "scatter": scatter,
    }


def build_normals(years):
    """Per-city day-of-year mean daily max from ERA5 -> data/normals.json.
    Reads the global city list written by gen_demo_data.py."""
    start, end = daterange(years)
    cities = json.load(open(os.path.join(DATA, "cities.json")))
    normals = {}
    for m in cities:
        print(f"   normals {m['name']} ...")
        raw = fetch_archive_tmax(m["lat"], m["lon"], start, end, "temperature_2m_max")
        by_doy = {}
        for d, v in raw.items():
            by_doy.setdefault(d.timetuple().tm_yday, []).append(v)
        series = []
        for doy in range(1, 367):
            vals = by_doy.get(doy) or by_doy.get(365 if doy == 366 else doy) or [0.0]
            series.append(round(float(np.mean(vals)), 2))
        normals[m["id"]] = {"temperature_2m_max": series}
        time.sleep(0.4)
    json.dump(normals, open(os.path.join(DATA, "normals.json"), "w"),
              separators=(",", ":"))
    print(f"   wrote normals.json ({len(normals)} cities)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", type=float, default=5)
    ap.add_argument("--skip-normals", action="store_true")
    args = ap.parse_args()
    start, end = daterange(args.years)
    print(f"Window: {start} .. {end}")

    cats = {}
    for cat_id, meta in CATEGORIES.items():
        cats[cat_id] = calibrate_category(cat_id, meta, start, end)

    out = {"generated_at": date.today().isoformat(), "categories": cats}
    json.dump(out, open(os.path.join(DATA, "coefficients.json"), "w"),
              separators=(",", ":"))
    print(f"\nWrote coefficients.json")

    if not args.skip_normals:
        print("\nBuilding climatological normals ...")
        build_normals(args.years)
    print("\nDone. Reload the app to see calibrated values.")


if __name__ == "__main__":
    main()
