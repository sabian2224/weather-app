(() => {
    const STORAGE_KEYS = {
        recent: "weatherDesk.recentCities",
        saved: "weatherDesk.savedCity",
        theme: "weatherDesk.theme",
    };

    const form = document.getElementById("search-form");
    const input = document.getElementById("city-input");
    const validation = document.getElementById("validation");
    const unitButtons = document.querySelectorAll(".units-toggle button");
    const locationBtn = document.getElementById("location-btn");
    const themeToggle = document.getElementById("theme-toggle");
    const savedCityBtn = document.getElementById("saved-city");
    const recentList = document.getElementById("recent-list");
    const saveCityBtn = document.getElementById("save-city");

    const emptyEl = document.getElementById("empty");
    const loadingEl = document.getElementById("loading");
    const errorEl = document.getElementById("error");
    const errorText = document.getElementById("error-text");
    const cardEl = document.getElementById("weather-card");
    const currentPanel = document.getElementById("current-panel");

    const els = {
        location: document.getElementById("location"),
        description: document.getElementById("description"),
        icon: document.getElementById("icon"),
        temp: document.getElementById("temp"),
        range: document.getElementById("range"),
        feelsLike: document.getElementById("feels-like"),
        localTime: document.getElementById("local-time"),
        humidity: document.getElementById("humidity"),
        wind: document.getElementById("wind"),
        pressure: document.getElementById("pressure"),
        visibility: document.getElementById("visibility"),
        sunrise: document.getElementById("sunrise"),
        sunset: document.getElementById("sunset"),
        clouds: document.getElementById("clouds"),
        tip: document.getElementById("tip"),
        hourly: document.getElementById("hourly-list"),
        forecast: document.getElementById("forecast-list"),
    };

    let units = "imperial";
    let lastRequest = null;
    let activeCity = "";

    applyStoredTheme();
    renderSavedCity();
    renderRecentCities();

    unitButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
            if (btn.classList.contains("active")) return;
            unitButtons.forEach((button) => button.classList.remove("active"));
            btn.classList.add("active");
            units = btn.dataset.units;
            if (lastRequest) fetchWeather(lastRequest);
        });
    });

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        const city = input.value.trim();
        if (!city) {
            showValidation("Please enter a city name.");
            return;
        }
        if (city.length < 2) {
            showValidation("City name must be at least 2 characters.");
            return;
        }
        clearValidation();
        fetchWeather({ city });
    });

    input.addEventListener("input", clearValidation);

    locationBtn.addEventListener("click", () => {
        if (!navigator.geolocation) {
            showValidation("Geolocation is not available in this browser.");
            return;
        }

        clearValidation();
        locationBtn.disabled = true;
        locationBtn.textContent = "Locating";

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                fetchWeather({
                    lat: latitude.toFixed(4),
                    lon: longitude.toFixed(4),
                    source: "location",
                }).finally(() => {
                    locationBtn.disabled = false;
                    locationBtn.textContent = "Locate";
                });
            },
            () => {
                locationBtn.disabled = false;
                locationBtn.textContent = "Locate";
                showValidation("Location access was blocked. Search by city instead.");
            },
            { enableHighAccuracy: false, timeout: 9000, maximumAge: 600000 },
        );
    });

    themeToggle.addEventListener("click", () => {
        document.body.classList.toggle("dark");
        const mode = document.body.classList.contains("dark") ? "dark" : "light";
        localStorage.setItem(STORAGE_KEYS.theme, mode);
    });

    savedCityBtn.addEventListener("click", () => {
        const saved = getSavedCity();
        if (saved) {
            input.value = saved;
            fetchWeather({ city: saved });
        }
    });

    saveCityBtn.addEventListener("click", () => {
        if (!activeCity) return;
        localStorage.setItem(STORAGE_KEYS.saved, activeCity);
        renderSavedCity();
        updateSaveButton();
    });

    function applyStoredTheme() {
        const savedTheme = localStorage.getItem(STORAGE_KEYS.theme);
        const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
        if (savedTheme === "dark" || (!savedTheme && prefersDark)) {
            document.body.classList.add("dark");
        }
    }

    function showValidation(msg) {
        validation.textContent = msg;
        validation.hidden = false;
    }

    function clearValidation() {
        validation.hidden = true;
        validation.textContent = "";
    }

    function showOnly(stateEl) {
        [emptyEl, loadingEl, errorEl, cardEl].forEach((el) => {
            el.hidden = el !== stateEl;
        });
    }

    async function fetchWeather(request) {
        lastRequest = request;
        showOnly(loadingEl);

        try {
            const params = new URLSearchParams({ units });
            if (request.city) params.set("city", request.city);
            if (request.lat && request.lon) {
                params.set("lat", request.lat);
                params.set("lon", request.lon);
            }

            const res = await fetch(`/api/weather?${params}`);
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.detail || "Failed to fetch weather.");
            }

            render(data);
            rememberCity(data.current);
            showOnly(cardEl);
        } catch (err) {
            errorText.textContent = err.message || "Something went wrong.";
            showOnly(errorEl);
        }
    }

    function render({ current, forecast, hourly }) {
        const tempUnit = current.units === "metric" ? "\u00b0C" : "\u00b0F";
        const speedUnit = current.units === "metric" ? "m/s" : "mph";
        const visibility = formatVisibility(current.visibility, current.units);

        activeCity = current.city || input.value.trim();
        const location = current.country ? `${current.city}, ${current.country}` : current.city;
        els.location.textContent = location || "Current location";
        els.description.textContent = current.description || current.condition || "";
        els.temp.textContent = `${current.temp}${tempUnit}`;
        els.range.textContent = `High ${current.temp_max}${tempUnit} / Low ${current.temp_min}${tempUnit}`;
        els.feelsLike.textContent = `${current.feels_like}${tempUnit}`;
        els.localTime.textContent = current.local_time ? `Local update time ${current.local_time}` : "";
        els.humidity.textContent = valueOrDash(current.humidity, "%");
        els.wind.textContent = `${current.wind_speed} ${speedUnit}${windDirection(current.wind_deg)}`;
        els.pressure.textContent = valueOrDash(current.pressure, " hPa");
        els.visibility.textContent = visibility || "-";
        els.sunrise.textContent = current.sunrise || "-";
        els.sunset.textContent = current.sunset || "-";
        els.clouds.textContent = valueOrDash(current.clouds, "%");
        els.tip.textContent = buildTip(current, hourly);

        setWeatherMood(current.condition);
        updateSaveButton();
        renderIcon(els.icon, current.icon, current.description || current.condition);
        renderHourly(hourly, tempUnit);
        renderForecast(forecast, tempUnit);
    }

    function renderIcon(img, icon, alt) {
        if (icon) {
            img.src = `https://openweathermap.org/img/wn/${icon}@2x.png`;
            img.alt = alt || "";
            img.hidden = false;
        } else {
            img.hidden = true;
        }
    }

    function renderHourly(hourly, tempUnit) {
        els.hourly.innerHTML = "";
        hourly.forEach((hour) => {
            const li = document.createElement("li");
            const time = document.createElement("div");
            const img = document.createElement("img");
            const temp = document.createElement("div");
            const rain = document.createElement("div");

            time.className = "hour";
            time.textContent = hour.time;
            img.src = `https://openweathermap.org/img/wn/${hour.icon}@2x.png`;
            img.alt = hour.condition || "";
            temp.className = "hour-temp";
            temp.textContent = `${hour.temp}${tempUnit}`;
            rain.className = "rain";
            rain.textContent = `${hour.pop}% rain`;

            li.append(time, img, temp, rain);
            els.hourly.appendChild(li);
        });
    }

    function renderForecast(forecast, tempUnit) {
        els.forecast.innerHTML = "";
        forecast.forEach((day) => {
            const li = document.createElement("li");
            const dayEl = document.createElement("div");
            const img = document.createElement("img");
            const range = document.createElement("div");
            const high = document.createElement("strong");
            const low = document.createTextNode(`${day.temp_min}${tempUnit}`);

            dayEl.className = "day";
            dayEl.textContent = day.weekday;
            img.src = `https://openweathermap.org/img/wn/${day.icon}@2x.png`;
            img.alt = day.condition || "";
            range.className = "range";
            high.textContent = `${day.temp_max}${tempUnit}`;
            range.append(high, low);
            li.append(dayEl, img, range);
            els.forecast.appendChild(li);
        });
    }

    function rememberCity(current) {
        if (!current.city) return;
        activeCity = current.city;
        const cityLabel = current.country ? `${current.city}, ${current.country}` : current.city;
        const recent = getRecentCities().filter((city) => city.toLowerCase() !== cityLabel.toLowerCase());
        recent.unshift(cityLabel);
        localStorage.setItem(STORAGE_KEYS.recent, JSON.stringify(recent.slice(0, 6)));
        renderRecentCities();
    }

    function renderRecentCities() {
        const recent = getRecentCities();
        recentList.innerHTML = "";
        if (!recent.length) {
            const empty = document.createElement("span");
            empty.className = "chip empty-chip";
            empty.textContent = "Your searches will appear here";
            recentList.appendChild(empty);
            return;
        }

        recent.forEach((city) => {
            const chip = document.createElement("button");
            chip.className = "chip";
            chip.type = "button";
            chip.textContent = city;
            chip.addEventListener("click", () => {
                input.value = city;
                fetchWeather({ city });
            });
            recentList.appendChild(chip);
        });
    }

    function renderSavedCity() {
        const saved = getSavedCity();
        savedCityBtn.textContent = saved || "None yet";
        savedCityBtn.classList.toggle("empty-chip", !saved);
        savedCityBtn.disabled = !saved;
    }

    function updateSaveButton() {
        const saved = getSavedCity();
        const isSaved = Boolean(activeCity && saved && saved.toLowerCase() === activeCity.toLowerCase());
        saveCityBtn.textContent = isSaved ? "Saved" : "Save";
        saveCityBtn.classList.toggle("saved", isSaved);
    }

    function getRecentCities() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEYS.recent)) || [];
        } catch {
            return [];
        }
    }

    function getSavedCity() {
        return localStorage.getItem(STORAGE_KEYS.saved) || "";
    }

    function setWeatherMood(condition = "") {
        currentPanel.className = "current";
        const normalized = condition.toLowerCase();
        if (normalized) {
            currentPanel.classList.add(`weather-${normalized}`);
        }
    }

    function buildTip(current, hourly = []) {
        const nextRain = hourly.find((hour) => hour.pop >= 50);
        const condition = (current.condition || "").toLowerCase();
        const windLimit = current.units === "metric" ? 8 : 18;

        if (nextRain || condition.includes("rain") || condition.includes("drizzle")) {
            return nextRain ? `Rain risk around ${nextRain.time}` : "Keep rain gear nearby";
        }
        if (condition.includes("thunderstorm")) return "Storms may move quickly";
        if (current.wind_speed >= windLimit) return "Wind may affect outdoor plans";
        if (current.humidity >= 75) return "Humid air will feel warmer";
        if (current.temp >= (current.units === "metric" ? 29 : 84)) return "Hydrate and seek shade";
        if (current.temp <= (current.units === "metric" ? 4 : 40)) return "Layer up before heading out";
        if (condition.includes("clear")) return "Great window for outdoor time";
        return "Comfortable for most plans";
    }

    function valueOrDash(value, suffix = "") {
        if (value === null || value === undefined || value === "") return "-";
        return `${value}${suffix}`;
    }

    function formatVisibility(km, currentUnits) {
        if (km === null || km === undefined) return "";
        if (currentUnits === "imperial") {
            return `${(km * 0.621371).toFixed(1)} mi`;
        }
        return `${km} km`;
    }

    function windDirection(degrees) {
        if (degrees === null || degrees === undefined) return "";
        const directions = [" N", " NE", " E", " SE", " S", " SW", " W", " NW"];
        return directions[Math.round(degrees / 45) % 8];
    }
})();
