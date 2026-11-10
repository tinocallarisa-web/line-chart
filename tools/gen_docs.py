# -*- coding: utf-8 -*-
"""Páginas publicadas (docs/) de Line Chart by TCViz.

Mismo enfoque que Radar (tools/gen_docs.py): estilo, cabecera y buscador de Word Cloud. El contenido describe lo que
hace el código (capabilities.json, src/visual.ts, src/model.ts, src/formatSpec.ts); si cambia una función, cambiarla
aquí y regenerar:   python tools/gen_docs.py
Para OKviz: "conditional formatting (fx)" y "dynamic format strings" van escritos tal cual.
El changelog.html sale de CHANGELOG.md (raíz).
"""
import io, json, os, re, html

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WC = r"C:\tcviz\dev\WordCloud\docs"
NAME = "Line Chart by TCViz"
BASE = "https://tinocallarisa-web.github.io/line-chart/"
REPO = "https://github.com/tinocallarisa-web/line-chart"
PRODUCT = "https://tcviz.com/product/line-chart/"
VERSION = json.load(io.open(os.path.join(ROOT, "pbiviz.json"), encoding="utf-8"))["visual"]["version"]
FECHA = "10 November 2026"
VIDEO = "https://www.youtube.com/watch?v=R7EQ3PDNhMs"

plantilla = io.open(os.path.join(WC, "privacy.html"), encoding="utf-8").read()
HEAD = plantilla[:plantilla.index("<body>")]
HEADER = plantilla[plantilla.index("<header>"):plantilla.index("</header>") + len("</header>")]
sup = io.open(os.path.join(WC, "support.html"), encoding="utf-8").read()
SCRIPT = sup[sup.rindex("<script"):sup.rindex("</script>") + len("</script>")]


def page(title, sub, body, nav="", search=False):
    head = HEAD.replace("Privacy Policy – Word Cloud by TCViz", f"{title} – {NAME}")
    hdr = HEADER.replace("Word Cloud by TCViz", NAME).replace(">Privacy Policy<", f">{html.escape(sub)}<")
    sb = ""
    if search:
        sb = '''<div class="searchbar">
  <div class="searchbox">
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"
         stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
    <input id="docsearch" type="search" placeholder="Search the documentation — try &quot;plan&quot;, &quot;gap&quot;, &quot;events&quot;, &quot;zoom&quot;…"
           autocomplete="off" aria-label="Search the documentation">
    <button id="searchclear" type="button" aria-label="Clear search" hidden>&times;</button>
  </div>
  <div id="searchstatus" class="search-status" role="status" aria-live="polite"></div>
</div>
'''
    foot = f'''<footer>
  <div style="margin-bottom:10px;">
    <a href="{BASE}support.html">Documentation</a>
    <a href="{BASE}privacy.html">Privacy Policy</a>
    <a href="{BASE}terms.html">Terms of Use</a>
    <a href="{BASE}changelog.html">Changelog</a>
    <a href="{REPO}/discussions" target="_blank">Discussions</a>
    <a href="{REPO}/issues" target="_blank">Issues</a>
    <a href="{PRODUCT}" target="_blank">tcviz.com</a>
  </div>
  <p>© 2026 TCViz · {NAME} · <a href="mailto:support@tcviz.com">support@tcviz.com</a></p>
</footer>
'''
    return (head + "<body>\n" + hdr + "\n" + nav + sb + body + foot + (SCRIPT if search else "") + "\n</body>\n</html>\n")


# ── Datos comunes ────────────────────────────────────────────────────────────
# Límites de campos: capabilities.json → dataViewMappings[0].conditions. Filas: window de 30.000.

