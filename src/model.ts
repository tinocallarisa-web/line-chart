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
    /** Cadencia propia (mediana de distancias entre sus puntos con valor), en unidades de pos. */
    cadence: number;
}

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
    /** Small multiples aún no se dibujan (bloque 2): se muestra el primer panel y se dice. */
    smPanels: number;
    smShown: string | null;
    hasHighlights: boolean;
    rowCount: number;
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

export function buildModel(dv: DataView, blankLabel: string): Model | null {
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

    // Small multiples (bloque 2): por ahora solo el primer panel, y se avisa.
    const smVals: string[] = [];
    if (smCol) for (let r = 0; r < N; r++) { const k = String(smCol.values[r] ?? ""); if (smVals.indexOf(k) < 0) smVals.push(k); }
    const smFirst = smVals.length ? smVals[0] : null;

    const keyIndex = new Map<string, number>();
    const keys: AxisKey[] = [];
    const legends: string[] = [];
    const legIndex = new Map<string, number>();
    const rowKey: number[] = new Array(N).fill(-1);
    const rowLeg: number[] = new Array(N).fill(-1);
    let missingAxis = 0;
    const anyValue = (r: number) => cols.some(c => !hasRole(c.source, "tooltips") && toNum(c.values[r]) !== null);

    for (let r = 0; r < N; r++) {
        if (smCol && String(smCol.values[r] ?? "") !== smFirst) continue;
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
        if (empty) { if (anyValue(r)) missingAxis++; continue; }
        let ki = keyIndex.get(key);
        if (ki === undefined) { ki = keys.length; keyIndex.set(key, ki); keys.push({ key, raw: raws, pos }); }
        rowKey[r] = ki;
        const lg = legendCol ? String(legendCol.values[r] ?? "\u0000") : "";
        let li = legIndex.get(lg);
        if (li === undefined) { li = legends.length; legIndex.set(lg, li); legends.push(lg); }
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
    for (const col of ordered) {
        const role = hasRole(col.source, "values") ? "values" : "secondaryValues";
        for (let li = 0; li < legends.length; li++) {
            const values: (number | null)[] = new Array(K).fill(null);
            const formats: (string | undefined)[] = new Array(K).fill(undefined);
            const rows: number[] = new Array(K).fill(-1);
            const hl: (number | null)[] | null = col.highlights ? new Array(K).fill(null) : null;
            let any = false;
            for (let r = 0; r < N; r++) {
                if (rowLeg[r] !== li || rowKey[r] < 0) continue;
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
                cadence: cadenceOf(own) || cadence,
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
                if (rowLeg[r] !== s.legendIndex || rowKey[r] < 0) continue;
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
        hasHighlights, rowCount: N,
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
