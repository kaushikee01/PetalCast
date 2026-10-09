/* =========================================================
   1. SETTINGS + SMALL HELPERS
   ========================================================= */
const GEO_URL = "https://geocoding-api.open-meteo.com/v1/search";
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";
const AIR_URL = "https://air-quality-api.open-meteo.com/v1/air-quality";

// $("id") is a shortcut for document.getElementById("id")
const $ = (id) => document.getElementById(id);

// Remember choices between visits (try/catch because some browsers block storage)
function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {} }
function load(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } }

// Turns text into safe HTML so a weird city name can't break the page
function esc(text) {
  const d = document.createElement("div");
  d.textContent = text;
  return d.innerHTML;
}

let units = load("petalcast-units") || "metric";   // "metric" or "imperial"
let favorites = load("petalcast-favs") || [];       // saved places
let recents = load("petalcast-recent") || [];       // recent searches
let currentPlace = null;
let view = "home";                                  // which screen is showing

// Two places are "the same" if their coordinates match closely
const same = (a, b) => Number(a.lat).toFixed(2) === Number(b.lat).toFixed(2) &&
                       Number(a.lon).toFixed(2) === Number(b.lon).toFixed(2);
const isFav = (p) => favorites.some((f) => same(f, p));

// Cities shown on the home screen
const WORLD = [
  { name: "Delhi", region: "India", lat: 28.6139, lon: 77.2090 },
  { name: "Mumbai", region: "India", lat: 19.0760, lon: 72.8777 },
  { name: "Bengaluru", region: "India", lat: 12.9716, lon: 77.5946 },
  { name: "Kolkata", region: "India", lat: 22.5726, lon: 88.3639 },
  { name: "London", region: "United Kingdom", lat: 51.5072, lon: -0.1276 },
  { name: "New York", region: "United States", lat: 40.7128, lon: -74.0060 },
  { name: "Tokyo", region: "Japan", lat: 35.6762, lon: 139.6503 },
  { name: "Dubai", region: "United Arab Emirates", lat: 25.2048, lon: 55.2708 }
];

const DID_YOU_KNOW = [
  "Humidity above 70% makes warm days feel hotter, because sweat evaporates more slowly.",
  "The UV index can be high even on cloudy days. Thin cloud blocks only part of it.",
  "A steady drop in air pressure often means rain or wind is on the way.",
  "Chance of rain is the odds that rain falls at that spot, not how much or for how long.",
  "A breeze makes cold air feel colder. The “feels like” temperature already includes this.",
  "Air pollution tends to build up on calm, cool mornings, so midday walks can be cleaner.",
  "Fog is most common just before sunrise, when the air is at its coolest."
];

/* =========================================================
   2. WEATHER CODES -> description, emoji, mood
   (Open-Meteo sends a number; we translate it)
   ========================================================= */
function describe(code, isDay) {
  const sun = isDay ? "☀️" : "🌙";
  const partly = isDay ? "⛅" : "☁️";
  if (code === 0) return { text: "Clear sky", icon: sun };
  if (code === 1) return { text: "Mostly clear", icon: isDay ? "🌤️" : "🌙" };
  if (code === 2) return { text: "Partly cloudy", icon: partly };
  if (code === 3) return { text: "Overcast", icon: "☁️" };
  if (code === 45 || code === 48) return { text: "Foggy", icon: "🌫️" };
  if (code >= 51 && code <= 55) return { text: "Drizzle", icon: "🌦️" };
  if (code === 56 || code === 57) return { text: "Freezing drizzle", icon: "🌧️" };
  if (code >= 61 && code <= 65) return { text: code === 65 ? "Heavy rain" : "Rain", icon: "🌧️" };
  if (code === 66 || code === 67) return { text: "Freezing rain", icon: "🌧️" };
  if (code >= 71 && code <= 75) return { text: "Snow", icon: "🌨️" };
  if (code === 77) return { text: "Snow grains", icon: "🌨️" };
  if (code >= 80 && code <= 82) return { text: "Rain showers", icon: "🌦️" };
  if (code === 85 || code === 86) return { text: "Snow showers", icon: "🌨️" };
  if (code === 95) return { text: "Thunderstorm", icon: "⛈️" };
  if (code === 96 || code === 99) return { text: "Thunderstorm with hail", icon: "⛈️" };
  return { text: "Unknown", icon: "🌈" };
}

function moodFor(code, isDay) {
  if (!isDay) return "night";
  if (code >= 95) return "storm";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if (code >= 2) return "cloudy";
  return "sunny";
}

