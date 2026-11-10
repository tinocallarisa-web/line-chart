# -*- coding: utf-8 -*-
"""Infografías de la ficha (1366x768): docs/infographic.html y docs/infographic-pro.html, y sus PNG en assets/.

Imágenes de entrada (tools/img/), ya limpias (sin sello de prueba ni marca de agua):
- desktop_plan.png, desktop_regions.png, desktop_events.png: recortes de assets/Image_1-3.png (Power BI Desktop).
- gaps_trend.png, target_steps.png, trend_zoom.png: simulador, versión gratuita.
- annotations.png, sm_events.png, index.png, style_<estilo>.png: simulador, funciones Pro con licencia.
python tools/gen_infographic.py
"""
import asyncio, base64, io, os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, "tools", "img")
DOC = "https://tinocallarisa-web.github.io/line-chart/support.html"
ESTILOS = ("boardroom", "ledger", "editorial", "signal", "aurora", "terrace")


def data_uri(name, width, caja=None):
    im = Image.open(os.path.join(IMG, name)).convert("RGB")
    if caja:
        im = im.crop(caja)
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    b = io.BytesIO(); im.save(b, "JPEG", quality=90)
    return "data:image/jpeg;base64," + base64.b64encode(b.getvalue()).decode()


CSS = """
:root{--bg:#FAF9F5;--bg2:#EDE9DE;--line:#DAD9D4;--t1:#3D3929;--t2:#535146;--t3:#83827D;--acc:#2B6CB0;--accd:#1F4E80;--acc2:#3E9C5B;--acc2l:#E3F2E8;--red:#C0392B}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#888;font-family:'Segoe UI',system-ui,sans-serif}
#infographic{background:var(--bg);color:var(--t1);width:1366px;height:768px;overflow:hidden;padding:22px 34px 14px;display:flex;flex-direction:column;gap:12px}
.head{display:flex;align-items:flex-end;justify-content:space-between;gap:20px}
.head h1{font-family:Poppins,'Segoe UI',sans-serif;font-size:32px;font-weight:700;line-height:1.05}
.head h1 span{color:var(--acc)}
.head p{font-size:15px;color:var(--t2);margin-top:6px;max-width:900px}
.brand{font-size:12px;color:var(--t3);text-align:right;line-height:1.5}
.brand b{color:var(--acc)}
.grid{display:grid;gap:14px;flex:1;min-height:0}
.col{display:flex;flex-direction:column;gap:12px;min-height:0}
.card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px 16px;min-height:0}
.card h3{font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:var(--t3);margin-bottom:8px}
.shot{background:#fff;border:1px solid var(--line);border-radius:12px;padding:8px;display:flex;flex-direction:column;min-height:0}
.shot img{width:100%;height:auto;display:block}
.shot .cap{font-size:12px;color:var(--t3);padding:6px 4px 0;line-height:1.35}
.shot .cap b{color:var(--t1)}
.row{display:grid;gap:12px}
.fix img{height:var(--h);object-fit:contain;background:#fff}
.steps{list-style:none;display:grid;gap:7px}
.steps li{display:grid;grid-template-columns:24px 1fr;gap:8px;font-size:13px;color:var(--t2);align-items:start;line-height:1.35}
.steps b.n{width:22px;height:22px;border-radius:50%;background:var(--acc2);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px}
.steps strong,ul.l strong{color:var(--t1)}
ul.l{list-style:none;display:grid;gap:6px}
ul.l li{font-size:13px;color:var(--t2);padding-left:18px;position:relative;line-height:1.35}
ul.l li::before{content:"";position:absolute;left:2px;top:6px;width:8px;height:8px;border-radius:2px;background:var(--acc)}
ul.l.pro li::before{background:var(--acc2)}
.chip{display:inline-block;font-size:10px;font-weight:700;letter-spacing:.8px;padding:2px 8px;border-radius:999px;margin-left:6px;vertical-align:middle}
.chip.free{background:#E6EEF8;color:var(--accd)} .chip.pro{background:var(--acc2l);color:#2F7A47}
.endlab{display:inline-block;white-space:nowrap;font-size:12px;font-weight:600;color:#1E88E5;background:#F4F8FC;border:1px solid #D6E4F2;border-radius:6px;padding:4px 8px;margin:2px 0 8px}
.endlab em{font-style:normal;color:var(--red)}
.styles{display:grid;grid-template-columns:repeat(2,1fr);gap:6px;height:236px;align-content:start}
.styles figure{position:relative;border-radius:6px;overflow:hidden;border:1px solid var(--line)}
.styles img{width:100%;height:auto!important;display:block}
.styles figcaption{position:absolute;left:0;bottom:0;font-size:10.5px;font-weight:700;color:#fff;background:rgba(30,30,30,.72);padding:1px 7px;border-top-right-radius:6px}
.foot{display:flex;justify-content:space-between;font-size:12px;color:var(--t3)}
.foot b{color:var(--t2)}
"""


