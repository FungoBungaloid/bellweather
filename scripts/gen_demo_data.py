#!/usr/bin/env python3
"""
gen_demo_data.py — generate the seed/demo data files for Bellwether.

This produces *plausible* data so the app runs end-to-end with zero setup:
  data/metros.json
  data/media_plan.json
  data/categories.json
  data/coefficients.json      (placeholder elasticities + synthetic scatter)
  data/normals.json           (synthetic climatological day-of-year normals)
  data/forecast_snapshot.json (offline fallback forecast)

The REAL calibration of elasticity/r2/normals from historical data lives in
scripts/calibrate.py and overwrites coefficients.json + normals.json. This
script only exists so the demo never depends on a network call having run.

Stdlib only — no numpy/pandas required.
"""
import json
import math
import os
import random
from datetime import date, timedelta

random.seed(42)  # deterministic demo

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
os.makedirs(DATA, exist_ok=True)

# name, state, lat, lon, population, tmax_mean(°C ann. avg daily high), tmax_amp(°C seasonal amplitude)
METROS = [
    ("New York", "NY", 40.71, -74.01, 18800000, 17.0, 12.5),
    ("Los Angeles", "CA", 34.05, -118.24, 12500000, 24.0, 5.0),
    ("Chicago", "IL", 41.88, -87.63, 9500000, 15.0, 15.0),
    ("Houston", "TX", 29.76, -95.37, 7100000, 27.5, 9.0),
    ("Phoenix", "AZ", 33.45, -112.07, 4900000, 31.0, 12.0),
    ("Philadelphia", "PA", 39.95, -75.16, 6200000, 18.5, 13.0),
    ("San Antonio", "TX", 29.42, -98.49, 2600000, 28.5, 9.5),
    ("San Diego", "CA", 32.72, -117.16, 3300000, 22.0, 4.0),
    ("Dallas", "TX", 32.78, -96.80, 7600000, 26.0, 12.0),
    ("Atlanta", "GA", 33.75, -84.39, 6100000, 22.5, 10.0),
    ("Seattle", "WA", 47.61, -122.33, 4000000, 16.0, 8.0),
    ("Denver", "CO", 39.74, -104.99, 2960000, 18.0, 13.0),
    ("Miami", "FL", 25.76, -80.19, 6200000, 29.0, 4.0),
    ("Minneapolis", "MN", 44.98, -93.27, 3700000, 13.0, 16.5),
    ("Boston", "MA", 42.36, -71.06, 4900000, 16.0, 13.0),
    ("Detroit", "MI", 42.33, -83.05, 4300000, 15.0, 14.0),
    ("Portland", "OR", 45.52, -122.68, 2500000, 18.0, 9.5),
    ("Las Vegas", "NV", 36.17, -115.14, 2300000, 28.0, 13.5),
    ("Charlotte", "NC", 35.23, -80.84, 2700000, 22.5, 11.0),
    ("Nashville", "TN", 36.16, -86.78, 2000000, 22.0, 11.5),
    ("Kansas City", "MO", 39.10, -94.58, 2200000, 19.0, 14.5),
    ("St. Louis", "MO", 38.63, -90.20, 2800000, 20.0, 13.5),
    ("Salt Lake City", "UT", 40.76, -111.89, 1250000, 18.0, 14.0),
    ("Tampa", "FL", 27.95, -82.46, 3200000, 28.0, 5.0),
    ("Orlando", "FL", 28.54, -81.38, 2700000, 29.0, 5.0),
    ("Pittsburgh", "PA", 40.44, -79.996, 2300000, 16.5, 13.0),
    ("Cincinnati", "OH", 39.10, -84.51, 2200000, 18.0, 13.5),
    ("Cleveland", "OH", 41.50, -81.69, 2050000, 15.0, 13.5),
    ("Indianapolis", "IN", 39.77, -86.16, 2050000, 17.0, 14.0),
    ("Columbus", "OH", 39.96, -83.00, 2150000, 17.5, 13.5),
    ("Milwaukee", "WI", 43.04, -87.91, 1570000, 13.5, 15.0),
    ("Oklahoma City", "OK", 35.47, -97.52, 1400000, 23.0, 13.0),
    ("New Orleans", "LA", 29.95, -90.07, 1270000, 27.0, 7.0),
    ("Memphis", "TN", 35.15, -90.05, 1340000, 23.0, 12.0),
    ("Raleigh", "NC", 35.78, -78.64, 1400000, 22.5, 11.0),
    ("Sacramento", "CA", 38.58, -121.49, 2400000, 24.0, 9.5),
    ("San Francisco", "CA", 37.77, -122.42, 4700000, 18.0, 3.0),
    ("Albuquerque", "NM", 35.08, -106.65, 920000, 22.0, 13.0),
    ("Austin", "TX", 30.27, -97.74, 2300000, 27.0, 10.0),
    ("Jacksonville", "FL", 30.33, -81.66, 1600000, 27.0, 7.0),
    ("Boise", "ID", 43.62, -116.20, 750000, 18.0, 14.5),
    ("Omaha", "NE", 41.26, -95.93, 970000, 17.0, 15.5),
]

