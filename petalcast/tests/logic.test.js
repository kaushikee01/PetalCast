// Tests for the parts that need no internet or database:  npm test
const assert = require("node:assert");
const { TtlCache } = require("../src/cache");
const v = require("../src/validate");
const { evaluate, isOnCooldown, localHour } = require("../src/services/alertRules");

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log("  ok  ", name);
  } catch (err) {
    console.error("  FAIL", name, "\n      ", err.message);
    process.exitCode = 1;
  }
}

// Builds a fake forecast with 48 hourly slots starting at 2026-10-09 00:00
function fakeForecast(overrides = {}) {
  const hourlyTimes = Array.from({ length: 48 }, (_, i) => {
    const day = i < 24 ? "09" : "10";
    return `2026-10-${day}T${String(i % 24).padStart(2, "0")}:00`;
  });
  return {
    utc_offset_seconds: 19800,                                  // India: +5:30
    current: { time: "2026-10-09T10:15" },
    hourly: {
      time: hourlyTimes,
      precipitation_probability: Array(48).fill(10),
      wind_speed_10m: Array(48).fill(12)
    },
    daily: {
      temperature_2m_max: [31],
      temperature_2m_min: [22],
      precipitation_probability_max: [10],
      weather_code: [1]
    },
    ...overrides
  };
}

