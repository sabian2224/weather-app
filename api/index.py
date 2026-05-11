import os
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

# Resolve project root so static/templates work both locally and on Vercel.
ROOT = Path(__file__).resolve().parent.parent
TEMPLATES_DIR = ROOT / "templates"
STATIC_DIR = ROOT / "static"

# Fall back to the previously hard-coded key so the app still runs if the env
# var isn't set, but production deploys should always supply WEATHER_API_KEY.
WEATHER_API_KEY = os.environ.get("WEATHER_API_KEY", "c258869a6fb2cca384d344ecad1c44ca")

OWM_BASE = "https://api.openweathermap.org/data/2.5"

app = FastAPI(title="Weather App", docs_url=None, redoc_url=None)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))


@app.get("/")
async def home(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/api/weather")
async def get_weather(
    city: str = Query(..., min_length=1, max_length=80),
    units: str = Query("imperial", pattern="^(imperial|metric)$"),
):
    city = city.strip()
    if not city:
        raise HTTPException(status_code=400, detail="City name is required.")

    async with httpx.AsyncClient(timeout=10.0) as client:
        current = await _fetch(client, "/weather", {"q": city, "units": units})
        forecast = await _fetch(client, "/forecast", {"q": city, "units": units})

    return JSONResponse({
        "current": _shape_current(current, units),
        "forecast": _shape_forecast(forecast),
    })


async def _fetch(client: httpx.AsyncClient, path: str, params: dict):
    params = {**params, "appid": WEATHER_API_KEY}
    try:
        resp = await client.get(f"{OWM_BASE}{path}", params=params)
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="Weather service unreachable.")

    if resp.status_code == 404:
        raise HTTPException(status_code=404, detail="City not found.")
    if resp.status_code == 401:
        raise HTTPException(status_code=500, detail="Invalid API key configuration.")
    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail="Weather service error.")
    return resp.json()


def _shape_current(data: dict, units: str) -> dict:
    weather = (data.get("weather") or [{}])[0]
    main = data.get("main", {})
    wind = data.get("wind", {})
    sys = data.get("sys", {})
    return {
        "city": data.get("name"),
        "country": sys.get("country"),
        "condition": weather.get("main"),
        "description": weather.get("description", "").title(),
        "icon": weather.get("icon"),
        "temp": round(main.get("temp", 0)),
        "feels_like": round(main.get("feels_like", 0)),
        "humidity": main.get("humidity"),
        "wind_speed": round(wind.get("speed", 0), 1),
        "units": units,
    }


def _shape_forecast(data: dict) -> list:
    """Collapse the 3-hour forecast list into one entry per day (up to 5)."""
    buckets: dict[str, list] = defaultdict(list)
    for item in data.get("list", []):
        date_key = item["dt_txt"].split(" ")[0]
        buckets[date_key].append(item)

    today = datetime.utcnow().strftime("%Y-%m-%d")
    days = []
    for date_key, items in buckets.items():
        if date_key == today:
            continue
        # Prefer the midday slot for a representative icon/temp.
        midday = next(
            (i for i in items if i["dt_txt"].endswith("12:00:00")),
            items[len(items) // 2],
        )
        temps = [i["main"]["temp"] for i in items]
        weather = (midday.get("weather") or [{}])[0]
        days.append({
            "date": date_key,
            "weekday": datetime.strptime(date_key, "%Y-%m-%d").strftime("%a"),
            "icon": weather.get("icon"),
            "condition": weather.get("main"),
            "temp_min": round(min(temps)),
            "temp_max": round(max(temps)),
        })
        if len(days) == 5:
            break
    return days
