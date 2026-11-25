# -*- coding: utf-8 -*-
"""Simulador Playwright de Line Chart by TCViz: selección y filtro hacia fuera (25-11-2026).

Carga el bundle de .tmp/drop (`node build-test.js --free`: el código de producción con la licencia real) en un host
simulado que FILTRA COMO POWER BI: con varias columnas en categories (eje, leyenda, small multiples), la identidad de
categories[k].identity[i] es la de la FILA i entera, y cada identidad recibida en select() filtra las filas que
coinciden en TODAS sus columnas. Una tarjeta de suma simulada suma Net sales de esas filas (sin contar dos veces).

Datos: los CSV del informe de ejemplo (C:\\tcviz\\test_visuales\\LineChart\\csv, Alder Outdoor Co.), los mismos del
LineChart_sample.pbix donde Tino vio el defecto (South = $236K, un mes, en vez de ~$15M):
  - Regions and margin: eje Year > Month, Legend = Region, Net sales + Gross margin % (secundario);
  - Legend = Event: eje Year > Month, Legend = Event (un evento por mes o en blanco);
  - Small multiples: eje Month, Small multiples = Year, Legend = Region (con licencia: todos los paneles);
  - Tope: eje Date diario, Legend = Channel, 1.200 días por serie (> MAX_SELECT_IDS = 1.000).

    node build-test.js --free
    python tools/simulador/harness.py

Termina con "TODO OK" o con la lista de fallos.
"""
import asyncio, csv, io, json, math, os, sys
from collections import defaultdict
from datetime import date, timedelta
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DROP = os.path.join(ROOT, ".tmp", "drop")
CSV = os.environ.get("LC_CSV", r"C:\tcviz\test_visuales\LineChart\csv")
PLAN = "line-chart-pro"
MAX_IDS = 1000
FALLOS = []
N_CHECKS = [0]
MESES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def check(name, ok, detail=""):
    N_CHECKS[0] += 1
    print(f"  {'OK   ' if ok else 'FALLO'} {name}{'  — ' + detail if detail else ''}")
    if not ok:
        FALLOS.append(name)


# ── Datos ─────────────────────────────────────────────────────────────────────
def leer(n):
    with io.open(os.path.join(CSV, n + ".csv"), encoding="utf-8") as f:
        return list(csv.DictReader(f))


REG_ORDER = {r["Region"]: int(r["Order"]) for r in leer("Region")}
EVENTOS = {r["Date"]: r["Event"] for r in leer("Events")}
# Filas de hechos: una por mes y región con venta (Net sales = SUM(Sales amount); los meses futuros no tienen venta).
VENTAS = []
for r in leer("Sales"):
    if not r["Sales amount"]:
        continue
    y, mth = int(r["Date"][:4]), int(r["Date"][5:7])
    VENTAS.append({"Year": y, "Month": MESES[mth - 1], "mn": mth, "Region": r["Region"], "Event": EVENTOS.get(r["Date"]),
                   "v": float(r["Sales amount"]), "mr": float(r["Margin rate"])})
VENTAS.sort(key=lambda r: (r["Year"], r["mn"], REG_ORDER[r["Region"]]))
TOT_REG = defaultdict(float)
for r in VENTAS:
    TOT_REG[r["Region"]] += r["v"]


def src(name, role, typ="text", level=None, measure=False, fmt=None):
    s = {"displayName": name, "queryName": ("m." if measure else "t.") + name, "roles": {role: True}, "type": {typ: True}}
    if level:
        s["expr"] = {"level": level}
    if measure:
        s["isMeasure"] = True
    if fmt:
        s["format"] = fmt
    return s


def col(name, role, values, typ="text", level=None):
    return {"source": src(name, role, typ, level), "values": values, "identity": [{"v": v} for v in values]}


def meas(name, role, values, fmt=None):
    return {"source": src(name, role, "numeric", measure=True, fmt=fmt), "values": values}


def dv(cats, ms, objects=None):
    o = {"style": {"template": "report", "guide": False}, "legend": {"show": True, "position": "top"}}
    o.update(objects or {})
    return {"metadata": {"objects": o, "columns": [c["source"] for c in cats] + [m["source"] for m in ms]},
            "categorical": {"categories": cats, "values": ms}}


def dv_regiones():
    """Regions and margin: una fila por Year × Month × Region (la agregación de Desktop)."""
    rows = VENTAS
    cats = [col("Year", "axis", [r["Year"] for r in rows], "numeric", "Year"), col("Month", "axis", [r["Month"] for r in rows], level="Month"),
            col("Region", "legend", [r["Region"] for r in rows])]
    ms = [meas("Net sales", "values", [r["v"] for r in rows], "$#,0"),
          meas("Gross margin %", "secondaryValues", [r["mr"] for r in rows], "0.0%")]
    return dv(cats, ms, {"endLabels": {"show": True, "content": "nameValue"}, "y2Axis": {"show": True}})


def base_eventos():
    g = {}
    for r in VENTAS:
        k = (r["Year"], r["mn"])
        a = g.setdefault(k, {"Year": r["Year"], "Month": r["Month"], "mn": r["mn"], "Event": r["Event"], "v": 0.0})
        a["v"] += r["v"]
    return [g[k] for k in sorted(g)]


EVT = base_eventos()


def dv_eventos():
    cats = [col("Year", "axis", [r["Year"] for r in EVT], "numeric", "Year"), col("Month", "axis", [r["Month"] for r in EVT], level="Month"),
            col("Event", "legend", [r["Event"] for r in EVT])]
    return dv(cats, [meas("Net sales", "values", [r["v"] for r in EVT], "$#,0")])


SM = sorted(VENTAS, key=lambda r: (r["mn"], r["Year"], REG_ORDER[r["Region"]]))


def dv_sm():
    cats = [col("Month", "axis", [r["Month"] for r in SM]), col("Year", "smallMultiple", [r["Year"] for r in SM], "numeric"),
            col("Region", "legend", [r["Region"] for r in SM])]
    return dv(cats, [meas("Net sales", "values", [r["v"] for r in SM], "$#,0")], {"smallMultiples": {"columns": 2}})


def base_grande(dias):
    out, d0 = [], date(2023, 1, 1)
    for i in range(dias):
        d = (d0 + timedelta(days=i)).isoformat()
        for j, ch in enumerate(("Web", "Store")):
            # Curva suave (los puntos vecinos casi a la misma altura): el clic en un vértice es un clic en el punto.
            out.append({"Date": d, "Channel": ch, "v": float(round(1000 + 300 * math.sin(i / 40) + 600 * j))})
    return out


def dv_grande(base):
    cats = [col("Date", "axis", [r["Date"] for r in base], "dateTime"), col("Channel", "legend", [r["Channel"] for r in base])]
    return dv(cats, [meas("Visits", "values", [r["v"] for r in base], "#,0")])