FIELDS = [
    ("Axis", "Grouping", "Yes, one field", "A date gives a real time axis: points sit at their true distance and a missing period is a gap. A date hierarchy, text or numbers give a category axis with evenly spaced points. A hierarchy gives drilldown."),
    ("Legend", "Grouping", "No, one field", "One line per value (region, brand, team) for every measure. Colours are set per legend value."),
    ("Values", "Measure", "Yes, up to 6", "One line per measure, on the left axis."),
    ("Secondary values", "Measure", "No, up to 3", "Measures in other units (margin %, units) on a right-hand axis."),
    ("Plan", "Measure", "No, one field", "Drawn as a thin dashed line. With gap shading on, the area between actual and plan is green above and red below. After the last actual period it carries on, marked “Actual | Plan”."),
    ("Prior year", "Measure", "No, one field", "Same as Plan, with its own dash. Gap shading uses it when there is no Plan."),
    ("Forecast", "Measure", "No, one field", "Your own forecast measure, drawn dashed; it also carries on after the last actual period."),
    ("Target line", "Measure", "No, one field", "A horizontal line when the target is the same for every period, or a stepped line when it changes by period."),
    ("Events", "Measure", "No — Pro, one field", "A vertical line with its text wherever the field is not blank. A text column set to <strong>First</strong>, or a text measure."),
    ("Annotations", "Measure", "No — Pro, one field", "A note on the line wherever the field is not blank (first measure). A text column set to First, or a text measure."),
    ("Small multiples", "Grouping", "No — Pro, one field", "One chart per value (region, plant), with a shared or separate Y axis."),
    ("Tooltips", "Measure", "No", "Extra measures in the tooltip. Report page tooltips are supported."),
]

FREE_PRO = [
    ("Real date axis: an empty period is a gap, never a zero (Break, Connect or Zero, your choice)", "✓", "✓"),
    ("Several measures, a legend and a secondary axis at the same time", "✓", "✓"),
    ("End labels with the last non-empty value, kept apart so they do not overlap", "✓", "✓"),
    ("Plan, prior year and forecast as their own fields", "✓", "✓"),
    ("Gap shading between actual and plan (or prior year), green above and red below, split exactly where the lines cross", "✓", "✓"),
    ("Split actual and plan: the plan carries on dashed after the last actual period, marked “Actual | Plan”", "✓", "✓"),
    ("Target line from a measure, flat or stepped", "✓", "✓"),
    ("Trend line (linear or moving average) and peaks &amp; lows", "✓", "✓"),
    ("Smooth lines that never overshoot the data (monotone curve)", "✓", "✓"),
    ("Zoom with Ctrl + mouse wheel or the keyboard, optional zoom slider, Y axis that fits the zoomed range", "✓", "✓"),
    ("Sort categories, source note under the chart", "✓", "✓"),
    ("Colour, line style, width and markers per series; conditional formatting (fx) on colours", "✓", "✓"),
    ("Report theme and Classic templates; setup guide and start screen", "✓", "✓"),
    ("Cross-filtering, multi-select, highlight, bookmarks, drilldown, context menu, report page tooltips, keyboard, high contrast", "✓", "✓"),
    ("Number format of the measure, dynamic format strings included; format on the canvas; 12 languages", "✓", "✓"),
    ("Variance in the end label (“+4.2% vs plan” or the absolute difference)", "—", "✓"),
    ("Six collection styles: Boardroom, Ledger, Editorial, Signal, Aurora, Terrace", "—", "✓"),
    ("Small multiples", "—", "✓"),
    ("Events: vertical lines with their text, from a column of your own Events table or a measure", "—", "✓"),
    ("Annotations pinned to a point", "—", "✓"),
    ("Show values as: index (first = 100), % change from the first period, running total", "—", "✓"),
]

FORMAT = [
    ("Style template", "Report theme (default: the colours of your report theme, like a native visual), Classic, and the six collection styles Boardroom, Ledger, Editorial, Signal, Aurora and Terrace (Pro). A template only fills what you have not set yourself. Setup guide: turn it back on to see the guide again."),
    ("Lines", "Line width; markers (auto, on, off) and marker size; missing values — Break the line, Connect over the gap, or Zero; smooth lines; Show values as (Pro): value, index, % change, running total. <strong>Colors</strong>: colour, line style (solid, dashed, dotted), width and markers per series. Without a Legend field the colour accepts conditional formatting (fx) rules, evaluated per point on the markers."),
    ("End labels", "Show; content — name and value, value, or name; maximum labels; text size; use the series colour or a fixed colour; variance vs plan or prior year (Pro): % or absolute."),
    ("Events (Pro)", "Show; line colour and style; show labels; label position top or bottom; text size. The full text is always in the tooltip."),
    ("Annotations (Pro)", "Show; text size and colour; background colour and opacity."),
    ("Plan, prior year and forecast", "Show; line colour — grey or the series colour; width; show in legend; gap shading with the colours above and below the reference and its opacity; split actual and plan."),
    ("Target line", "Show; colour, with conditional formatting (fx) rules per period; width; line style; label and text size."),
    ("Trend line", "Show; type — linear or moving average, with the number of periods; apply to all series or the first; width; opacity. The linear trend runs from the first to the last point: it is not a forecast."),
    ("Peaks &amp; lows", "Show; mark the highest, the lowest or both; first series or all; text size. Calculated on the visible (zoomed) range."),
    ("Axes", "X axis: show, text size and colour, title, sort categories (data order, value descending or ascending, alphabetical — category axes only). Y axis: show, text size and colour, title, start at zero, gridlines and their colour. Secondary Y axis: show, text size, title, start at zero."),
    ("Legend", "Show; position top or bottom; text size and colour; title."),
    ("Small multiples (Pro)", "Columns (0 = automatic); space between panels; title size, colour, bold and alignment; panel background and border; shared Y axis."),
    ("Source note", "Show; text; size; colour; alignment. A line under the chart for the data source."),
    ("Interactions", "Zoom; Y auto-fit when zoomed; zoom slider."),
]

