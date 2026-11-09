/*
 * Line Chart by TCViz — del dataView al modelo que se dibuja. Sin DOM ni host: se puede probar aparte.
 *
 * Mapeo validado en Desktop (09-11-2026): categories select [axis, smallMultiple, legend] con window 30.000 y values
 * select [values, secondaryValues, plan, previousYear, forecast, tooltips] SIN group. Cada fila es una combinación
 * eje × panel × leyenda; la leyenda se separa aquí. Agrupar los values por leyenda paginaba a 500 filas.
 */
"use strict";

import powerbi from "powerbi-visuals-api";
import DataView = powerbi.DataView;
import DataViewCategoryColumn = powerbi.DataViewCategoryColumn;
import DataViewValueColumn = powerbi.DataViewValueColumn;
import DataViewMetadataColumn = powerbi.DataViewMetadataColumn;
import PrimitiveValue = powerbi.PrimitiveValue;

export type RefKind = "plan" | "previousYear" | "forecast";
export const REF_KINDS: RefKind[] = ["plan", "previousYear", "forecast"];

export interface AxisKey {
    /** Clave estable (ms de la fecha, o las etiquetas unidas). */
    key: string;
    /** Valores originales, uno por columna del eje (varias si se expande la jerarquía). */
    raw: PrimitiveValue[];
    /** Posición en X: milisegundos con eje de fecha continuo; índice con eje categórico. */
    pos: number;
}

export interface RefLine {
    kind: RefKind;
    name: string;
    format: string | undefined;
    values: (number | null)[];
    formats: (string | undefined)[];
}

export interface Series {
    id: string;
    name: string;
    measure: string;
    legend: string | null;
    /** Índice del valor de leyenda (orden de aparición), para el color y el teclado. */
    legendIndex: number;
    role: "values" | "secondaryValues";
    format: string | undefined;
    values: (number | null)[];
    /** Formato dinámico de la medida, punto a punto (general.formatString). */
    formats: (string | undefined)[];
    highlights: (number | null)[] | null;
    /** Fila del dataView de cada clave del eje (-1 si no hay). */
    rows: number[];
    refs: RefLine[];
    /** Último valor NO vacío. */
    lastIndex: number;
    color: string;
    /** Color elegido en el panel (dataColors): por valor de leyenda, o por medida sin leyenda. */
    customColor: string | null;
    /** Cadencia propia (mediana de distancias entre sus puntos con valor), en unidades de pos. */
    cadence: number;
    /** Trazo elegido en el panel (dataColors.lineStyle/lineWidth/markers), con el mismo selector que el color. */
    customStroke: SeriesStroke;
    /** Anotaciones (texto por clave del eje), solo en las series de la primera medida; null en las demás. */
    notes: (string | null)[] | null;
}

export interface SeriesStroke { style: string | null; width: number | null; markers: string | null; }

/** Línea de objetivo de un panel: un valor por clave del eje (deduplicado entre las marcas de la leyenda). */
export interface TargetLine {
    name: string;
    format: string | undefined;
    values: (number | null)[];
    formats: (string | undefined)[];
    /** Todos los valores no vacíos son iguales: línea horizontal en todo el ancho. */
    constant: boolean;
}

/** Un campo de texto (eventos o anotaciones): nombre y cuántos valores llegaron sin ser texto (Count, Sum...). */
export interface TextField { name: string; nonText: number; }

export interface TooltipColumn { name: string; format: string | undefined; values: PrimitiveValue[]; }

export interface Model {
    keys: AxisKey[];
    isTime: boolean;
    /** Cadencia del eje (mediana de las diferencias), en unidades de pos. */
    cadence: number;
    axisCols: DataViewCategoryColumn[];
    legendCol: DataViewCategoryColumn | null;
    smCol: DataViewCategoryColumn | null;
    axisName: string;
    axisFormat: string | undefined;
    legendName: string;
    series: Series[];
    refKinds: RefKind[];
    tooltipCols: TooltipColumn[];
    /** Filas con valor pero sin dato en el eje (año vacío, fecha nula): no se dibujan y se avisa. */
    missingAxis: number;
    /** Power BI recortó: llegaron menos filas de las que hay (más de 30.000 combinaciones). */
    segment: boolean;
    /** Small multiples: cuántos valores hay y cuál dibuja este modelo (null sin campo). */
    smPanels: number;
    smShown: string | null;
    /** Valores de leyenda (todos los paneles) con su primera fila: el selector de su color. */
    legendValues: { name: string; row: number }[];
    hasHighlights: boolean;
    rowCount: number;
    target: TargetLine | null;
    /** Texto del evento por clave del eje (deduplicado entre las marcas de la leyenda); null sin campo Events. */
    events: (string | null)[] | null;
    eventsField: TextField | null;
    notesField: TextField | null;
}

