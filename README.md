# PetalCast

A pink weather app with its own backend. The backend fetches weather from Open-Meteo, caches it,
and (optionally) lets people create accounts, save places and get weather alerts.

## 1. Run it

You need **Node.js 20 or newer** (https://nodejs.org, pick the LTS version).

```bash
cd petalcast
npm install                 # downloads the libraries (needs internet)
cp .env.example .env        # then open .env and set JWT_SECRET (see the comment inside)
npm start
```

Open **http://localhost:3000**. The server hosts the website and the API together.

Other commands:

| Command | What it does |
|---|---|
| `npm run dev` | Restarts the server automatically when you edit a file |
| `npm test` | Runs the tests (cache, validation, alert rules) |
| `npm run alerts:run` | Runs the alert check once, right now |

If `npm install` fails on `better-sqlite3`, make sure you're on a current Node LTS version.

## 2. What is where

```
server.js                  starts everything
src/app.js                 security, rate limits, routes
src/config.js              settings from .env
src/db.js                  database tables (SQLite file in data/)
src/cache.js               the weather cache
src/validate.js            checks every input
src/middleware/            errors + login check
src/routes/                one file per group of endpoints
src/services/openmeteo.js  talks to Open-Meteo (through the cache)
src/services/alertRules.js the rules for each alert type
src/services/mailer.js     optional email
src/jobs/alertChecker.js   scheduled alert checks
public/                    the website (weather.html, style.css, app.js)
tests/logic.test.js        tests
```

## 3. The API

Errors always look like `{ "error": { "message": "..." } }`.
Endpoints marked 🔒 need the header `Authorization: Bearer <token>` (you get a token from login/register).

### Weather (public)

| Method | Path | What it does |
|---|---|---|
| GET | `/api/geocode?q=delhi&count=5` | Find cities by name |
| GET | `/api/weather?lat=28.61&lon=77.21&units=metric` | Current, 24-hour and 7-day weather |
| GET | `/api/air?lat=28.61&lon=77.21` | Air quality (US AQI, PM2.5) |
| GET | `/api/cards?lat=28.61,19.07&lon=77.21,72.87&units=metric` | Current weather for up to 20 places at once |
| GET | `/api/health` | Is the server (and database) alive? |

`units` is `metric` (°C, km/h) or `imperial` (°F, mph).

### Accounts

| Method | Path | Body |
|---|---|---|
| POST | `/api/auth/register` | `{ "email", "password" }` (password 8 to 72 characters) |
| POST | `/api/auth/login` | `{ "email", "password" }` |
| GET 🔒 | `/api/auth/me` | |
| DELETE 🔒 | `/api/auth/me` | `{ "password" }` (deletes the account and all its data) |

Both register and login return `{ "token": "...", "user": { "id", "email" } }`.
Tokens last 7 days. To log out, the app just forgets the token.

### Saved places, recents, settings 🔒

| Method | Path | Body |
|---|---|---|
| GET / POST | `/api/places` | POST: `{ "name", "region", "lat", "lon" }` (max 8) |
| DELETE | `/api/places/:id` | |
| GET / POST | `/api/recents` | POST: `{ "name", "region", "lat", "lon" }` (keeps the latest 6) |
| DELETE | `/api/recents` | Clears all recents |
| GET / PUT | `/api/settings` | PUT: `{ "units": "imperial", "emailAlerts": true }` |

### Alerts and notifications

| Method | Path | Notes |
|---|---|---|
| GET | `/api/alerts/types` | The alert types and their limits (public) |
| GET / POST 🔒 | `/api/alerts` | POST: `{ "name", "region", "lat", "lon", "type", "threshold" }` (max 10) |
| PATCH 🔒 | `/api/alerts/:id` | `{ "enabled": false }` and/or `{ "threshold": 70 }` |
| DELETE 🔒 | `/api/alerts/:id` | |
| GET 🔒 | `/api/notifications?unread=1` | The inbox, newest first |
| POST 🔒 | `/api/notifications/read-all` | |
| POST 🔒 | `/api/notifications/:id/read` | |
| DELETE 🔒 | `/api/notifications/:id` | |

Alert types (thresholds are always metric):

| type | Fires when | Default |
|---|---|---|
| `rain` | chance of rain in the next 24 h reaches the threshold | 60 % |
| `heat` | today's high reaches the threshold | 38 °C |
| `cold` | today's low drops to the threshold | 5 °C |
| `wind` | wind in the next 24 h reaches the threshold | 40 km/h |
| `aqi` | US AQI reaches the threshold | 150 |
| `daily` | every morning around 7 am local time (no threshold) | |

The checker runs every 30 minutes (change `ALERT_CRON` in `.env`). The same alert won't repeat
within 12 hours (20 hours for the morning summary). If `SMTP_HOST` is set and the person turned on
`emailAlerts`, alerts are emailed as well as shown in the inbox.

### Try it from the terminal

```bash
# create an account
curl -s -X POST localhost:3000/api/auth/register -H "Content-Type: application/json" \
  -d '{"email":"me@example.com","password":"a-good-password"}'

# save the token it returns:
TOKEN="paste-token-here"

# save a place
curl -s -X POST localhost:3000/api/places -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Delhi","region":"India","lat":28.6139,"lon":77.209}'

# make a rain alert, then run the checker by hand
curl -s -X POST localhost:3000/api/alerts -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Delhi","lat":28.6139,"lon":77.209,"type":"rain","threshold":10}'
npm run alerts:run
curl -s localhost:3000/api/notifications -H "Authorization: Bearer $TOKEN"
```

## 4. How the main ideas work

- **Caching:** a weather answer is reused for 10 minutes (air quality 30 minutes, city search 24 hours).
  Coordinates are rounded to 2 decimals (about 1 km) so nearby requests share an answer. If many
  people ask for the same new city at once, only one request goes to Open-Meteo.
- **Passwords:** stored only as bcrypt hashes. Wrong-email and wrong-password give the same message.
- **Rate limits:** 120 requests per minute per visitor; 10 failed logins per 15 minutes.
- **Every place/alert/notification query includes `AND user_id = ?`,** so nobody can touch another person's data.
- **Secrets** live in `.env`, which is excluded from git.

## 5. Going online

1. Use a host that runs Node (Render, Railway, Fly.io, a VPS).
2. Set `NODE_ENV=production`, a real `JWT_SECRET`, `TRUST_PROXY=true`, and `CORS_ORIGINS` to your site address.
3. Keep the `data/` folder on a persistent disk, otherwise the database resets on each deploy.
4. Serve it over HTTPS (most hosts do this for you).

## 6. Not built yet

- The frontend has no login screen yet. The website still keeps saved places in the browser;
  accounts, synced places and the alerts inbox are available through the API.
- Push notifications (only in-app inbox and email).
- Password reset by email.
- Running more than one server (the cache would need Redis).
