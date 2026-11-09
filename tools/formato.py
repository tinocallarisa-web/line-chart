# -*- coding: utf-8 -*-
"""Tabla ÚNICA del panel de formato de Line Chart by TCViz.

De aquí salen, sin copiar a mano:
  - capabilities.json → "objects" (los dataRoles y el mapeo NO se tocan: están validados en Desktop),
  - src/formatSpec.ts → la tabla que lee el visual (valores por defecto, panel y on-object),
  - stringResources/en-US → las claves Obj_/Prop_/Enum_ en inglés.
Ejecutar desde la raíz:  python tools/formato.py   (tools/i18n.py lo llama antes de traducir)

Regla de la cartera: los nombres internos (objeto y propiedad) no se renombran nunca una vez publicados.
"""
import io, json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

TEMPLATES = [("report", "Report theme"), ("classic", "Classic"),
             ("boardroom", "Boardroom (Pro)"), ("ledger", "Ledger (Pro)"), ("editorial", "Editorial (Pro)"),
             ("signal", "Signal (Pro)"), ("aurora", "Aurora (Pro)"), ("terrace", "Terrace (Pro)")]

# (propiedad, etiqueta, tipo, por defecto, extra)   tipo: bool | num | fill | enum | text
OBJECTS = [
    ("style", "Style template", [
        ("template", "Template", "enum", "report", {"items": TEMPLATES}),
        ("guide", "Setup guide", "bool", True, {}),
    ]),
    ("lines", "Lines", [
        ("width", "Line width", "num", 2, {"min": 0.5, "max": 8}),
        ("markers", "Markers", "enum", "auto", {"items": [("auto", "Automatic"), ("on", "On"), ("off", "Off")]}),
        ("markerSize", "Marker size", "num", 3, {"min": 1, "max": 10}),
        ("missing", "Missing values", "enum", "break",
         {"items": [("break", "Break the line"), ("connect", "Connect the points"), ("zero", "Treat as zero")]}),
    ]),
    ("endLabels", "End labels", [
        ("show", "Show end labels", "bool", True, {}),
        ("content", "Content", "enum", "nameValue",
         {"items": [("nameValue", "Name and value"), ("value", "Value"), ("name", "Name")]}),
        ("maxLabels", "Maximum labels", "num", 8, {"min": 1, "max": 50}),
        ("fontSize", "Text size", "num", 10, {"min": 7, "max": 24}),
        ("seriesColor", "Use the series color", "bool", True, {}),
        ("color", "Text color", "fill", "#252423", {}),
        # Bloque 2 (Pro): desvío contra el plan, o contra el año anterior si no hay plan.
        ("variance", "Variance vs plan or PY (Pro)", "enum", "off",
         {"items": [("off", "Off"), ("pct", "Percentage"), ("abs", "Absolute")]}),
    ]),
    ("references", "Plan, prior year and forecast", [
        ("show", "Show reference lines", "bool", True, {}),
        ("colorMode", "Line color", "enum", "gray", {"items": [("gray", "Gray"), ("series", "Color of its series")]}),
        ("color", "Gray", "fill", "#8A8886", {}),
        ("width", "Line width", "num", 1.5, {"min": 0.5, "max": 6}),
        ("legend", "Show in legend", "bool", True, {}),
        # Bloque 2 (Pro): banda entre la serie real y su referencia (plan, o año anterior), partida en el cruce.
        ("gapShading", "Gap shading (Pro)", "bool", False, {}),
        ("aboveColor", "Above the reference", "fill", "#2E7D32", {}),
        ("belowColor", "Below the reference", "fill", "#C62828", {}),
        ("gapOpacity", "Shading opacity (%)", "num", 18, {"min": 5, "max": 30}),
    ]),
    ("xAxis", "X axis", [
        ("show", "Show X axis", "bool", True, {}),
        ("fontSize", "Text size", "num", 10, {"min": 7, "max": 24}),
        ("color", "Text color", "fill", "#605E5C", {}),
        ("title", "Title", "bool", False, {}),
    ]),
    ("yAxis", "Y axis", [
        ("show", "Show Y axis", "bool", True, {}),
        ("fontSize", "Text size", "num", 10, {"min": 7, "max": 24}),
        ("color", "Text color", "fill", "#605E5C", {}),
        ("title", "Title", "bool", True, {}),
        ("zero", "Start at zero", "bool", False, {}),
        ("grid", "Gridlines", "bool", True, {}),
        ("gridColor", "Gridline color", "fill", "#E1DFDD", {}),
    ]),
    ("y2Axis", "Secondary Y axis", [
        ("show", "Show secondary Y axis", "bool", True, {}),
        ("fontSize", "Text size", "num", 10, {"min": 7, "max": 24}),
        ("title", "Title", "bool", True, {}),
        ("zero", "Start at zero", "bool", False, {}),
    ]),
    ("legend", "Legend", [
        ("show", "Show legend", "bool", True, {}),
        ("position", "Position", "enum", "top", {"items": [("top", "Top"), ("bottom", "Bottom")]}),
        ("fontSize", "Text size", "num", 10, {"min": 7, "max": 24}),
        ("color", "Text color", "fill", "#605E5C", {}),
    ]),
    # Las 9 opciones comunes (nombres internos de Histogram/Pareto) y el eje Y compartido.
    ("smallMultiples", "Small multiples (Pro)", [
        ("columns", "Columns (0 = automatic)", "num", 0, {"min": 0, "max": 12}),
        ("gap", "Space between panels", "num", 8, {"min": 0, "max": 40}),
        ("titleFontSize", "Title size", "num", 12, {"min": 7, "max": 24}),
        ("titleColor", "Title color", "fill", "#252423", {}),
        ("titleBold", "Bold title", "bool", True, {}),
        ("titleAlign", "Title alignment", "enum", "left", {"items": [("left", "Left"), ("center", "Center")]}),
        ("background", "Panel background", "fill", "", {}),
        ("border", "Panel border", "bool", False, {}),
        ("borderColor", "Panel border color", "fill", "#E1DFDD", {}),
        ("sharedY", "Shared Y axis", "bool", True, {}),
    ]),
    # Color por serie (gratis, como el nativo): se guarda con selector (medida o valor de leyenda); el panel lo construye
    # el visual en la tarjeta Lines. Sin tarjeta propia en PANE.
    ("dataColors", "Series colors", [
        ("fill", "Color", "fill", "", {}),
    ]),
]