/* =========================================================
   3. FORMATTING HELPERS
   Open-Meteo times look like "2026-10-09T14:30" in the city's own
   local time, so we read the pieces straight from the text.
   ========================================================= */
function fmtHour(t) {
  const h = parseInt(t.slice(11, 13), 10);
  return (h % 12 || 12) + " " + (h >= 12 ? "pm" : "am");
}
function fmtTime(t) {
  const h = parseInt(t.slice(11, 13), 10);
  return (h % 12 || 12) + ":" + t.slice(14, 16) + " " + (h >= 12 ? "pm" : "am");
}
function fmtDay(dateStr, index) {
  if (index === 0) return "Today";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { weekday: "short" });
}
function fmtLongDate(t) {
  return new Date(t.slice(0, 10) + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}
function compass(d) {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round(d / 22.5) % 16];
}
function uvLabel(uv) {
  if (uv < 3) return "Low";
  if (uv < 6) return "Moderate";
  if (uv < 8) return "High";
  if (uv < 11) return "Very high";
  return "Extreme";
}
function aqiLabel(a) {
  if (a <= 50) return "Good";
  if (a <= 100) return "Moderate";
  if (a <= 150) return "Unhealthy for sensitive groups";
  if (a <= 200) return "Unhealthy";
  if (a <= 300) return "Very unhealthy";
  return "Hazardous";
}
function humidityNote(h) {
  if (h < 30) return "Dry";
  if (h < 60) return "Comfortable";
  if (h < 80) return "Humid";
  return "Very humid";
}
const deg = (n) => Math.round(n) + "°";

/* =========================================================
   4. SHOWING / HIDING SCREENS
   ========================================================= */
function show(which) {
  if (which !== "loading") view = which;           // remember home / weather
  $("loading").hidden = which !== "loading";
  $("home").hidden = which !== "home";
  $("weather").hidden = which !== "weather";
  if (which === "home") document.body.dataset.mood = "home";
  if (which !== "error") $("error").hidden = true;
}
function showError(message) {
  $("error").textContent = message;
  $("error").hidden = false;
  $("status-live").textContent = message;
}

/* =========================================================
   5. FETCHING DATA
   ========================================================= */