const hasRole = (s: DataViewMetadataColumn | undefined, r: string): boolean => !!(s && s.roles && s.roles[r]);

/** Nivel de una jerarquía de fechas (expr de nivel), validado en Desktop. */
export function isHierarchyLevel(s: DataViewMetadataColumn): boolean {
    const e = s.expr as unknown as Record<string, unknown> | undefined;
    return !!e && e.level !== undefined;
}

function toDate(v: PrimitiveValue): Date | null {
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) {
        const d = new Date(v);
        return isNaN(d.getTime()) ? null : d;
    }
    return null;
}

function toNum(v: PrimitiveValue): number | null {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    return isFinite(n) ? n : null;
}

export function median(a: number[]): number {
    if (!a.length) return 0;
    const s = a.slice().sort((x, y) => x - y);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Mediana de las distancias entre posiciones consecutivas con valor. */
export function cadenceOf(pos: number[]): number {
    const d: number[] = [];
    for (let i = 1; i < pos.length; i++) { const x = pos[i] - pos[i - 1]; if (x > 0) d.push(x); }
    return median(d);
}

/**
 * Texto de un evento o anotación: solo cadenas con algo más que espacios (null = sin evento). Un valor que no es texto
 * (el campo quedó en Count o Sum) devuelve undefined: no se pinta y se avisa al autor.
 */
export function textOf(v: PrimitiveValue): string | null | undefined {
    if (v === null || v === undefined) return null;
    if (typeof v !== "string") return undefined;
    const t = v.trim();
    return t ? t : null;
}

const strokeOf = (o: unknown): SeriesStroke => {
    const d = (o as any)?.dataColors;
    const st = d?.lineStyle, mk = d?.markers;
    const w = Number(d?.lineWidth);
    return {
        style: typeof st === "string" && st ? st : null,
        width: d?.lineWidth !== undefined && d?.lineWidth !== null && isFinite(w) ? Math.max(0.5, Math.min(8, w)) : null,
        markers: typeof mk === "string" && mk ? mk : null,
    };
};
const NO_STROKE: SeriesStroke = { style: null, width: null, markers: null };

const colorOf = (o: unknown): string | null => {
    const c = (o as any)?.dataColors?.fill?.solid?.color;
    return typeof c === "string" && c ? c : null;
};

/** Valores del campo Small multiples, en el orden en que llegan. Vacío si no hay campo. */
export function panelValues(dv: DataView): string[] {
    const cats = dv?.categorical?.categories ?? [];
    const smCol = cats.find(c => hasRole(c.source, "smallMultiple"));
    if (!smCol) return [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const v of smCol.values) { const k = String(v ?? ""); if (!seen.has(k)) { seen.add(k); out.push(k); } }
    return out;
}

/**
 * El modelo de UN panel. Las claves del eje y los valores de leyenda salen de TODAS las filas, para que los paneles
 * compartan el eje X y cada marca tenga el mismo color en todos; las series solo toman las filas de su panel.
 * panel = undefined: el primero (sin licencia, o con el campo pero sin paneles).
 */
export function buildModel(dv: DataView, blankLabel: string, panel?: string): Model | null {
    const cat = dv && dv.categorical;
    if (!cat || !cat.categories || !cat.categories.length) return null;
    const cats = cat.categories;
    const axisCols = cats.filter(c => hasRole(c.source, "axis"));
    if (!axisCols.length) return null;
    const smCol = cats.find(c => hasRole(c.source, "smallMultiple")) || null;
    const legendCol = cats.find(c => hasRole(c.source, "legend")) || null;
    const cols: DataViewValueColumn[] = (cat.values || []) as unknown as DataViewValueColumn[];
    const measureCols = cols.filter(c => hasRole(c.source, "values") || hasRole(c.source, "secondaryValues"));
    if (!measureCols.length) return null;
    const N = axisCols[0].values ? axisCols[0].values.length : 0;

    const a0 = axisCols[0];
    const isTime = axisCols.length === 1 && !!(a0.source.type && a0.source.type.dateTime) &&
        a0.values.some(v => toDate(v) !== null);
    const levelCols = axisCols.map(c => isHierarchyLevel(c.source));

    const smVals = panelValues(dv);
    const smFirst = smVals.length ? (panel !== undefined && smVals.indexOf(panel) >= 0 ? panel : smVals[0]) : null;
    const inPanel = (r: number) => !smCol || String(smCol.values[r] ?? "") === smFirst;

    const keyIndex = new Map<string, number>();
    const keys: AxisKey[] = [];
    const legends: string[] = [];
    const legIndex = new Map<string, number>();
    const rowKey: number[] = new Array(N).fill(-1);
    const rowLeg: number[] = new Array(N).fill(-1);
    let missingAxis = 0;
    const anyValue = (r: number) => cols.some(c => !hasRole(c.source, "tooltips") && !hasRole(c.source, "events") &&
        !hasRole(c.source, "annotations") && toNum(c.values[r]) !== null);

    const legendFirstRow: number[] = [];
    for (let r = 0; r < N; r++) {
        const raws = axisCols.map(c => c.values[r]);
        let empty = false;
        let key: string;
        let pos = 0;
        if (isTime) {
            const d = toDate(raws[0]);
            if (!d) empty = true; else { pos = d.getTime(); key = String(pos); }
        } else {
            // Vacío: nulo o texto vacío; en un nivel de jerarquía numérico, también 0 (año de una fecha vacía).
            empty = raws.some((v, i) => v === null || v === undefined || v === "" || (levelCols[i] && v === 0));
            if (!empty) key = raws.map(v => (v instanceof Date ? String(v.getTime()) : String(v))).join("␟");
        }
        if (empty) { if (anyValue(r) && inPanel(r)) missingAxis++; continue; }
        let ki = keyIndex.get(key);
        if (ki === undefined) { ki = keys.length; keyIndex.set(key, ki); keys.push({ key, raw: raws, pos }); }
        rowKey[r] = ki;
        const lg = legendCol ? String(legendCol.values[r] ?? "\u0000") : "";
        let li = legIndex.get(lg);
        if (li === undefined) { li = legends.length; legIndex.set(lg, li); legends.push(lg); legendFirstRow.push(r); }
        rowLeg[r] = li;
    }

    // Orden del eje: por fecha; numérico si todo el eje es un único número (no jerarquía); si no, el de Power BI.
    let order = keys.map((_k, i) => i);
    if (isTime) order.sort((x, y) => keys[x].pos - keys[y].pos);
    else if (axisCols.length === 1 && !levelCols[0] && keys.every(k => typeof k.raw[0] === "number")) {
        order.sort((x, y) => (keys[x].raw[0] as number) - (keys[y].raw[0] as number));
    }
    const remap = new Array(keys.length);
    order.forEach((old, i) => { remap[old] = i; });
    const sorted = order.map(i => keys[i]);
    if (!isTime) sorted.forEach((k, i) => { k.pos = i; });
    for (let r = 0; r < N; r++) if (rowKey[r] >= 0) rowKey[r] = remap[rowKey[r]];
    const K = sorted.length;
    const cadence = isTime ? cadenceOf(sorted.map(k => k.pos)) || 86400000 : 1;

    const legendName = (i: number): string | null => {
        if (!legendCol) return null;
        const v = legends[i];
        return v === "\u0000" ? blankLabel : v;
    };
    const fmtOfPoint = (c: DataViewValueColumn, r: number): string | undefined => {
        const o = c.objects && c.objects[r];
        const f = o && o.general && (o.general as Record<string, unknown>).formatString;
        return typeof f === "string" && f ? f : undefined;
    };

    const series: Series[] = [];
    const roleCols = (role: string) => measureCols.filter(c => hasRole(c.source, role));
    const ordered = roleCols("values").concat(roleCols("secondaryValues"));
    let hasHighlights = false;
    const metaCols = dv.metadata?.columns ?? [];
    const legendColor = (li: number): string | null => {
        if (!legendCol || !legendCol.objects) return null;
        for (let r = 0; r < N; r++) if (rowLeg[r] === li) { const c = colorOf(legendCol.objects[r]); if (c) return c; }
        return null;
    };
    const legendStroke = (li: number): SeriesStroke => {
        if (!legendCol || !legendCol.objects) return NO_STROKE;
        for (let r = 0; r < N; r++) if (rowLeg[r] === li && legendCol.objects[r]) {
            const st = strokeOf(legendCol.objects[r]);
            if (st.style || st.width !== null || st.markers) return st;
        }
        return NO_STROKE;
    };
    for (const col of ordered) {
        const role = hasRole(col.source, "values") ? "values" : "secondaryValues";
        // Sin leyenda, el color se guarda por medida (selector metadata); con leyenda, por valor de leyenda y solo para
        // la primera medida (las demás siguen el automático: dos medidas de la misma marca no deben confundirse).
        const meta = metaCols.find(c => c.queryName === col.source.queryName) ?? col.source;
        const measureColor = legendCol ? null : (colorOf(col.source.objects) ?? colorOf(meta.objects));
        const sa = strokeOf(col.source.objects), sb = strokeOf(meta.objects);
        const measureStroke: SeriesStroke = legendCol ? NO_STROKE
            : { style: sa.style ?? sb.style, width: sa.width ?? sb.width, markers: sa.markers ?? sb.markers };
        for (let li = 0; li < legends.length; li++) {
            const values: (number | null)[] = new Array(K).fill(null);
            const formats: (string | undefined)[] = new Array(K).fill(undefined);
            const rows: number[] = new Array(K).fill(-1);
            const hl: (number | null)[] | null = col.highlights ? new Array(K).fill(null) : null;
            let any = false;
            for (let r = 0; r < N; r++) {
                if (rowLeg[r] !== li || rowKey[r] < 0 || !inPanel(r)) continue;
                const k = rowKey[r];
                rows[k] = r;
                const v = toNum(col.values[r]);
                values[k] = v;
                if (v !== null) any = true;
                formats[k] = fmtOfPoint(col, r);
                if (hl) { const h = toNum(col.highlights[r]); hl[k] = h; if (h !== null) hasHighlights = true; }
            }
            if (!any) continue;
            const lg = legendName(li);
            const measure = col.source.displayName;
            const name = lg === null ? measure : (ordered.length > 1 ? lg + " · " + measure : lg);
            let last = -1;
            for (let k = K - 1; k >= 0; k--) if (values[k] !== null) { last = k; break; }
            const own: number[] = [];
            values.forEach((v, k) => { if (v !== null) own.push(sorted[k].pos); });
            series.push({
                id: (col.source.queryName || measure) + "␟" + (lg ?? ""), name, measure, legend: lg, legendIndex: li, role,
                format: col.source.format, values, formats, highlights: hl, rows, refs: [], lastIndex: last, color: "",
                customColor: legendCol ? (col === ordered[0] ? legendColor(li) : null) : measureColor,
                cadence: cadenceOf(own) || cadence,
                customStroke: legendCol ? (col === ordered[0] ? legendStroke(li) : NO_STROKE) : measureStroke,
                notes: null,
            });
        }
    }

    // Referencias: emparejadas con la serie de la PRIMERA medida (Values, o Secondary si no hay), una por leyenda.
    const refKinds: RefKind[] = [];
    const firstMeasure = ordered[0];
    for (const kind of REF_KINDS) {
        const col = cols.find(c => hasRole(c.source, kind));
        if (!col) continue;
        let used = false;
        for (const s of series) {
            if (s.id.split("␟")[0] !== (firstMeasure.source.queryName || firstMeasure.source.displayName)) continue;
            const values: (number | null)[] = new Array(K).fill(null);
            const formats: (string | undefined)[] = new Array(K).fill(undefined);
            let any = false;
            for (let r = 0; r < N; r++) {
                if (rowLeg[r] !== s.legendIndex || rowKey[r] < 0 || !inPanel(r)) continue;
                const v = toNum(col.values[r]);
                values[rowKey[r]] = v;
                formats[rowKey[r]] = fmtOfPoint(col, r);
                if (v !== null) any = true;
            }
            if (!any) continue;
            used = true;
            s.refs.push({ kind, name: col.source.displayName, format: col.source.format, values, formats });
        }
        if (used) refKinds.push(kind);
    }

    // Línea de objetivo: un valor por clave del eje en este panel; con leyenda la medida se repite por marca, así que
    // vale el primer valor no vacío de cada clave.
    let target: TargetLine | null = null;
    const tcol = cols.find(c => hasRole(c.source, "targetLine"));
    if (tcol) {
        const values: (number | null)[] = new Array(K).fill(null);
        const formats: (string | undefined)[] = new Array(K).fill(undefined);
        for (let r = 0; r < N; r++) {
            const k = rowKey[r];
            if (k < 0 || !inPanel(r) || values[k] !== null) continue;
            const v = toNum(tcol.values[r]);
            if (v === null) continue;
            values[k] = v; formats[k] = fmtOfPoint(tcol, r);
        }
        const nn = values.filter((v): v is number => v !== null);
        if (nn.length) target = { name: tcol.source.displayName, format: tcol.source.format, values, formats, constant: nn.every(v => v === nn[0]) };
    }

    // Eventos: texto por clave del eje (el primero no vacío de la clave en este panel).
    let events: (string | null)[] | null = null;
    let eventsField: TextField | null = null;
    const ecol = cols.find(c => hasRole(c.source, "events"));
    if (ecol) {
        const ev: (string | null)[] = new Array(K).fill(null);
        const fld: TextField = { name: ecol.source.displayName, nonText: 0 };
        for (let r = 0; r < N; r++) {
            const k = rowKey[r];
            if (k < 0 || !inPanel(r)) continue;
            const t = textOf(ecol.values[r]);
            if (t === undefined) { fld.nonText++; continue; }
            if (t !== null && ev[k] === null) ev[k] = t;
        }
        events = ev; eventsField = fld;
    }

    // Anotaciones: por marca de leyenda (la medida se evalúa por marca), en las series de la primera medida.
    let notesField: TextField | null = null;
    const acol = cols.find(c => hasRole(c.source, "annotations"));
    if (acol) {
        const fld: TextField = { name: acol.source.displayName, nonText: 0 };
        const fq = firstMeasure.source.queryName || firstMeasure.source.displayName;
        for (const s of series) {
            if (s.id.split("␟")[0] !== fq) continue;
            const notes: (string | null)[] = new Array(K).fill(null);
            for (let r = 0; r < N; r++) {
                if (rowLeg[r] !== s.legendIndex || rowKey[r] < 0 || !inPanel(r)) continue;
                const t = textOf(acol.values[r]);
                if (t === undefined) { fld.nonText++; continue; }
                if (t !== null && notes[rowKey[r]] === null) notes[rowKey[r]] = t;
            }
            s.notes = notes;
        }
        notesField = fld;
    }

    const tooltipCols: TooltipColumn[] = cols.filter(c => hasRole(c.source, "tooltips"))
        .map(c => ({ name: c.source.displayName, format: c.source.format, values: c.values }));

    const md = dv.metadata as unknown as Record<string, unknown>;
    return {
        keys: sorted, isTime, cadence, axisCols, legendCol, smCol,
        axisName: axisCols.map(c => c.source.displayName).join(" · "),
        axisFormat: a0.source.format,
        legendName: legendCol ? legendCol.source.displayName : "",
        series, refKinds, tooltipCols, missingAxis,
        segment: !!(md && md.segment),
        smPanels: smVals.length, smShown: smFirst,
        legendValues: legendCol ? legends.map((l, i) => ({ name: legendName(i) ?? l, row: legendFirstRow[i] })) : [],
        hasHighlights, rowCount: N,
        target, events, eventsField, notesField,
    };
}

/** Un punto que se dibuja: posición en X y valor. */
export interface Pt { pos: number; v: number; k: number; }

/**
 * Tramos de una línea según la regla de huecos. Vacío ≠ cero:
 *  - break: se corta donde falta un periodo (distancia > 1,5 × la cadencia PROPIA de la serie: un plan mensual sobre
 *    eje diario sigue unido, un día sin venta en una serie diaria corta);
 *  - connect: se unen los puntos con valor;
 *  - zero: los vacíos de la serie valen 0 y, con eje de fecha, un periodo sin fila baja a 0. Una serie más gruesa que
 *    el eje (plan mensual en eje diario) no se rellena: se trata como break con su cadencia.
 */
export function segmentsOf(values: (number | null)[], keys: AxisKey[], mode: string, ownCadence: number,
    axisCadence: number, isTime: boolean, from = 0): Pt[][] {
    const pts: Pt[] = [];
    const coarse = ownCadence > axisCadence * 1.5;
    const zero = mode === "zero" && !coarse;
    for (let k = from; k < values.length; k++) {
        const v = values[k];
        if (v !== null) pts.push({ pos: keys[k].pos, v, k });
        else if (zero) pts.push({ pos: keys[k].pos, v: 0, k });
    }
    if (!pts.length) return [];
    if (mode === "connect") return [pts];
    const gap = (zero ? axisCadence : ownCadence) * 1.5;
    const out: Pt[][] = [];
    let cur: Pt[] = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        if (b.pos - a.pos > gap + 1e-9) {
            if (zero && isTime) {
                // Periodos sin fila: la línea baja a cero y sigue.
                cur.push({ pos: a.pos + axisCadence, v: 0, k: -1 });
                cur.push({ pos: b.pos - axisCadence, v: 0, k: -1 });
                cur.push(b);
                continue;
            }
            out.push(cur);
            cur = [b];
        } else cur.push(b);
    }
    out.push(cur);
    return out;
}