def suma_filtrada(keys, base):
    """Como Power BI: cada identidad filtra las filas de la base que coinciden en TODAS sus columnas. Devuelve
    (suma, filas); suma None si dos identidades cubren la misma fila o alguna no cubre ninguna."""
    vistos, tot = set(), 0.0
    for k in keys:
        partes = [x.split("=", 1) for x in k.split("|")]
        hit = False
        for i, r in enumerate(base):
            if all(("null" if r.get(c) is None else str(r.get(c))) == v for c, v in partes):
                if i in vistos:
                    return None, len(vistos)
                vistos.add(i)
                hit = True
                tot += r["v"]
        if not hit:
            return None, len(vistos)
    return tot, len(vistos)


STUB = r"""
window.__store = { meta: {}, rows: {} };
window.__storeMerge = (items) => { for (const it of items) { if (it.selector && window.__noRowPersist) continue;
   const tgt = it.selector ? (__store.rows[it.selector.data[0]] = __store.rows[it.selector.data[0]] || {}) : __store.meta;
   tgt[it.objectName] = Object.assign({}, tgt[it.objectName] || {}, it.properties); } };
window.__rowKey = (cats, i) => cats.map(c => c.source.displayName + '=' + c.values[i]).join('|');
// El dataView que entrega el host: la base + lo guardado en el informe.
window.__apply = (base) => { const dv = JSON.parse(JSON.stringify(base)); const cats = dv.categorical.categories;
   dv.metadata.objects = Object.assign({}, dv.metadata.objects || {}, JSON.parse(JSON.stringify(__store.meta)));
   const leg = cats.find(c => c.source.roles.legend);
   if (leg && Object.keys(__store.rows).length) leg.objects = leg.values.map((_, i) => __store.rows[__rowKey(cats, i)] || null);
   return dv; };
window.__ev = []; window.__menu = []; window.__nSelect = 0; window.__maxSel = 0; window.__sel = [];
window.powerbi = { visuals: { plugins: {} }, extensibility: {} };
(function(){
 let sel = [];
 const asignados = {}; let nAsig = 0;
 const COLORS = ['#118DFF', '#12239E', '#E66C37', '#6B007B', '#E044A7', '#744EC2', '#D9B300', '#D64550'];
 const mkId = key => ({ key, getKey(){ return key; }, getSelector(){ return { data: [key] }; }, equals(o){ return !!o && o.key === key; }, includes(){ return false; } });
 window.__mkId = mkId;
 window.__host = {
  eventService: { renderingStarted(){ __ev.push('S'); }, renderingFinished(){ __ev.push('F'); }, renderingFailed(o, m){ __ev.push('X'); console.error('FAILED', m); } },
  createSelectionManager(){ return {
     select(id, multi){ const a = Array.isArray(id) ? id : [id]; window.__maxSel = Math.max(window.__maxSel, a.length); window.__nSelect++;
        sel = multi ? sel.concat(a) : a; window.__sel = sel; return Promise.resolve(sel); },
     clear(){ sel = []; window.__sel = []; return Promise.resolve(); }, getSelectionIds(){ return sel; },
     hasSelection(){ return sel.length > 0; }, registerOnSelectCallback(cb){ window.__onSel = cb; },
     showContextMenu(id, p){ __menu.push(id && id.key ? id.key : null); return Promise.resolve(); } }; },
  // Como Power BI: con varias columnas en categories, categories[k].identity[i] es la identidad de la FILA i (todas
  // sus columnas), se pida la columna que se pida; con una sola columna, la de su valor.
  createSelectionIdBuilder(){ const k = []; const b = {
     withCategory(c, i){ const cols = window.__cats || [c];
        for (const col of cols) { const part = col.source.displayName + '=' + col.values[i]; if (k.indexOf(part) < 0) k.push(part); } return b; },
     withSeries(){ return b; }, withMeasure(){ return b; }, createSelectionId(){ return mkId(k.join('|')); } }; return b; },
  createLocalizationManager(){ return { getDisplayName(k){ return k; } }; },
  tooltipService: { enabled(){ return true; }, show(o){ window.__tip = o; }, move(o){ window.__tip = o; }, hide(){} },
  subSelectionService: { subSelect(){}, updateRegionOutlines(){} },
  hostCapabilities: { allowInteractions: true }, locale: window.__locale || 'en-US',
  fetchMoreData(){ return false; },
  colorPalette: { isHighContrast: false, foreground: {value: '#252423'}, background: {value: '#FFFFFF'},
    foregroundNeutralSecondary: {value: '#605E5C'}, foregroundSelected: {value: '#1AEBFF'},
    getColor(k){ if (!(k in asignados)) asignados[k] = COLORS[(nAsig++) % COLORS.length]; return {value: asignados[k]}; } },
  licenseManager: { getAvailableServicePlans(){ return Promise.resolve({ plans: window.__plan ? [{ spIdentifier: window.__plan, state: 1 }] : [], isLicenseUnsupportedEnv: false, isLicenseInfoAvailable: true }); },
     notifyFeatureBlocked(){ return Promise.resolve(true); }, notifyLicenseRequired(){ return Promise.resolve(true); }, clearLicenseNotification(){ return Promise.resolve(true); } },
  // Como Power BI: persistProperties guarda en el informe (selector nulo → metadata.objects; selector de fila → los
  // objects de las filas cuya identidad coincide) y dispara un update con los objects nuevos.
  persistProperties(p){ (window.__persist = window.__persist || []).push(p); __storeMerge(p.merge || []);
     setTimeout(() => window.__again && window.__again(), 0); }, launchUrl(){}, applyJsonFilter(){ window.__jsonFilter = true; },
  displayWarningIcon(){}, refreshHostData(){},
 };
})();
"""

