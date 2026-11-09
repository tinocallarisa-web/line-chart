/*
 * Line Chart by TCViz — ESQUELETO DE DIAGNÓSTICO DEL MAPEO DE DATOS (no es el visual real).
 *
 * En cada update pinta en el propio visual (y en console.log) lo que Power BI entrega en el
 * dataView categorical: categorías y roles, tipo de la columna del eje, niveles de jerarquía,
 * grupos de la leyenda (values.grouped()), medidas por grupo con su rol y formato, highlights,
 * metadata.segment (recorte / paginación), operationKind y las cinco primeras filas.
 *
 * Sin licencia todavía. Cuando llegue el visual real:
 *   // const PLAN_IDS: string[] = [];   // Service ID(s) de Partner Center (ver LECCIONES-2026-09-14.md)
 */
"use strict";

import powerbi from "powerbi-visuals-api";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import IVisualEventService = powerbi.extensibility.IVisualEventService;
import DataView = powerbi.DataView;
import DataViewCategoryColumn = powerbi.DataViewCategoryColumn;
import DataViewValueColumn = powerbi.DataViewValueColumn;
import DataViewMetadataColumn = powerbi.DataViewMetadataColumn;
import PrimitiveValue = powerbi.PrimitiveValue;

// build-test.js la rellena con "test AAAA-MM-DD HH:MM"; en producción va vacía y no se pinta.
const TEST_STAMP = ""; // TEST_STAMP_MARKER
const MAX_ROWS = 5;
const MAX_GROUPS_PER_ROW = 4;