USE_CASES = [
    ("Monthly sales against plan",
     "Axis = Month, Values = Sales, Plan = Sales plan. Turn on <strong>Gap shading</strong>: months above plan in green, below in red. The plan carries on after the last actual month, so the rest of the year is on the same chart."),
    ("This year against last year",
     "Prior year = a time-intelligence measure such as <code>CALCULATE([Sales], SAMEPERIODLASTYEAR('Date'[Date]))</code>. With Pro, the end label can show the variance: “+4.2% vs PY”."),
    ("Regions with a margin on a second axis",
     "Values = Sales, Legend = Region, Secondary values = Margin %. Each region has its end label with its last value, and the margin reads on the right-hand axis."),
    ("Daily data with a trend",
     "A daily date on Axis, a Trend line (moving average of 7 periods) and Peaks &amp; lows. Ctrl + wheel zooms into a month; the Y axis fits the zoomed range."),
    ("Campaigns, price changes and incidents (Pro)",
     "An Events table with Date and Event, related to the calendar: each event is a vertical line with its text, so the reason for a jump is on the chart."),
    ("Comparing growth, not size (Pro)",
     "Show values as → Index: every line starts at 100, so a small region that grew 30% is visibly ahead of a large one that grew 5%."),
]

TROUBLE = [
    ("My line drops to zero in an empty month",
     "<p>The line is drawn from your data: a zero is a real zero returned by the measure. Measures that wrap the result in <code>+ 0</code> or <code>COALESCE(…, 0)</code> turn a blank into zero; return BLANK() instead and the month is a gap. "
     "If you do want the line to go to zero, choose <strong>Lines → Missing values → Zero</strong>; <strong>Connect</strong> draws straight over the gap.</p>"),
    ("The axis shows categories, not a time axis",
     "<p>The time axis needs a single date column (Date data type) on Axis. A date hierarchy (Year, Quarter, Month) gives evenly spaced categories, like any category axis. In the field well, choose the date field itself instead of Date Hierarchy.</p>"),
    ("“Events expects text: set the field to First”",
     "<p>A text column in Events or Annotations is summarised as Count by default, so the visual receives numbers. In the field well, open the field menu and choose <strong>First</strong>. Or use a text measure.</p>"),
    ("Two events in the same period show only one",
     "<p>With <strong>First</strong>, Power BI sends one text per period. Use a measure that joins them: "
     "<code>Event text = CONCATENATEX ( VALUES ( Events[Event] ), Events[Event], \" · \" )</code>.</p>"),
    ("“Power BI sent only part of the data”",
     "<p>Power BI sends up to 30,000 combinations of axis, small multiples panel and legend value. Above that, the visual draws what arrived and says so. Filter the page, use a coarser axis (week instead of day) or fewer legend values.</p>"),
    ("“N values without a date on the axis”",
     "<p>Some rows have a blank date. They cannot be placed on a time axis, so they are left out and counted in the note. Check the relationship between your fact table and the calendar.</p>"),
    ("Gap shading or the variance label does not appear",
     "<p>Both need a <strong>Plan</strong> or a <strong>Prior year</strong> field: without a reference there is nothing to compare against. Gap shading is in <em>Plan, prior year and forecast → Gap shading</em>.</p>"),
    ("Zoom does nothing",
     "<p>Zoom uses Ctrl + mouse wheel (Cmd on a Mac) or the + and − keys with the chart focused. It is off in format mode, when <em>Interactions → Zoom</em> is off, or when the report author turned interactions off. Esc or the <em>Reset zoom</em> button goes back to the full range.</p>"),
    ("I see a “Pro preview” watermark",
     "<p>A Pro feature is turned on and you are editing without a licence. Turn it off to remove the watermark, or get a licence. Readers of the report without a licence see the free chart, with no watermark.</p>"),
]