def page(title, body):
    return (f'<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>{title}</title>'
            '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@600;700&display=swap">'
            f'<style>{CSS}</style></head><body><div id="infographic">{body}</div></body></html>\n')


FOOT = f'<div class="foot"><span>{{izq}}</span><span>tcviz.com · Documentation: {DOC}</span></div>'


def general():
    body = f"""
<div class="head"><div><h1>Line Chart <span>by TCViz</span></h1>
<p>Are we on plan, and why did that month drop? Actual against plan with the gap shaded, the plan carried on past the last actual month, and empty months drawn as gaps, not zeros.</p></div>
<div class="brand"><b>tcviz.com</b><br>Power BI custom visual · no network requests</div></div>
<div class="grid" style="grid-template-columns:760px 1fr">
  <div class="col">
    <div class="shot"><img src="{data_uri('desktop_plan.png', 1600)}" alt="">
      <div class="cap"><b>Actual vs plan</b> · green above, red below · the plan carries on dashed after <b>Actual | Plan</b> · target and end labels.</div></div>
    <div class="row fix" style="grid-template-columns:repeat(3,1fr);--h:132px">
      <div class="shot"><img src="{data_uri('gaps_trend.png', 600, (220, 250, 700, 520))}" alt=""><div class="cap"><b>Honest gaps</b> · an empty month breaks the line: Break, Connect or Zero.</div></div>
      <div class="shot"><img src="{data_uri('target_steps.png', 600, (230, 20, 1000, 520))}" alt=""><div class="cap"><b>Target line</b> · flat, or stepped when the target changes by period.</div></div>
      <div class="shot"><img src="{data_uri('trend_zoom.png', 600, (380, 0, 1000, 520))}" alt=""><div class="cap"><b>Trend and zoom</b> · Ctrl + wheel, the Y axis fits the zoomed range.</div></div>
    </div>
  </div>
  <div class="col">
    <div class="shot"><img src="{data_uri('desktop_regions.png', 1000)}" alt="">
      <div class="cap"><b>Several series, one legend, a 2nd axis</b> · sales by region on the left, gross margin % on the right, peak marked.</div></div>
    <div class="card" style="flex:1"><h3>Free <span class="chip free">FREE</span></h3><ul class="l">
      <li><strong>Gap shading</strong> against Plan, or Prior year when there is no Plan</li>
      <li>Plan and forecast <strong>dashed after the last actual</strong>, marked “Actual | Plan”</li>
      <li><strong>Target line</strong> from a measure, flat or stepped</li>
      <li><strong>End labels</strong> with the last value, kept apart so they do not overlap</li>
      <li>Empty periods as <strong>gaps</strong>: Break, Connect or Zero, your choice</li>
      <li>Up to 6 measures and a legend, up to 3 on a <strong>secondary axis</strong></li>
      <li>Trend line (linear or moving average), peaks and lows</li>
      <li>Zoom with Ctrl + wheel or the keyboard, optional zoom slider</li>
      <li>Report theme, filtering, bookmarks, keyboard, <strong>12 languages</strong></li></ul></div>
  </div>
</div>
{FOOT.format(izq="<b>Pro</b> adds events from your own table, annotations, variance on the end label, small multiples, Show values as and six styles.")}
"""
    return page("Line Chart by TCViz — Visual Guide", body)


