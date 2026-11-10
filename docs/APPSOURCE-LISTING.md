# AppSource Listing — Line Chart by TCViz 1.0.0.0

Copy ready to paste into Partner Center, English only. **Editing this file does not change the offer**: every field
is pasted by hand in Partner Center.

Limits measured in Partner Center: *Search results summary* 100 characters, *Description* 5,000 characters counting the
HTML tags (cut silently), *Certification notes* 2,500 counted with CRLF and **cleared on every resubmission**, 3 keywords.

Rules for this listing: start with the problem; no comparison with other marketplace visuals by name, only with what
Power BI does natively; no superlatives or figures that cannot be proven; "Power BI" with that capitalisation;
"conditional formatting (fx)" and "dynamic format strings" written as such (OKviz looks for them). No prices in the
description (they go in the plan). No mention of team or organisation licences.

---

## Offer name

```
Line Chart by TCViz
```

## Search results summary (max 100)
*(97 characters)*

```
Line chart for Power BI: actual vs plan with gap shading, end labels and real gaps in your dates.
```

## Search keywords (3)

```
line chart
forecast vs actual
time series
```

- `line chart` — the name of the type. Whoever types it in AppSource already has the native line chart and is looking
  for what it lacks; without it the offer does not appear for the most direct search.
- `forecast vs actual` — the problem in the buyer's words, from someone with a monthly review. It is what the dashed
  plan or forecast after the last actual month answers. `plan vs actual` and `budget vs actual` are left to Bar Chart
  with Variation % and Bullet Chart, so the TCViz offers do not compete for the same search.
- `time series` — the analyst's term for the data shape (daily, weekly, monthly). It brings people whose problem is the
  date axis: empty periods drawn as zero, daily data that needs zoom and a trend.

Left out: `small multiples`, `annotations` (functions, not problems), `year over year` (good alternative if
`time series` brings no traffic after three months; inferred, no volume data).

## Description

*(3,470 characters as text; 4,261 as the HTML that is pasted, 4,305 counting CRLF; limit 5,000)*

Paste the **HTML**, not this text: `python C:\tcviz\utillaje\ficha_html.py "C:\tcviz\dev\LineChart"` writes
`docs/APPSOURCE-DESCRIPTION.html` (brand template). The 5,000-character limit counts the tags.

```
The monthly review asks two questions: are we on plan, and why did that month drop? A line of sales month by month answers neither. And a measure that returns 0 instead of blank makes an empty month look like a collapse.

Line Chart by TCViz draws actual against plan or prior year with the gap shaded green or red, carries the plan on past the last actual month, puts the last value at the end of every line, and draws an empty period as a gap: you choose Break, Connect or Zero.

FREE: A COMPLETE LINE CHART
• A real date axis: points at their true distance, an empty period drawn as a gap (or connected, or zero: your choice)
• Up to 6 measures and a legend, plus up to 3 measures on a secondary axis
• End labels with the last value of every line, kept apart so they do not overlap
• Plan, Prior year and Forecast as their own fields; gap shading against Plan (or Prior year when there is no Plan): green above, red below, split exactly where the lines cross
• Split actual and plan: the plan carries on dashed after the last actual month, marked "Actual | Plan"
• Target line from a measure, flat or stepped when the target changes by period
• Trend line (linear or moving average), peaks and lows, smooth lines that never overshoot the data
• Zoom with Ctrl + mouse wheel or the keyboard, an optional zoom slider and a Y axis that fits the zoomed range
• Categories sorted by value or alphabetically, and a source note
• Report theme by default, colour and line style per series, conditional formatting (fx) on the series colour (without a legend) and on the target line

PRO: THE CONTEXT AROUND THE NUMBERS
• Events: vertical lines with their text, straight from a column of your own Events table
• Annotations pinned to a point on the line
• Variance in the end label: "+4.2% vs plan" or against prior year
• Small multiples: one chart per region or plant, with a shared or separate Y axis
• Show values as: index (first visible period = 100), % change from the first visible period, running total
• Six collection styles (Boardroom, Ledger, Editorial, Signal, Aurora, Terrace) that match other TCViz visuals

FREE AND PRO
The free version is a complete, correct line chart, with plan, gap shading and target line included; field and row limits are the same in both. Pro adds the context. Turn on a Pro feature while editing without a licence and it is drawn working on your own data under a "Pro preview" watermark; report readers without a licence see the free chart.

WORKS LIKE A NATIVE VISUAL
• Click to filter, Ctrl+click for several, highlight from other visuals, bookmarks, drilldown on a hierarchy, context menu, report page tooltips
• Keyboard navigation, screen-reader descriptions, high contrast and a layout that adapts down to a sparkline
• The number format of each measure, dynamic format strings included; format on the canvas; twelve languages; a setup guide and a start screen

PRIVACY
The visual declares no privileges, so Power BI does not let it make any network request. Everything is computed inside your report; the licence is checked through Microsoft's own licensing API.

GETTING STARTED
1. Axis: a date column. Values: Sales.
2. Plan: your plan measure; turn on Gap shading.
3. Pro: drag Events[Event] to Events and set it to First.

Documentation, FAQ and the events recipe: https://tinocallarisa-web.github.io/line-chart/support.html
Questions: https://github.com/tinocallarisa-web/line-chart/discussions
Support: support@tcviz.com
```

