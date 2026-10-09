# YAML custom consumption

`simulation.worker.js` bundles `../custom-consumption.yaml?raw` using Vite.
It parses and adds these consumers to the generated annual/monthly household
profile **or** the imported consumption profile, before `generateDayTimeValues`.
The base profile is copied, not mutated. YAML energy is not scaled to the user's
household annual/monthly targets. Do not include the same appliances in both the
base profile and YAML unless their energy should intentionally be counted twice.

## Calendar and units

- Schedules are **German local wall-clock times**, compatible with the simulation's
  `YYYYMMDD:HH` output labels. UTC date methods are used only for deterministic
  calendar arithmetic; these labels are not UTC instants. Do not apply
  `shiftUtcToGermanTime` to YAML or consumption a second time.
- Like the output calendar, every day has 24 buckets, including daylight-saving
  transition days. A schedule at 08:00 stays in the 08 bucket in winter and summer;
  it does not move with the browser's timezone. This is a wall-clock hourly model,
  not an elapsed-time model of 23/25-hour DST days.
- `power` is W; EV `capacity` is Wh. Each bucket's `P` is average W over one hour,
  numerically equal to Wh. Partial-hour intervals are prorated exactly.
- Heating `start-date` and `end-date` must be quoted valid `YYYY-MM-DD` strings.
  Their month/day recur in the calculation year (the written year only validates
  the date). Both start dates are inclusive; winter ranges may wrap New Year.
  February 29 runs only in leap years. Overnight schedules continue beyond the
  final active start date. `00:00-24:00` means a full day.
- EV `starts` alternates English weekday/percentage and start time, for example
  `monday:60%,20:00,wednesday:20%,08:00`. The percentage is energy to replenish
  **to 100%**, not starting SOC. Charging runs at configured power up to 80% SOC,
  then at `min(power, 3600 W)`. Overlapping events for one car are rejected,
  including overlap across the weekly boundary. Independent entries add together.
- The previous week's recurring starts are included to retain New Year carry-in.
  Energy and hours are clipped to the calculation year; counts include only starts
  within that year. Missing base-profile hours fail with `Custom consumption:`.

## Worker response contract

Success: `{ results, hours, consumptionSummary }`.
Failure: `{ error }` (no partial results).

`consumptionSummary` has exactly these fields:

| Field | Meaning |
| --- | --- |
| `year` | Numeric calculation year |
| `baseKwh` | Sum of selected generated/scaled/imported base `P`, divided by 1000 |
| `customSummaries` | Array of `{ name, type, count, hours, energyKwh }`, in YAML order |
| `customKwh` | Sum of `customSummaries[].energyKwh` |
| `totalKwh` | `baseKwh + customKwh` |

Upstream heat-pump and EV beta loads are still built separately by the simulation.
They are **not** included in this summary; each result's `consumptionYear` and
`consumers` account for them. YAML consumers belong to the household component.

Monthly `batteryLoad` retains its existing name and Wh unit, but now sums gross
`batteryCharge + batteryDischarge`, rather than reading the removed signed
hourly `batteryLoad` field. No hourly energy calculation is changed.

Coverage: `customConsumption.test.js` (parser/calendar/energy),
`simulation.worker.yaml.test.js` (response contract and pipeline ordering), and
`simulation.yaml.test.js` (real upstream loads, energy balance and battery totals).