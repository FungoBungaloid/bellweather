#!/usr/bin/env python3
"""
gen_demo_data.py — generate the seed/demo data files for Bellwether.

Produces *plausible*, deterministic, GLOBAL data so the app runs end-to-end with
zero setup and zero network:
  data/cities.json            (~120 cities worldwide: id, name, country, region, lat, lon, pop)
  data/media_plan.json        (current spend weight + named buyer per city)
  data/categories.json        (the product gallery — ~10 weather-sensitive lines)
  data/coefficients.json      (placeholder elasticities + synthetic scatter per product)
  data/normals.json           (synthetic climatological day-of-year normals per city)
  data/forecast_snapshot.json (offline fallback forecast, keyed by city id)

The REAL calibration of elasticity/r2/normals from historical data lives in
scripts/calibrate.py and overwrites coefficients.json + normals.json. This
script only exists so the demo never depends on a network call having run.

Stdlib only — no numpy/pandas required. Deterministic (seeded).
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

# ---------------------------------------------------------------------------
# Cities. (name, admin, country, cc, region, lat, lon, population, tmean, tamp)
#   admin     : US state, else "" (subtitle falls back to country code)
#   tmean     : annual-average daily-high °C
#   tamp      : seasonal amplitude °C (≈ (summer high − winter high) / 2)
# Northern/southern hemisphere phase is inferred from latitude sign.
# ---------------------------------------------------------------------------
US = "United States"
NA, SA, EU, AF, ME, SAS, EAS, SEA, OC = (
    "North America", "South America", "Europe", "Africa", "Middle East",
    "South Asia", "East Asia", "Southeast Asia", "Oceania",
)

CITIES = [
    # ---- United States (the flagship demo region) ----
    ("New York", "NY", US, "US", NA, 40.71, -74.01, 18800000, 17.0, 12.5),
    ("Los Angeles", "CA", US, "US", NA, 34.05, -118.24, 12500000, 24.0, 5.0),
    ("Chicago", "IL", US, "US", NA, 41.88, -87.63, 9500000, 15.0, 15.0),
    ("Houston", "TX", US, "US", NA, 29.76, -95.37, 7100000, 27.5, 9.0),
    ("Phoenix", "AZ", US, "US", NA, 33.45, -112.07, 4900000, 31.0, 12.0),
    ("Philadelphia", "PA", US, "US", NA, 39.95, -75.16, 6200000, 18.5, 13.0),
    ("San Antonio", "TX", US, "US", NA, 29.42, -98.49, 2600000, 28.5, 9.5),
    ("San Diego", "CA", US, "US", NA, 32.72, -117.16, 3300000, 22.0, 4.0),
    ("Dallas", "TX", US, "US", NA, 32.78, -96.80, 7600000, 26.0, 12.0),
    ("Atlanta", "GA", US, "US", NA, 33.75, -84.39, 6100000, 22.5, 10.0),
    ("Seattle", "WA", US, "US", NA, 47.61, -122.33, 4000000, 16.0, 8.0),
    ("Denver", "CO", US, "US", NA, 39.74, -104.99, 2960000, 18.0, 13.0),
    ("Miami", "FL", US, "US", NA, 25.76, -80.19, 6200000, 29.0, 4.0),
    ("Minneapolis", "MN", US, "US", NA, 44.98, -93.27, 3700000, 13.0, 16.5),
    ("Boston", "MA", US, "US", NA, 42.36, -71.06, 4900000, 16.0, 13.0),
    ("Detroit", "MI", US, "US", NA, 42.33, -83.05, 4300000, 15.0, 14.0),
    ("Portland", "OR", US, "US", NA, 45.52, -122.68, 2500000, 18.0, 9.5),
    ("Las Vegas", "NV", US, "US", NA, 36.17, -115.14, 2300000, 28.0, 13.5),
    ("Charlotte", "NC", US, "US", NA, 35.23, -80.84, 2700000, 22.5, 11.0),
    ("Nashville", "TN", US, "US", NA, 36.16, -86.78, 2000000, 22.0, 11.5),
    ("Kansas City", "MO", US, "US", NA, 39.10, -94.58, 2200000, 19.0, 14.5),
    ("St. Louis", "MO", US, "US", NA, 38.63, -90.20, 2800000, 20.0, 13.5),
    ("Salt Lake City", "UT", US, "US", NA, 40.76, -111.89, 1250000, 18.0, 14.0),
    ("Tampa", "FL", US, "US", NA, 27.95, -82.46, 3200000, 28.0, 5.0),
    ("Orlando", "FL", US, "US", NA, 28.54, -81.38, 2700000, 29.0, 5.0),
    ("Pittsburgh", "PA", US, "US", NA, 40.44, -79.996, 2300000, 16.5, 13.0),
    ("Cincinnati", "OH", US, "US", NA, 39.10, -84.51, 2200000, 18.0, 13.5),
    ("Cleveland", "OH", US, "US", NA, 41.50, -81.69, 2050000, 15.0, 13.5),
    ("Indianapolis", "IN", US, "US", NA, 39.77, -86.16, 2050000, 17.0, 14.0),
    ("Columbus", "OH", US, "US", NA, 39.96, -83.00, 2150000, 17.5, 13.5),
    ("Milwaukee", "WI", US, "US", NA, 43.04, -87.91, 1570000, 13.5, 15.0),
    ("Oklahoma City", "OK", US, "US", NA, 35.47, -97.52, 1400000, 23.0, 13.0),
    ("New Orleans", "LA", US, "US", NA, 29.95, -90.07, 1270000, 27.0, 7.0),
    ("Memphis", "TN", US, "US", NA, 35.15, -90.05, 1340000, 23.0, 12.0),
    ("Raleigh", "NC", US, "US", NA, 35.78, -78.64, 1400000, 22.5, 11.0),
    ("Sacramento", "CA", US, "US", NA, 38.58, -121.49, 2400000, 24.0, 9.5),
    ("San Francisco", "CA", US, "US", NA, 37.77, -122.42, 4700000, 18.0, 3.0),
    ("Albuquerque", "NM", US, "US", NA, 35.08, -106.65, 920000, 22.0, 13.0),
    ("Austin", "TX", US, "US", NA, 30.27, -97.74, 2300000, 27.0, 10.0),
    ("Jacksonville", "FL", US, "US", NA, 30.33, -81.66, 1600000, 27.0, 7.0),
    ("Boise", "ID", US, "US", NA, 43.62, -116.20, 750000, 18.0, 14.5),
    ("Omaha", "NE", US, "US", NA, 41.26, -95.93, 970000, 17.0, 15.5),
    # ---- North America (non-US) ----
    ("Toronto", "", "Canada", "CA", NA, 43.65, -79.38, 6200000, 12.5, 14.5),
    ("Vancouver", "", "Canada", "CA", NA, 49.28, -123.12, 2600000, 13.5, 8.0),
    ("Montreal", "", "Canada", "CA", NA, 45.50, -73.57, 4200000, 11.0, 16.0),
    ("Mexico City", "", "Mexico", "MX", NA, 19.43, -99.13, 21800000, 24.0, 4.0),
    ("Guadalajara", "", "Mexico", "MX", NA, 20.67, -103.35, 5200000, 27.0, 5.0),
    ("Monterrey", "", "Mexico", "MX", NA, 25.69, -100.32, 4700000, 28.0, 9.0),
    # ---- South America ----
    ("São Paulo", "", "Brazil", "BR", SA, -23.55, -46.63, 22000000, 25.0, 4.5),
    ("Rio de Janeiro", "", "Brazil", "BR", SA, -22.91, -43.17, 13500000, 28.0, 4.0),
    ("Buenos Aires", "", "Argentina", "AR", SA, -34.60, -58.38, 15000000, 22.5, 8.0),
    ("Santiago", "", "Chile", "CL", SA, -33.45, -70.67, 7000000, 22.0, 8.5),
    ("Lima", "", "Peru", "PE", SA, -12.05, -77.04, 11000000, 23.0, 4.0),
    ("Bogotá", "", "Colombia", "CO", SA, 4.71, -74.07, 11000000, 19.5, 1.0),
    ("Caracas", "", "Venezuela", "VE", SA, 10.48, -66.90, 2900000, 27.0, 1.5),
    # ---- Europe ----
    ("London", "", "United Kingdom", "GB", EU, 51.51, -0.13, 9500000, 15.0, 8.5),
    ("Paris", "", "France", "FR", EU, 48.86, 2.35, 11000000, 16.0, 9.5),
    ("Berlin", "", "Germany", "DE", EU, 52.52, 13.41, 4500000, 14.0, 11.0),
    ("Madrid", "", "Spain", "ES", EU, 40.42, -3.70, 6700000, 21.0, 11.0),
    ("Barcelona", "", "Spain", "ES", EU, 41.39, 2.17, 5600000, 21.0, 8.0),
    ("Rome", "", "Italy", "IT", EU, 41.90, 12.50, 4300000, 21.0, 9.0),
    ("Milan", "", "Italy", "IT", EU, 45.46, 9.19, 3200000, 18.0, 11.0),
    ("Amsterdam", "", "Netherlands", "NL", EU, 52.37, 4.90, 2500000, 14.0, 9.0),
    ("Vienna", "", "Austria", "AT", EU, 48.21, 16.37, 2800000, 15.0, 11.0),
    ("Zurich", "", "Switzerland", "CH", EU, 47.37, 8.54, 1400000, 14.5, 10.5),
    ("Munich", "", "Germany", "DE", EU, 48.14, 11.58, 2600000, 14.0, 11.0),
    ("Warsaw", "", "Poland", "PL", EU, 52.23, 21.01, 3100000, 13.5, 12.5),
    ("Prague", "", "Czechia", "CZ", EU, 50.08, 14.44, 2700000, 13.5, 11.5),
    ("Stockholm", "", "Sweden", "SE", EU, 59.33, 18.07, 2400000, 10.5, 11.5),
    ("Oslo", "", "Norway", "NO", EU, 59.91, 10.75, 1700000, 9.5, 11.0),
    ("Copenhagen", "", "Denmark", "DK", EU, 55.68, 12.57, 2100000, 11.5, 9.5),
    ("Helsinki", "", "Finland", "FI", EU, 60.17, 24.94, 1500000, 9.0, 12.0),
    ("Dublin", "", "Ireland", "IE", EU, 53.35, -6.26, 2000000, 13.0, 6.5),
    ("Lisbon", "", "Portugal", "PT", EU, 38.72, -9.14, 3000000, 21.0, 7.0),
    ("Athens", "", "Greece", "GR", EU, 37.98, 23.73, 3800000, 23.0, 9.5),
    ("Istanbul", "", "Türkiye", "TR", EU, 41.01, 28.98, 15500000, 18.0, 9.5),
    ("Moscow", "", "Russia", "RU", EU, 55.75, 37.62, 12600000, 10.0, 14.5),
    ("Kyiv", "", "Ukraine", "UA", EU, 50.45, 30.52, 3000000, 13.0, 13.0),
    # ---- Middle East & Africa ----
    ("Dubai", "", "United Arab Emirates", "AE", ME, 25.20, 55.27, 3500000, 33.0, 8.0),
    ("Riyadh", "", "Saudi Arabia", "SA", ME, 24.71, 46.68, 7600000, 33.0, 10.0),
    ("Tel Aviv", "", "Israel", "IL", ME, 32.08, 34.78, 4000000, 25.0, 7.0),
    ("Cairo", "", "Egypt", "EG", AF, 30.04, 31.24, 21300000, 28.0, 8.0),
    ("Lagos", "", "Nigeria", "NG", AF, 6.52, 3.38, 15400000, 31.0, 2.0),
    ("Nairobi", "", "Kenya", "KE", AF, -1.29, 36.82, 4900000, 24.0, 2.0),
    ("Johannesburg", "", "South Africa", "ZA", AF, -26.20, 28.05, 6000000, 22.0, 4.5),
    ("Cape Town", "", "South Africa", "ZA", AF, -33.92, 18.42, 4600000, 21.0, 5.0),
    ("Casablanca", "", "Morocco", "MA", AF, 33.57, -7.59, 3700000, 22.0, 5.5),
    ("Accra", "", "Ghana", "GH", AF, 5.60, -0.19, 2500000, 31.0, 1.5),
    ("Addis Ababa", "", "Ethiopia", "ET", AF, 9.01, 38.76, 5000000, 23.0, 2.0),
    # ---- South Asia ----
    ("Mumbai", "", "India", "IN", SAS, 19.08, 72.88, 21000000, 32.0, 3.0),
    ("Delhi", "", "India", "IN", SAS, 28.61, 77.21, 32000000, 32.0, 8.0),
    ("Bengaluru", "", "India", "IN", SAS, 12.97, 77.59, 13000000, 29.0, 3.0),
    ("Chennai", "", "India", "IN", SAS, 13.08, 80.27, 11000000, 33.0, 3.0),
    ("Karachi", "", "Pakistan", "PK", SAS, 24.86, 67.01, 16000000, 32.0, 5.0),
    ("Dhaka", "", "Bangladesh", "BD", SAS, 23.81, 90.41, 22000000, 31.0, 4.0),
    ("Colombo", "", "Sri Lanka", "LK", SAS, 6.93, 79.86, 5600000, 30.0, 1.5),
    # ---- East Asia ----
    ("Tokyo", "", "Japan", "JP", EAS, 35.68, 139.69, 37000000, 19.0, 11.0),
    ("Osaka", "", "Japan", "JP", EAS, 34.69, 135.50, 19000000, 20.0, 11.0),
    ("Seoul", "", "South Korea", "KR", EAS, 37.57, 126.98, 9700000, 17.0, 14.0),
    ("Beijing", "", "China", "CN", EAS, 39.90, 116.41, 21500000, 18.0, 15.0),
    ("Shanghai", "", "China", "CN", EAS, 31.23, 121.47, 27000000, 21.0, 11.0),
    ("Guangzhou", "", "China", "CN", EAS, 23.13, 113.26, 18700000, 27.0, 6.5),
    ("Shenzhen", "", "China", "CN", EAS, 22.54, 114.06, 17500000, 27.0, 6.0),
    ("Hong Kong", "", "Hong Kong", "HK", EAS, 22.32, 114.17, 7500000, 26.0, 6.0),
    ("Taipei", "", "Taiwan", "TW", EAS, 25.03, 121.57, 7000000, 27.0, 7.0),
    # ---- Southeast Asia ----
    ("Bangkok", "", "Thailand", "TH", SEA, 13.76, 100.50, 10700000, 33.0, 2.5),
    ("Singapore", "", "Singapore", "SG", SEA, 1.35, 103.82, 5900000, 31.0, 1.0),
    ("Jakarta", "", "Indonesia", "ID", SEA, -6.21, 106.85, 11000000, 32.0, 1.5),
    ("Kuala Lumpur", "", "Malaysia", "MY", SEA, 3.14, 101.69, 8000000, 32.0, 1.0),
    ("Manila", "", "Philippines", "PH", SEA, 14.60, 120.98, 13900000, 32.0, 2.5),
    ("Ho Chi Minh City", "", "Vietnam", "VN", SEA, 10.82, 106.63, 9000000, 33.0, 2.5),
    ("Hanoi", "", "Vietnam", "VN", SEA, 21.03, 105.85, 8000000, 28.0, 7.0),
    # ---- Oceania ----
    ("Sydney", "", "Australia", "AU", OC, -33.87, 151.21, 5300000, 22.5, 5.0),
    ("Melbourne", "", "Australia", "AU", OC, -37.81, 144.96, 5100000, 20.0, 6.0),
    ("Brisbane", "", "Australia", "AU", OC, -27.47, 153.03, 2600000, 26.0, 4.5),
    ("Perth", "", "Australia", "AU", OC, -31.95, 115.86, 2100000, 24.5, 7.0),
    ("Auckland", "", "New Zealand", "NZ", OC, -36.85, 174.76, 1700000, 19.0, 4.5),
]

# Buyer roster — assigned deterministically per city.
FIRST = ["Jordan", "Priya", "Marcus", "Elena", "Devon", "Sofia", "Aaron", "Maya",
         "Liam", "Nadia", "Theo", "Grace", "Omar", "Ruth", "Cole", "Ines",
         "Felix", "Dana", "Hugo", "Lena", "Sam", "Tara", "Yuki", "Aria",
         "Mateo", "Noor", "Kai", "Zara"]
LAST = ["Reyes", "Okafor", "Bauer", "Nguyen", "Castellano", "Mbeki", "Walsh",
        "Petrova", "Kane", "Haddad", "Lindqvist", "Osei", "Romano", "Fischer",
        "Tanaka", "Silva", "Khan", "Park"]


def cid(name, cc):
    base = name.lower().replace(" ", "_").replace(".", "").replace("ã", "a").replace("é", "e").replace("ü", "u").replace("ç", "c")
    return f"{base}_{cc.lower()}"


def doy_normal(tmean, tamp, lat, doy):
    """Synthetic climatological daily-max normal for a day-of-year (1..366).
    Northern hemisphere peaks ~ July 22 (doy 203); southern flips by half a year.
    A gentle sub-seasonal wobble adds texture."""
    peak = 203 if lat >= 0 else 203 - 182  # ≈ Jan 21 in the south
    phase = 2 * math.pi * (doy - peak) / 365.25
    base = tmean + tamp * math.cos(phase)
    wobble = 0.6 * math.sin(2 * math.pi * doy / 18.0)
    return round(base + wobble, 2)


def build_cities_and_plan():
    cities = []
    plan = {}
    raw = {}
    for i, (name, admin, country, cc, region, lat, lon, pop, tmean, tamp) in enumerate(CITIES):
        cid_ = cid(name, cc)
        # Per-market day-to-day temperature variability (°C). Coastal/tropical
        # markets (small seasonal amplitude) are far steadier than continental
        # ones — this is what makes a modest anomaly *surprising* in one place
        # and a shrug in another. It powers the non-obvious ranking.
        sigma = round(max(1.6, min(6.0, 1.5 + 0.20 * tamp)), 2)
        cities.append({
            "id": cid_, "name": name,
            "state": admin or cc, "country": country, "cc": cc, "region": region,
            "lat": lat, "lon": lon, "population": pop, "sigma": sigma,
        })
        # Deliberately mis-aligned plan: over-weight cooler markets, under-weight
        # hot ones, so the diagnosis layer surfaces real summer gaps.
        cool_bias = max(0.45, min(1.9, 1.7 - (tmean - 15.0) / 18.0))
        raw[cid_] = (pop ** 0.6) * cool_bias
    total = sum(raw.values())
    for i, (name, admin, country, cc, region, lat, lon, pop, tmean, tamp) in enumerate(CITIES):
        cid_ = cid(name, cc)
        first = FIRST[i % len(FIRST)]
        plan[cid_] = {
            "current_weight": round(raw[cid_] / total, 6),
            "buyer_name": f"{first} {LAST[i % len(LAST)]}",
            "buyer_handle": "@" + first.lower(),
        }
    s = sum(p["current_weight"] for p in plan.values())
    for p in plan.values():
        p["current_weight"] = round(p["current_weight"] / s, 6)
    return cities, plan


def build_normals():
    normals = {}
    for (name, admin, country, cc, region, lat, lon, pop, tmean, tamp) in CITIES:
        normals[cid(name, cc)] = {
            "temperature_2m_max": [doy_normal(tmean, tamp, lat, d) for d in range(1, 367)]
        }
    return normals


# ---------------------------------------------------------------------------
# Product gallery. Each line is weather-sensitive with a real-world proxy article.
# elasticity = % demand change per +1°C anomaly; sign encodes the response.
# Accents are flat riso inks — warm orange family for heat-driven lines, blue
# family for cold-comfort lines (a couple of off-hues for gallery variety).
# ---------------------------------------------------------------------------
# The portfolio of a fictional national house brand — a *universe* of lines, each
# with its own weather signature. Heat-driven lines flush when temperature departs
# ABOVE normal; cold-driven lines flush when it departs BELOW. Every line is
# temperature-driven so the anomaly→demand story stays apples-to-apples.
PRODUCTS = [
    # id, label, proxy, elasticity, r2, accent, icon, tagline, creative_angle
    # ---- heat-driven (positive elasticity) ----
    ("ice_cream", "Pint-size Ice Cream", "Ice_cream", 1.84, 0.68, "#ff5a1f", "🍦",
     "Take-home pints — impulse demand spikes the moment heat runs above normal.",
     "Lean into the break in the weather: \"It hit {temp_f}° — earn the treat.\" Late-afternoon and evening freezer runs."),
    ("freezer_pops", "Freezer Pops", "Ice_pop", 1.98, 0.61, "#ff7a3d", "🧊",
     "Kid-led, hyper-elastic: the cheapest cool-down, first to move on a hot snap.",
     "Family + value cue: \"{temp_f}° outside — stock the freezer.\" Multipack, basket-builder messaging."),
    ("cold_brew", "Cold Brew Coffee", "Iced_coffee", 1.35, 0.51, "#9c5a2a", "🧋",
     "The warm-to-cold cue flip: iced overtakes hot when it runs warmer than usual.",
     "Reframe the daily ritual: \"Iced, for the {temp_f}° morning.\" Commute and mid-afternoon day-parts."),
    ("electrolyte", "Electrolyte Mix", "Sports_drink", 1.15, 0.47, "#ff5a7a", "🥤",
     "Hydration lifts with above-normal heat and sweat — function over flavour.",
     "Performance + replenishment: \"Out-sweat the {temp_f}°.\" Gym, jobsite and youth-sport occasions."),
    ("sparkling", "Sparkling Water", "Carbonated_water", 0.92, 0.40, "#36b3c4", "🫧",
     "A gentle lift — the everyday fridge-filler nudges up on warmer-than-normal days.",
     "Light refreshment: \"Fizz for a {temp_f}° afternoon.\" Multipack pantry-load, no-calorie cue."),
    ("sunscreen", "Sunscreen", "Sunscreen", 1.55, 0.62, "#ff8a1f", "🧴",
     "Sun-protection demand spikes with hotter, brighter-than-normal days.",
     "Preparedness, not panic: \"{temp_f}° and clear — cover up.\" UV/outdoor occasions, same-day pickup."),
    ("swimwear", "Swimwear", "Swimsuit", 1.40, 0.50, "#1fb0ff", "🩱",
     "Discretionary and weather-triggered — an early warm spell pulls the season forward.",
     "Bring the season forward: \"{temp_f}° already? Dive in.\" Pool, lake and coastal trip occasions."),
    ("bug_spray", "Insect Repellent", "Insect_repellent", 1.22, 0.44, "#7a9c2a", "🦟",
     "Warm, muggy spells above normal wake the bugs — and the category.",
     "Protect the outdoors: \"Warm nights, more bites.\" Patio, camping and evening-outdoor occasions."),
    ("portable_ac", "Portable AC", "Air_conditioning", 2.05, 0.71, "#e23a1f", "❄️",
     "The sharpest mover of all — a heat anomaly converts shoppers to buyers fast.",
     "Urgency + relief: \"{temp_f}° indoors is optional.\" Units + same-week install windows."),
    ("garden_centre", "Garden Centre", "Gardening", 1.05, 0.43, "#4caa45", "🪴",
     "Mild-to-warm departures pull weekend gardeners out earlier than the calendar.",
     "Catch the first nice weekend: \"{temp_f}° — get planting.\" Soil, seedlings and tool baskets."),
    # ---- cold-driven (negative elasticity) ----
    ("soup", "Ready Soup", "Soup", -1.46, 0.55, "#2436d4", "🥣",
     "Comfort demand rises when it turns colder than the local normal.",
     "Sell warmth on the turn: \"When it dropped, we were ready.\" Evening dwell-time, cosy at-home messaging."),
    ("hot_cocoa", "Hot Cocoa", "Hot_chocolate", -1.62, 0.60, "#1f5fd4", "☕",
     "Hot-drink demand climbs as temperatures fall below normal — treat, not staple.",
     "Cosy occasion: \"Colder than usual — warm up.\" Family, after-school and weekend-treat moments."),
    ("herbal_tea", "Herbal Tea", "Herbal_tea", -1.00, 0.42, "#2a8fb8", "🍵",
     "A steady lift on cool-than-normal days — wellness and wind-down cues.",
     "Everyday comfort: \"A cooler-than-usual evening calls for it.\" Wind-down and morning rituals."),
    ("lip_balm", "Lip Balm", "Lip_balm", -1.10, 0.40, "#5a7fd4", "💄",
     "Cold, dry departures crack lips — a tiny basket-add that moves with the chill.",
     "Impulse at the till: \"Cold snap incoming — protect.\" Front-of-store, multipack add-ons."),
    ("slow_cooker", "Slow Cooker", "Slow_cooker", -1.30, 0.50, "#4b3fd4", "🍲",
     "Hearty-cooking demand rises on colder-than-normal stretches.",
     "Plan-ahead comfort: \"Set it for the cold snap.\" Weekend grocery + meal-prep occasions."),
    ("firewood", "Firewood & Logs", "Firewood", -1.55, 0.52, "#3a2fb0", "🪵",
     "A genuine cold-snap buy — stocks up hard when it runs below normal.",
     "Beat the chill: \"Colder than forecast — stock up.\" Bundle + delivery, fireplace and fire-pit occasions."),
]


def synth_scatter(elasticity, r2, n=150, xspread=8.0):
    """(anomaly, residual) points whose OLS fit ~ elasticity with roughly r2."""
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
    cats = {}
    for (pid, label, proxy, e, r2, accent, icon, tag, ang) in PRODUCTS:
        cats[pid] = {
            "label": label,
            "proxy_article": proxy,
            "driver": "temperature_2m_max",
            "elasticity": e,
            "r2": r2,
            "direction": "positive" if e >= 0 else "negative",
            "n_days": 1825,
            "scatter": synth_scatter(e, r2),
        }
    return {
        "generated_at": date.today().isoformat(),
        "note": "SEED data from gen_demo_data.py. Run scripts/calibrate.py to replace with real calibrated values.",
        "categories": cats,
    }


def build_categories():
    cats = {}
    for (pid, label, proxy, e, r2, accent, icon, tag, ang) in PRODUCTS:
        cats[pid] = {
            "id": pid,
            "label": label,
            "group": "positive" if e >= 0 else "negative",
            "tagline": tag,
            "creative_angle": ang,
            "accent": accent,
            "icon": icon,
        }
    return cats


def build_forecast_snapshot(normals):
    """Offline fallback, keyed by city id. Built from normals + smooth synthetic
    fronts (travelling warm/cool bands) so any region of the globe looks alive
    even with no network."""
    start = date.today()
    days = 7
    dates = [(start + timedelta(days=k)).isoformat() for k in range(days)]
    doy0 = start.timetuple().tm_yday
    by_id = {}
    for (name, admin, country, cc, region, lat, lon, pop, tmean, tamp) in CITIES:
        cid_ = cid(name, cc)
        tmax, precip = [], []
        rlon, rlat = math.radians(lon), math.radians(lat)
        for k in range(days):
            doy = ((doy0 - 1 + k) % 366) + 1
            base = normals[cid_]["temperature_2m_max"][doy - 1]
            # Travelling warm/cool fronts: layered sinusoids at a few spatial
            # frequencies that march each day, so every region sees a real
            # departure on some day of the week. Amplitude is deliberately punchy
            # so steady, low-σ markets (coastal/tropical) post rare z-scores when
            # a front catches them — that's the non-obvious money the demo shows.
            anom = (8.0 * math.sin(rlon * 1.3 + 0.8 * k) * math.cos(rlat * 1.1)
                    + 4.0 * math.sin(rlat * 2.2 - 0.5 * k)
                    + 3.5 * math.sin(rlon * 2.7 - 0.3 * k + rlat))
            anom = max(-12.0, min(12.0, anom))
            t = base + anom + random.gauss(0, 0.6)
            tmax.append(round(t, 1))
            precip.append(round(max(0.0, random.gauss(1.2, 2.0)) if anom < 0
                                else max(0.0, random.gauss(0.4, 1.0)), 1))
        by_id[cid_] = {
            "time": dates,
            "temperature_2m_max": tmax,
            "precipitation_sum": precip,
        }
    return {"generated_at": start.isoformat(), "source": "synthetic_snapshot", "byId": by_id}


def main():
    cities, plan = build_cities_and_plan()
    normals = build_normals()
    write("cities.json", cities)
    write("media_plan.json", plan)
    write("categories.json", build_categories())
    write("coefficients.json", build_coefficients())
    write("normals.json", normals)
    write("forecast_snapshot.json", build_forecast_snapshot(normals))
    print(f"Wrote demo data for {len(cities)} cities, {len(PRODUCTS)} products to {DATA}")


def write(name, obj):
    path = os.path.join(DATA, name)
    with open(path, "w") as f:
        json.dump(obj, f, separators=(",", ":"), ensure_ascii=False)
    print(f"  {name}  ({os.path.getsize(path)//1024} KB)")


if __name__ == "__main__":
    main()