async function searchCities(query) {
  const url = `${GEO_URL}?name=${encodeURIComponent(query)}&count=5&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("search-failed");
  const data = await res.json();
  return data.results || [];
}

function unitParams() {
  const metric = units === "metric";
  return { temperature_unit: metric ? "celsius" : "fahrenheit", wind_speed_unit: metric ? "kmh" : "mph" };
}

async function fetchWeather(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,pressure_msl,wind_speed_10m,wind_direction_10m",
    hourly: "temperature_2m,precipitation_probability,weather_code,visibility,uv_index,is_day",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max,uv_index_max",
    timezone: "auto",
    forecast_days: 7,
    ...unitParams()
  });
  const res = await fetch(`${WEATHER_URL}?${params}`);
  if (!res.ok) throw new Error("weather-failed");
  return res.json();
}

// Air quality is a separate service, so we ask for it separately
async function fetchAir(lat, lon) {
  const params = new URLSearchParams({ latitude: lat, longitude: lon, current: "us_aqi,pm2_5", timezone: "auto" });
  const res = await fetch(`${AIR_URL}?${params}`);
  if (!res.ok) throw new Error("air-failed");
  return res.json();
}

// One request for many cities (used by the home screen cards)
async function fetchCards(places) {
  const params = new URLSearchParams({
    latitude: places.map((p) => p.lat).join(","),
    longitude: places.map((p) => p.lon).join(","),
    current: "temperature_2m,weather_code,is_day",
    timezone: "auto",
    ...unitParams()
  });
  const res = await fetch(`${WEATHER_URL}?${params}`);
  if (!res.ok) throw new Error("cards-failed");
  const data = await res.json();
  return Array.isArray(data) ? data : [data];
}

// Load one place, then draw it
async function loadPlace(place) {
  const previous = view;
  currentPlace = place;
  $("suggestions").hidden = true;
  $("error").hidden = true;
  show("loading");

  if (!navigator.onLine) {
    show(previous);
    showError("You're offline. Connect to the internet and try again.");
    return;
  }

  try {
    // Ask for weather and air quality at the same time
    const [weatherResult, airResult] = await Promise.allSettled([
      fetchWeather(place.lat, place.lon),
      fetchAir(place.lat, place.lon)
    ]);
    if (weatherResult.status === "rejected") throw weatherResult.reason;

    rememberRecent(place);
    render(weatherResult.value, place, airResult.status === "fulfilled" ? airResult.value : null);
    show("weather");
    window.scrollTo(0, 0);
    $("status-live").textContent = `Weather loaded for ${place.name}`;
  } catch (err) {
    show(previous);
    showError("Couldn't load the weather right now. Check your connection and try again.");
  }
}

/* =========================================================
   6. DRAWING THE WEATHER SCREEN
   ========================================================= */
function render(data, place, air) {
  const metric = units === "metric";
  const cur = data.current;
  const hourly = data.hourly;
  const daily = data.daily;

  const info = describe(cur.weather_code, cur.is_day);
  document.body.dataset.mood = moodFor(cur.weather_code, cur.is_day);

  // --- Hero ---
  $("place").textContent = place.region ? `${place.name}, ${place.region}` : place.name;
  $("local-time").textContent = `${fmtLongDate(cur.time)}, ${fmtTime(cur.time)} local time`;
  $("temp").innerHTML = `${Math.round(cur.temperature_2m)}<sup>${metric ? "°C" : "°F"}</sup>`;
  $("cond").textContent = `${info.text}, feels like ${deg(cur.apparent_temperature)}`;
  $("hilo").textContent = `High ${deg(daily.temperature_2m_max[0])} · Low ${deg(daily.temperature_2m_min[0])}`;
  $("hero-icon").textContent = info.icon;
  updateFavButton();

  // --- Find "right now" inside the hourly list ---
  const nowKey = cur.time.slice(0, 13) + ":00";
  let start = hourly.time.indexOf(nowKey);
  if (start < 0) start = 0;

  // --- PetalTips ---
  $("tips").innerHTML = buildTips(data, air, start).map((t) => `
    <div class="panel tipcard">
      <div class="h"><span aria-hidden="true">${t.icon}</span>${t.title}</div>
      <p>${t.text}</p>
    </div>`).join("");

  // --- Hourly strip (next 24 hours) ---
  let hoursHtml = "";
  for (let i = start; i < start + 24 && i < hourly.time.length; i++) {
    const h = describe(hourly.weather_code[i], hourly.is_day[i]);
    const rain = hourly.precipitation_probability[i];
    hoursHtml += `
      <div class="hour ${i === start ? "now" : ""}">
        <div class="t">${i === start ? "Now" : fmtHour(hourly.time[i])}</div>
        <div class="i" aria-hidden="true">${h.icon}</div>
        <div class="d">${deg(hourly.temperature_2m[i])}</div>
        <div class="p">${rain >= 20 ? "💧" + rain + "%" : ""}</div>
      </div>`;
  }
  $("hourly").innerHTML = hoursHtml;

  // --- Detail tiles ---
  const visRaw = hourly.visibility[start];                 // metres
  const visibility = metric ? (visRaw / 1000) : (visRaw / 1609.34);
  const visText = visibility >= 10 ? Math.round(visibility) : visibility.toFixed(1);
  const uv = hourly.uv_index[start] ?? daily.uv_index_max[0];
  const aqi = air && air.current ? air.current.us_aqi : null;
  const pm25 = air && air.current ? air.current.pm2_5 : null;

  const tiles = [
    { k: "Air quality (US AQI)", v: aqi ?? "–", n: aqi === null ? "Not available right now" : `${aqiLabel(aqi)}${pm25 !== null ? " · PM2.5 " + Math.round(pm25) + " µg/m³" : ""}` },
    { k: "Humidity", v: cur.relative_humidity_2m + "%", n: humidityNote(cur.relative_humidity_2m) },
    { k: "Wind", v: `${Math.round(cur.wind_speed_10m)} ${metric ? "km/h" : "mph"}`, n: `From the ${compass(cur.wind_direction_10m)} (${Math.round(cur.wind_direction_10m)}°)` },
    { k: "Pressure", v: Math.round(cur.pressure_msl) + " hPa", n: cur.pressure_msl < 1009 ? "Low" : cur.pressure_msl > 1022 ? "High" : "Normal" },
    { k: "Visibility", v: `${visText} ${metric ? "km" : "mi"}`, n: visibility < 1 ? "Poor" : visibility < 5 ? "Moderate" : "Good" },
    { k: "UV index", v: Math.round(uv), n: uvLabel(uv) },
    { k: "Chance of rain today", v: (daily.precipitation_probability_max[0] ?? 0) + "%", n: "Highest through the day" }
  ];
  $("details").innerHTML = tiles.map((t) => `
    <div class="panel tile">
      <div class="k">${t.k}</div>
      <div class="v">${t.v}</div>
      <div class="n">${t.n}</div>
    </div>`).join("");

  // --- Sunrise / sunset with a "where is the sun now" dot ---
  const rise = daily.sunrise[0], set = daily.sunset[0];
  const pct = Math.max(0, Math.min(1, (new Date(cur.time) - new Date(rise)) / (new Date(set) - new Date(rise))));
  $("sun").innerHTML = `
    <div class="sun-row">
      <span>🌅 ${fmtTime(rise)}<small>Sunrise</small></span>
      <span>${fmtTime(set)} 🌇<small>Sunset</small></span>
    </div>
    <div class="sun-track" role="img" aria-label="Sun is ${Math.round(pct * 100)} percent of the way through the day">
      <div class="sun-dot" style="left:${(pct * 100).toFixed(1)}%"></div>
    </div>`;

  // --- 7-day forecast ---
  const weekMin = Math.min(...daily.temperature_2m_min);
  const weekMax = Math.max(...daily.temperature_2m_max);
  const span = (weekMax - weekMin) || 1;
  $("daily").innerHTML = daily.time.map((day, i) => {
    const d = describe(daily.weather_code[i], 1);
    const lo = daily.temperature_2m_min[i];
    const hi = daily.temperature_2m_max[i];
    const left = ((lo - weekMin) / span) * 100;
    const width = Math.max(((hi - lo) / span) * 100, 4);
    const rain = daily.precipitation_probability_max[i] ?? 0;
    return `
      <div class="day">
        <div class="name">${fmtDay(day, i)}</div>
        <div class="ico" aria-hidden="true">${d.icon}</div>
        <div class="day-right">
          <div class="lo">${deg(lo)}</div>
          <div class="bar" role="img" aria-label="${d.text}, low ${deg(lo)}, high ${deg(hi)}"><i style="left:${left.toFixed(1)}%; width:${width.toFixed(1)}%"></i></div>
          <div class="hi">${deg(hi)}</div>
          <div class="rain">${d.text}${rain >= 20 ? " · " + rain + "% chance of rain" : ""}</div>
        </div>
      </div>`;
  }).join("");
}

/* =========================================================
   7. PETALTIPS: plain-language advice from the numbers
   ========================================================= */
function buildTips(data, air, start) {
  const metric = units === "metric";
  const toC = (v) => metric ? v : (v - 32) * 5 / 9;      // always think in °C
  const toKmh = (v) => metric ? v : v * 1.609;           // and km/h

  const cur = data.current, hourly = data.hourly, daily = data.daily;
  const feelsC = toC(cur.apparent_temperature);
  const rainMax = daily.precipitation_probability_max[0] ?? 0;
  const stormy = daily.weather_code[0] >= 95;
  const uvMax = daily.uv_index_max[0] ?? 0;
  const windKmh = toKmh(cur.wind_speed_10m);
  const aqi = air && air.current ? air.current.us_aqi : null;
  const tips = [];

  // Umbrella
  let umbrella;
  if (stormy) umbrella = "Thunderstorms are possible. Stay indoors while they pass and carry an umbrella.";
  else if (rainMax >= 50) umbrella = `Rain is likely today (${rainMax}%). Take an umbrella.`;
  else if (rainMax >= 20) umbrella = `A ${rainMax}% chance of rain. A small umbrella in your bag is a good idea.`;
  else umbrella = "Rain is unlikely today. You can leave the umbrella at home.";
  tips.push({ icon: "☂️", title: "Umbrella", text: umbrella });

  // Sunscreen
  let sunscreen;
  if (uvMax >= 8) sunscreen = `UV peaks at ${Math.round(uvMax)} (${uvLabel(uvMax).toLowerCase()}). Wear SPF 50, sunglasses, and stay in shade around midday.`;
  else if (uvMax >= 3) sunscreen = `UV peaks at ${Math.round(uvMax)} (${uvLabel(uvMax).toLowerCase()}). Wear SPF 30 or higher if you'll be outside for a while.`;
  else sunscreen = "UV is low today, so sunscreen is optional.";
  tips.push({ icon: "🧴", title: "Sun protection", text: sunscreen });

  // What to wear (based on "feels like")
  let wear;
  if (feelsC < 10) wear = "It feels cold. Wear a warm jacket, a scarf and closed shoes.";
  else if (feelsC < 18) wear = "It feels cool. A sweater or light jacket will keep you comfortable.";
  else if (feelsC < 26) wear = "It feels mild. A tee or kurta with light layers works well.";
  else if (feelsC < 33) wear = "It feels warm. Choose breathable cotton or linen and light colours.";
  else wear = "It feels very hot. Wear the lightest fabrics, a hat, and carry water.";
  if (rainMax >= 50) wear += " Pick shoes that can handle puddles.";
  if (windKmh > 35) wear += " It's gusty, so skip anything loose.";
  tips.push({ icon: "👗", title: "What to wear", text: wear });

  // Air quality
  let airTip;
  if (aqi === null) airTip = "Air quality data isn't available right now.";
  else if (aqi > 200) airTip = `AQI is ${aqi} (${aqiLabel(aqi).toLowerCase()}). Stay indoors if you can and wear an N95 mask if you must go out.`;
  else if (aqi > 150) airTip = `AQI is ${aqi} (unhealthy). Skip outdoor workouts and wear a mask outside.`;
  else if (aqi > 100) airTip = `AQI is ${aqi}. People with asthma or allergies should keep outdoor time short.`;
  else airTip = `AQI is ${aqi} (${aqiLabel(aqi).toLowerCase()}). A good day for a walk.`;
  tips.push({ icon: "🍃", title: "Air", text: airTip });

  // Best time outside: daylight hour in the next 24h closest to 23°C with low rain chance
  let best = -1, bestScore = Infinity;
  for (let i = start; i < start + 24 && i < hourly.time.length; i++) {
    if (!hourly.is_day[i]) continue;
    const score = Math.abs(toC(hourly.temperature_2m[i]) - 23) + (hourly.precipitation_probability[i] || 0) / 4;
    if (score < bestScore) { bestScore = score; best = i; }
  }
  tips.push({
    icon: "🕐",
    title: "Best time outside",
    text: best < 0
      ? "There's no daylight in the next 24 hours, so stay cosy indoors."
      : `Around ${fmtHour(hourly.time[best])}, when it's ${deg(hourly.temperature_2m[best])} with the best mix of comfort and dry weather.`
  });

  return tips;
}