# Ayudantes en la página: vértices de la línea de una serie (en su panel) y clics en coordenadas reales.
HELP = r"""
window.__lc = {
  group(id, panel){ const gs = Array.from(document.querySelectorAll('.lc-series')).filter(g => g.getAttribute('data-id') === id); return gs[panel || 0]; },
  verts(id, panel){ const g = this.group(id, panel); const p = g && g.querySelector('path.lc-line'); if (!p) return [];
     const n = (p.getAttribute('d') || '').match(/-?\d+(\.\d+)?(e-?\d+)?/g).map(Number); const out = [];
     for (let i = 0; i + 1 < n.length; i += 2) out.push([n[i], n[i + 1]]); return out; },
  client(id, panel, x, y){ const p = this.group(id, panel).querySelector('path.lc-line'); const svg = p.ownerSVGElement; const pt = svg.createSVGPoint();
     pt.x = x; pt.y = y; const c = pt.matrixTransform(p.getScreenCTM()); return [c.x, c.y]; },
  overlay(id, panel){ const g = this.group(id, panel); const box = g.closest('.lc-panel') || g.ownerSVGElement; return box.querySelector('.lc-overlay'); },
  fire(el, type, cx, cy, ctrl){ el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: cx, clientY: cy, ctrlKey: !!ctrl })); },
  // Clic en el vértice j (un punto) o a media distancia entre j y j+1 (la línea, lejos de los puntos).
  clickAt(id, panel, j, onLine, ctrl, type){ const v = this.verts(id, panel); const a = v[j], b = v[j + 1] || a;
     const x = onLine ? (a[0] + b[0]) / 2 : a[0], y = onLine ? (a[1] + b[1]) / 2 : a[1];
     const [cx, cy] = this.client(id, panel, x, y); this.fire(this.overlay(id, panel), type || 'click', cx, cy, ctrl); },
  legend(id, ctrl){ const it = document.querySelector('.lc-legend-item[data-id="' + id + '"]'); if (!it) return false; this.fire(it, 'click', 0, 0, ctrl); return true; },
  endLabel(id, panel, ctrl){ const els = Array.from(document.querySelectorAll('.lc-endlabel')).filter(e => e.getAttribute('data-id') === id);
     const el = els[panel || 0]; if (!el) return false; const t = el.querySelector('text') || el; const r = t.getBoundingClientRect();
     this.fire(t, 'click', r.x + r.width / 2, r.y + r.height / 2, ctrl); return true; },
  // Opacidad de cada serie por id y número de panel (id#panel).
  state(){ const op = {}, n = {}; document.querySelectorAll('.lc-series').forEach(g => { const id = g.getAttribute('data-id'); n[id] = (n[id] || 0); op[id + '#' + n[id]++] = g.getAttribute('opacity'); });
     const note = document.querySelector('.lc-selnote');
     return { sel: (window.__sel || []).map(s => s.key), nSelect: window.__nSelect, maxSel: window.__maxSel, menu: window.__menu.slice(),
              note: note && note.style.display !== 'none' ? note.textContent : '', live: (document.querySelector('.lc-live') || {}).textContent || '',
              rings: document.querySelectorAll('.lc-sel circle').length, op }; },
};
"""


async def page(b, data, W=1400, H=620, locale="en-US", plan=PLAN, vm=0, store=None):
    guid = json.load(io.open(os.path.join(DROP, "pbiviz.json"), encoding="utf-8"))["visual"]["guid"]
    pg = await b.new_page(viewport={"width": W + 20, "height": H + 20})
    errs = []
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append(str(e)))
    await pg.set_content(f"<html><body style='margin:0;background:#fff'><div id='host' style='position:relative;width:{W}px;height:{H}px;overflow:hidden'></div></body></html>")
    await pg.add_style_tag(path=os.path.join(DROP, "visual.css"))
    # LC_NOROW=1: variante de diagnóstico en la que el host ignora lo que el visual guarda con selector de fila.
    await pg.add_script_tag(content=f"window.__plan = {json.dumps(plan)}; window.__locale = {json.dumps(locale)}; window.__noRowPersist = {json.dumps(os.environ.get('LC_NOROW') == '1')};")
    await pg.add_script_tag(content=STUB)
    await pg.add_script_tag(content=HELP)
    await pg.add_script_tag(path=os.path.join(DROP, "visual.js"))
    await pg.evaluate("(g) => { window.__v = powerbi.visuals.plugins[g].create({ element: document.getElementById('host'), host: __host }); }", guid)
    pg._errs, pg._dims, pg._vm = errs, (W, H), vm
    if store:
        await pg.evaluate("(st) => { window.__store = st; }", store)
    await upd(pg, data)
    await pg.wait_for_timeout(150)   # la licencia resuelve después del primer pintado
    return pg


async def upd(pg, data):
    W, H = pg._dims
    await pg.evaluate("""([dv, W, H, vm]) => { window.__base = dv; window.__cats = dv.categorical.categories;
        window.__again = () => __v.update({ dataViews: [__apply(window.__base)], viewport: { width: W, height: H }, type: 2, operationKind: 0, viewMode: vm, editMode: 0 });
        // Variante (pg._sinobj): tras un cambio de datos (filtro), el primer update llega SIN los objects de las filas y
        // el siguiente con ellos, como sospechamos de Desktop tras un segmentador.
        const fpd = JSON.stringify(dv.categorical.categories.map(c => c.values)); const cambia = fpd !== window.__fpd; window.__fpd = fpd;
        if (window.__sinObj && cambia) { const dv0 = __apply(window.__base); dv0.categorical.categories.forEach(c => { delete c.objects; });
            __v.update({ dataViews: [dv0], viewport: { width: W, height: H }, type: 2, operationKind: 0, viewMode: vm, editMode: 0 }); }
        window.__again(); }""", [data, W, H, getattr(pg, "_vm", 0)])
    await pg.wait_for_timeout(60)


async def st(pg):
    await pg.wait_for_timeout(20)
    return await pg.evaluate("() => __lc.state()")


async def sin_errores(pg, label):
    ev = await pg.evaluate("() => __ev.join('')")
    check(f"{label}: sin errores y eventos de render 1:1", not pg._errs and ev.count("S") == ev.count("F") and "X" not in ev, f"{ev[-12:]} {pg._errs[:2]}")


def fmt(x):
    return "—" if x is None else f"{x:,.0f}"


TABLA = []


def caso(nombre, s, base, esperado, filas_esp, extra_ok=True, detalle=""):
    suma, filas = suma_filtrada(s["sel"], base)
    TABLA.append((nombre, len(s["sel"]), filas, suma, esperado))
    ok = suma is not None and abs(suma - esperado) < 0.5 and filas == filas_esp and extra_ok
    check(f"{nombre}: filtra {fmt(esperado)} ({filas_esp} filas)", ok, f"enviadas {len(s['sel'])} ids, {filas} filas, suma {fmt(suma)} {detalle}")


SID = lambda reg, m="Net sales": f"m.{m}␟{reg}"