export class Visual implements IVisual {
    private host: IVisualHost;
    private events: IVisualEventService;
    private root: HTMLElement;
    private updateCount = 0;

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.events = options.host.eventService;
        this.root = document.createElement("div");
        this.root.className = "line-chart-tcviz-diag";
        this.root.style.cssText = "position:absolute;inset:0;overflow:auto;padding:6px 8px;box-sizing:border-box;" +
            "font-size:11px;line-height:1.35;color:#252423;background:#fff;white-space:pre-wrap;" +
            "font-family:Consolas,'Courier New',monospace;";
        this.root.tabIndex = 0;
        options.element.appendChild(this.root);
    }

    public update(options: VisualUpdateOptions): void {
        this.events.renderingStarted(options);
        try {
            this.updateCount++;
            const lines = this.diagnose(options);
            this.paint(lines);
            console.log("[LineChart DIAG]\n" + lines.join("\n"));
            this.events.renderingFinished(options);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.log("[LineChart DIAG] error: " + msg);
            this.events.renderingFailed(options, msg);
        }
    }

    // ---------------------------------------------------------------- diagnóstico

    private diagnose(options: VisualUpdateOptions): string[] {
        const L: string[] = [];
        const o = options as unknown as Record<string, unknown>;
        L.push("LINE CHART by TCViz — diagnóstico de mapeo · update #" + this.updateCount + (TEST_STAMP ? "  [" + TEST_STAMP + "]" : ""));
        L.push("type=" + options.type + "  operationKind=" + this.opKind(o.operationKind) +
            "  viewport=" + Math.round(options.viewport.width) + "x" + Math.round(options.viewport.height) +
            "  isLandingPage=" + String(o.isLandingPage));

        const dv: DataView | undefined = options.dataViews && options.dataViews[0];
        if (!dv) {
            L.push("", "Sin dataView: añade un campo a Axis y una medida a Values.");
            return L;
        }
        const md = dv.metadata || ({} as powerbi.DataViewMetadata);
        const seg = (md as unknown as Record<string, unknown>).segment;
        L.push("metadata.segment=" + (seg === undefined ? "(no llega: datos completos)" : "LLEGA → hay más filas " + this.json(seg)) +
            "  metadata.columns=" + (md.columns ? md.columns.length : 0));
        const extraMd = Object.keys(md).filter(k => k !== "columns" && k !== "objects" && k !== "segment");
        if (extraMd.length) L.push("otras claves de metadata: " + extraMd.join(", "));

        const cat = dv.categorical;
        if (!cat) {
            L.push("", "No llega dataView.categorical.");
            return L;
        }

        // Categorías
        const cats: DataViewCategoryColumn[] = cat.categories || [];
        L.push("", "CATEGORÍAS: " + cats.length);
        cats.forEach((c, i) => {
            const s = c.source;
            L.push("  [" + i + "] \"" + s.displayName + "\" roles=" + this.roles(s) + " filas=" + (c.values ? c.values.length : 0) +
                " tipo=" + this.typeOf(s));
            L.push("      queryName=" + (s.queryName || "-") + "  jerarquía=" + this.hierarchyInfo(s));
            if (c.values && c.values.length) {
                L.push("      primero=" + this.fmt(c.values[0]) + "  último=" + this.fmt(c.values[c.values.length - 1]) +
                    "  distintos=" + new Set(c.values.map(v => this.key(v))).size);
                const fechas = c.values.filter(v => v instanceof Date) as Date[];
                if (fechas.length) {
                    const t = fechas.map(d => d.getTime());
                    L.push("      mín=" + this.fmt(new Date(Math.min(...t))) + "  máx=" + this.fmt(new Date(Math.max(...t))));
                }
            }
        });
        const axisCat = cats.find(c => this.hasRole(c.source, "axis"));
        const smCat = cats.find(c => this.hasRole(c.source, "smallMultiple"));
        if (!axisCat) L.push("  (no hay categoría con rol axis)");

        // Valores y grupos
        const vals = cat.values;
        const totalRows = cats.length && cats[0].values ? cats[0].values.length : 0;
        L.push("", "FILAS TOTALES (combinaciones de categorías): " + totalRows);
        if (!vals) {
            L.push("VALUES: no llega categorical.values (¿sin medidas?).");
            return L;
        }
        const legendSrc = vals.source;
        L.push("VALUES: columnas=" + vals.length + "  leyenda=" + (legendSrc ? "\"" + legendSrc.displayName + "\" roles=" + this.roles(legendSrc) + " tipo=" + this.typeOf(legendSrc) : "(sin leyenda)"));
        const groups = vals.grouped();
        L.push("GRUPOS (values.grouped()): " + groups.length);
        let anyHighlight = false;
        groups.forEach((g, gi) => {
            const gname = g.name === undefined || g.name === null ? "(sin nombre)" : this.fmt(g.name as PrimitiveValue);
            if (gi < 12) L.push("  grupo " + gi + " = " + gname + "  medidas=" + g.values.length);
            g.values.forEach(col => {
                const hl = col.highlights;
                if (hl) anyHighlight = true;
                if (gi < 12) {
                    L.push("     · \"" + col.source.displayName + "\" rol=" + this.roles(col.source) +
                        " format=" + (col.source.format || "-") + " tipo=" + this.typeOf(col.source) +
                        " valores=" + col.values.length + " nulos=" + col.values.filter(v => v === null || v === undefined).length +
                        (hl ? " highlights=" + hl.filter(v => v !== null && v !== undefined).length + "/" + hl.length : ""));
                }
            });
        });
        if (groups.length > 12) L.push("  … y " + (groups.length - 12) + " grupos más");
        L.push("HIGHLIGHTS: " + (anyHighlight ? "SÍ llegan" : "no"));

        // Primeras filas
        L.push("", "PRIMERAS " + Math.min(MAX_ROWS, totalRows) + " FILAS:");
        for (let r = 0; r < Math.min(MAX_ROWS, totalRows); r++) {
            const parts: string[] = [];
            parts.push("eje=" + (axisCat ? this.fmt(axisCat.values[r]) : "-"));
            if (smCat) parts.push("panel=" + this.fmt(smCat.values[r]));
            const gl: string[] = [];
            groups.slice(0, MAX_GROUPS_PER_ROW).forEach(g => {
                const vs = g.values.map((col: DataViewValueColumn) => this.roleName(col.source) + "=" + this.fmt(col.values[r]));
                gl.push((legendSrc ? "[" + this.fmt(g.name as PrimitiveValue) + "] " : "") + vs.join(" "));
            });
            if (groups.length > MAX_GROUPS_PER_ROW) gl.push("…");
            L.push("  " + r + ": " + parts.join("  ") + "  |  " + gl.join("  |  "));
        }
        return L;
    }

    // ---------------------------------------------------------------- utilidades

    private opKind(k: unknown): string {
        const names: Record<number, string> = { 0: "Create", 1: "Append", 2: "Segment" };
        return k === undefined ? "(undefined)" : String(k) + (names[k as number] ? " " + names[k as number] : "");
    }

    private roles(s: DataViewMetadataColumn): string {
        return s.roles ? Object.keys(s.roles).filter(k => s.roles[k]).join("+") : "-";
    }

    private roleName(s: DataViewMetadataColumn): string {
        const r = this.roles(s);
        return r === "-" ? s.displayName : r;
    }

    private hasRole(s: DataViewMetadataColumn, role: string): boolean {
        return !!(s.roles && s.roles[role]);
    }

    private typeOf(s: DataViewMetadataColumn): string {
        const t = s.type;
        if (!t) return "?";
        const f: string[] = [];
        if (t.dateTime) f.push("dateTime");
        if (t.numeric) f.push("numeric");
        if (t.integer) f.push("integer");
        if (t.text) f.push("text");
        if (t.bool) f.push("bool");
        if (t.duration) f.push("duration");
        return f.length ? f.join("/") : "otro";
    }

    private hierarchyInfo(s: DataViewMetadataColumn): string {
        const e = s.expr as unknown as Record<string, unknown> | undefined;
        if (!e) return "sin expr";
        if (e.level !== undefined) {
            return "SÍ nivel=\"" + String(e.level) + "\"" + (e.hierarchy !== undefined ? " jerarquía=\"" + String(e.hierarchy) + "\"" : "");
        }
        const kind = e.kind !== undefined ? String(e.kind) : (e._kind !== undefined ? String(e._kind) : "?");
        return "no (expr kind=" + kind + ")";
    }

    private key(v: PrimitiveValue): string {
        return v instanceof Date ? "d" + v.getTime() : typeof v + ":" + String(v);
    }

    private fmt(v: PrimitiveValue): string {
        if (v === null || v === undefined) return "∅";
        if (v instanceof Date) return v.toISOString().slice(0, 10);
        if (typeof v === "number") return String(Number(v.toPrecision(6)));
        return String(v);
    }

    private json(v: unknown): string {
        try { return JSON.stringify(v).slice(0, 200); } catch { return String(v); }
    }

    private paint(lines: string[]): void {
        while (this.root.firstChild) this.root.removeChild(this.root.firstChild);
        lines.forEach((t, i) => {
            const d = document.createElement("div");
            d.textContent = t === "" ? " " : t;
            if (i === 0) { d.style.fontWeight = "bold"; d.style.color = "#1F4E79"; }
            else if (/^[A-ZÁÉÍÓÚ ]+[:(]/.test(t)) d.style.fontWeight = "bold";
            if (t.indexOf("LLEGA →") >= 0) d.style.color = "#C00000";
            this.root.appendChild(d);
        });
    }
}