No "What's new" block: this is the first version.

## Plan

| Field | Value |
|---|---|
| Plan ID | **`line-chart-pro`** (exactly this: it is the ID the code checks, `PLAN_IDS` in `src/visual.ts`) |
| Plan name | Line Chart Pro |
| Price | 0.99 USD per user per month, 9.99 USD per user per year (round local prices with `utillaje/redondear_precios.py`) |
| Trial | None |
| Plan description | The contents of `docs/PLAN-DESCRIPTION.html` (lines that start with an emoji; the plan editor removes bold). Text below. |

```
⭐ Line Chart Pro adds the context around the numbers.
📍 Events: vertical lines with their text, from a column of your own Events table or a text measure.
📝 Annotations pinned to a point on the line.
📊 Variance in the end label: "+4.2% vs plan" or against prior year.
🗂️ Small multiples: one chart per region, plant or team.
📈 Show values as: index (first visible period = 100), % change from the first visible period, running total.
🎨 Six collection styles: Boardroom, Ledger, Editorial, Signal, Aurora and Terrace.
✅ Includes everything in the free version: real date axis, plan with gap shading, target and trend lines, zoom.
```

## Offer setup

| Field | Value |
|---|---|
| Offer name | Line Chart by TCViz |
| Categories | The closest available to change over time and comparison (check the list in Partner Center) |
| Industries | Retail; Professional services |
| Video | https://www.youtube.com/watch?v=R7EQ3PDNhMs |
| Support / documentation | https://tinocallarisa-web.github.io/line-chart/support.html |
| Privacy | https://tinocallarisa-web.github.io/line-chart/privacy.html |
| Terms (EULA) | https://tinocallarisa-web.github.io/line-chart/terms.html |
| Changelog | https://tinocallarisa-web.github.io/line-chart/changelog.html |
| Source | https://github.com/tinocallarisa-web/line-chart |
| Product page | https://tcviz.com/product/line-chart/ |
| Logo | `assets/icon_300x300.png` |
| Screenshots | `assets/infographic.png` (free), `assets/infographic-pro.png` (Pro), then `assets/Image_1.png`, `assets/Image_2.png`, `assets/Image_3.png` (all 1366x768; infographics regenerated with `python tools/gen_infographic.py`) |
| Package | `dist/lineChartTCVizD8CCBAB58761478B9C59A5FA700EC503.1.0.0.0.pbiviz` |
| Sample report | `LineChart_sample.pbix` (6 pages; no `_test` in the name) |

The video goes **only** in its canonical form, `https://www.youtube.com/watch?v=<id>`: never a short link, never
`/shorts/` or `/embed/` (policy 100.3.3.3).

---

## What to paste by hand in Partner Center (1.0.0.0)

Editing this file changes nothing in the offer. In Partner Center:

1. **Offer listing → Name:** `Line Chart by TCViz`.
2. **Offer listing → Search results summary:** the block above (97 characters).
3. **Offer listing → Description:** the contents of `docs/APPSOURCE-DESCRIPTION.html` (run `ficha_html.py` again after
   any edit), not the text above.
4. **Offer listing → Search keywords:** `line chart`, `forecast vs actual`, `time series`.
5. **Offer listing → Videos:** `https://www.youtube.com/watch?v=R7EQ3PDNhMs`.
6. **Offer listing → Support / Privacy / Terms URLs:** the table above. Check each one with a real request after the
   repo is pushed: until then GitHub Pages answers 404.
7. **Plans → new plan:** Plan ID `line-chart-pro`, name, prices in the pricing fields, no trial; Plan description from
   `docs/PLAN-DESCRIPTION.html`.
8. **Technical configuration:** the 1.0.0.0 `.pbiviz` and `LineChart_sample.pbix`.
9. **Review and publish → Notes for certification:** `docs/CERTIFICATION-NOTES-SHORT.txt`.
10. **Screenshots and logo.**
