# Changelog

All notable changes to Line Chart by TCViz. Power BI four-part version numbers.

## 1.0.1.0 — 2026-11-25

- New Accessibility card at the end of the Format pane: High contrast (Auto, following Windows, or On to force the high-contrast look without a Windows theme), Focus outline color and width for keyboard focus, and Minimum text size, a floor for every text in the chart (axes, legend, end labels, events, annotations, source note and notices).
- Large tables: when Power BI sends the data in parts (over 30,000 rows), the chart now asks for the rest, in Power BI Desktop too, up to ten more parts. The "only part of the data" notice stays only if the data is still incomplete after that.
- Fix: selecting a series (legend item, line or end label) now filters other visuals by the whole series. Before, when the axis or the legend made several columns, a card next to the chart showed a single month of the series. End labels can now be clicked to select their series. With small multiples, a click in a panel selects the series in that panel and the legend selects it in every panel.
- A selection of more than 1,000 rows is shown in the chart only, with the notice "Too many rows to filter other visuals (N) — select fewer items"; select fewer items to filter the rest of the page.
- Right-click on a series opens the Power BI context menu for the series, without the include and exclude options of a single month; right-click on a point opens it for that point.
- Fix: a colour, line style, width or markers chosen for a series now stay when a filter or slicer removes part of the data (for example a Year slicer without the first year). Before, the series went back to its automatic look. Reports made with 1.0.0.0 are updated the first time they are opened for editing, so Power BI Desktop may mark the report as changed once.

## 1.0.0.0 — 2026-11-10

- First release: a line chart for business time series on a real date axis, where an empty period is a gap and never a zero (Break, Connect or Zero, your choice). Text, numbers or a date hierarchy give a category axis, with drilldown on a hierarchy.
- Up to 6 measures and a legend, plus up to 3 measures on a secondary axis.
- End labels with the last non-empty value of every line, kept apart so they do not overlap.
- Plan, Prior year and Forecast as their own fields, drawn as thin dashed lines.
- Gap shading between actual and plan (or prior year): green above, red below, split exactly where the lines cross.
- Split actual and plan: the plan and forecast carry on dashed after the last actual period, marked "Actual | Plan".
- Target line from a measure: flat when the target is constant, stepped when it changes by period, with conditional formatting (fx) on its colour.
- Trend line (linear or moving average), peaks and lows, smooth lines that never overshoot the data.
- Zoom with Ctrl + mouse wheel or the keyboard, an optional zoom slider and a Y axis that fits the zoomed range; sort categories; a source note under the chart.
- Colour, line style, width and markers per series, conditional formatting (fx) on the series colour without a legend; Report theme (default) and Classic templates; setup guide and start screen.
- Pro: variance in the end label, six collection styles (Boardroom, Ledger, Editorial, Signal, Aurora, Terrace), small multiples, events from a text column or measure, annotations, and Show values as (index, % change, running total). Without a licence, Pro features are drawn under a "Pro preview" watermark while editing; reading view shows the free chart.
- Cross-filtering, multi-select, highlight, bookmarks, context menu, report page tooltips, keyboard navigation, screen-reader descriptions and high contrast.
- The number format of each measure, dynamic format strings included; format on the canvas; Format pane and texts in 12 languages.
- No network requests; Pro licence through Microsoft AppSource.