async def tanda_regiones(b):
    print("\nRegions and margin (Legend = Region, eje Year > Month)")
    base = VENTAS
    pg = await page(b, dv_regiones())
    south = [r for r in base if r["Region"] == "South"]
    north = [r for r in base if r["Region"] == "North"]
    # 1 · Leyenda
    check("la leyenda tiene South", await pg.evaluate("(id) => !!document.querySelector('.lc-legend-item[data-id=\"' + id + '\"]')", SID("South")))
    await pg.evaluate("(id) => __lc.legend(id)", SID("South"))
    s = await st(pg)
    caso("Leyenda South", s, base, TOT_REG["South"], len(south))
    check("leyenda South: las demás series atenuadas", s["op"].get(SID("North") + "#0") == "0.3" and s["op"].get(SID("South") + "#0") == "1", str(s["op"]))
    # 2 · Ctrl + leyenda North: South + North; Ctrl otra vez en South: solo North
    await pg.evaluate("(id) => __lc.legend(id, true)", SID("North"))
    s = await st(pg)
    caso("Leyenda South + Ctrl North", s, base, TOT_REG["South"] + TOT_REG["North"], len(south) + len(north))
    await pg.evaluate("(id) => __lc.legend(id, true)", SID("South"))
    s = await st(pg)
    caso("Ctrl de nuevo en South (la quita)", s, base, TOT_REG["North"], len(north))
    # Clic normal en North (única seleccionada): se quita todo
    await pg.evaluate("(id) => __lc.legend(id)", SID("North"))
    s = await st(pg)
    check("clic en la única serie seleccionada: limpia la selección", s["sel"] == [], str(s["sel"][:3]))
    # 3 · Clic en la línea (a media distancia entre dos puntos)
    await pg.evaluate("(id) => __lc.clickAt(id, 0, 10, true)", SID("South"))
    s = await st(pg)
    caso("Clic en la línea South", s, base, TOT_REG["South"], len(south))
    # 4 · Etiqueta final
    await pg.evaluate("(id) => __lc.legend(id)", SID("South"))   # quita (South era la única)
    hay = await pg.evaluate("(id) => __lc.endLabel(id, 0)", SID("East"))
    s = await st(pg)
    east = [r for r in base if r["Region"] == "East"]
    check("hay etiqueta final de East", hay)
    caso("Etiqueta final East", s, base, TOT_REG["East"], len(east))
    # 5 · Punto: su fila (Mar 2024 de South: vértice 14)
    await pg.evaluate("(id) => __lc.clickAt(id, 0, 14, false)", SID("South"))
    s = await st(pg)
    r14 = south[14]
    # Un anillo por medida de la serie (Net sales y Gross margin %): el mismo punto, la misma fila.
    caso(f"Punto South {r14['Month']} {r14['Year']}", s, base, r14["v"], 1, s["rings"] == 2, f"anillos={s['rings']}")
    # Ctrl + otro punto: los dos
    await pg.evaluate("(id) => __lc.clickAt(id, 0, 20, false, true)", SID("North"))
    s = await st(pg)
    caso("Punto + Ctrl otro punto (North)", s, base, r14["v"] + north[20]["v"], 2)
    # 6 · Menú contextual: en la línea (varias filas) sin identidad; en un punto, la de su fila
    await pg.evaluate("(id) => __lc.clickAt(id, 0, 5, true, false, 'contextmenu')", SID("South"))
    await pg.evaluate("(id) => __lc.clickAt(id, 0, 5, false, false, 'contextmenu')", SID("South"))
    s = await st(pg)
    check("menú contextual en la línea (serie, 45 filas): sin identidad de dato", len(s["menu"]) >= 2 and s["menu"][-2] is None, str(s["menu"][-2:]))
    exp5 = f"Year={south[5]['Year']}|Month={south[5]['Month']}|Region=South"
    check("menú contextual en un punto: la identidad de su fila", s["menu"][-1] == exp5, str(s["menu"][-1:]))
    # 7 · Marcadores: selección externa con las filas de South → South seleccionada, sin llamar a select()
    await pg.evaluate("() => __lc.legend('x')")
    await pg.evaluate("() => { __host.createSelectionManager().clear(); }")
    n0 = (await st(pg))["nSelect"]
    keys = [f"Year={r['Year']}|Month={r['Month']}|Region=South" for r in south]
    await pg.evaluate("(ks) => { window.__onSel(ks.map(k => __mkId(k))); }", keys)
    s = await st(pg)
    check("marcador con las filas de South: South seleccionada (las demás atenuadas)", s["op"].get(SID("North") + "#0") == "0.3" and s["op"].get(SID("South") + "#0") == "1", str(s["op"]))
    check("marcador: restaurar no llama a select() ni a persistProperties", s["nSelect"] == n0 and not await pg.evaluate("() => (window.__persist || []).length"), f"{s['nSelect']} vs {n0}")
    # Marcador con un punto → anillo en el punto
    await pg.evaluate("(ks) => { window.__onSel(ks.map(k => __mkId(k))); }", [keys[14]])
    s = await st(pg)
    check("marcador con una fila: el punto seleccionado (un anillo por medida)", s["rings"] == 2, f"anillos={s['rings']}")
    # Tras restaurar South, un clic en la leyenda South la quita (toggle sobre lo restaurado)
    await pg.evaluate("(ks) => { window.__onSel(ks.map(k => __mkId(k))); }", keys)
    await pg.evaluate("(id) => __lc.legend(id)", SID("South"))
    s = await st(pg)
    check("tras el marcador de South, clic en South: limpia", s["sel"] == [], str(s["sel"][:2]))
    # Un update de datos conserva la selección y la vuelve a resolver
    await pg.evaluate("(id) => __lc.legend(id)", SID("West"))
    await upd(pg, dv_regiones())
    s = await st(pg)
    check("un update con los mismos datos conserva la selección de West", s["op"].get(SID("South") + "#0") == "0.3" and s["op"].get(SID("West") + "#0") == "1", str(s["op"]))
    check("nunca applyJsonFilter", not await pg.evaluate("() => !!window.__jsonFilter"))
    await sin_errores(pg, "Regions and margin")
    await pg.close()


async def tanda_eventos(b):
    print("\nLegend = Event (eje Year > Month)")
    pg = await page(b, dv_eventos())
    blanco = [r for r in EVT if r["Event"] is None]
    ids = await pg.evaluate("() => Array.from(document.querySelectorAll('.lc-legend-item')).map(e => e.getAttribute('data-id'))")
    bid = next((i for i in ids if i.endswith("␟(Blank)")), None)
    check("la leyenda tiene la serie (Blank)", bid is not None, str(ids))
    if bid:
        await pg.evaluate("(id) => __lc.legend(id)", bid)
        s = await st(pg)
        caso("Leyenda (Blank) — meses sin evento", s, EVT, sum(r["v"] for r in blanco), len(blanco))
    ev = next(r for r in EVT if r["Event"])
    await pg.evaluate("(id) => __lc.legend(id)", f"m.Net sales␟{ev['Event']}")
    s = await st(pg)
    caso(f"Leyenda «{ev['Event']}»", s, EVT, ev["v"], 1)
    await sin_errores(pg, "Legend = Event")
    await pg.close()


