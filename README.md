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