def pro():
    estilos = "".join(
        f'<figure><img src="{data_uri(f"style_{e}.png", 330, (600, 150, 1240, 600))}" alt=""><figcaption>{e.title()}</figcaption></figure>'
        for e in ESTILOS)
    body = f"""
<div class="head"><div><h1>Line Chart <span>Pro</span></h1>
<p>The context around the numbers: what happened, where, and how far from plan — from your own data, in Power BI.</p></div>
<div class="brand"><b>tcviz.com</b><br>Pro preview while you edit · licence on Microsoft AppSource</div></div>
<div class="grid" style="grid-template-columns:720px 1fr">
  <div class="col">
    <div class="shot"><img src="{data_uri('desktop_events.png', 1600)}" alt="">
      <div class="cap"><b>Events</b> from a column of your own Events table · each one a vertical line with its text, so the reason for a jump is on the chart.</div></div>
    <div class="row" style="grid-template-columns:1fr 1.12fr 1fr;flex:1">
      <div class="card"><h3>Events in 3 steps <span class="chip pro">PRO</span></h3><ol class="steps">
        <li><b class="n">1</b><span>A table <strong>Events</strong> with two columns: Date and Event</span></li>
        <li><b class="n">2</b><span><strong>Relate</strong> Events[Date] to your calendar date</span></li>
        <li><b class="n">3</b><span>Drag <strong>Events[Event]</strong> to Events and set it to <strong>First</strong></span></li></ol></div>
      <div class="card"><h3>Variance label</h3>
        <span class="endlab">Net sales €2.56M · <em>−4.8% vs plan</em></span>
        <p style="font-size:12.5px;color:var(--t2);line-height:1.4">The last value and how far it is from plan, or from prior year: as a % or as the absolute difference.</p></div>
      <div class="card"><h3>Try it on your data</h3>
        <p style="font-size:12.5px;color:var(--t2);line-height:1.4">Without a licence, any Pro feature you turn on while editing is drawn on your own data under a “Pro preview” watermark. Report readers without a licence see the free chart.</p></div>
    </div>
  </div>
  <div class="col">
    <div class="row fix" style="grid-template-columns:1fr 1fr;--h:236px;flex:1">
      <div class="shot"><img src="{data_uri('annotations.png', 700, (680, 40, 995, 330))}" alt=""><div class="cap"><b>Annotations</b> pinned to a point on the line.</div></div>
      <div class="shot"><img src="{data_uri('index.png', 700, (640, 0, 994, 300))}" alt=""><div class="cap"><b>Show values as</b> · index (first visible period = 100), % change, running total.</div></div>
    </div>
    <div class="row fix" style="grid-template-columns:1fr 1fr;--h:236px;flex:1">
      <div class="shot"><img src="{data_uri('sm_events.png', 700, (0, 0, 560, 620))}" alt=""><div class="cap"><b>Small multiples</b> · one chart per region, shared or separate Y axis.</div></div>
      <div class="shot"><div class="styles">{estilos}</div><div class="cap"><b>Six collection styles</b> that match other TCViz visuals.</div></div>
    </div>
  </div>
</div>
{FOOT.format(izq="Everything is computed inside your report. No network requests.")}
"""
    return page("Line Chart by TCViz — Pro", body)


async def render(html_path, png_path):
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1366, "height": 768})
        await pg.goto("file:///" + html_path.replace("\\", "/"))
        await pg.wait_for_timeout(800)
        el = await pg.query_selector("#infographic")
        await el.screenshot(path=png_path)
        await b.close()


def main():
    os.makedirs(os.path.join(ROOT, "assets"), exist_ok=True)
    for nombre, f, png in (("infographic.html", general, "infographic.png"), ("infographic-pro.html", pro, "infographic-pro.png")):
        h = os.path.join(ROOT, "docs", nombre)
        io.open(h, "w", encoding="utf-8", newline="\n").write(f())
        asyncio.run(render(h, os.path.join(ROOT, "assets", png)))
        print(nombre, "->", png, Image.open(os.path.join(ROOT, "assets", png)).size)


if __name__ == "__main__":
    main()
