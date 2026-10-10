# pvtools

Frontend des PV-Auslegungsrechners, gebaut mit [Vue 3](https://vuejs.org), [Vite](https://vite.dev), [Tailwind CSS](https://tailwindcss.com) und [Chart.js](https://www.chartjs.org). Die Simulation läuft in einem Web Worker, damit die Oberfläche bedienbar bleibt.

## Requirements

- Node.js 22.21+ on the supported 22.x line, or a supported newer LTS release (e.g. 24.x). Vite 8 requires at least Node.js 20.19 or 22.12.
- NPM

## Build Setup

```bash
# install dependencies
$ npm install

# serve with hot reload at localhost:3000 (expects the backend at localhost:8082)
$ npm run dev

# build the static site into dist/
$ npm run build

# preview the build
$ npm run preview

# run the unit tests
$ npm run test-all
```

## Environment variables (build time)

| Variable            | Description                                                                                         | Default if not set                                          |
| ------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| APP_URL             | Base URL of the backend, e.g. `https://pvtools.example.com`. The frontend posts to `$APP_URL/relay` | build: same origin (`/relay`), dev: `http://localhost:8082` |
| GOOGLE_ANALYTICS_ID | Google Analytics 4 measurement ID (`G-...`), Google Analytics is disabled if empty                  | (not set)                                                   |

## Docker

```bash
# Build image with defaults (backend reachable under /relay of the same origin)
$ docker build --tag pvtools-frontend:latest .

# Build image with custom settings
$ docker build --build-arg APP_URL=https://backend.example.com:8443 --build-arg GOOGLE_ANALYTICS_ID=G-XXXXXXXXXX --tag pvtools-frontend:latest .

# Run image
$ docker run --publish 8080:8080 pvtools-frontend:latest
```

## Structure

| Path                    | Content                                                                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `main.js`, `style.css`  | App entry, Tailwind theme (light/dark colors, fonts)                                                                                         |
| `router.js`             | Routes `/`, `/impress`, `/consumptionProfiles`                                                                                               |
| `pages/`                | Pages                                                                                                                                        |
| `components/inputs/`    | Input steps (location, roofs, consumption, costs, expert settings)                                                                           |
| `components/results/`   | Recommendation, KPIs, charts, table and details                                                                                              |
| `components/ui/`        | Small building blocks (cards, number fields, compass)                                                                                        |
| `composables/`          | Shared state (`useCalculator`) and dark mode (`useTheme`)                                                                                    |
| `lib/`                  | Backend/PVGIS requests, number formatting, chart theme, downloads                                                                            |
| `data/faq.js`           | FAQ and news                                                                                                                                 |
| `functions/`            | Calculation logic (energy flow, simulation, load profiles, CSV) and tests, explained in [`functions/BERECHNUNG.md`](functions/BERECHNUNG.md) |
| `functions/*.worker.js` | Web Worker running the simulation                                                                                                            |
| `public/`               | Static files, served as is                                                                                                                   |

## Fork enhancements

- Local Windows development with the existing VS Code backend/frontend tasks;
  see the [root README](../README.md#lokal-unter-windows-starten).
- `custom-consumption.yaml` bundles additional scheduled appliances (`heating`)
  and weekly EV replenishment events (`electric-car`) into the simulation worker.
  They add to either the generated household profile or imported consumption,
  without rescaling YAML energy or mutating the base profile. Avoid double counting
  these loads in household input, imported data, or the separate beta load controls.
- Schedules follow German local wall-clock hourly labels, including a fixed
  24-bucket day at daylight-saving transitions. EV percentages describe energy
  replenished to 100%, with configured power up to 80% SOC and
  `min(power, 3600 W)` thereafter. Calendar carry-in and partial-hour energy are
  preserved; overlapping events for the same vehicle are rejected.
- The worker returns `consumptionSummary` alongside results and hours, containing
  base/custom/total kWh and per-consumer starts, hours, and energy. Separate beta
  loads remain part of the simulation results, not this YAML summary.
- The backend relay restricts upstream targets, disables redirects, supports
  operator-configured `RELAY_USER_AGENT` / `NOMINATIM_EMAIL`, and forwards actual
  upstream HTTP responses. Its 15-second timeout maps transport timeouts to 504
  and other transport failures to 502.

See [functions/CUSTOM_CONSUMPTION.md](functions/CUSTOM_CONSUMPTION.md) for the
calendar, units, worker response contract, and regression coverage, and the
[root YAML guide](../README.md#zusätzlicher-verbrauch-aus-yaml) for complete
configuration formats and examples. Use `consumptions: []` to disable YAML loads;
production changes require a fresh frontend build.