FAQ = [
    ("Why does an empty month break the line?",
     "<p>Because a missing value is not a zero. A native line chart that drops to zero in a month without data tells the meeting that sales collapsed. "
     "By default the line stops and starts again; you can connect over the gap or draw zero in <strong>Lines → Missing values</strong>.</p>"),
    ("How does gap shading choose its colour?",
     "<p>The area between the actual line and the reference (Plan, or Prior year when there is no plan) is green where actual is above and red where it is below, split exactly at the point where the lines cross. "
     "For costs, where lower is better, swap the two colours in <em>Plan, prior year and forecast</em>.</p>"),
    ("What does “Split actual and plan” do?",
     "<p>When the plan or forecast has values after the last actual period, that part is drawn with a longer dash and a thin vertical line marks <strong>Actual | Plan</strong>. Turn it off in <em>Plan, prior year and forecast</em>.</p>"),
    ("How do I add events?",
     "<ol style=\"padding-left:20px\"><li>Make a table <strong>Events</strong> with two columns: Date and Event.</li>"
     "<li>Relate Events[Date] to your calendar date.</li>"
     "<li>Drag Events[Event] to the <strong>Events</strong> field and set it to <strong>First</strong>.</li></ol>"
     "<p>Two events in the same period? Use a measure instead: <code>Event text = CONCATENATEX ( VALUES ( Events[Event] ), Events[Event], \" · \" )</code>. Events are part of Pro.</p>"),
    ("Is the trend line a forecast?",
     "<p>No. The linear trend is a least-squares line from the first to the last point of the series, and it is not extended. The moving average looks back N periods inside each stretch of the line, so it does not cross a gap. For a forecast, use your own measure in <strong>Forecast</strong>.</p>"),
    ("How many fields and rows can it use?",
     "<p>Axis, Legend and Small multiples take one field each; Values up to 6 measures; Secondary values up to 3; Plan, Prior year, Forecast, Target line, Events and Annotations one each. "
     "Power BI sends up to 30,000 combinations of axis, panel and legend value; when more exist, a note in the visual says the chart is incomplete. The limits are the same in the free version and in Pro.</p>"),
    ("Does it use my number formats?",
     "<p>Yes: the number format of each measure from the model, <strong>dynamic format strings</strong> included, in the report's language. Show values as (Pro) uses its own format for index and %.</p>"),
    ("Does it follow my report theme?",
     "<p>Yes. <strong>Report theme</strong> is the default template: series colours and text come from your theme, like a native visual. Colours you set yourself always win.</p>"),
    ("Do bookmarks keep my selection?",
     "<p>Bookmarks keep the points you select and the filters of the page. Like every Power BI visual, they do not keep formatting.</p>"),
    ("What is the “Pro preview” watermark?",
     "<p>While you edit a report without a licence, Pro features you turn on are drawn working on your own data under a watermark that names them, and Power BI shows its licence notice. "
     "Reading view shows the free chart. With small multiples, the preview draws the first 4 panels and reading view without a licence shows the first panel. "
     "Where Power BI provides no licence information (for example when you are not signed in to Power BI Desktop), the free chart is shown.</p>"),
    ("How do I get Pro?",
     "<p>On the visual's Microsoft AppSource page, choose <strong>Buy now</strong> (not Install free). Licences are per user and managed by Microsoft; "
     "every person who should see the Pro features needs one. Restart Power BI Desktop after the licence is assigned. See <a href=\"https://tcviz.com/licensing.html\">tcviz.com/licensing</a>.</p>"),
    ("Is my data sent anywhere?",
     "<p>No. The visual makes no network requests and stores nothing outside your report. The links on the start screen open only when you click them, through Power BI.</p>"),
]