/* =========================================================
   8. HOME SCREEN: greeting, tip, recents, saved, live cards
   ========================================================= */
function renderHome() {
  document.body.dataset.mood = "home";

  const hour = new Date().getHours();
  $("greeting").textContent = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : hour < 21 ? "Good evening" : "Good night";

  // A new tip each day
  const dayNumber = Math.floor(Date.now() / 86400000);
  $("tip-text").textContent = DID_YOU_KNOW[dayNumber % DID_YOU_KNOW.length];

  // Recent searches
  $("recent-sec").hidden = recents.length === 0;
  $("recent-chips").innerHTML = recents.map((p, i) => `<button class="chip" data-i="${i}">${esc(p.name)}</button>`).join("");
  $("recent-chips").onclick = (e) => {
    const b = e.target.closest("button");
    if (b) loadPlace(recents[b.dataset.i]);
  };

  // Saved places + world cities (placeholders first, live temperatures after)
  $("saved-sec").hidden = favorites.length === 0;
  drawCards($("saved-grid"), favorites);
  drawCards($("world-grid"), WORLD);

  const all = [...favorites, ...WORLD];
  const savedCount = favorites.length;
  fetchCards(all).then((results) => {
    drawCards($("saved-grid"), favorites, results.slice(0, savedCount));
    drawCards($("world-grid"), WORLD, results.slice(savedCount));
  }).catch(() => {
    // Offline or blocked: cards stay as "Tap to open" and still work when online
    drawCards($("saved-grid"), favorites, null, true);
    drawCards($("world-grid"), WORLD, null, true);
  });
}