# Orden común de la colección: Style template, tarjetas propias, ejes, leyenda, small multiples.
PANE = [
    ("style", "Style template", [("style", None, None)]),
    ("lines", "Lines", [("lines", None, None)]),
    ("endLabels", "End labels", [("endLabels", None, "show")]),
    ("references", "Plan, prior year and forecast", [("references", None, "show")]),
    ("axes", "Axes", [("xAxis", "X axis", "show"), ("yAxis", "Y axis", "show"), ("y2Axis", "Secondary Y axis", "show")]),
    ("legend", "Legend", [("legend", None, "show")]),
    ("smallMultiples", "Small multiples (Pro)", [("smallMultiples", None, None)]),
]


def cap_type(t):
    return {"bool": {"bool": True}, "num": {"numeric": True}, "fill": {"fill": {"solid": {"color": True}}},
            "text": {"text": True}}.get(t)


def generar():
    caps_p = os.path.join(ROOT, "capabilities.json")
    caps = json.load(io.open(caps_p, encoding="utf-8"))
    objs = {"general": {"properties": {"formatString": {"type": {"formatting": {"formatString": True}}}}}}
    en = {}
    ts_objs = {}
    for name, label, props in OBJECTS:
        okey = "Obj_" + name
        en[okey] = label
        cp = {}
        tp = []
        for p, plabel, t, d, extra in props:
            pkey = "Prop_%s_%s" % (name, p)
            en[pkey] = plabel
            if t == "enum":
                items = []
                for v, vl in extra["items"]:
                    ekey = "Enum_%s_%s" % (p, v)
                    en[ekey] = vl
                    items.append({"value": v, "displayName": vl, "displayNameKey": ekey})
                cp[p] = {"displayName": plabel, "displayNameKey": pkey, "type": {"enumeration": items}}
            else:
                cp[p] = {"displayName": plabel, "displayNameKey": pkey, "type": cap_type(t)}
            spec = {"name": p, "type": t, "def": d, "key": pkey, "label": plabel}
            if t == "enum":
                spec["items"] = [[v, "Enum_%s_%s" % (p, v), vl] for v, vl in extra["items"]]
            for k in ("min", "max"):
                if k in extra:
                    spec[k] = extra[k]
            tp.append(spec)
        objs[name] = {"displayName": label, "displayNameKey": okey, "properties": cp}
        ts_objs[name] = {"name": name, "key": okey, "label": label, "props": tp}
    caps["objects"] = objs
    caps["supportsOnObjectFormatting"] = True
    caps["enablePointerEventsFormatMode"] = True
    io.open(caps_p, "w", encoding="utf-8", newline="\n").write(json.dumps(caps, indent=2, ensure_ascii=False) + "\n")

    pane = []
    for uid, label, groups in PANE:
        ckey = "Obj_" + uid
        en.setdefault(ckey, label)
        gs = []
        for obj, glabel, toggle in groups:
            g = {"obj": obj, "toggle": toggle}
            if glabel:
                g["key"] = "Grp_" + obj
                g["label"] = glabel
                en[g["key"]] = glabel
            gs.append(g)
        pane.append({"uid": uid, "key": ckey, "label": label, "groups": gs})

    ts = ["/**",
          " * Tabla del panel de formato. Generado por tools/formato.py: no editar a mano.",
          " * Los nombres internos (objeto.propiedad) no se renombran nunca: los informes guardados dejarían de leerlos.",
          " */",
          "export type PropType = \"bool\" | \"num\" | \"fill\" | \"enum\" | \"text\";",
          "export interface PropSpec { name: string; type: PropType; def: string | number | boolean; key: string; label: string;",
          "    items?: [string, string, string][]; min?: number; max?: number; }",
          "export interface ObjSpec { name: string; key: string; label: string; props: PropSpec[]; }",
          "export interface GroupSpec { obj: string; toggle: string | null; key?: string; label?: string; }",
          "export interface CardSpec { uid: string; key: string; label: string; groups: GroupSpec[]; }",
          "export const OBJECTS: Record<string, ObjSpec> = " + json.dumps(ts_objs, ensure_ascii=False, indent=4) + ";",
          "export const PANE: CardSpec[] = " + json.dumps(pane, ensure_ascii=False, indent=4) + ";", ""]
    io.open(os.path.join(ROOT, "src", "formatSpec.ts"), "w", encoding="utf-8", newline="\n").write("\n".join(ts))

    enp = os.path.join(ROOT, "stringResources", "en-US", "resources.resjson")
    base = json.load(io.open(enp, encoding="utf-8"))
    roles = {k: v for k, v in base.items() if k.startswith("Role_")}
    out = dict(roles)
    out.update(en)
    io.open(enp, "w", encoding="utf-8", newline="\n").write(json.dumps(out, indent=2, ensure_ascii=False) + "\n")
    print("formato:", len(objs), "objetos ·", len(out), "claves en-US (sin las de tiempo de ejecución)")


if __name__ == "__main__":
    generar()
