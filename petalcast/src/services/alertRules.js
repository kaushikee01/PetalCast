// The rules for each kind of alert. This file only does maths on data, no network or
// database, which makes it easy to test.
//
// Thresholds are ALWAYS stored in metric: °C, km/h, % and US AQI.

const ALERT_TYPES = {
  rain:  { label: "Rain",            unit: "%",    default: 60,   min: 10,  max: 100, help: "Alert me when the chance of rain in the next 24 hours reaches this." },
  heat:  { label: "Heat",            unit: "°C",   default: 38,   min: 25,  max: 55,  help: "Alert me when today's high reaches this." },
  cold:  { label: "Cold",            unit: "°C",   default: 5,    min: -40, max: 15,  help: "Alert me when today's low drops to this." },
  wind:  { label: "Strong wind",     unit: "km/h", default: 40,   min: 15,  max: 150, help: "Alert me when wind in the next 24 hours reaches this." },
  aqi:   { label: "Air quality",     unit: "AQI",  default: 150,  min: 51,  max: 400, help: "Alert me when the US AQI reaches this." },
  daily: { label: "Morning summary", unit: "",     default: null, min: null, max: null, help: "A short forecast every morning at 7 am local time." }
};

// Don't repeat the same alert too soon (hours)
const COOLDOWN_HOURS = { daily: 20, default: 12 };

function aqiLabel(a) {
  if (a <= 50) return "good";
  if (a <= 100) return "moderate";
  if (a <= 150) return "unhealthy for sensitive groups";
  if (a <= 200) return "unhealthy";
  if (a <= 300) return "very unhealthy";
  return "hazardous";
}

function weatherText(code) {
  if (code === 0) return "Clear";
  if (code <= 2) return "Mostly clear";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Foggy";
  if (code >= 51 && code <= 57) return "Drizzly";
  if (code >= 61 && code <= 67) return "Rainy";
  if (code >= 71 && code <= 77) return "Snowy";
  if (code >= 80 && code <= 82) return "Showery";
  if (code === 85 || code === 86) return "Snowy";
  if (code >= 95) return "Stormy";
  return "Mixed";
}

// Which position in the hourly list is "now"?
function currentHourIndex(f) {
  const key = f.current.time.slice(0, 13) + ":00";
  const i = f.hourly.time.indexOf(key);
  return i < 0 ? 0 : i;
}

// What hour is it at the place itself? (Open-Meteo tells us the offset from UTC.)
function localHour(f, nowMs = Date.now()) {
  const offset = f.utc_offset_seconds || 0;
  return new Date(nowMs + offset * 1000).getUTCHours();
}

function next24(list, start) {
  return list.slice(start, start + 24).filter((v) => v !== null && v !== undefined);
}

// Returns { title, body } if the alert should fire, or null if not.
function evaluate(alert, f, air, nowMs = Date.now()) {
  const place = alert.name;

  switch (alert.type) {
    case "rain": {
      const values = next24(f.hourly.precipitation_probability, currentHourIndex(f));
      if (!values.length) return null;
      const max = Math.max(...values);
      if (max < alert.threshold) return null;
      return {
        title: `Rain expected in ${place}`,
        body: `There's up to a ${max}% chance of rain in the next 24 hours. Take an umbrella.`
      };
    }

    case "heat": {
      const high = f.daily.temperature_2m_max[0];
      if (high === null || high === undefined || high < alert.threshold) return null;
      return {
        title: `Hot day in ${place}`,
        body: `Today's high is ${Math.round(high)}°C. Drink plenty of water and avoid the midday sun.`
      };
    }

    case "cold": {
      const low = f.daily.temperature_2m_min[0];
      if (low === null || low === undefined || low > alert.threshold) return null;
      return {
        title: `Cold day in ${place}`,
        body: `Today's low is ${Math.round(low)}°C. Dress in warm layers.`
      };
    }

    case "wind": {
      const values = next24(f.hourly.wind_speed_10m || [], currentHourIndex(f));
      if (!values.length) return null;
      const max = Math.max(...values);
      if (max < alert.threshold) return null;
      return {
        title: `Strong wind in ${place}`,
        body: `Winds could reach ${Math.round(max)} km/h in the next 24 hours. Secure loose items outdoors.`
      };
    }

    case "aqi": {
      const aqi = air && air.current ? air.current.us_aqi : null;
      if (aqi === null || aqi === undefined || aqi < alert.threshold) return null;
      return {
        title: `Poor air quality in ${place}`,
        body: `The US AQI is ${aqi} (${aqiLabel(aqi)}). Limit time outdoors and consider a mask.`
      };
    }

    case "daily": {
      if (localHour(f, nowMs) !== 7) return null;       // only send around 7 am local time
      const hi = Math.round(f.daily.temperature_2m_max[0]);
      const lo = Math.round(f.daily.temperature_2m_min[0]);
      const rain = f.daily.precipitation_probability_max[0] ?? 0;
      return {
        title: `Good morning, ${place}`,
        body: `${weatherText(f.daily.weather_code[0])} today, ${lo}° to ${hi}°C, with a ${rain}% chance of rain.`
      };
    }

    default:
      return null;
  }
}

function isOnCooldown(alert, nowMs = Date.now()) {
  if (!alert.last_triggered_at) return false;
  const hours = COOLDOWN_HOURS[alert.type] ?? COOLDOWN_HOURS.default;
  return nowMs - alert.last_triggered_at < hours * 3600 * 1000;
}

module.exports = { ALERT_TYPES, evaluate, isOnCooldown, aqiLabel, currentHourIndex, localHour };