(async () => {
  console.log("Cache");
  await test("remembers a value until it expires", async () => {
    const c = new TtlCache();
    let calls = 0;
    const fetcher = async () => ++calls;
    assert.strictEqual(await c.remember("a", 1000, fetcher), 1);
    assert.strictEqual(await c.remember("a", 1000, fetcher), 1);
    assert.strictEqual(calls, 1);
  });
  await test("expired values are fetched again", async () => {
    const c = new TtlCache();
    let calls = 0;
    await c.remember("a", 5, async () => ++calls);
    await new Promise((r) => setTimeout(r, 20));
    await c.remember("a", 5, async () => ++calls);
    assert.strictEqual(calls, 2);
  });
  await test("simultaneous requests share one fetch", async () => {
    const c = new TtlCache();
    let calls = 0;
    const slow = async () => { calls++; await new Promise((r) => setTimeout(r, 30)); return "x"; };
    const results = await Promise.all([c.remember("k", 1000, slow), c.remember("k", 1000, slow), c.remember("k", 1000, slow)]);
    assert.deepStrictEqual(results, ["x", "x", "x"]);
    assert.strictEqual(calls, 1);
  });
  await test("a failed fetch is not cached", async () => {
    const c = new TtlCache();
    await assert.rejects(c.remember("k", 1000, async () => { throw new Error("boom"); }));
    assert.strictEqual(await c.remember("k", 1000, async () => "ok"), "ok");
  });
  await test("oldest entry is dropped when full", () => {
    const c = new TtlCache(2);
    c.set("a", 1, 1000); c.set("b", 2, 1000); c.set("c", 3, 1000);
    assert.strictEqual(c.get("a"), undefined);
    assert.strictEqual(c.get("c"), 3);
  });

  console.log("Validation");
  await test("accepts good coordinates", () => {
    assert.strictEqual(v.lat("28.61"), 28.61);
    assert.strictEqual(v.lon(-122.4), -122.4);
  });
  await test("rejects bad coordinates", () => {
    assert.throws(() => v.lat("500"), /between -90 and 90/);
    assert.throws(() => v.lon("abc"));
    assert.throws(() => v.lat(undefined), /required/);
    assert.throws(() => v.lat(""), /required/);
    assert.throws(() => v.lat(null), /required/);
  });
  await test("units default to metric and reject nonsense", () => {
    assert.strictEqual(v.units(undefined), "metric");
    assert.strictEqual(v.units("imperial"), "imperial");
    assert.throws(() => v.units("kelvin"));
  });
  await test("emails are cleaned and checked", () => {
    assert.strictEqual(v.email("  Pri@Example.COM "), "pri@example.com");
    assert.throws(() => v.email("not-an-email"));
    assert.throws(() => v.email(123));
  });
  await test("passwords must be 8 to 72 characters", () => {
    assert.throws(() => v.password("short"));
    assert.throws(() => v.password("x".repeat(80)));
    assert.strictEqual(v.password("long-enough-1"), "long-enough-1");
  });
  await test("text is trimmed and length-checked", () => {
    assert.strictEqual(v.text("  Delhi ", "name"), "Delhi");
    assert.throws(() => v.text("", "name"));
    assert.throws(() => v.text(["a"], "name"));
    assert.strictEqual(v.text(undefined, "region", { optional: true }), "");
  });
  await test("place keys match nearby coordinates", () => {
    assert.strictEqual(v.placeKey(28.6139, 77.209), v.placeKey(28.614, 77.2091));
  });

  console.log("Alert rules");
  await test("rain fires at or above the threshold", () => {
    const f = fakeForecast();
    f.hourly.precipitation_probability[14] = 75;
    const r = evaluate({ type: "rain", threshold: 60, name: "Delhi" }, f, null);
    assert.ok(r && /Rain expected in Delhi/.test(r.title));
    assert.match(r.body, /75%/);
  });
  await test("rain stays quiet below the threshold", () => {
    assert.strictEqual(evaluate({ type: "rain", threshold: 60, name: "Delhi" }, fakeForecast(), null), null);
  });
  await test("rain only looks at the next 24 hours", () => {
    const f = fakeForecast();
    f.hourly.precipitation_probability[3] = 99;   // 3 am, already past (now is 10 am)
    assert.strictEqual(evaluate({ type: "rain", threshold: 60, name: "X" }, f, null), null);
  });
  await test("heat and cold use today's high and low", () => {
    const f = fakeForecast({ daily: { ...fakeForecast().daily, temperature_2m_max: [41], temperature_2m_min: [2] } });
    assert.ok(evaluate({ type: "heat", threshold: 38, name: "X" }, f, null));
    assert.ok(evaluate({ type: "cold", threshold: 5, name: "X" }, f, null));
    assert.strictEqual(evaluate({ type: "heat", threshold: 45, name: "X" }, f, null), null);
  });
  await test("wind alert works", () => {
    const f = fakeForecast();
    f.hourly.wind_speed_10m[12] = 55;
    assert.ok(evaluate({ type: "wind", threshold: 40, name: "X" }, f, null));
  });
  await test("air quality alert works and handles missing data", () => {
    const air = { current: { us_aqi: 220 } };
    const r = evaluate({ type: "aqi", threshold: 150, name: "X" }, fakeForecast(), air);
    assert.match(r.body, /220.*very unhealthy/);
    assert.strictEqual(evaluate({ type: "aqi", threshold: 150, name: "X" }, fakeForecast(), null), null);
  });
  await test("morning summary only fires at 7 am local time", () => {
    const f = fakeForecast();
    // 01:30 UTC + 5:30 = 07:00 in India
    const sevenAmIndia = Date.UTC(2026, 9, 9, 1, 30);
    assert.strictEqual(localHour(f, sevenAmIndia), 7);
    assert.ok(evaluate({ type: "daily", name: "Delhi" }, f, null, sevenAmIndia));
    assert.strictEqual(evaluate({ type: "daily", name: "Delhi" }, f, null, sevenAmIndia + 3 * 3600 * 1000), null);
  });
  await test("cooldown stops repeat alerts", () => {
    const now = Date.now();
    assert.strictEqual(isOnCooldown({ type: "rain", last_triggered_at: now - 3600 * 1000 }, now), true);
    assert.strictEqual(isOnCooldown({ type: "rain", last_triggered_at: now - 13 * 3600 * 1000 }, now), false);
    assert.strictEqual(isOnCooldown({ type: "rain", last_triggered_at: null }, now), false);
  });

  console.log(`\n${passed} checks passed${process.exitCode ? ", some FAILED" : ""}.`);
})();
