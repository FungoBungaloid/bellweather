#!/usr/bin/env python3
"""
morning_run.py — the closed loop, unattended.  (Run by GitHub Actions on a cron.)

  1. Pulls the live Open-Meteo forecast for every metro.
  2. Writes data/forecast_snapshot.json  (graceful-failure cache for the app).
  3. Computes the demand field + diagnosis (a faithful port of the JS model)
     and prints today's headline alert.
  4. If SLACK_WEBHOOK_URL is set in the environment, posts the headline to Slack
     — proving Bellwether can act "with no human in the middle".

Stdlib only.
"""
import json
import math
import os
import sys
import urllib.parse
import urllib.request
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
FLIGHT_BUDGET = 2_000_000


def load(name):
    return json.load(open(os.path.join(DATA, name)))


def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Bellwether/1.0 (morning_run)"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def fetch_forecast(cities):
    lats = ",".join(str(m["lat"]) for m in cities)
    lons = ",".join(str(m["lon"]) for m in cities)
    q = urllib.parse.urlencode({
        "latitude": lats, "longitude": lons,
        "daily": "temperature_2m_max,precipitation_sum",
        "forecast_days": 7, "temperature_unit": "celsius", "timezone": "auto",
    })
    arr = get_json("https://api.open-meteo.com/v1/forecast?" + q)
    if not isinstance(arr, list):
        arr = [arr]
    return arr


def doy(iso):
    y, m, d = map(int, iso.split("-"))
    return (date(y, m, d) - date(y, 1, 1)).days + 1


def main():
    cities = load("cities.json")
    plan = load("media_plan.json")
    normals = load("normals.json")
    coef = load("coefficients.json")

    try:
        arr = fetch_forecast(cities)
        source = "live"
        daily_by_id = {cities[i]["id"]: arr[i]["daily"]
                       for i in range(min(len(cities), len(arr)))}
    except Exception as e:
        print(f"Live forecast failed ({e}); reusing existing snapshot.", file=sys.stderr)
        snap = load("forecast_snapshot.json")
        daily_by_id = snap["byId"]
        source = "snapshot"

    dates = next(iter(daily_by_id.values()))["time"]

    # write snapshot (graceful-failure cache), keyed by city id
    by_id = {}
    for cid, d in daily_by_id.items():
        n = len(d["time"])
        by_id[cid] = {
            "time": d["time"],
            "temperature_2m_max": d["temperature_2m_max"],
            "precipitation_sum": d.get("precipitation_sum", [0] * n),
        }
    snap = {"generated_at": date.today().isoformat(), "source": source, "byId": by_id}
    json.dump(snap, open(os.path.join(DATA, "forecast_snapshot.json"), "w"),
              separators=(",", ":"))
    print(f"Wrote forecast_snapshot.json ({source}, {len(by_id)} cities, {len(dates)} days)")

    # demand field + diagnosis per category, pick the punchiest day worldwide
    best = None
    for cat_id, cat in coef["categories"].items():
        e = cat["elasticity"]
        for di, dstr in enumerate(dates):
            d = doy(dstr)
            field = []
            for m in cities:
                dd = by_id.get(m["id"])
                if not dd or m["id"] not in normals:
                    continue
                t = dd["temperature_2m_max"][di]
                normal = normals[m["id"]]["temperature_2m_max"][min(365, d - 1)]
                anom = t - normal
                field.append({"m": m, "tmax": t, "anom": anom, "value": e * anom})
            diag = diagnose(field, plan)
            score = diag["headline"]["score"] if diag["headline"] else 0
            if best is None or score > best["score"]:
                best = {"score": score, "cat": cat, "cat_id": cat_id, "day": dstr, "diag": diag}

    h = best["diag"]["headline"]
    s = best["diag"]["source"]
    msg = (
        f"⚠️ {('Heat' if h['value']>=0 else 'Cold')} front → {h['m']['name']}, {best['day']} "
        f"({best['cat']['label']})\n"
        f"Projected demand {h['value']:+.0f}% vs normal "
        f"({round(h['tmax']*9/5+32)}°F, {h['anom']:+.1f}°C anomaly).\n"
        + (f"Move ${best['diag']['reallocation']:,}: {s['m']['name']} → {h['m']['name']}\n" if s else
           f"Shift ${best['diag']['reallocation']:,} into {h['m']['name']}\n")
        + f"Owner: {plan[h['m']['id']]['buyer_name']} {plan[h['m']['id']].get('buyer_handle','')}"
    )
    print("\n--- HEADLINE ALERT ---\n" + msg + "\n----------------------")

    hook = os.environ.get("SLACK_WEBHOOK_URL")
    if hook:
        body = json.dumps({"text": msg}).encode()
        req = urllib.request.Request(hook, data=body, headers={"Content-Type": "application/json"})
        try:
            urllib.request.urlopen(req, timeout=30)
            print("Posted headline to Slack.")
        except Exception as e:
            print(f"Slack post failed: {e}", file=sys.stderr)
    else:
        print("SLACK_WEBHOOK_URL not set — skipping Slack post (snapshot still refreshed).")


def diagnose(field, plan):
    relu = lambda x: x if x > 0 else 0
    val_raw = {}
    vsum = 0.0
    for p in field:
        v = p["m"]["population"] ** 0.65
        val_raw[p["m"]["id"]] = v
        vsum += v
    value = lambda i: val_raw[i] / vsum

    raw = {}
    rsum = 0.0
    for p in field:
        raw[p["m"]["id"]] = value(p["m"]["id"]) * relu(p["value"])
        rsum += raw[p["m"]["id"]]
    flat = rsum < 1e-9

    rows = []
    for p in field:
        i = p["m"]["id"]
        cw = plan.get(i, {}).get("current_weight", 0)
        tw = value(i) if flat else raw[i] / rsum
        move = tw - cw
        dollars = move * FLIGHT_BUDGET
        if p["value"] > 1 and move > 0:
            kind = "surge_underweight"
        elif move < 0:
            kind = "slump_overweight"
        else:
            kind = "aligned"
        rows.append({**p, "current_weight": cw, "target_weight": tw, "move": move,
                     "dollars": dollars, "kind": kind,
                     "score": abs(dollars) * (0.5 + value(i))})

    push = sorted([r for r in rows if r["kind"] == "surge_underweight"],
                  key=lambda r: -r["dollars"])
    pull = sorted([r for r in rows if r["kind"] == "slump_overweight"],
                  key=lambda r: r["dollars"])
    ranked = sorted(rows, key=lambda r: -r["score"])
    headline = push[0] if push else (ranked[0] if ranked else None)
    source = pull[0] if pull else None
    realloc = (min(headline["dollars"], -source["dollars"]) if source else headline["dollars"]) if headline else 0
    return {"headline": headline, "source": source,
            "reallocation": max(0, round(realloc))}


if __name__ == "__main__":
    main()