async def tanda_sm(b):
    print("\nSmall multiples (eje Month, Small multiples = Year, Legend = Region; con licencia)")
    pg = await page(b, dv_sm(), W=1400, H=900)
    years = sorted({r["Year"] for r in SM})
    ip = years.index(2024)
    n = await pg.evaluate("() => document.querySelectorAll('.lc-panel').length")
    check("un panel por año", n == len(years), str(n))
    s24 = [r for r in SM if r["Region"] == "South" and r["Year"] == 2024]
    sall = [r for r in SM if r["Region"] == "South"]
    # Clic en la línea South del panel 2024: South en ese panel
    await pg.evaluate("([id, p]) => __lc.clickAt(id, p, 4, true)", [SID("South"), ip])
    s = await st(pg)
    caso("SM · clic en la línea South del panel 2024", s, SM, sum(r["v"] for r in s24), len(s24))
    ops = [v for k, v in s["op"].items() if k.startswith(SID("South") + "#")]
    check("SM · solo el panel 2024 resalta South", ops.count("1") == 1, str(ops))
    # Ctrl + South del panel 2025: los dos paneles
    s25 = [r for r in SM if r["Region"] == "South" and r["Year"] == 2025]
    await pg.evaluate("([id, p]) => __lc.clickAt(id, p, 4, true, true)", [SID("South"), years.index(2025)])
    s = await st(pg)
    caso("SM · Ctrl + South del panel 2025", s, SM, sum(r["v"] for r in s24 + s25), len(s24) + len(s25))
    # Leyenda South: en todos los paneles
    await pg.evaluate("(id) => __lc.legend(id)", SID("South"))
    s = await st(pg)
    caso("SM · leyenda South (todos los paneles)", s, SM, TOT_REG["South"], len(sall))
    # Etiqueta final en el panel 2024: South en ese panel
    await pg.evaluate("(id) => __lc.legend(id)", SID("South"))
    hay = await pg.evaluate("([id, p]) => __lc.endLabel(id, p)", [SID("South"), ip])
    if hay:
        s = await st(pg)
        caso("SM · etiqueta final South del panel 2024", s, SM, sum(r["v"] for r in s24), len(s24))
    # Punto en un panel: su fila
    await pg.evaluate("([id, p]) => __lc.clickAt(id, p, 2, false)", [SID("South"), ip])
    s = await st(pg)
    caso(f"SM · punto South {s24[2]['Month']} 2024", s, SM, s24[2]["v"], 1)
    # Marcador con las filas de South 2024: solo ese panel
    await pg.evaluate("() => __lc.legend('x')")
    keys = [f"Month={r['Month']}|Year=2024|Region=South" for r in s24]
    await pg.evaluate("(ks) => { window.__onSel(ks.map(k => __mkId(k))); }", keys)
    s = await st(pg)
    ops = [v for k, v in s["op"].items() if k.startswith(SID("South") + "#")]
    check("SM · marcador con South 2024: resalta South solo en el panel 2024", ops.count("1") == 1 and ops[ip] == "1", str(ops))
    # Marcador con TODAS las filas de South: la serie entera (todos los paneles)
    keys = [f"Month={r['Month']}|Year={r['Year']}|Region=South" for r in sall]
    await pg.evaluate("(ks) => { window.__onSel(ks.map(k => __mkId(k))); }", keys)
    s = await st(pg)
    ops = [v for k, v in s["op"].items() if k.startswith(SID("South") + "#")]
    check("SM · marcador con todo South: resalta South en todos los paneles", ops and all(o == "1" for o in ops), str(ops))
    # Menú contextual en la línea de un panel (12 filas): sin identidad
    await pg.evaluate("([id, p]) => __lc.clickAt(id, p, 4, true, false, 'contextmenu')", [SID("South"), ip])
    s = await st(pg)
    check("SM · menú contextual en la línea de un panel: sin identidad de dato", s["menu"] and s["menu"][-1] is None, str(s["menu"][-1:]))
    await sin_errores(pg, "Small multiples")
    await pg.close()
    # Sin licencia (lectura): se dibuja solo el primer panel (2023). Clic en su línea = South en ese panel; leyenda = todo.
    pg = await page(b, dv_sm(), W=1400, H=700, plan=None)
    n = await pg.evaluate("() => document.querySelectorAll('.lc-panel').length")
    check("Free · un solo panel dibujado", n == 0, str(n))
    s23 = [r for r in SM if r["Region"] == "South" and r["Year"] == years[0]]
    await pg.evaluate("(id) => __lc.clickAt(id, 0, 4, true)", SID("South"))
    s = await st(pg)
    caso(f"Free SM · clic en la línea South (panel {years[0]})", s, SM, sum(r["v"] for r in s23), len(s23))
    await pg.evaluate("(id) => __lc.legend(id)", SID("South"))
    s = await st(pg)
    caso("Free SM · leyenda South (todos los paneles)", s, SM, TOT_REG["South"], len(sall))
    await sin_errores(pg, "Free con small multiples")
    await pg.close()


async def tanda_tope(b):
    print("\nTope de identidades (MAX_SELECT_IDS = 1.000)")
    base = base_grande(1200)
    pg = await page(b, dv_grande(base), W=1400, H=560)
    n0 = (await st(pg))["nSelect"]
    await pg.evaluate("() => __lc.legend('m.Visits␟Web')")
    s = await st(pg)
    TABLA.append(("Tope · leyenda Web (1.200 filas)", len(s["sel"]), 0, None, "solo en el visual + aviso"))
    check("tope: 1.200 filas > 1.000 → no se llama a select()", s["nSelect"] == n0 and s["sel"] == [], f"nSelect {s['nSelect']} vs {n0}, sel {len(s['sel'])}")
    check("tope: aviso visible con el número de filas", "Too many rows to filter other visuals (1,200)" in s["note"] and "select fewer items" in s["note"], repr(s["note"]))
    check("tope: la región viva lee el aviso", "Too many rows" in s["live"], repr(s["live"]))
    check("tope: la selección se ve dentro del visual (Store atenuada)", s["op"].get("m.Visits␟Store#0") == "0.3" and s["op"].get("m.Visits␟Web#0") == "1", str(s["op"]))
    # Un punto sí filtra (1 fila) y el aviso desaparece
    await pg.evaluate("() => __lc.clickAt('m.Visits␟Web', 0, 100, false)")
    s = await st(pg)
    check("tope: después un punto filtra (1 identidad) y el aviso se va", len(s["sel"]) == 1 and not s["note"], f"{len(s['sel'])} {s['note']!r}")
    check("tope: nunca más de 1.000 identidades en un select()", s["maxSel"] <= MAX_IDS, str(s["maxSel"]))
    await sin_errores(pg, "tope")
    await pg.close()
    # Por debajo del tope: 900 días → select con 900
    base9 = base_grande(900)
    pg = await page(b, dv_grande(base9), W=1400, H=560)
    await pg.evaluate("() => __lc.legend('m.Visits␟Web')")
    s = await st(pg)
    caso("Leyenda Web con 900 filas (bajo el tope)", s, base9, sum(r["v"] for r in base9 if r["Channel"] == "Web"), 900, not s["note"])
    await pg.close()
    # Ctrl suma filas: 600 + 600 = 1.200 pasa el tope; quitar una vuelve a filtrar
    base6 = base_grande(600)
    pg = await page(b, dv_grande(base6), W=1400, H=560)
    web6 = sum(r["v"] for r in base6 if r["Channel"] == "Web")
    await pg.evaluate("() => __lc.legend('m.Visits␟Web')")
    s = await st(pg)
    caso("Tope · leyenda Web (600 filas)", s, base6, web6, 600)
    n0 = s["nSelect"]
    await pg.evaluate("() => __lc.legend('m.Visits␟Store', true)")
    s = await st(pg)
    TABLA.append(("Tope · Web + Ctrl Store (1.200 filas)", len(s["sel"]), 0, None, "solo en el visual + aviso"))
    check("tope con Ctrl: 1.200 filas → sin select(), la de fuera se limpia y sale el aviso",
          s["nSelect"] == n0 and s["sel"] == [] and "(1,200)" in s["note"], f"{s['nSelect']} {len(s['sel'])} {s['note']!r}")
    check("tope con Ctrl: las dos series siguen resaltadas dentro", s["op"].get("m.Visits␟Web#0") == "1" and s["op"].get("m.Visits␟Store#0") == "1", str(s["op"]))
    await pg.evaluate("() => __lc.legend('m.Visits␟Store', true)")
    s = await st(pg)
    caso("Tope · Ctrl quita Store (vuelve a 600)", s, base6, web6, 600, not s["note"] and "Too many" not in s["live"], f"nota={s['note']!r} live={s['live']!r}")
    await sin_errores(pg, "tope con Ctrl")
    await pg.close()
    # El aviso en los 12 idiomas
    esperado = {"es-ES": "Demasiadas filas", "pt-BR": "Demasiadas linhas", "pt-PT": "Demasiadas linhas", "fr-FR": "Trop de lignes", "de-DE": "Zu viele Zeilen",
                "it-IT": "Troppe righe", "nl-NL": "Te veel rijen", "pl-PL": "Za dużo wierszy", "ja-JP": "行が多すぎます", "zh-CN": "行数过多",
                "ko-KR": "행이 너무 많습니다", "en-US": "Too many rows"}
    for loc, txt in esperado.items():
        pg = await page(b, dv_grande(base), W=1000, H=420, locale=loc)
        await pg.evaluate("() => __lc.legend('m.Visits␟Web')")
        s = await st(pg)
        check(f"tope: aviso traducido ({loc})", txt in s["note"] and "1" in s["note"], repr(s["note"]))
        await pg.close()


