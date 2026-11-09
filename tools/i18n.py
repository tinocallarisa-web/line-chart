# -*- coding: utf-8 -*-
"""stringResources (12 idiomas), la lista de pbiviz.json y src/strings.ts para Line Chart by TCViz.

Patrón de Pareto 1.7: inglés = stringResources/en-US (claves de capabilities, que genera tools/formato.py) + los
this.t/tf("Clave", "inglés") de src/visual.ts. Traducciones en tools/i18n_line.py, por TEXTO inglés; la 10.ª columna
es el español. Power BI Desktop solo traduce con getDisplayName las claves declaradas en capabilities.json: los textos
propios del visual (avisos, asistente, landing, panel construido en código) viajan además en src/strings.ts, que t()
consulta primero.

Ejecutar desde la raíz:  python tools/i18n.py          (regenera todo)
                         python tools/i18n.py --faltan (solo lista lo que no tiene traducción)
"""
import io, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import formato  # noqa: E402

L = ["pt-BR", "fr-FR", "de-DE", "it-IT", "nl-NL", "pl-PL", "ja-JP", "zh-CN", "ko-KR"]   # orden de las columnas
TODOS = ["en-US", "es-ES"] + L[:1] + ["pt-PT"] + L[1:]
PATRON = r'this\.tf?\(\s*"([A-Za-z0-9_]+)"\s*,\s*"((?:[^"\\]|\\.)*)"'


def leer(lang):
    p = os.path.join(ROOT, "stringResources", lang, "resources.resjson")
    return json.load(io.open(p, encoding="utf-8")) if os.path.exists(p) else {}


def escribir(lang, d):
    p = os.path.join(ROOT, "stringResources", lang, "resources.resjson")
    os.makedirs(os.path.dirname(p), exist_ok=True)
    io.open(p, "w", encoding="utf-8", newline="\n").write(json.dumps(d, indent=2, ensure_ascii=False) + "\n")


def ingles():
    en = leer("en-US")
    src = io.open(os.path.join(ROOT, "src", "visual.ts"), encoding="utf-8").read()
    rt = dict(re.findall(PATRON, src))
    for k, v in rt.items():
        v = json.loads('"' + v + '"')
        if k in en and en[k] != v:
            print("AVISO: %s tiene dos textos: %r / %r" % (k, en[k], v))
        en.setdefault(k, v)
    return en, rt


def main():
    if "--faltan" in sys.argv:
        formato.generar()
        en, _ = ingles()
        try:
            from i18n_line import P
        except ImportError:
            P = {}
        for v in sorted({v for v in en.values() if v not in P}):
            print(json.dumps(v, ensure_ascii=False))
        return
    formato.generar()
    from i18n_line import P
    en, rt = ingles()
    caps = io.open(os.path.join(ROOT, "capabilities.json"), encoding="utf-8").read()
    faltan = sorted({v for v in en.values() if v not in P})
    if faltan:
        print("SIN TRADUCIR (quedan en inglés):", faltan)
    malas = [k for k, v in P.items() if len(v) != 10]
    if malas:
        raise SystemExit("Filas sin 10 columnas: %s" % malas)
    out = {"en-US": en}
    out["es-ES"] = {k: (P[v][9] if v in P else v) for k, v in en.items()}
    for i, lg in enumerate(L):
        out[lg] = {k: (P[v][i] if v in P else v) for k, v in en.items()}
    out["pt-PT"] = dict(out["pt-BR"])
    for lg, d in out.items():
        escribir(lg, d)
    pj = os.path.join(ROOT, "pbiviz.json")
    pb = json.load(io.open(pj, encoding="utf-8"))
    pb["stringResources"] = ["stringResources/%s/resources.resjson" % lg for lg in TODOS]
    io.open(pj, "w", encoding="utf-8", newline="\n").write(json.dumps(pb, indent=2, ensure_ascii=False) + "\n")
    # Al bundle: todo lo que no está declarado en capabilities.json (textos propios y etiquetas del panel en código).
    runtime = sorted(k for k in en if '"%s"' % k not in caps)
    tabla = {lg: {k: out[lg][k] for k in runtime if out[lg].get(k) and out[lg][k] != en[k]} for lg in TODOS if lg != "en-US"}
    ts = ["/**",
          " * Textos que escribe el propio visual, por idioma. Power BI Desktop solo traduce con getDisplayName las claves",
          " * declaradas en capabilities.json; estas viajan en el bundle. Generado por tools/i18n.py: no editar a mano.",
          " */",
          "export const STRINGS: Record<string, Record<string, string>> = " + json.dumps(tabla, ensure_ascii=False, indent=4) + ";", ""]
    io.open(os.path.join(ROOT, "src", "strings.ts"), "w", encoding="utf-8", newline="\n").write("\n".join(ts))
    print(len(en), "claves ·", len(TODOS), "idiomas ·", len(runtime), "en el bundle")


if __name__ == "__main__":
    main()