function drawCards(el, places, results, failed) {
  el.innerHTML = places.map((p, i) => {
    const r = results && results[i] ? results[i].current : null;
    const info = r ? describe(r.weather_code, r.is_day) : null;
    return `
      <button class="card" data-i="${i}">
        <span><span class="c-name">${esc(p.name)}</span><span class="c-reg">${esc(p.region || "")}</span></span>
        <span class="c-mid">
          <span class="c-ico" aria-hidden="true">${info ? info.icon : "🌸"}</span>
          <span class="c-temp">${r ? deg(r.temperature_2m) : "–°"}</span>
        </span>
        <span class="c-cond">${info ? info.text : failed ? "Tap to open" : "Loading…"}</span>
      </button>`;
  }).join("");
  el.onclick = (e) => {
    const b = e.target.closest("button");
    if (b) loadPlace(places[b.dataset.i]);
  };
}

/* =========================================================
   9. RECENTS + FAVOURITES
   ========================================================= */
function rememberRecent(place) {
  recents = [place, ...recents.filter((p) => !same(p, place))].slice(0, 6);
  save("petalcast-recent", recents);
}
$("clear-recent").addEventListener("click", () => {
  recents = [];
  save("petalcast-recent", recents);
  renderHome();
});

function updateFavButton() {
  const on = currentPlace && isFav(currentPlace);
  $("fav").setAttribute("aria-pressed", on ? "true" : "false");
  $("fav").textContent = on ? "★ Saved" : "☆ Save place";
}
$("fav").addEventListener("click", () => {
  if (!currentPlace) return;
  if (isFav(currentPlace)) {
    favorites = favorites.filter((f) => !same(f, currentPlace));
  } else {
    if (favorites.length >= 8) { showError("You can save up to 8 places. Remove one first."); return; }
    favorites.push(currentPlace);
  }
  save("petalcast-favs", favorites);
  updateFavButton();
  $("status-live").textContent = isFav(currentPlace) ? "Place saved" : "Place removed from saved";
});