COLOR_JS = r"""(nombre) => { const fm = __v.getFormattingModel(); const out = [];
  const walk = o => { if (!o || typeof o !== 'object') return; if (Array.isArray(o)) { o.forEach(walk); return; }
    const d = o.control && o.control.properties && o.control.properties.descriptor;
    if (d && d.objectName === 'dataColors' && d.propertyName === 'fill') out.push({ name: o.displayName, sel: d.selector });
    Object.values(o).forEach(walk); };
  walk(fm); return out.find(x => x.name === nombre) || null; }"""


def sin_anio(data, anio):
    """Un filtro (segmentador de Year) que quita un año: la base sin esas filas."""
    d = json.loads(json.dumps(data))
    keep = [i for i, y in enumerate(d["categorical"]["categories"][0]["values"]) if y != anio]
    for c in d["categorical"]["categories"] + d["categorical"]["values"]:
        c["values"] = [c["values"][i] for i in keep]
        if "identity" in c:
            c["identity"] = [c["identity"][i] for i in keep]
    return d


# El usuario cambia una propiedad de la serie en el panel: Power BI la guarda con el selector del descriptor y actualiza.
PANE_SET = r"""([nombre, prop, valor]) => { const fm = __v.getFormattingModel(); let sel = null;
  const walk = o => { if (sel || !o || typeof o !== 'object') return; if (Array.isArray(o)) { o.forEach(walk); return; }
    const d = o.control && o.control.properties && o.control.properties.descriptor;
    if (d && d.objectName === 'dataColors' && d.propertyName === 'fill' && o.displayName === nombre) sel = d.selector;
    Object.values(o).forEach(walk); };
  walk(fm); const k = sel.data[0]; __store.rows[k] = __store.rows[k] || {}; const dc = __store.rows[k].dataColors = Object.assign({}, __store.rows[k].dataColors || {});
  if (valor === null) delete dc[prop]; else dc[prop] = prop === 'fill' ? { solid: { color: valor } } : valor;
  if (!Object.keys(dc).length) delete __store.rows[k];
  window.__again(); return k; }"""
STROKE = "() => { const g = Array.from(document.querySelectorAll('.lc-series')).find(g => g.getAttribute('data-id') === 'm.Net sales␟South'); const p = g.querySelector('path.lc-line'); return [p.getAttribute('stroke').toUpperCase(), p.getAttribute('stroke-width')]; }"
NPERSIST = "() => (window.__persist || []).length"
MAPA = "() => { const m = (__store.meta.seriesStyles || {}).map; return m ? JSON.parse(m) : null; }"


