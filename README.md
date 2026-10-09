[![Website](https://img.shields.io/website?up_message=online&url=https%3A%2F%2Fpvtools.sektorsonne.de%2F)](https://pvtools.sektorsonne.de)

# PVTools
PV-Auslegungsrechner mit Unterstützung für
- Batteriespeicher
- Mehrere Dachflächen
- Zusätzliche, zeitgesteuerte Verbraucher aus YAML

## Lokal unter Windows starten

Das Projekt besteht aus einem **Vue-3-/Vite-Frontend** und einem
**Express-/TypeScript-Backend**. Beide laufen in separaten PowerShell-Terminals.

### Voraussetzungen

- Node.js **22.21 oder neuer innerhalb der unterstützten 22.x-Reihe**, alternativ
	eine unterstützte neuere LTS-Version (z. B. 24.x), sowie npm. Vite 8 benötigt
	mindestens Node.js 20.19 oder 22.12; für dieses Projekt wird 22.21+ empfohlen.
- Internetzugang für PVGIS und die Nominatim-Ortssuche; eine Datenbank ist nicht nötig.
- Repository in VS Code öffnen. Die folgenden Pfade ggf. anpassen.

### Backend

In einem PowerShell-Terminal:

```powershell
Set-Location "C:\Users\KurtRiede\git\GitHub\PVTools\backend"
npm install
npm start
```

Das Backend lauscht standardmäßig auf <http://localhost:8082>. Es stellt
`POST /relay` bereit, keine Entwicklungsoberfläche. Das Terminal geöffnet lassen.

### Frontend

In einem zweiten PowerShell-Terminal:

```powershell
Set-Location "C:\Users\KurtRiede\git\GitHub\PVTools\pvtools"
npm install
npm run dev
```

Die Anwendung unter <http://localhost:3000> öffnen. `pvtools/vite.config.js`
verwendet im Entwicklungsmodus automatisch `http://localhost:8082` als Backend.
Keine zusätzliche Konfiguration ist für den lokalen Start erforderlich.
`npm install` nur bei der ersten Einrichtung oder geänderten Abhängigkeiten
wiederholen. Mit **Strg+C** beide Prozesse stoppen.

### VS-Code-Tasks und Prüfung

Die vorhandenen Tasks bleiben nutzbar: **PVTools: Backend**, **PVTools: Frontend**,
**PVTools: Open Browser** und **PVTools: Start All**. Über „Terminal → Task
ausführen“ auswählen; der Standard-Build-Task startet beide Dienste und öffnet
den Browser. Einen bereits laufenden Dienst nicht nochmals starten.

Im Frontend-Verzeichnis erzeugt `npm run build` die statische Anwendung in
`dist/`; `npm run preview` zeigt diesen Build und `npm run test-all` führt die
Frontend-Tests aus. Im Backend-Verzeichnis prüfen `npm run compile-ts` und
anschließend `node --test api/relay.test.js` den Relay. Vorschau und statischer
Build ersetzen das Backend nicht.

### Konfiguration und Sicherheit

- Frontend: `APP_URL` ist die Backend-Basis-URL inklusive Protokoll und optionalem
	Port. Ohne diese Variable verwendet Vite im Entwicklungsmodus localhost:8082,
	im Build den gleichen Ursprung (`/relay`). Nach Änderungen neu starten bzw.
	neu bauen. Weitere Build-Variablen stehen in [pvtools/README.md](pvtools/README.md).
- Backend: `REQUEST_PORT` überschreibt Port 8082. Für die lokale Entwicklung
	`NODE_ENV` nicht auf `production` setzen. Die aktuelle Produktions-CORS-Konfiguration
	erwartet im **Backend** `APP_URL` als Frontend-Host ohne `https://` (sie ergänzt
	das Protokoll selbst); das ist nicht dasselbe Format wie die Frontend-Variable.
- `RELAY_USER_AGENT` überschreibt die PVTools-Anwendungskennung.
	`NOMINATIM_EMAIL` ergänzt bei Nominatim eine Betreiber-Kontaktadresse als
	`email`-Queryparameter, sofern die Anfrage noch keinen enthält. Beide Variablen
	vor dem Backend-Start setzen. Echte Kontaktdaten nicht im Repository hinterlegen;
	die Adresse wird an Nominatim übertragen. Beispielwerte wären
	`PVTools/1.0 (https://example.org/pvtools)` und `operator@example.org`.
- Der Relay erlaubt nur `GET` über HTTPS zu `re.jrc.ec.europa.eu` und
	`nominatim.openstreetmap.org`, ohne Zugangsdaten und nur auf dem Standardport
	443. Weiterleitungen werden nicht verfolgt. Ungültige URLs ergeben 400,
	unzulässige Methoden oder Ziele 403. Tatsächliche Upstream-HTTP-Statuscodes
	und Antwortdaten werden weitergegeben, insbesondere 400 und 429.
- Der **15-Sekunden-Timeout** bleibt für die lokalen Regressionstests erhalten
	und beendet langsame Anfragen zeitnah statt erst nach 60 Sekunden.
	Transport-Timeouts ergeben 504, sonstige Transportfehler 502.
- Backend nicht ungeschützt öffentlich freigeben: Die Ziel-Allowlist ersetzt
	keine Zugriffskontrolle oder Ratenbegrenzung. Die
	[Nominatim-Nutzungsrichtlinie](https://operations.osmfoundation.org/policies/nominatim/)
	gilt weiterhin.

## Zusätzlicher Verbrauch aus YAML

`pvtools/custom-consumption.yaml` enthält unter `consumptions` eine Liste
zusätzlicher Verbraucher. Jeder Eintrag benötigt `name`, `type` und `power`.
Die Formate des Forks bleiben **`heating`** und **`electric-car`**; beide können
in derselben Liste stehen. Zahlen ohne Einheitensuffix schreiben, Zeiten und
Datumsangaben in Anführungszeichen setzen, mit Leerzeichen einrücken.
Kommentare beginnen mit `#`.

Die Datei wird mit dem Frontend gebündelt und im Web Worker geladen. Änderungen
erfordern im produktiven Betrieb einen neuen Frontend-Build. Zum Abschalten
die Datei behalten und `consumptions: []` setzen. Fehlerhafte Konfiguration
bricht die Berechnung mit einem `Custom consumption:`-Fehler ab.

Die YAML-Verbraucher werden **zusätzlich** zum erzeugten Jahres-/Monatsprofil
oder zum importierten Verbrauchsprofil addiert, ohne das Basisprofil zu ändern.
Der eingegebene Haushaltsverbrauch bzw. das importierte Profil sollte diese
Lasten daher nicht bereits enthalten. YAML-Energie wird nicht auf die
Haushaltszielwerte skaliert. Die separaten Wärmepumpen-/EV-Beta-Lasten der
Oberfläche werden unabhängig berechnet; dieselbe Last nicht doppelt konfigurieren.

### Kalender und Einheiten

Alle Zeitpläne verwenden **deutsche lokale Uhrzeit** passend zu den
`YYYYMMDD:HH`-Simulationslabels, nicht UTC-Zeitpunkte. UTC-Datumsfunktionen dienen
nur deterministischer Kalenderarithmetik. Keine zweite Zeitzonenverschiebung
anwenden. Jeder Kalendertag hat 24 Stunden-Buckets, auch bei Sommer-/Winterzeit;
08:00 bleibt unabhängig von Saison und Browser-Zeitzone im 08-Uhr-Bucket.
Dies ist kein Modell verstrichener Zeit mit 23-/25-Stunden-Tagen.

`power` wird in **W**, EV-`capacity` in **Wh** angegeben. Ein Stundenwert `P`
ist die durchschnittliche Leistung in W, numerisch gleich der Energie in Wh
für diese Stunde. Teilstunden und Ladephasenwechsel werden anteilig integriert.

### Zeitgesteuerte Geräte (`heating`)

```yaml
consumptions:
	- name: Pool heater in spring
		type: heating
		power: 2500
		schedule: "05:00-22:00"
		start-date: "2024-04-01"
		end-date: "2024-05-31"
```

| Feld | Format | Bedeutung |
| --- | --- | --- |
| `name` | Text | Bezeichnung des Verbrauchers |
| `type` | `heating` | Zeitgesteuerter Verbraucher mit konstanter Leistung |
| `power` | Positive Zahl, W | Elektrische Leistung während des Betriebs |
| `schedule` | `HH:MM-HH:MM` | Tägliches Betriebsfenster; einstellige Stunden sind ebenfalls erlaubt |
| `start-date` | Quoted `YYYY-MM-DD` | Erster aktiver Starttag, inklusive |
| `end-date` | Quoted `YYYY-MM-DD` | Letzter aktiver Starttag, inklusive |

Datumsangaben müssen gültig sein; Monat und Tag wiederholen sich im ausgewählten
Berechnungsjahr, das angegebene Jahr validiert nur das Datum. Ein ausschließlich
am 29. Februar liegender Zeitplan läuft nur in Schaltjahren. Ein Enddatum vor dem
Startdatum bedeutet eine Saison über den Jahreswechsel (z. B. November–März).
Separate Einträge erlauben unterschiedliche saisonale Betriebszeiten.

Das tägliche Fenster schließt den Start ein und das Ende aus. Liegt die Endzeit
vor der Startzeit, läuft das Gerät über Mitternacht weiter, auch nach dem letzten
aktiven Starttag. `00:00-24:00` bedeutet einen ganzen Tag; gleiche Start- und
Endzeiten werden abgelehnt. Unabhängige Verbraucher addieren sich.

### Elektroautos (`electric-car`)

```yaml
consumptions:
	- name: Electric car
		type: electric-car
		power: 11000
		capacity: 50000
		starts: "monday:60%,20:00,wednesday:20%,08:00,friday:20%,15:00"
```

| Feld | Format | Bedeutung |
| --- | --- | --- |
| `name` | Text | Fahrzeugbezeichnung |
| `type` | `electric-car` | Fahrzeug mit wöchentlichen Ladestarts |
| `power` | Positive Zahl, W | Ladeleistung bis 80 % Ladezustand |
| `capacity` | Positive Zahl, Wh | Batteriekapazität; 50000 bedeutet 50 kWh |
| `starts` | `weekday:percentage%,HH:MM,...` | Abwechselnd Wochentag/Nachladeanteil und Startzeit |

Wochentage sind kleingeschriebenes Englisch (`monday` bis `sunday`). Leerzeichen
zwischen Einträgen und einstellige Stunden (`8:00`) sind erlaubt. Prozente müssen
größer als 0 und höchstens 100 sein.

**Der Prozentwert ist die nachzuladende Energie bis 100 %, nicht der anfängliche
Ladezustand.** `monday:20%,20:00` startet montags um 20:00 bei 80 % und lädt die
fehlenden 20 % nach. Jeder Start ist ein unabhängiger Nachladevorgang; Fahrten
zwischen den Terminen und zusätzliche Ladeverluste werden nicht simuliert.

Geladen wird mit `power` bis 80 % Ladezustand, danach mit
**`min(power, 3600 W)`** bis 100 %. Für 50 kWh Kapazität und 11 kW Ladeleistung:

- 20 % Nachladen: 10 kWh mit 3,6 kW, Dauer **2 h 46 min 40 s**.
- 60 % Nachladen: Start bei 40 %, zunächst 20 kWh mit 11 kW bis 80 %, danach
	10 kWh mit 3,6 kW; insgesamt ca. **4 h 35 min 45 s**.

Ladevorgänge dürfen Mitternacht und den Jahreswechsel überschreiten. Die
wiederkehrenden Starts der Vorwoche erhalten den Überhang vom Vorjahr.
Energie und Betriebsstunden werden auf das Berechnungsjahr begrenzt; die
Startanzahl zählt nur Starts innerhalb dieses Jahres. Überlappende Termine
desselben Fahrzeugs werden auch über die Wochengrenze abgelehnt. Unterschiedliche
Fahrzeuge dürfen gleichzeitig laden.

Der Worker liefert außerdem `consumptionSummary` mit `year`, `baseKwh`,
`customSummaries` (jeweils `name`, `type`, `count`, `hours`, `energyKwh`),
`customKwh` und `totalKwh`. Separate Beta-Lasten sind nicht Teil dieser
Zusammenfassung, sondern werden in den Simulationsergebnissen berücksichtigt.
Details zu Pipeline, Kalender und Tests:
[functions/CUSTOM_CONSUMPTION.md](pvtools/functions/CUSTOM_CONSUMPTION.md).
Die allgemeine Berechnung ist in
[functions/BERECHNUNG.md](pvtools/functions/BERECHNUNG.md) dokumentiert.

## API-Foundation:
https://re.jrc.ec.europa.eu/api/v5_3/

https://re.jrc.ec.europa.eu/api/v5_3/SHScalc?lat=45&lon=8&outputformat=json&peakpower=10&batterysize=50&consumptionday=200&cutoff=40

Dokumentation:

https://joint-research-centre.ec.europa.eu/pvgis-photovoltaic-geographical-information-system/getting-started-pvgis/api-non-interactive-service_en

Frontend fragt Backend an mit:

Anfrage-Body als JSON:
- `url`: vollständige HTTPS-URL eines erlaubten Dienstes
- `method`: `GET`

Das Frontend sendet diesen Body an `POST /relay`. Das Backend führt eine
GET-Anfrage aus und gibt HTTP-Status und Antwortdaten des Dienstes zurück.
