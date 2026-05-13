import os
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

# Resolve project root so static/templates work both locally and on Vercel.
ROOT = Path(__file__).resolve().parent.parent
TEMPLATES_DIR = ROOT / "templates"
STATIC_DIR = ROOT / "static"

load_dotenv(ROOT / ".env")

WEATHER_API_KEY = os.environ.get("WEATHER_API_KEY")

OWM_BASE = "https://api.openweathermap.org/data/2.5"

app = FastAPI(title="Weather App", docs_url=None, redoc_url=None)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))


@app.get("/")
async def home(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/api/weather")
async def get_weather(
    city: str | None = Query(None, min_length=1, max_length=80),
    lat: float | None = Query(None, ge=-90, le=90),
    lon: float | None = Query(None, ge=-180, le=180),
    units: str = Query("imperial", pattern="^(imperial|metric)$"),
):
    location_params = _location_params(city, lat, lon)

    async with httpx.AsyncClient(timeout=10.0) as client:
        current = await _fetch(client, "/weather", {**location_params, "units": units})
        forecast = await _fetch(client, "/forecast", {**location_params, "units": units})

    return JSONResponse({
        "current": _shape_current(current, units),
        "forecast": _shape_forecast(forecast),
        "hourly": _shape_hourly(forecast),
    })


def _location_params(city: str | None, lat: float | None, lon: float | None) -> dict:
    if lat is not None or lon is not None:
        if lat is None or lon is None:
            raise HTTPException(status_code=400, detail="Latitude and longitude are both required.")
        return {"lat": lat, "lon": lon}

    city = (city or "").strip()
    if not city:
        raise HTTPException(status_code=400, detail="City name is required.")
    return {"q": city}


async def _fetch(client: httpx.AsyncClient, path: str, params: dict):
    if not WEATHER_API_KEY:
        raise HTTPException(status_code=500, detail="Missing WEATHER_API_KEY configuration.")

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
    clouds = data.get("clouds", {})
    visibility = data.get("visibility")
    timezone_offset = data.get("timezone", 0)
    return {
        "city": data.get("name"),
        "country": sys.get("country"),
        "coordinates": data.get("coord", {}),
        "condition": weather.get("main"),
        "description": weather.get("description", "").title(),
        "icon": weather.get("icon"),
        "temp": round(main.get("temp", 0)),
        "feels_like": round(main.get("feels_like", 0)),
        "temp_min": round(main.get("temp_min", 0)),
        "temp_max": round(main.get("temp_max", 0)),
        "humidity": main.get("humidity"),
        "pressure": main.get("pressure"),
        "visibility": round(visibility / 1000, 1) if visibility is not None else None,
        "wind_speed": round(wind.get("speed", 0), 1),
        "wind_deg": wind.get("deg"),
        "clouds": clouds.get("all"),
        "sunrise": _format_time(sys.get("sunrise"), timezone_offset),
        "sunset": _format_time(sys.get("sunset"), timezone_offset),
        "local_time": _format_time(data.get("dt"), timezone_offset),
        "is_day": _is_day(data.get("dt"), sys.get("sunrise"), sys.get("sunset")),
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


def _shape_hourly(data: dict) -> list:
    hours = []
    for item in data.get("list", [])[:8]:
        weather = (item.get("weather") or [{}])[0]
        hour = datetime.strptime(item["dt_txt"], "%Y-%m-%d %H:%M:%S")
        hours.append({
            "time": hour.strftime("%-I %p") if os.name != "nt" else hour.strftime("%#I %p"),
            "icon": weather.get("icon"),
            "condition": weather.get("main"),
            "temp": round(item.get("main", {}).get("temp", 0)),
            "pop": round(item.get("pop", 0) * 100),
        })
    return hours


def _format_time(timestamp: int | None, timezone_offset: int) -> str | None:
    if timestamp is None:
        return None
    return datetime.utcfromtimestamp(timestamp + timezone_offset).strftime("%I:%M %p").lstrip("0")


def _is_day(current: int | None, sunrise: int | None, sunset: int | None) -> bool:
    if current is None or sunrise is None or sunset is None:
        return True
    return sunrise <= current < sunset