async def tanda_color(b):
    """25-11 (build .42, Tino en Desktop): con un color fijo en South y un segmentador de Year sin 2023, South cambiaba
    de color. El panel guarda dataColors con el selector de UNA fila de la serie; desde la 1.0.1 el visual guarda además
    seriesStyles.map (oculto) por valor de leyenda y dibuja con él."""
    print("\nColor por serie: mapa persistente por valor de leyenda (seriesStyles.map)")
    full, s23 = dv_regiones(), sin_anio(dv_regiones(), 2023)
    pg = await page(b, full, vm=1)
    e = await pg.evaluate(COLOR_JS, "South")
    check("panel: el color de South apunta a la fila Jan 2023 (primera de la serie)", e and e["sel"]["data"][0] == "Year=2023|Month=Jan|Region=South", str(e))
    defecto = (await pg.evaluate(STROKE))[0]
    # 1 · Color fijo para South (editando): se dibuja y se guarda el mapa con UN persist; el update que provoca no persiste.
    await pg.evaluate(PANE_SET, ["South", "fill", "#FF0000"])
    await pg.wait_for_timeout(150)
    check("color fijo #FF0000: South roja", (await pg.evaluate(STROKE))[0] == "#FF0000", str(await pg.evaluate(STROKE)))
    mp = await pg.evaluate(MAPA)
    check("mapa guardado: South → #FF0000 con la fila Jan 2023", mp and mp.get("South", {}).get("fill") == "#FF0000" and "2023" in mp["South"]["k"] and '"Jan"' in mp["South"]["k"], str(mp))
    n1 = await pg.evaluate(NPERSIST)
    await upd(pg, full)
    await pg.wait_for_timeout(100)
    check("un solo persist por cambio y ninguno en los updates siguientes (sin bucle)", n1 == 1 and await pg.evaluate(NPERSIST) == 1, f"{n1} → {await pg.evaluate(NPERSIST)}")
    # 2 · Segmentador sin 2023: la fila del selector desaparece, el color se conserva
    await upd(pg, s23)
    await pg.wait_for_timeout(100)
    check("filtro sin 2023: South SIGUE roja (defecto de la .42)", (await pg.evaluate(STROKE))[0] == "#FF0000", str(await pg.evaluate(STROKE)))
    check("filtro sin 2023: sin persist", await pg.evaluate(NPERSIST) == 1)
    e = await pg.evaluate(COLOR_JS, "South")
    check("filtro sin 2023: el panel apunta a la primera fila visible (Jan 2024)", e and e["sel"]["data"][0] == "Year=2024|Month=Jan|Region=South", str(e))
    # 3 · Cambiar el color con el filtro puesto
    await pg.evaluate(PANE_SET, ["South", "fill", "#00AA00"])
    await pg.wait_for_timeout(150)
    check("con el filtro, cambio a #00AA00: South verde", (await pg.evaluate(STROKE))[0] == "#00AA00", str(await pg.evaluate(STROKE)))
    mp = await pg.evaluate(MAPA)
    check("mapa: South → #00AA00 y la fila autoritativa pasa a Jan 2024", mp and mp["South"].get("fill") == "#00AA00" and "2024" in mp["South"]["k"], str(mp))
    # 3b · Solo el grosor con el filtro: se fusiona (el color se conserva)
    await pg.evaluate(PANE_SET, ["South", "lineWidth", 5])
    await pg.wait_for_timeout(150)
    sk = await pg.evaluate(STROKE)
    check("con el filtro, grosor 5: South verde y de 5 px", sk[0] == "#00AA00" and float(sk[1]) == 5, str(sk))
    # 4 · Quitar el filtro: la fila Jan 2023 aún lleva el rojo viejo → no aparecen dos colores
    await upd(pg, full)
    await pg.wait_for_timeout(150)
    sk = await pg.evaluate(STROKE)
    viejo = await pg.evaluate("() => JSON.stringify(__store.rows['Year=2023|Month=Jan|Region=South'] || null)")
    check("sin filtro: South verde (no vuelve el rojo de la fila Jan 2023)", sk[0] == "#00AA00" and float(sk[1]) == 5, f"{sk} (fila 2023: {viejo})")
    e = await pg.evaluate(COLOR_JS, "South")
    check("sin filtro: el panel apunta a la fila autoritativa (Jan 2024), no a la del rojo viejo", e and e["sel"]["data"][0] == "Year=2024|Month=Jan|Region=South", str(e))
    n4 = await pg.evaluate(NPERSIST)
    # 5 · Cambiar sin filtro, y restablecer: vuelve el automático, no el rojo viejo
    await pg.evaluate(PANE_SET, ["South", "fill", "#0000FF"])
    await pg.wait_for_timeout(150)
    check("sin filtro, cambio a #0000FF: South azul", (await pg.evaluate(STROKE))[0] == "#0000FF", str(await pg.evaluate(STROKE)))
    await pg.evaluate(PANE_SET, ["South", "fill", None])
    await pg.evaluate(PANE_SET, ["South", "lineWidth", None])
    await pg.wait_for_timeout(200)
    sk = await pg.evaluate(STROKE)
    check("restablecer: South vuelve al color automático (no al rojo viejo)", sk[0] == defecto, f"{sk} vs {defecto}")
    # 6 · Marcadores (selección restaurada): no tocan el color ni persisten
    await pg.evaluate(PANE_SET, ["South", "fill", "#AA00AA"])
    await pg.wait_for_timeout(150)
    np0 = await pg.evaluate(NPERSIST)
    keys = [f"Year={r['Year']}|Month={r['Month']}|Region=South" for r in VENTAS if r["Region"] == "South"]
    await pg.evaluate("(ks) => { window.__onSel(ks.map(k => __mkId(k))); }", keys)
    await pg.wait_for_timeout(80)
    s = await st(pg)
    check("marcador: South seleccionada, sigue #AA00AA y sin persist", s["op"].get(SID("North") + "#0") == "0.3" and (await pg.evaluate(STROKE))[0] == "#AA00AA" and await pg.evaluate(NPERSIST) == np0, f"{np0} {await pg.evaluate(NPERSIST)}")
    total = await pg.evaluate(NPERSIST)
    check(f"persist solo cuando cambia algo ({total} en toda la secuencia, ≥ {n4})", total >= n4 and total <= 8, str(total))
    store = await pg.evaluate("() => JSON.parse(JSON.stringify(__store))")
    await sin_errores(pg, "color por serie (editando)")
    await pg.close()
    # 7 · Lectura (sin permiso de escritura): el mapa ya guardado basta, sin persist
    pg = await page(b, s23, vm=0, store=store)
    await pg.wait_for_timeout(100)
    check("lectura con filtro sin 2023: South conserva #AA00AA con el mapa guardado", (await pg.evaluate(STROKE))[0] == "#AA00AA", str(await pg.evaluate(STROKE)))
    check("lectura: nunca persistProperties", await pg.evaluate(NPERSIST) == 0)
    await sin_errores(pg, "color por serie (lectura)")
    await pg.close()
    # 8 · Informe de la 1.0.0 (sin mapa, color en la primera fila): igual que antes; editando, se migra al mapa una vez
    legacy = {"meta": {}, "rows": {"Year=2023|Month=Jan|Region=South": {"dataColors": {"fill": {"solid": {"color": "#FF8800"}}}}}}
    pg = await page(b, full, vm=0, store=legacy)
    check("1.0.0 en lectura: South #FF8800 como antes, sin persist", (await pg.evaluate(STROKE))[0] == "#FF8800" and await pg.evaluate(NPERSIST) == 0)
    await pg.close()
    pg = await page(b, full, vm=1, store=json.loads(json.dumps(legacy)))
    await pg.wait_for_timeout(150)
    mp = await pg.evaluate(MAPA)
    check("1.0.0 editando: se migra al mapa con un persist", mp and mp.get("South", {}).get("fill") == "#FF8800" and await pg.evaluate(NPERSIST) == 1, f"{mp} {await pg.evaluate(NPERSIST)}")
    await upd(pg, s23)
    await pg.wait_for_timeout(100)
    check("1.0.0 migrado: con filtro sin 2023 South sigue #FF8800", (await pg.evaluate(STROKE))[0] == "#FF8800" and await pg.evaluate(NPERSIST) == 1)
    await sin_errores(pg, "color por serie (migración)")
    await pg.close()


# Variante Desktop: al mirar el panel, el host reescribe en la fila del selector el valor que muestra el ColorPicker.
PANE_LOOK = r"""(nombre) => { const fm = __v.getFormattingModel(); let hit = null;
  const walk = o => { if (hit || !o || typeof o !== 'object') return; if (Array.isArray(o)) { o.forEach(walk); return; }
    const d = o.control && o.control.properties && o.control.properties.descriptor;
    if (d && d.objectName === 'dataColors' && d.propertyName === 'fill' && o.displayName === nombre) hit = o.control.properties;
    Object.values(o).forEach(walk); };
  walk(fm); const k = hit.descriptor.selector.data[0]; __store.rows[k] = __store.rows[k] || {};
  __store.rows[k].dataColors = Object.assign({}, __store.rows[k].dataColors || {}, { fill: { solid: { color: hit.value.value } } });
  window.__again(); return [k, hit.value.value]; }"""
SOLO_MAPA = "() => (window.__persist || []).every(p => (p.merge || []).every(m => m.selector === null && m.objectName === 'seriesStyles'))"


async def paso(pg, data, label, esperado, mirar=False):
    await upd(pg, data)
    await pg.wait_for_timeout(120)
    if mirar:
        await pg.evaluate(PANE_LOOK, "South")
        await pg.wait_for_timeout(150)
    sk = (await pg.evaluate(STROKE))[0]
    diag = await pg.evaluate("() => (document.querySelector('.lc-diag') || {}).textContent || ''")
    check(f"{label}: South {esperado}", sk == esperado, f"{sk} · {diag}")


