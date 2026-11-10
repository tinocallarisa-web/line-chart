# Line Chart by TCViz — TCViz Web Product Page Content

Content for the four tabs of the TCViz product page (`https://tcviz.com/product/line-chart/`). Current visual version:
**1.0.0.0**. The live page is generated from `src/data.jsx` in `tcviz-web`; this file is the source text, and editing it
does not change the site. No prices on this page: they live in AppSource and on the licensing page.

## Page title and meta

- Title: `Line Chart for Power BI — actual vs plan, gap shading, events | TCViz`
- Meta description: `A Power BI line chart that shows whether you are on plan: gap shading, the plan after the last actual month, end labels, real date gaps. Events and small multiples in Pro.`

## TAB 1: OVERVIEW

### Are we on plan? Read it on the line

A line chart of sales month by month answers "what happened". The meeting is about something else: are we on plan, and
why did that month drop? Line Chart by TCViz draws actual against plan and prior year with the gap shaded green or red,
carries the plan on past the last actual month, puts the last value at the end of every line, and pins your own events
and notes on the timeline.

### Key highlights
- **An empty month is a gap, not a zero.** A real date axis: points sit at their true distance, and a period without
  data breaks the line instead of falling to zero (or connects, or draws zero: your choice).
- **Actual vs plan, free.** Plan, prior year and forecast as their own fields, with the gap shaded green above and red
  below, split exactly where the lines cross.
- **The rest of the year on the same chart.** After the last actual month the plan carries on dashed, marked
  "Actual | Plan".
- **The last value where you look.** End labels with the last value of every line, kept apart so they do not overlap.
- **Pro: the context around the numbers.** Events and annotations on the timeline, variance in the end label, small
  multiples, "Show values as" and six collection styles.

Video: https://www.youtube.com/watch?v=R7EQ3PDNhMs

---

## TAB 2: FEATURES

### Free: a complete line chart
- Real date axis with gaps (Break, Connect or Zero); text, numbers or a date hierarchy give a category axis, with drilldown
- Up to 6 measures and a legend, plus up to 3 measures on a secondary axis
- End labels with the last value, kept apart so they do not overlap
- Plan, Prior year and Forecast fields; gap shading green / red split at the crossing; Split actual and plan
- Target line from a measure, flat or stepped when the target changes by period
- Trend line (linear or moving average), peaks and lows, smooth lines that never overshoot the data
- Zoom with Ctrl + mouse wheel or the keyboard, optional zoom slider, Y axis that fits the zoomed range
- Sort categories, source note under the chart
- Colour, line style, width and markers per series; conditional formatting (*fx*) on colours
- Report theme (default) and Classic templates; setup guide and start screen
- Cross-filtering, multi-select, highlight, bookmarks, context menu, report page tooltips
- Keyboard navigation, screen-reader descriptions, high contrast
- Number format of each measure, dynamic format strings included; format on the canvas; 12 languages

### Pro: the context around the numbers
- **Events:** vertical lines with their text, from a column of your own Events table (set to First) or a text measure
- **Annotations:** notes pinned to a point on the line
- **Variance in the end label:** "+4.2% vs plan", or against prior year, as % or absolute
- **Small multiples:** one chart per region or plant, with columns, spacing, titles, panel styling and a shared or
  separate Y axis
- **Show values as:** index (first = 100), % change, running total
- **Collection styles:** Boardroom, Ledger, Editorial, Signal, Aurora, Terrace

### Free vs Pro

| Feature | Free | Pro |
|---|---|---|
| Real date axis with gaps, several measures, legend, secondary axis | ✓ | ✓ |
| End labels with the last value | ✓ | ✓ |
| Plan, prior year, forecast, gap shading, Split actual and plan | ✓ | ✓ |
| Target line, trend line, peaks and lows, smooth lines | ✓ | ✓ |
| Zoom, sort categories, source note | ✓ | ✓ |
| Report theme and Classic, per-series colour and line style, conditional formatting (*fx*) | ✓ | ✓ |
| Cross-filtering, highlight, bookmarks, drilldown, report page tooltips | ✓ | ✓ |
| Keyboard navigation, high contrast, 12 languages | ✓ | ✓ |
| Variance in the end label | — | **✓** |
| Events and annotations | — | **✓** |
| Small multiples | — | **✓** |
| Show values as (index, % change, running total) | — | **✓** |
| Six collection styles | — | **✓** |

Field and row limits are the same in both. Turn on a Pro feature while editing without a licence and it is drawn
working on your own data under a "Pro preview" watermark; report readers without a licence see the free chart.

---

## TAB 3: HOW TO USE

1. **Axis** — a date column (the column itself, not Date Hierarchy) for a real time axis.
2. **Values** — Sales. **Legend** — Region, for one line per region.
3. **Plan** — your plan measure; turn on *Plan, prior year and forecast → Gap shading*.
4. **Prior year** — `CALCULATE([Sales], SAMEPERIODLASTYEAR('Date'[Date]))`.
5. **Target line** — a measure; flat when constant, stepped when it changes by period.

### Events in one minute (Pro)
1. Make a table Events with two columns: Date and Event.
2. Relate Events[Date] to your calendar date.
3. Drag Events[Event] to the Events field and set it to First.

Two events in the same period? `Event text = CONCATENATEX ( VALUES ( Events[Event] ), Events[Event], " · " )`

### Use cases
- **Monthly sales against plan** — gap shading and the plan for the rest of the year.
- **This year against last year** — Prior year field; with Pro, "+4.2% vs PY" in the end label.
- **Regions with a margin** — Legend = Region, Margin % on the secondary axis.
- **Daily data** — zoom into a month, a 7-period moving average, peaks and lows.
- **Campaigns and incidents (Pro)** — your Events table on the timeline.
- **Growth, not size (Pro)** — Show values as → Index: every line starts at 100.

---

## TAB 4: SUPPORT

- Documentation, FAQ and troubleshooting: https://tinocallarisa-web.github.io/line-chart/support.html
- Questions: https://github.com/tinocallarisa-web/line-chart/discussions
- Bugs: https://github.com/tinocallarisa-web/line-chart/issues
- Privacy: https://tinocallarisa-web.github.io/line-chart/privacy.html
- Terms: https://tinocallarisa-web.github.io/line-chart/terms.html
- Email: support@tcviz.com

Privacy in one line: the visual declares no privileges, so Power BI does not let it make any network request;
everything is computed inside your report.

AppSource link: add it when the offer is published (not before: a link to an unpublished offer gives 404).
