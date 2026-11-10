# Line Chart by TCViz — Tips & Hints (1.0.0.0)

A line chart for business time series that answers "are we on plan?": actual against plan and prior year with the gap
shaded, the plan carried on past the last actual month, the last value at the end of every line, and an empty month
drawn as a gap, never as a zero. This page is the short version of everything worth knowing.
Full documentation, with search: <https://tinocallarisa-web.github.io/line-chart/support.html>

## Quick start

1. Axis: a date column (the column itself, not Date Hierarchy) for a real time axis.
2. Values: Sales. Legend: Region, for one line per region.
3. Plan: your plan measure. Turn on Plan, prior year and forecast → Gap shading.

The most common surprise: the line drops to zero in an empty month. The visual never invents that zero; the measure
returns it (`+ 0`, `COALESCE(…, 0)`). Return BLANK() and the month becomes a gap.

## Field wells

| Well | Limit | What it does |
|---|---|---|
| Axis | 1 field | A date gives a real time axis; text, numbers or a date hierarchy give evenly spaced categories. A hierarchy gives drilldown. |
| Legend | 1 field | One line per value (region, brand, team) for every measure. |
| Values | up to 6 measures | One line per measure, left axis. |
| Secondary values | up to 3 measures | Other units on a right-hand axis. |
| Plan / Prior year / Forecast | 1 each | Thin dashed lines; gap shading against Plan (or Prior year). |
| Target line | 1 | Flat when constant, stepped when it changes by period. |
| Events (Pro) | 1 | A vertical line with its text: a text column set to First, or a text measure. |
| Annotations (Pro) | 1 | A note on the first measure's line, same rule as Events. |
| Small multiples (Pro) | 1 | One chart per value; shared or separate Y axis. |
| Tooltips | several | Extra measures; report page tooltips work too. |

Power BI sends up to 30,000 combinations of axis, panel and legend value. Above that the visual draws what arrived and
says so. The limits are the same in the free version and in Pro.

## Reading it

- A break in a line is a period without data, not a zero. Lines → Missing values: Break, Connect or Zero.
- Gap shading: green where actual is above the reference, red where below, split where the lines cross. For costs,
  swap the two colours.
- After the "Actual | Plan" mark only the plan or forecast continues, with a longer dash.
- The linear trend runs from the first to the last point and is not extended: it is not a forecast.
- Peaks & lows are found in the visible range, so they follow the zoom.

## Events in one minute (Pro)

1. Make a table Events with two columns: Date and Event.
2. Relate Events[Date] to your calendar date.
3. Drag Events[Event] to the Events field and set it to First.

Two events in the same period? Use a measure instead:
`Event text = CONCATENATEX ( VALUES ( Events[Event] ), Events[Event], " · " )`

If the visual says "Events expects text: set the field to First", the column is being summarised as Count.

## Zoom

- Ctrl (Cmd on a Mac) + mouse wheel over the chart, or + and − with the chart focused.
- Interactions → Zoom slider adds a strip under the axis to drag the range.
- Esc or the Reset zoom button goes back. The Y axis fits the zoomed range (Interactions → Y auto-fit when zoomed).

## Format pane

- Style template — Report theme (default), Classic, and the six collection styles (Pro). Your own settings win.
- Lines — width, markers, missing values, smooth lines, Show values as (Pro); Colors: colour, line style, width and
  markers per series, conditional formatting (fx) on the colour without a Legend.
- End labels — name and value, value or name; maximum labels; series colour; variance vs plan or PY (Pro).
- Plan, prior year and forecast — grey or series colour, show in legend, gap shading and its colours and opacity,
  split actual and plan.
- Target line — colour with conditional formatting (fx) rules per period, width, style, label.
- Trend line — linear or moving average (periods), all series or the first.
- Peaks & lows, Axes (sort categories, start at zero, gridlines, secondary axis), Legend (top or bottom),
  Small multiples (Pro), Source note, Interactions.

## Pro

- Variance in the end label: "+4.2% vs plan", or the absolute difference; needs Plan or Prior year.
- Six collection styles: Boardroom, Ledger, Editorial, Signal, Aurora, Terrace.
- Small multiples, with columns, spacing, titles, panel background and border, shared Y axis.
- Events and annotations from your own text.
- Show values as: index (first visible period = 100), % change from the first visible period, running total.

Without a licence, a Pro feature you turn on while editing is drawn working under a "Pro preview" watermark; reading
view shows the free chart. Licences are per user: everyone who should see the Pro features needs one.

## Keyboard

Tab into the visual; left/right move along the axis, up/down between series; Home/End and PageUp/PageDown jump;
Enter or Space selects (Ctrl adds); Esc clears or resets the zoom; Shift + F10 or the context-menu key opens the menu;
Shift + left/right moves between small multiples panels.

## Help

- Documentation: <https://tinocallarisa-web.github.io/line-chart/support.html>
- Questions: <https://github.com/tinocallarisa-web/line-chart/discussions>
- Bugs: <https://github.com/tinocallarisa-web/line-chart/issues>
- Video: <https://www.youtube.com/watch?v=R7EQ3PDNhMs>
- Support: support@tcviz.com