# Buyer roster — assigned deterministically per metro.
FIRST = ["Jordan", "Priya", "Marcus", "Elena", "Devon", "Sofia", "Aaron", "Maya",
         "Liam", "Nadia", "Theo", "Grace", "Omar", "Ruth", "Cole", "Ines",
         "Felix", "Dana", "Hugo", "Lena", "Sam", "Tara"]
LAST = ["Reyes", "Okafor", "Bauer", "Nguyen", "Castellano", "Mbeki", "Walsh",
        "Petrova", "Kane", "Haddad", "Lindqvist", "Osei", "Romano", "Fischer"]


def doy_normal(tmax_mean, tmax_amp, doy):
    """Synthetic climatological daily-max normal for a day-of-year (1..366).
    Peak ~ July 22 (doy 203). Small smooth wobble for realism."""
    phase = 2 * math.pi * (doy - 203) / 365.25
    base = tmax_mean + tmax_amp * math.cos(phase)
    wobble = 0.6 * math.sin(2 * math.pi * doy / 18.0)  # gentle sub-seasonal texture
    return round(base + wobble, 2)


def build_metros_and_plan():
    metros = []
    plan = {}
    # Misaligned media plan: over-weight cool/coastal, under-weight hot interior,
    # so the diagnosis layer surfaces real gaps in summer.
    raw = {}
    for i, (name, st, lat, lon, pop, tmean, tamp) in enumerate(METROS):
        mid = name.lower().replace(" ", "_").replace(".", "")
        metros.append({
            "id": mid, "name": name, "state": st,
            "lat": lat, "lon": lon, "population": pop,
        })
        # cool bias: cooler annual-high metros get a heavier (deliberately wrong) weight
        cool_bias = max(0.45, min(1.9, 1.7 - (tmean - 15.0) / 18.0))
        raw[mid] = (pop ** 0.6) * cool_bias
    total = sum(raw.values())
    for i, (name, st, lat, lon, pop, tmean, tamp) in enumerate(METROS):
        mid = name.lower().replace(" ", "_").replace(".", "")
        buyer = f"{FIRST[i % len(FIRST)]} {LAST[i % len(LAST)]}"
        plan[mid] = {
            "current_weight": round(raw[mid] / total, 5),
            "buyer_name": buyer,
            "buyer_handle": "@" + FIRST[i % len(FIRST)].lower(),
        }
    # re-normalise weights to exactly 1.0 (rounding drift)
    s = sum(p["current_weight"] for p in plan.values())
    for p in plan.values():
        p["current_weight"] = round(p["current_weight"] / s, 5)
    return metros, plan


def build_normals():
    normals = {}
    for (name, st, lat, lon, pop, tmean, tamp) in METROS:
        mid = name.lower().replace(" ", "_").replace(".", "")
        normals[mid] = {
            "temperature_2m_max": [doy_normal(tmean, tamp, d) for d in range(1, 367)]
        }
    return normals


def synth_scatter(elasticity, r2, n=150, xspread=8.0):
    """Generate (anomaly, residual) points whose OLS fit ~ elasticity with ~r2."""
    sig_var = (elasticity ** 2) * (xspread ** 2)
    noise_var = sig_var * (1 - r2) / max(r2, 1e-6)
    noise_sd = math.sqrt(noise_var)
    pts = []
    for _ in range(n):
        x = random.gauss(0, xspread)
        y = elasticity * x + random.gauss(0, noise_sd)
        pts.append([round(x, 2), round(y, 2)])
    return pts


