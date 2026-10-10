# Netzdienliches Laden

In den Experten-Einstellungen aktivieren. Stündliche Day-Ahead-Preise
für das ausgewählte Vergleichsjahr werden automatisch geladen, alternativ per CSV importiert. Ohne vollständige Preise
wird nicht gerechnet; es gibt keine erfundenen Ersatzpreise.

## Automatischer Abruf und Cache

Energy-Charts / Fraunhofer ISE (`https://api.energy-charts.info/price`), Gebotszone
DE-LU, liefert historische Preise in EUR/MWh ohne API-Schlüssel.
Abruf erfolgt über den Backend-Relay (Anbieter-CORS verhindert direkten Browserzugriff).
Quelle der geprüften Daten: Bundesnetzagentur / SMARD, CC BY 4.0. Quellenangabe und
Lizenzinformationen der Antwort bleiben im Cache erhalten.

Jahrescache: `pvtools:dayAheadPrices:v1:DE-LU:<Jahr>` in localStorage, ohne Ablauf.
„Preise neu laden (statt CSV)“ umgeht den Cache und wechselt nach erfolgreichem
Abruf zur automatischen Quelle. Fehlgeschlagene Aktualisierung behält alte Daten.
Speicherfehler verhindern keine Simulation. Historische Daten können korrigiert werden.
Fehlende Anbieterjahre, Lücken und nichtnumerische Preise führen zu einer Fehlermeldung;
ein CSV-Import bleibt möglich. DE-LU existiert erst seit 2018; ältere Gebotszonen
werden nicht stillschweigend gleichgesetzt. HTTP 429 wird ohne automatische Wiederholungen gemeldet.

UTC-Zeitstempel werden explizit nach Europe/Berlin umgerechnet. Die doppelte
Herbststunde wird gemittelt, ausschließlich die fehlende Sommerzeitstunde
interpoliert. Das bildet das vorhandene 24-Stunden-Kalenderraster ab, nicht
exakte verstrichene Zeit an Zeitumstellungstagen.

## Preisdatei

CSV mit den Spalten `dayTime,price`. `dayTime` ist eine lokale Kalenderstunde
im Format `YYYYMMDD:HH`; `price` ist der Börsenpreis in EUR/MWh, auch negativ.
Komma oder Semikolon als Trennzeichen werden unterstützt. Bei Semikolon
sind Dezimalkommas erlaubt. Jede Stunde des Jahres muss genau einmal vorliegen:
8760 Zeilen bzw. 8784 im Schaltjahr. Unterstützt werden Vergleichsjahre 2005–2023.

Die Simulation verwendet 24 lokale Stunden pro Kalendertag. Datenanbieter mit
UTC-Zeitstempeln müssen deshalb vor dem Import nach deutscher Lokalzeit
umgerechnet werden: die fehlende Sommerzeitstunde interpolieren und die doppelte
Herbststunde mitteln, nicht summieren. Beim Jahreswechsel neue Preise importieren.

## Steuerung und Grenzen

- Standardmäßig ausgeschaltet: bisherige Berechnung bleibt unverändert.
- Preise bis zur eingestellten Schwelle (Standard 0 EUR/MWh) kennzeichnen
  Überschussstunden. Das ist eine **Näherung, keine lokale Netzüberlastungsprognose**.
- Rollierender Horizont: aktuelle Stunde plus die nächsten 23 Kalenderstunden.
  Keine Jahresschleife und kein Zugriff auf spätere Prognosen für die Entscheidung.
- Vor Überschussstunden wird Platz für deren prognostizierte PV-Überschüsse
  reserviert. In Überschussstunden lädt die Batterie möglichst viel PV.
- Prognostiziertes Angebot berücksichtigt direkte Verbraucher, Wärmepumpe,
  E-Auto, Wechselrichterlimit, Ladeleistung und Wirkungsgrad.
- Ladeziel begrenzt nur die Ladung: Mindest-SOC, physische Kapazität,
  normale Lastversorgung und Energieerhaltung bleiben bestehen.
- Keine Netzladung und keine absichtliche Batterieentladung ins Netz.
- Ideale PV-/Verbrauchsprognosen, konservative Heuristik, kein globales Optimum.
  Künftige Entladung wird nicht als frei werdender Platz angerechnet;
  es kann daher mehr Kapazität als nötig reserviert werden. Außerhalb der
  Überschussstunden kann die Einspeisung steigen, die Autarkie kann sinken.
- Wirtschaftlichkeit verwendet weiterhin den festen Stromtarif und die
  Einspeisevergütung. Börsenpreise dienen ausschließlich als Steuersignal.

Die Ergebnisse zeigen die Zahl der Überschussstunden und die Einspeisung
während dieser Stunden je Speichergröße, einschließlich Referenz ohne Speicher.

Regressionstests: `gridFriendlyCharging.test.js` und `priceImport.test.js`.