/** Valor de una línea dibujada en una posición: interpolado dentro de su tramo; null fuera de todo tramo (hueco). */
export function valueAt(segs: Pt[][], pos: number): number | null {
    const i = segIndex(segs, pos);
    if (i < 0) return null;
    const s = segs[i];
    if (s.length === 1) return s[0].v;
    let lo = 0, hi = s.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (s[mid].pos <= pos) lo = mid; else hi = mid; }
    const p = s[lo], q = s[hi];
    if (q.pos === p.pos) return q.v;
    const t = Math.max(0, Math.min(1, (pos - p.pos) / (q.pos - p.pos)));
    return p.v + (q.v - p.v) * t;
}

/** Índice del tramo que contiene la posición, o -1. */
export function segIndex(segs: Pt[][], pos: number): number {
    for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        if (!s.length) continue;
        if (pos >= s[0].pos - 1e-6 && pos <= s[s.length - 1].pos + 1e-6) return i;
    }
    return -1;
}

export interface BandPt { pos: number; a: number; b: number; }
/** Un tramo de banda: sign 1 = la serie real por encima de su referencia, -1 = por debajo. */
export interface Band { sign: 1 | -1; pts: BandPt[]; }

/**
 * Banda real-vs-referencia, partida EXACTAMENTE en el cruce. Las dos líneas son rectas entre sus puntos, así que entre
 * dos posiciones consecutivas de la unión de sus puntos las dos son lineales: el cruce es la intersección de dos
 * rectas (interpolación lineal de la diferencia). Sin banda donde falta una de las dos (respeta los huecos de cada
 * línea tal como se dibujan, con su regla de huecos).
 */
