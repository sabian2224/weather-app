(() => {
    const form = document.getElementById("search-form");
    const input = document.getElementById("city-input");
    const validation = document.getElementById("validation");
    const unitButtons = document.querySelectorAll(".units-toggle button");

    const emptyEl = document.getElementById("empty");
    const loadingEl = document.getElementById("loading");
    const errorEl = document.getElementById("error");
    const errorText = document.getElementById("error-text");
    const cardEl = document.getElementById("weather-card");

    const els = {
        location: document.getElementById("location"),
        description: document.getElementById("description"),
        icon: document.getElementById("icon"),
        temp: document.getElementById("temp"),
        feelsLike: document.getElementById("feels-like"),
        humidity: document.getElementById("humidity"),
        wind: document.getElementById("wind"),
        condition: document.getElementById("condition"),
        forecast: document.getElementById("forecast-list"),
    };

    let units = "imperial";
    let lastCity = "";

    unitButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
            if (btn.classList.contains("active")) return;
            unitButtons.forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            units = btn.dataset.units;
            if (lastCity) fetchWeather(lastCity);
        });
    });

    form.addEventListener("submit", (e) => {
        e.preventDefault();
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
        fetchWeather(city);
    });

    input.addEventListener("input", clearValidation);

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

    async function fetchWeather(city) {
        lastCity = city;
        showOnly(loadingEl);

        try {
            const params = new URLSearchParams({ city, units });
            const res = await fetch(`/api/weather?${params}`);
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.detail || "Failed to fetch weather.");
            }
            render(data);
            showOnly(cardEl);
        } catch (err) {
            errorText.textContent = err.message || "Something went wrong.";
            showOnly(errorEl);
        }
    }

    function render({ current, forecast }) {
        const tempUnit = current.units === "metric" ? "°C" : "°F";
        const speedUnit = current.units === "metric" ? "m/s" : "mph";

        els.location.textContent = current.country
            ? `${current.city}, ${current.country}`
            : current.city;
        els.description.textContent = current.description || current.condition || "";
        els.temp.textContent = `${current.temp}${tempUnit}`;
        els.feelsLike.textContent = `${current.feels_like}${tempUnit}`;
        els.humidity.textContent = `${current.humidity}%`;
        els.wind.textContent = `${current.wind_speed} ${speedUnit}`;
        els.condition.textContent = current.condition || "—";

        if (current.icon) {
            els.icon.src = `https://openweathermap.org/img/wn/${current.icon}@2x.png`;
            els.icon.alt = current.description || current.condition || "";
            els.icon.hidden = false;
        } else {
            els.icon.hidden = true;
        }

        els.forecast.innerHTML = "";
        forecast.forEach((day) => {
            const li = document.createElement("li");
            li.innerHTML = `
                <div class="day">${day.weekday}</div>
                <img src="https://openweathermap.org/img/wn/${day.icon}@2x.png" alt="${day.condition}" />
                <div class="range">
                    <strong>${day.temp_max}${tempUnit}</strong>${day.temp_min}${tempUnit}
                </div>
            `;
            els.forecast.appendChild(li);
        });
    }
})();