/* =========================================================
   10. SEARCH BOX
   ========================================================= */
$("search-form").addEventListener("submit", async (event) => {
  event.preventDefault();                       // stop the page from reloading
  const query = $("city").value.trim();
  if (!query) { showError("Type a city name to search."); return; }

  $("error").hidden = true;
  try {
    const results = await searchCities(query);
    if (results.length === 0) {
      showError(`No city found for “${query}”. Check the spelling or try a nearby city.`);
      return;
    }
    if (results.length === 1) { pick(results[0]); return; }
    showSuggestions(results);
  } catch (err) {
    showError("Couldn't search right now. Check your connection and try again.");
  }
});

function showSuggestions(results) {
  const list = $("suggestions");
  list.innerHTML = results.map((r, i) => `
    <li><button type="button" data-i="${i}">
      ${esc(r.name)} <small>${esc([r.admin1, r.country].filter(Boolean).join(", "))}</small>
    </button></li>`).join("");
  list.hidden = false;
  list.onclick = (e) => {
    const btn = e.target.closest("button");
    if (btn) pick(results[btn.dataset.i]);
  };
}

function pick(r) {
  $("city").value = "";
  loadPlace({ name: r.name, region: r.admin1 || r.country || "", lat: r.latitude, lon: r.longitude });
}

// Close the suggestion list when clicking elsewhere
document.addEventListener("click", (e) => {
  if (!e.target.closest(".search")) $("suggestions").hidden = true;
});

/* =========================================================
   11. "USE MY LOCATION"
   ========================================================= */
$("locate").addEventListener("click", () => {
  if (!("geolocation" in navigator)) {
    showError("Your browser can't share its location. Search for a city instead.");
    return;
  }
  const previous = view;
  show("loading");
  navigator.geolocation.getCurrentPosition(
    (pos) => loadPlace({ name: "Your location", region: "", lat: pos.coords.latitude, lon: pos.coords.longitude }),
    (err) => {
      show(previous);
      showError(err.code === 1
        ? "Location access was blocked. Allow it in your browser settings, or search for a city."
        : "Couldn't find your location. Search for a city instead.");
    },
    { timeout: 10000 }
  );
});

/* =========================================================
   12. NAVIGATION + UNIT TOGGLE
   ========================================================= */
function goHome() {
  show("home");
  renderHome();
  window.scrollTo(0, 0);
}
$("brand").addEventListener("click", goHome);
$("back").addEventListener("click", goHome);

function setUnits(next) {
  units = next;
  save("petalcast-units", units);
  $("unit-c").setAttribute("aria-pressed", units === "metric");
  $("unit-f").setAttribute("aria-pressed", units === "imperial");
  if (view === "weather" && currentPlace) loadPlace(currentPlace);   // redraw with new units
  else renderHome();
}
$("unit-c").addEventListener("click", () => setUnits("metric"));
$("unit-f").addEventListener("click", () => setUnits("imperial"));

/* =========================================================
   13. START UP
   ========================================================= */
$("unit-c").setAttribute("aria-pressed", units === "metric");
$("unit-f").setAttribute("aria-pressed", units === "imperial");
show("home");
renderHome();