def table(headers, rows):
    th = "".join(f"<th>{html.escape(h)}</th>" for h in headers)
    trs = "".join("<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>" for r in rows)
    return f"<table><thead><tr>{th}</tr></thead><tbody>{trs}</tbody></table>"


def details(items):
    return "".join(f'<details><summary>{html.escape(q)}</summary><div class="faq-body">{a}</div></details>' for q, a in items)


def support():
    nav = '''<nav>
  <a href="#quickstart" class="active">Quick Start</a>
  <a href="#read">How to read it</a>
  <a href="#usecases">Use cases</a>
  <a href="#fields">Field Wells</a>
  <a href="#freepro">Free and Pro</a>
  <a href="#events">Events</a>
  <a href="#format">Format Pane</a>
  <a href="#interaction">Selection and zoom</a>
  <a href="#accessibility">Accessibility</a>
  <a href="#troubleshooting">Troubleshooting</a>
  <a href="#faq">FAQ</a>
  <a href="changelog.html">Changelog</a>
  <a href="#contact">Contact</a>
</nav>
'''
    video = (f'<div class="video-wrap"><iframe src="https://www.youtube.com/embed/{VIDEO.split("v=")[-1]}" title="{NAME} video" '
             f'allowfullscreen></iframe></div>\n<p style="font-size:13px;color:var(--t3);margin:8px 0 0">Video on YouTube: '
             f'<a href="{VIDEO}" target="_blank">{VIDEO}</a></p>') if VIDEO else ""
    uses = "".join(f'<div class="card"><h3>{html.escape(t)}</h3><p>{d}</p></div>' for t, d in USE_CASES)
    body = f'''<div class="wrap">

<div class="verpill">Visual v{VERSION} &nbsp;·&nbsp; docs updated {FECHA} &nbsp;·&nbsp; <a href="changelog.html">what's new</a></div>

<p class="lead">A line chart for business time series that answers the question the meeting is about: are we on plan? Actual against
plan and prior year with the gap shaded green or red, the plan carried on past the last actual month, the last value at the end of every
line, and an empty month drawn as a gap, never as a zero. <strong>Pro</strong> adds the context around the numbers: events and annotations
on the timeline, the variance in the end label, small multiples, “Show values as” and six collection styles.</p>
{video}
<h2 id="quickstart">Quick Start</h2>
<div class="card">
<ol style="padding-left:20px;font-size:14px;color:var(--t2)">
<li>Add <strong>{html.escape(NAME)}</strong> to the page. With no fields it shows a start screen with these steps.</li>
<li>Drag a date to <strong>Axis</strong> — the date column itself, for a real time axis.</li>
<li>Drag a measure to <strong>Values</strong> — Sales. Add a <strong>Legend</strong> (Region) for one line per value.</li>
<li>Drag your plan measure to <strong>Plan</strong>, and turn on <em>Plan, prior year and forecast → Gap shading</em>.</li>
<li>The setup guide in the corner lists the optional fields and lets you try each Pro feature on your data.</li>
</ol>
</div>

<h2 id="read">How to read it</h2>
<div class="card">
<figure style="margin:0 0 14px">
<svg viewBox="0 0 640 230" role="img" aria-label="Annotated line chart: actual, plan, gap shading, Actual | Plan mark, event and end label" style="width:100%;max-width:640px;display:block;margin:0 auto">
  <g font-family="Segoe UI, sans-serif" font-size="12" fill="#535146">
    <path d="M30 200 H440" stroke="#D6D4D0"/>
    <path d="M30 120 L80 108 L130 100 L155.7 109.3 L130 113.5 L80 121.75 L30 130 Z" fill="#3E9C5B" fill-opacity="0.22"/>
    <path d="M155.7 109.3 L180 118 L230 124 L280 96 L280 88.75 L230 97 L180 105.25 Z" fill="#C62828" fill-opacity="0.18"/>
    <path d="M30 130 L280 88.75" fill="none" stroke="#83827D" stroke-width="1.5" stroke-dasharray="6 3"/>
    <path d="M280 88.75 L430 64" fill="none" stroke="#83827D" stroke-width="1.5" stroke-dasharray="12 4"/>
    <path d="M30 120 L80 108 L130 100 L180 118 L230 124 L280 96" fill="none" stroke="#2B6CB0" stroke-width="2.5"/>
    <path d="M280 30 V200" stroke="#83827D" stroke-dasharray="1 3"/>
    <text x="276" y="26" text-anchor="end" font-size="10">Actual</text><text x="284" y="26" font-size="10">Plan</text>
    <path d="M180 40 V200" stroke="#3D3929" stroke-dasharray="4 3"/><text x="184" y="52" font-size="10">Price change</text>
    <text x="288" y="104" font-weight="700" fill="#2B6CB0">1,284</text>
    <text x="470" y="40" font-weight="700" fill="#2B6CB0">Actual</text><text x="470" y="56">ends with its last value</text>
    <text x="470" y="86" font-weight="700" fill="#83827D">Plan (dashed)</text><text x="470" y="102">carries on after “Actual | Plan”</text>
    <text x="470" y="132" font-weight="700" fill="#3E9C5B">Gap shading</text><text x="470" y="148">green above plan, red below</text>
    <text x="470" y="178" font-weight="700" fill="#3D3929">Event (Pro)</text><text x="470" y="194">a vertical line with its text</text>
  </g>
</svg>
</figure>
<p>Read the actual line against the plan: the shaded area is the gap, split where the lines cross. Past the “Actual | Plan” mark only the
plan (or forecast) continues. A break in a line is a period without data, not a zero.</p>
</div>

<h2 id="usecases">Use cases</h2>
{uses}

<h2 id="fields">Field Wells</h2>
{table(["Field", "Kind", "Required / limit", "What it does"], [(f"<strong>{a}</strong>", b, c, d) for a, b, c, d in FIELDS])}
<p>Power BI sends up to 30,000 combinations of axis, small multiples panel and legend value. When there are more, a note in the visual
says the chart is incomplete. The limits are the same in the free version and in Pro.</p>

<h2 id="freepro">Free and Pro</h2>
{table(["Capability", "Free", "Pro"], FREE_PRO)}
<p>Turn on a Pro capability without a licence while editing and it is drawn working on your own data under a “Pro preview” watermark that
names it. Reading view shows the free chart. Pro is sold per user on Microsoft AppSource.</p>

<h2 id="events">Events in one minute (Pro)</h2>
<div class="card">
<ol style="padding-left:20px;font-size:14px;color:var(--t2)">
<li>Make a table <strong>Events</strong> with two columns: <strong>Date</strong> and <strong>Event</strong>.</li>
<li>Relate Events[Date] to your calendar date (many-to-one, single direction).</li>
<li>Drag Events[Event] to the <strong>Events</strong> field and set it to <strong>First</strong>.</li>
</ol>
<p>Two events in the same period? Use a measure instead:</p>
<p><code>Event text = CONCATENATEX ( VALUES ( Events[Event] ), Events[Event], " · " )</code></p>
<p>Annotations work the same way: any text column set to First, or a text measure, in <strong>Annotations</strong> pins a note to the first measure's line.</p>
</div>

<h2 id="format">Format Pane</h2>
{table(["Card", "Settings"], [(f"<strong>{a}</strong>", b) for a, b in FORMAT])}
<p>Format on the canvas: in format mode, click the lines, the plan and gap shading, the end labels, the axes, the legend, the target and trend lines, events, annotations or the source note to format them where they are.</p>

<h2 id="interaction">Selection, zoom and interaction</h2>
<div class="card">
<ul>
<li>Click a point to filter the rest of the page; with a Legend field, click a legend item to select the whole series. Ctrl/Cmd + click adds; click again or click the background to clear.</li>
<li>Highlight: when another visual filters this one, the highlighted values are drawn over a faded line.</li>
<li>Tooltip with a crosshair; report page tooltips are supported. At a period with an event, the tooltip shows its full text.</li>
<li>Zoom: Ctrl/Cmd + mouse wheel, or + and − with the chart focused; drag the optional zoom slider under the axis. Esc or <em>Reset zoom</em> goes back. The Y axis fits the zoomed range unless you turn that off.</li>
<li>Bookmarks restore the selection. Right-click opens the Power BI context menu. A hierarchy in Axis gives drilldown.</li>
<li>When the report author turns interactions off, clicks do not filter and zoom is off.</li>
</ul>
</div>

<h2 id="accessibility">Accessibility</h2>
<div class="card">
<ul>
<li>Keyboard: Tab into the visual; left and right arrows move along the axis, up and down between series; Home/End and PageUp/PageDown jump; Enter or Space selects; Esc clears (or resets the zoom); the context-menu key or Shift + F10 opens the menu. With small multiples, Shift + left/right moves between panels.</li>
<li>Each point is announced to screen readers with its series, date and value; the chart describes how many series and points it has.</li>
<li>High contrast: the visual uses the colours of the Windows contrast theme and tells series apart by line pattern and marker shape.</li>
<li>The layout adapts to the size of the visual: in small sizes labels, legend and axes give way, down to a sparkline.</li>
</ul>
</div>

<h2 id="troubleshooting">Troubleshooting</h2>
{details(TROUBLE)}

<h2 id="faq">FAQ</h2>
{details(FAQ)}

<h2 id="contact">Contact</h2>
<div class="contact-box"><div class="icon">✉</div><div>
<h3>Questions, bugs, ideas</h3>
<p>Ask in <a href="{REPO}/discussions" target="_blank">GitHub Discussions</a>, report a bug in <a href="{REPO}/issues" target="_blank">GitHub Issues</a>,
or write to <a href="mailto:support@tcviz.com">support@tcviz.com</a>. Product page: <a href="{PRODUCT}" target="_blank">tcviz.com/product/line-chart</a>.</p>
</div></div>

</div>
'''
    return page("Documentation", "Documentation", body, nav=nav, search=True)


