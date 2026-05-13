# Weather App

A FastAPI weather app ready for Vercel deployment.

## Local Development

1. Create a local environment file:

   ```bash
   cp .env.example .env
   ```

2. Add your OpenWeather API key to `.env`:

   ```bash
   WEATHER_API_KEY=your_openweather_api_key_here
   ```

3. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

4. Run the app:

   ```bash
   python main.py
   ```

5. Open `http://localhost:8000`.

## Vercel Deployment

Before deploying, add this environment variable in Vercel:

```text
WEATHER_API_KEY=your_openweather_api_key_here
```

The production entry point is `index.py`, which imports the FastAPI app from `api/index.py`.