export function gapBands(real: Pt[][], ref: Pt[][]): Band[] {
    const out: Band[] = [];
    for (const seg of real) {
        if (seg.length < 2) continue;
        const lo = seg[0].pos, hi = seg[seg.length - 1].pos;
        const set = new Set<number>();
        seg.forEach(p => set.add(p.pos));
        for (const rs of ref) for (const p of rs) if (p.pos > lo && p.pos < hi) set.add(p.pos);
        const pos = Array.from(set).sort((x, y) => x - y);
        let cur: BandPt[] = [];
        let sign = 0;
        let prev: BandPt | null = null;
        let prevSeg = -1;
        const flush = () => { if (cur.length >= 2 && sign !== 0) out.push({ sign: sign as 1 | -1, pts: cur }); cur = []; sign = 0; };
        for (const x of pos) {
            const a = valueAt([seg], x);
            const ri = segIndex(ref, x);
            const b = ri >= 0 ? valueAt([ref[ri]], x) : null;
            if (a === null || b === null) { flush(); prev = null; prevSeg = -1; continue; }
            // La referencia se corta entre el punto anterior y este: la banda también.
            if (prev && ri !== prevSeg) { flush(); prev = null; }
            const pt: BandPt = { pos: x, a, b };
            const d = a - b;
            const sg = d > 0 ? 1 : d < 0 ? -1 : 0;
            if (prev) {
                const dp = prev.a - prev.b;
                if ((dp > 0 && d < 0) || (dp < 0 && d > 0)) {
                    const t = dp / (dp - d);
                    const ca = prev.a + (a - prev.a) * t;
                    const c: BandPt = { pos: prev.pos + (x - prev.pos) * t, a: ca, b: ca };
                    cur.push(c);
                    flush();
                    cur = [c, pt];
                    sign = sg;
                    prev = pt; prevSeg = ri;
                    continue;
                }
                // Tras un punto exactamente igual a la referencia, el signo puede cambiar sin cruce interpolado.
                if (sg !== 0 && sign !== 0 && sg !== sign) { const z = cur[cur.length - 1]; flush(); cur = [z]; }
            }
            if (sign === 0 && sg !== 0) sign = sg;
            cur.push(pt);
            prev = pt; prevSeg = ri;
        }
        flush();
    }
    return out;
}