def privacy():
    body = f'''<div class="wrap prose">
<h1>Privacy Policy</h1>
<p><strong>Last updated:</strong> {FECHA} (version {VERSION})</p>
<h2>1. Overview</h2>
<p>{NAME} is a Power BI custom visual developed by TCViz (Tino Callarisa). This policy describes how data is handled when you use it.</p>
<h2>2. Data collection</h2>
<p>The visual <strong>does not collect, transmit or store any data</strong>. Every calculation — gaps, gap shading, trend lines, peaks,
variances, index and running totals — happens inside Power BI, on the data of your report.</p>
<h2>3. No network access</h2>
<p>The visual declares <strong>no network privileges</strong> (<code>"privileges": []</code>), so Power BI does not let it make any web request.
Everything it draws, including the start-screen icon, is bundled inside the visual.</p>
<p>The <em>Guide</em>, <em>Product page</em> and <em>Video</em> links on the start screen ask Power BI to open those pages in your browser, only
when you click them (Power BI Desktop asks first). The visual sends nothing.</p>
<h2>4. Cookies and storage</h2>
<p>No cookies and no browser storage. Formatting settings are saved in your report by Power BI, like those of any visual.</p>
<h2>5. Licensing</h2>
<p>To know whether you have a Pro licence, the visual asks Microsoft's licensing API in Power BI (<code>IVisualLicenseManager</code>). TCViz receives
no data from this check. See the <a href="https://privacy.microsoft.com/privacystatement">Microsoft Privacy Statement</a>.</p>
<h2>6. Third parties</h2>
<p>No analytics, tracking or advertising.</p>
<h2>7. Contact</h2>
<p><a href="mailto:support@tcviz.com">support@tcviz.com</a></p>
</div>
'''
    return page("Privacy Policy", "Privacy Policy", body)