async def tanda_color_secuencias(b):
    """25-11 (build .47, Tino): sin 2023 → bien; después sin 2024 → pierde el color; y sin 2024 directamente, en el mismo
    informe, también. Se reproducen las secuencias sobre el mismo estado guardado, con y sin la variante de Desktop que
    reescribe el objeto en la fila a la que apunta el panel al mirarlo."""
    print("\nColor por serie: secuencias con el segmentador de Year (build .47)")
    full, s23, s24 = dv_regiones(), sin_anio(dv_regiones(), 2023), sin_anio(dv_regiones(), 2024)
    for mirar, sinobj in ((False, False), (True, False), (False, True), (True, True)):
        v = (" (Desktop reescribe al mirar)" if mirar else "") + (" (primer update sin objects)" if sinobj else "")
        pg = await page(b, full, vm=1)
        if sinobj:
            await pg.evaluate("() => { window.__sinObj = true; }")
        await pg.evaluate(PANE_SET, ["South", "fill", "#FF0000"])
        await pg.wait_for_timeout(150)
        await paso(pg, full, f"S1{v} · color fijo", "#FF0000", mirar)
        await paso(pg, s23, f"S1{v} · sin 2023", "#FF0000", mirar)
        await paso(pg, full, f"S1{v} · todo", "#FF0000", mirar)
        await paso(pg, s24, f"S1{v} · sin 2024", "#FF0000", mirar)
        await paso(pg, s23, f"S1{v} · sin 2023 otra vez", "#FF0000", mirar)
        await paso(pg, full, f"S1{v} · todo otra vez", "#FF0000", mirar)
        mp = await pg.evaluate(MAPA)
        check(f"S1{v}: el mapa guardado sigue #FF0000", mp and mp["South"].get("fill") == "#FF0000", str(mp))
        check(f"S1{v}: el visual solo guarda el mapa (nunca escribe en filas)", await pg.evaluate(SOLO_MAPA))
        np = await pg.evaluate(NPERSIST)
        check(f"S1{v}: persist solo por cambios reales ({np})", np <= (4 if mirar else 1), str(np))
        await sin_errores(pg, f"S1{v}")
        store = await pg.evaluate("() => JSON.parse(JSON.stringify(__store))")
        await pg.close()
        # S2: mismo informe guardado, sesión nueva, sin 2024 directamente
        pg = await page(b, s24, vm=1, store=store)
        if sinobj:
            await pg.evaluate("() => { window.__sinObj = true; }")
        await pg.wait_for_timeout(120)
        await paso(pg, s24, f"S2{v} · sesión nueva, sin 2024 directo", "#FF0000", mirar)
        await paso(pg, s23, f"S2{v} · después sin 2023", "#FF0000", mirar)
        await sin_errores(pg, f"S2{v}")
        await pg.close()
    # S3: informe recién creado con la 1.0.0 (sin mapa, color en Jan 2023): sin 2024 directo, editando y luego con mapa
    legacy = {"meta": {}, "rows": {"Year=2023|Month=Jan|Region=South": {"dataColors": {"fill": {"solid": {"color": "#FF8800"}}}}}}
    pg = await page(b, s24, vm=1, store=json.loads(json.dumps(legacy)))
    await pg.wait_for_timeout(150)
    await paso(pg, s24, "S3 · sin mapa, sin 2024 directo", "#FF8800")
    mp = await pg.evaluate(MAPA)
    check("S3: migrado al mapa (#FF8800)", mp and mp.get("South", {}).get("fill") == "#FF8800", str(mp))
    await paso(pg, s23, "S3 · con mapa, sin 2023", "#FF8800", True)
    store = await pg.evaluate("() => JSON.parse(JSON.stringify(__store))")
    await pg.close()
    pg = await page(b, s24, vm=0, store=store)
    await paso(pg, s24, "S3 · lectura con mapa, sin 2024", "#FF8800")
    check("S3 lectura: sin persist", await pg.evaluate(NPERSIST) == 0)
    await pg.close()
    # S4: objetos viejos de la .42 en otra fila (Jan 2024 verde) y mapa rojo: nunca se adoptan
    stale = {"meta": {"seriesStyles": {"map": json.dumps({"South": {"k": json.dumps([2023, "Jan", "South"]), "fill": "#FF0000"}})}},
             "rows": {"Year=2023|Month=Jan|Region=South": {"dataColors": {"fill": {"solid": {"color": "#FF0000"}}}},
                      "Year=2024|Month=Jan|Region=South": {"dataColors": {"fill": {"solid": {"color": "#00AA00"}}}}}}
    pg = await page(b, full, vm=1, store=stale)
    await paso(pg, s23, "S4 · objeto viejo verde en Jan 2024, sin 2023", "#FF0000")
    await paso(pg, s23, "S4 · y mirando el panel", "#FF0000", True)
    await paso(pg, full, "S4 · todo", "#FF0000")
    await paso(pg, s24, "S4 · sin 2024", "#FF0000", True)
    # Y un cambio real sigue funcionando en cualquier estado del filtro
    await upd(pg, s23)
    await pg.evaluate(PANE_SET, ["South", "fill", "#0000FF"])
    await pg.wait_for_timeout(150)
    await paso(pg, s23, "S4 · cambio real con el filtro: azul", "#0000FF")
    await paso(pg, s24, "S4 · azul también sin 2024", "#0000FF")
    await paso(pg, full, "S4 · azul con todo", "#0000FF")
    check("S4: el diagnóstico de prueba se ve (map South …)", "map South:" in await pg.evaluate("() => (document.querySelector('.lc-diag') || {}).textContent || ''"))
    await sin_errores(pg, "S4")
    await pg.close()


def comprobar_capabilities():
    print("\ncapabilities.json")
    c = json.load(io.open(os.path.join(ROOT, "capabilities.json"), encoding="utf-8"))
    g = c.get("objects", {}).get("general", {}).get("properties", {})
    check("general.filter NO declarado (rompe select())", "filter" not in g and "selfFilter" not in g, str(list(g)))


async def main():
    comprobar_capabilities()
    async with async_playwright() as p:
        b = await p.chromium.launch()
        await tanda_regiones(b)
        await tanda_eventos(b)
        await tanda_sm(b)
        await tanda_tope(b)
        await tanda_color(b)
        await tanda_color_secuencias(b)
        await b.close()
    print("\nCaso | ids enviadas | filas filtradas | suma filtrada | esperado")
    for t in TABLA:
        print(f"  {t[0]} | {t[1]} | {t[2]} | {fmt(t[3])} | {t[4] if isinstance(t[4], str) else fmt(t[4])}")
    print(f"\n{N_CHECKS[0]} comprobaciones")
    print("TODO OK" if not FALLOS else "FALLOS (%d):\n  - %s" % (len(FALLOS), "\n  - ".join(FALLOS)))
    sys.exit(1 if FALLOS else 0)


if __name__ == "__main__":
    asyncio.run(main())