def build_coefficients():
    return {
        "generated_at": date.today().isoformat(),
        "note": "SEED data from gen_demo_data.py. Run scripts/calibrate.py to replace with real calibrated values.",
        "categories": {
            "cold_refreshment": {
                "label": "Cold Refreshment",
                "proxy_article": "Ice_cream",
                "driver": "temperature_2m_max",
                "elasticity": 1.84,
                "r2": 0.68,
                "direction": "positive",
                "n_days": 1825,
                "scatter": synth_scatter(1.84, 0.68),
            },
            "warm_comfort": {
                "label": "Warm Comfort",
                "proxy_article": "Soup",
                "driver": "temperature_2m_max",
                "elasticity": -1.46,
                "r2": 0.55,
                "direction": "negative",
                "n_days": 1825,
                "scatter": synth_scatter(-1.46, 0.55),
            },
        },
    }


def build_categories():
    return {
        "cold_refreshment": {
            "id": "cold_refreshment",
            "label": "Cold Refreshment",
            "tagline": "Ice cream, cold brew, sparkling — demand climbs as heat departs above normal.",
            "creative_angle": "Lean into the heat: \"Beat the {temp_f}° spike.\" Push chilled, on-the-go, impulse occasions. Day-part toward afternoon peak.",
            "accent": "#e4572e",
            "icon": "☀️",
        },
        "warm_comfort": {
            "id": "warm_comfort",
            "label": "Warm Comfort",
            "tagline": "Soup, hot drinks, comfort food — demand rises when it turns colder than normal.",
            "creative_angle": "Sell warmth and comfort: \"When it turns, we're ready.\" Evening and weekend dwell-time occasions, cozy at-home messaging.",
            "accent": "#2e86ab",
            "icon": "🍵",
        },
    }


def build_forecast_snapshot(normals):
    """Offline fallback. Mirrors Open-Meteo batched response shape: an array,
    one object per coordinate, with .daily.{time,temperature_2m_max,precipitation_sum}.
    Built from normals + a smooth synthetic heat front sweeping west→east so the
    demo map is visibly alive even with no network."""
    start = date.today()
    days = 7
    dates = [(start + timedelta(days=k)).isoformat() for k in range(days)]
    doy0 = start.timetuple().tm_yday
    arr = []
    for (name, st, lat, lon, pop, tmean, tamp) in METROS:
        mid = name.lower().replace(" ", "_").replace(".", "")
        tmax = []
        precip = []
        for k in range(days):
            doy = ((doy0 - 1 + k) % 366) + 1
            base = normals[mid]["temperature_2m_max"][doy - 1]
            # Heat front: a warm anomaly bulge that moves eastward each day.
            # front longitude marches from ~ -120 to ~ -70 across the week.
            front_lon = -122 + (52.0 / (days - 1)) * k
            dist = abs(lon - front_lon)
            anom = 7.0 * math.exp(-(dist ** 2) / (2 * 9.0 ** 2))  # +°C near the front
            anom -= 2.0 * math.exp(-((lon - (front_lon - 22)) ** 2) / (2 * 9.0 ** 2))  # cool behind
            t = base + anom + random.gauss(0, 0.6)
            tmax.append(round(t, 1))
            precip.append(round(max(0.0, random.gauss(1.2, 2.0)) if anom < 0 else max(0.0, random.gauss(0.4, 1.0)), 1))
        arr.append({
            "latitude": lat, "longitude": lon,
            "timezone": "auto",
            "daily": {
                "time": dates,
                "temperature_2m_max": tmax,
                "precipitation_sum": precip,
            },
        })
    return {"generated_at": start.isoformat(), "source": "synthetic_snapshot", "metros": arr}


def main():
    metros, plan = build_metros_and_plan()
    normals = build_normals()
    write("metros.json", metros)
    write("media_plan.json", plan)
    write("categories.json", build_categories())
    write("coefficients.json", build_coefficients())
    write("normals.json", normals)
    write("forecast_snapshot.json", build_forecast_snapshot(normals))
    print(f"Wrote demo data for {len(metros)} metros to {DATA}")


def write(name, obj):
    path = os.path.join(DATA, name)
    with open(path, "w") as f:
        json.dump(obj, f, separators=(",", ":"))
    print(f"  {name}  ({os.path.getsize(path)//1024} KB)")


if __name__ == "__main__":
    main()