def terms():
    def plain(t):
        return html.unescape(re.sub(r"<[^>]+>", "", t))
    free = "; ".join(plain(r[0][0].lower() + r[0][1:]) for r in FREE_PRO if r[1] == "✓")
    pro = "; ".join(plain(r[0][0].lower() + r[0][1:]) for r in FREE_PRO if r[1] == "—")
    body = f'''<div class="wrap prose">
<h1>Terms of Use</h1>
<p><strong>Effective date:</strong> {FECHA} &nbsp;·&nbsp; applies to version {VERSION} and later</p>
<h2>1. Acceptance</h2>
<p>By installing or using {NAME} ("the Visual"), you agree to these Terms of Use. If you do not agree, do not install or use the Visual.</p>
<h2>2. License grant</h2>
<p>TCViz grants you a non-exclusive, non-transferable, revocable license to use the Visual within Microsoft Power BI, subject to these Terms
and any applicable Microsoft AppSource subscription terms.</p>
<p><strong>Free tier:</strong> available to all users at no cost. Includes: {html.escape(free)}.</p>
<p><strong>Pro tier:</strong> available through a Microsoft AppSource subscription, licensed per user. Adds: {html.escape(pro)}.
Without an active licence, Pro features are shown in edit mode only, as a preview marked with a watermark; reading view shows the free result.
Field and row limits are the same in both tiers.</p>
<h2>3. Restrictions</h2>
<ul>
<li>Do not reverse-engineer, decompile or disassemble the Visual, except where applicable law permits it.</li>
<li>Do not redistribute, resell, sublicense or transfer the Visual.</li>
<li>Do not remove or alter proprietary notices, branding or watermarks.</li>
<li>Do not use the Visual in breach of applicable laws.</li>
</ul>
<h2>4. Intellectual property</h2>
<p>The Visual, including its source code, design and documentation, is the intellectual property of TCViz. The source code is published on
GitHub for transparency and review; publication does not grant a licence to copy it or to build competing products.</p>
<h2>5. Disclaimer of warranties</h2>
<p>The Visual is provided "as is", without warranty of any kind, express or implied, including merchantability, fitness for a particular
purpose and non-infringement. TCViz does not warrant that the Visual will be error-free or uninterrupted.</p>
<h2>6. Limitation of liability</h2>
<p>To the maximum extent permitted by law, TCViz shall not be liable for any indirect, incidental, special, consequential or punitive damages
arising from the use of, or inability to use, the Visual.</p>
<h2>7. Updates</h2>
<p>TCViz may update the Visual and these Terms. Updated Terms are posted at this address with a new date; continued use means acceptance.</p>
<h2>8. Governing law</h2>
<p>These Terms are governed by the laws of Spain. Any dispute shall be resolved in the courts of Barcelona, Spain.</p>
<h2>9. Contact</h2>
<p><a href="mailto:support@tcviz.com">support@tcviz.com</a></p>
</div>
'''
    return page("Terms of Use", "Terms of Use", body)


