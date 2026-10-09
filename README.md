# PVTools

[![Website](https://img.shields.io/website?up_message=online&url=https%3A%2F%2Fpvtools.sektorsonne.de%2F)](https://pvtools.sektorsonne.de)

PV Auslegungsrechner für mit Support für

- Batteriespeicher
- Mehrere Dachflächen

## Local hosting on Windows

The project consists of a **Nuxt 2 frontend** and an **Express backend**.
Run both in separate PowerShell terminals in VS Code.

### Prerequisites

- Install Node.js and npm.
- Internet access is required for external PVGIS and geocoding API requests.
- No database is required for the currently enabled backend endpoints.

This project uses older dependencies, including Nuxt 2 and Webpack 4.
Current Node.js versions may cause compatibility issues.

### 1. Start the backend

Open a PowerShell terminal and navigate to the backend directory:

```powershell
cd "C:\Users\KurtRiede\git\GitHub\PVTools\backend"
npm install
npm start
```

The backend listens on <http://localhost:8082> by default and forwards
requests from the frontend to external APIs. Keep this terminal running.

### 2. Start the frontend

Open a second PowerShell terminal and navigate to the frontend directory:

```powershell
cd "C:\Users\KurtRiede\git\GitHub\PVTools\pvtools"
npm install
npm run dev
```

Open <http://localhost:3000> in your browser. Keep this terminal running as well.

Adjust the directory paths above if the repository is stored elsewhere.
You only need to repeat `npm install` when dependencies need to be installed
or updated, not every time you start the application.

### Local configuration

In development mode, `pvtools/nuxt.config.js` already configures the frontend
to use the backend at `http://localhost:8082`. No additional environment
variables are required for this procedure. Leave `NODE_ENV` unset or set to
`development`; the production configuration expects an HTTPS `APP_URL`.

### Troubleshooting: OpenSSL error

If the frontend reports `ERR_OSSL_EVP_UNSUPPORTED`, set the following
compatibility workaround in the frontend PowerShell terminal and retry:

```powershell
$env:NODE_OPTIONS = "--openssl-legacy-provider"
npm run dev
```

This setting applies to the current terminal session. It is a temporary
workaround for the older build tooling, not a dependency upgrade.

### Stopping the application

Press **Ctrl+C** in each terminal to stop the frontend and backend.

### Security note

Use this procedure for local development only. **Do not expose the backend
port publicly:** the URL check in `backend/api/relay.ts` does not currently
provide an effective restriction on forwarded request destinations.

## Custom consumption file

`pvtools/custom-consumption.yaml` describes additional electricity consumers
in YAML. The top-level `consumptions` key contains a list of entries. Each
entry must include a descriptive `name` and a `type`. The required `type`
selects the entry format: `heating` or `electric-car`.

The application loads this file automatically and adds all configured loads to
the household H0 profile before calculating PV self-consumption and battery
operation. The annual consumption entered in the UI is **household consumption
only**: do not include these additional loads there. Self-sufficiency and annual
consumption results use the combined load.

The file is bundled with the frontend. Development mode reloads it when it
changes; production deployments require rebuilding the frontend. To disable
additional loads, keep the file and set `consumptions: []`. Invalid YAML or
entries stop calculation and display a `Custom consumption:` error.

All schedules use **UTC**, aligned with the hourly PVGIS model; there is no
local-time or daylight-saving conversion. Partial hours contribute proportional
energy to the hourly load (average W, numerically equal to Wh in each hour).

### Scheduled appliances

A heating appliance requires `type: heating` and uses a daily operating window
and a date range. Electricity consumption is assumed to be constant power:

```yaml
consumptions:
  - name: Pool heater in spring
    type: heating
    power: 2500
    schedule: "05:00-22:00"
    start-date: "2024-04-01"
    end-date: "2024-05-31"
```

| Field | Format | Meaning |
| --- | --- | --- |
| `name` | Text | Human-readable consumer name. |
| `type` | `heating` | Required. Selects the scheduled heating appliance format. |
| `power` | Number, W | Electrical power while the appliance is running; `2500` means 2.5 kW. |
| `schedule` | Quoted `HH:MM-HH:MM` | Daily operating window in 24-hour notation. |
| `start-date` | Quoted `YYYY-MM-DD` | Inclusive first operating day, recurring by month/day. |
| `end-date` | Quoted `YYYY-MM-DD` | Inclusive last operating day, recurring by month/day. |

Use separate entries for seasonal schedules, as shown by the three pool-heater
entries in the sample file. Dates must be valid, but their year is ignored when
applying the schedule: April 2024 runs in April of the selected calculation
year. A February 29-only schedule runs only in leap years. A date range ending
before it starts wraps around New Year (for example November through March).

The daily window includes its start and excludes its end. An end time earlier
than the start means overnight operation, continuing into the following day
even after the last scheduled date. Use `00:00-24:00` for a full day; equal
start and end times are rejected. Independent consumers are added together.

### Electric cars

An electric-car entry requires `type: electric-car`, charging power, battery
capacity, and weekly charging start events instead of the appliance fields:

```yaml
consumptions:
  - name: Electric car
    type: electric-car
    power: 11000
    capacity: 50000
    starts: "monday:20%,20:00,wednesday:20%,08:00,friday:20%,15:00"
```

| Field | Format | Meaning |
| --- | --- | --- |
| `name` | Text | Human-readable vehicle name. |
| `type` | `electric-car` | Required. Selects the electric-car entry format. |
| `power` | Number, W | Full-rate charging power up to 80% state of charge; `11000` means 11 kW. |
| `capacity` | Number, Wh | Battery energy capacity; `50000` means 50 kWh. |
| `starts` | Quoted text | Weekly events in the form `weekday:percentage%,HH:MM`, joined by commas. |

Li-ion charging is simulated in two constant-power stages: the configured
`power` (11 kW in the example) up to **80% state of charge**, then **3.6 kW**
until fully charged. If the configured charger power is below 3.6 kW, the
second stage uses that lower power instead.

For example, `monday:20%,20:00` describes a Monday charging start at 20:00,
replenishing **20% of battery capacity**, not charging from 20% to 100%.
The initial state of charge is therefore `100% - percentage`: this event
starts at 80% and uses only the slower stage. Each event independently
replenishes its specified energy to 100%; vehicle usage between events is
not simulated.
Use lowercase English weekday names
(`monday` through `sunday`) and preferably two-digit hours, such as `08:00`.
Single-digit hours (`8:00`) and spaces between events are accepted.

Charging starts every matching weekday. For a 50 kWh battery:

- `20%` replenishment delivers 10 kWh at 3.6 kW, taking **2 hours 46 minutes
  40 seconds**.
- `60%` replenishment starts at 40% state of charge, delivers 20 kWh at
  11 kW to reach 80%, then 10 kWh at 3.6 kW to reach 100%. Total duration is
  approximately **4 hours 35 minutes 45 seconds**.

Stage transitions and partial hours are integrated into the hourly load
profile without changing the requested replenishment energy. No additional
vehicle charging losses are modeled. Percentages must be greater than zero
and no more than 100; powers and capacities must be positive numbers.

Charging may cross midnight or New Year. Only energy falling within the
calculation year is counted, including carry-in from the previous week's
recurring events. Overlapping events for the same vehicle are rejected;
different vehicles may charge simultaneously and their loads are added.

Use spaces for YAML indentation, keep times and dates quoted, and store powers
and capacities as numbers without unit suffixes. Comments begin with `#`.
Both entry formats can be mixed in the same `consumptions` list.

## API-Foundation

<https://re.jrc.ec.europa.eu/api/v5_2/>

<https://re.jrc.ec.europa.eu/api/v5_2/SHScalc?lat=45&lon=8&outputformat=json&peakpower=10&batterysize=50&consumptionday=200&cutoff=40>

Dokumentation:

<https://joint-research-centre.ec.europa.eu/pvgis-photovoltaic-geographical-information-system/getting-started-pvgis/api-non-interactive-service_en>

Frontend fragt Backend an mit:

Anfrage Body:

- Link für die Abfrage
- Body für die Abfrage
- HTTP Method

Backend nimmt die Daten und fragt bei "Link" mit "Body" an

Backend schickt Antwort von "Link" an Frontend zurück