def changelog():
    md = io.open(os.path.join(ROOT, "CHANGELOG.md"), encoding="utf-8").read()
    partes = re.split(r"^## ", md, flags=re.M)[1:]
    bloques = []
    for p in partes:
        cab, _, cuerpo = p.partition("\n")
        items = "".join(f"<li>{html.escape(l[2:].strip())}</li>" for l in cuerpo.splitlines() if l.startswith("- "))
        bloques.append(f'<div class="card"><h3>{html.escape(cab.strip())}</h3><ul>{items}</ul></div>')
    body = f'<div class="wrap prose"><h1>Changelog</h1><p>{NAME} · current version {VERSION}</p>{"".join(bloques)}</div>\n'
    return page("Changelog", "Changelog", body)


def tips_plain():
    """docs/TIPS-AND-HINTS-PLAIN.txt desde docs/TIPS-AND-HINTS.md (la fuente es el .md: editar allí)."""
    md = io.open(os.path.join(ROOT, "docs", "TIPS-AND-HINTS.md"), encoding="utf-8").read()
    out = []
    for l in md.splitlines():
        l = re.sub(r"<(https?://[^>]+)>", r"\1", l).replace("`", "").replace("**", "").replace("—", "--")
        if l.startswith("# "):
            t = l[2:].upper()
            out += [t, "=" * len(t)]
        elif l.startswith("## "):
            t = l[3:].upper()
            out += [t, "-" * len(t)]
        elif l.startswith("|---"):
            continue
        elif l.startswith("|"):
            out.append("- " + " | ".join(c.strip() for c in l.strip("|").split("|")))
        else:
            out.append(l)
    return "\n".join(out).rstrip() + "\n"


def main():
    os.makedirs(os.path.join(ROOT, "docs"), exist_ok=True)
    io.open(os.path.join(ROOT, "docs", "TIPS-AND-HINTS-PLAIN.txt"), "w", encoding="utf-8", newline="\n").write(tips_plain())
    for nombre, f in (("support.html", support), ("privacy.html", privacy), ("terms.html", terms), ("changelog.html", changelog)):
        io.open(os.path.join(ROOT, "docs", nombre), "w", encoding="utf-8", newline="\n").write(f())
    io.open(os.path.join(ROOT, "docs", "index.html"), "w", encoding="utf-8", newline="\n").write(
        f'<!DOCTYPE html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=support.html"><title>{NAME}</title><a href="support.html">Documentation</a>\n')
    print("docs:", sorted(os.listdir(os.path.join(ROOT, "docs"))))


if __name__ == "__main__":
    main()
