/*
 * Line Chart by TCViz.
 *
 * Gratis (bloque 1): eje de fechas continuo (o categórico con texto, número o nivel de jerarquía), huecos honestos
 * (Break / Connect / Zero; vacío ≠ cero), varias medidas y leyenda con eje secundario, Plan / Prior year / Forecast
 * como líneas grises, etiquetas al final con el último valor no vacío, color por serie, tooltip con cruceta, resaltado,
 * selección, teclado, alto contraste, mosaico pequeño, landing de la serie, asistente y formato desde el lienzo.
 *
 * Pro (bloque 2), con vista previa por función solo editando y bajo marca de agua: los seis estilos de la colección,
 * la banda real-vs-referencia partida en el cruce, el desvío en la etiqueta final y small multiples.
 *
 * Reglas de la cartera que se cumplen aquí:
 *  - renderingStarted / Finished|Failed 1:1 por update(): los repintados internos (licencia, hover, selección,
 *    teclado, asistente) llaman a render() o a paintState(), nunca a this.update(), y no emiten eventos.
 *  - La licencia se pide en diferido, fuera del try: un fallo de licencia nunca convierte un render en Failed.
 *  - Nunca persistProperties dentro de registerOnSelectCallback.
 *  - allowInteractions desde host.hostCapabilities.
 *  - Sin innerHTML: todo con createElement / d3 y textContent.
 *  - Formato de números del modelo (source.format, formato dinámico por punto y host.locale).
 */
"use strict";

import powerbi from "powerbi-visuals-api";
import * as d3 from "d3";
import { valueFormatter } from "powerbi-visuals-utils-formattingutils";
import {
    HtmlSubSelectableClass, HtmlSubSelectionHelper, SubSelectableDisplayNameAttribute,
    SubSelectableObjectNameAttribute, SubSelectableTypeAttribute,
} from "powerbi-visuals-utils-onobjectutils";
import "./../style/visual.less";

import { STRINGS } from "./strings";
import { OBJECTS, PANE, PropSpec } from "./formatSpec";
import { buildModel, cadenceOf, Model, Series, RefKind, RefLine, segmentsOf, Pt, panelValues, gapBands } from "./model";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import ISelectionId = powerbi.visuals.ISelectionId;
import IVisualEventService = powerbi.extensibility.IVisualEventService;
import ILocalizationManager = powerbi.extensibility.ILocalizationManager;
import DataView = powerbi.DataView;
import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;

type Sel<T extends d3.BaseType> = d3.Selection<T, unknown, null, undefined>;
type Settings = Record<string, Record<string, any>>;

// build-test.js la rellena con "test AAAA-MM-DD HH:MM vX"; en producción va vacía y no se pinta.
const TEST_STAMP = ""; // TEST_STAMP_MARKER

/**
 * Plan previsto en Partner Center (serie económica, como Radar: 0,99/mes · 9,99/año). Funciones Pro: estilos de la
 * colección, banda real-vs-referencia, desvío en la etiqueta final y small multiples. El Plan ID DEBE ser el que se
 * escriba al crear el plan.
 */
const PLAN_IDS = ["line-chart-pro"];
const STATE_ACTIVE = 1;
const STATE_WARNING = 2;
/** spIdentifier es el Service ID completo ("editor.oferta.plan"); se acepta también el Plan ID solo. */
function matchesPlan(sp: unknown, planId: string): boolean {
    const s = String(sp ?? "");
    return s === planId || s.endsWith("." + planId);
}

// Enlaces de la pantalla de inicio: solo con un clic, por host.launchUrl.
const URL_GUIDE = "https://tinocallarisa-web.github.io/LineChart/support.html";
const URL_PRODUCT = "https://tcviz.com/product/line-chart/?ref=visual-line-chart";

/** Colores "Classic" de Power BI, por orden de serie. */
const CLASSIC = ["#118DFF", "#12239E", "#E66C37", "#6B007B", "#E044A7", "#744EC2", "#D9B300", "#D64550", "#197278", "#1AAB40"];
/** Alto contraste: las series se distinguen por trazo y marcador, no por color. */
const HC_DASH = ["", "10,4", "16,4,4,4", "5,5", "20,5", "12,3,3,3,3,3", "8,8", "24,4,8,4"];
const HC_SYMBOLS = [d3.symbolCircle, d3.symbolSquare, d3.symbolTriangle, d3.symbolDiamond, d3.symbolCross, d3.symbolStar, d3.symbolWye];
const REF_KINDS_ORDER: RefKind[] = ["plan", "previousYear", "forecast"];
const REF_DASH: Record<RefKind, string> = { plan: "6,3", previousYear: "2,3", forecast: "8,3,2,3" };
const REF_DEFAULT_NAME: Record<RefKind, [string, string]> = {
    plan: ["Role_Plan", "Plan"], previousYear: ["Role_PreviousYear", "Prior year"], forecast: ["Role_Forecast", "Forecast"],
};

/**
 * Plantillas. Solo rellenan lo que el usuario no ha tocado (lo guardado en metadata.objects gana) y, al ELEGIR una,
 * se borran los ajustes que ella define (aplicarPlantilla). "report" se reconstruye en cada update desde el tema.
 */
const TEMPLATES: Record<string, Settings> = {
    report: {},
    classic: { xAxis: { color: "#605E5C" }, yAxis: { color: "#605E5C", gridColor: "#E1DFDD" }, legend: { color: "#605E5C" },
        endLabels: { color: "#252423" }, references: { color: "#8A8886", aboveColor: "#2E7D32", belowColor: "#C62828" },
        smallMultiples: { titleColor: "#252423", borderColor: "#E1DFDD" } },
};

/**
 * Los seis estilos de la colección (Pro, con vista previa). Tokens compartidos con KPI Card: trend.color = la serie
 * real (series[0]), targetColor = el plan; up/down = los de la comparación de Pareto en el mismo estilo. Así una página
 * con KPI Card, Pareto y Line Chart en Boardroom se ve como un solo informe.
 */
const PRO_STYLES = ["boardroom", "ledger", "editorial", "signal", "aurora", "terrace"];
interface StyleTokens { bg: string; text: string; axis: string; grid: string; plan: string; up: string; down: string; series: string[]; font?: string; grad?: string; }
export const STYLE_TOKENS: Record<string, StyleTokens> = {
    boardroom: { bg: "#16263D", text: "#F2F0E8", axis: "#9FB0C6", grid: "#2A3E5C", plan: "#6FCF97", up: "#6FCF97", down: "#EB8A7B", series: ["#C9A45C", "#8FB8E8", "#EB8A7B", "#6FCF97", "#C5D3E3"] },
    ledger: { bg: "#FBF8EF", text: "#231F16", axis: "#6E6652", grid: "#D9D2BE", plan: "#946A10", up: "#2F6B3B", down: "#A32A2A", series: ["#7A1F1F", "#3A3528", "#2F6B3B", "#946A10", "#B7AD92"], font: "Georgia, serif" },
    editorial: { bg: "#FFFFFF", text: "#111111", axis: "#5F5F5F", grid: "#E2E2E2", plan: "#111111", up: "#111111", down: "#D7263D", series: ["#D7263D", "#111111", "#5F5F5F", "#BDBDBD", "#8C1C2B"], font: "Georgia, serif" },
    signal: { bg: "#FFFFFF", text: "#14202B", axis: "#566472", grid: "#D9DEE4", plan: "#B7791F", up: "#1F7A4D", down: "#C0392B", series: ["#1F7A4D", "#14202B", "#B7791F", "#C0392B", "#9AA5B1"] },
    aurora: { bg: "#10395E", text: "#FFFFFF", axis: "#C5D3E3", grid: "#3A5C7E", plan: "#FFD27D", up: "#7CE7D0", down: "#FF9DB0", series: ["#7CE7D0", "#FFD27D", "#FF9DB0", "#9DB7FF", "#C5D3E3"], grad: "linear-gradient(135deg, #1B1147, #10395E 50%, #0B5A5E)" },
    terrace: { bg: "#FBF5EC", text: "#3A2A1E", axis: "#7A6450", grid: "#E5D6C2", plan: "#5E7128", up: "#5E7128", down: "#B5372A", series: ["#B5532A", "#5E7128", "#B5782A", "#B5372A", "#C9A77E"] },
};
for (const k of PRO_STYLES) {
    const t = STYLE_TOKENS[k];
    TEMPLATES[k] = { xAxis: { color: t.axis }, yAxis: { color: t.axis, gridColor: t.grid }, legend: { color: t.axis },
        endLabels: { color: t.text }, references: { color: t.axis, aboveColor: t.up, belowColor: t.down },
        smallMultiples: { titleColor: t.axis, borderColor: t.grid } };
}
const FONT_DEFAULT = "'Segoe UI', wf_segoe-ui_normal, helvetica, arial, sans-serif";

/** "Report theme" (por defecto): los colores del tema del informe, como un visual nativo. */
function reportTemplate(host: IVisualHost): Settings {
    const pal: any = host.colorPalette;
    const fg: string = pal?.foreground?.value ?? "#252423";
    const soft: string = pal?.foregroundNeutralSecondary?.value ?? "#605E5C";
    const grid: string = pal?.backgroundNeutral?.value ?? "#E1DFDD";
    const ter: string = pal?.foregroundNeutralTertiary?.value ?? "#8A8886";
    return { xAxis: { color: soft }, yAxis: { color: soft, gridColor: grid }, legend: { color: soft },
        endLabels: { color: fg }, references: { color: ter }, smallMultiples: { titleColor: fg, borderColor: grid } };
}

let hatchCounter = 0;
/** Sin licencia, la vista previa de small multiples dibuja como mucho estos paneles. */
const PREVIEW_PANELS = 4;

interface Layout {
    mode: "full" | "mini" | "spark";
    W: number; H: number;
    left: number; right: number; top: number; bottom: number;
    plotW: number; plotH: number;
    xAxis: boolean; yAxis: boolean; y2Axis: boolean; xTitle: boolean; yTitle: boolean; y2Title: boolean;
    legend: boolean; legendRows: LegendItem[][]; legendH: number;
    labels: boolean; labelW: number; y1W: number; y2W: number;
    noticeH: number;
}

interface LegendItem { label: string; color: string; kind: "series" | "ref"; dash: string; series?: Series; ref?: RefKind; w: number; idx: number; }

interface Drawn { s: Series; y: d3.ScaleLinear<number, number>; segs: Pt[][]; }

/** Caja ocupada por una etiqueta (anticolisión de eventos, anotaciones y objetivo). */
interface Box { x0: number; y0: number; x1: number; y1: number; }

/** Un panel dibujado (uno solo sin small multiples): su modelo, su caja y sus escalas, para el puntero y el teclado. */
interface PanelState {
    model: Model; g: Sel<SVGGElement>; ox: number; oy: number;
    L: Layout | null; x: (pos: number) => number;
    y1: d3.ScaleLinear<number, number> | null; y2: d3.ScaleLinear<number, number> | null; drawn: Drawn[];
}

export class Visual implements IVisual {
    private host: IVisualHost;
    private events: IVisualEventService;
    private selectionManager: ISelectionManager;
    private loc: ILocalizationManager;
    private root: HTMLDivElement;
    private svg: Sel<SVGSVGElement>;
    private live: HTMLDivElement;
    private guideEl: HTMLDivElement | null = null;
    private subSelectionHelper: HtmlSubSelectionHelper;
    public visualOnObjectFormatting: powerbi.extensibility.visual.VisualOnObjectFormatting;

    private isPro = false; // ISPRO_MARKER
    private licenseRequested = false;
    private licenseResolved = false;
    private licenseEnvUnsupported = false;
    /**
     * Funciones Pro dibujadas de verdad, bajo marca de agua, para que el autor vea lo que compraría. Solo editando y solo
     * cuando la licencia ya se ha resuelto: si no, un cliente Pro vería la marca en el primer fotograma y un informe
     * publicado llevaría una función sin pagar.
     */
    private proPreview = false;
    private watermarkEl: HTMLDivElement;
    private watermarkTitle: HTMLDivElement;
    private watermarkWhy: HTMLDivElement;
    private lastBlockedNotice = "";
    private licenseIconShown = false;
    private licenseIconTimer: number | null = null;

    private lastOptions: VisualUpdateOptions | null = null;
    private dataView: DataView | null = null;
    /** Panel activo (el del puntero o el teclado): model, L, x, y1, y2 y drawn apuntan a él. */
    private model: Model | null = null;
    private models: Model[] = [];
    private panels: PanelState[] = [];
    private curPanel: PanelState | null = null;
    /** Se dibujan varios paneles (small multiples con licencia o en la vista previa). */
    private multi = false;
    /** Todas las series de todos los paneles, una por id: leyenda y colores. */
    private allSeries: Series[] = [];
    private canvas: Sel<SVGGElement>;
    private sharedDomains: { d1: [number, number] | null; d2: [number, number] | null } | null = null;
    private hatchId = "lc-hatch-" + (++hatchCounter);
    private settings: Settings = {};
    private tplVisto: string | null = null;
    private tplEfectiva = "report";
    private editing = false;
    private formatMode = false;
    private guideStep = 1;

    // Dibujo en curso (para el puntero, el teclado y la selección)
    private L: Layout | null = null;
    private x: (pos: number) => number = () => 0;
    private y1: d3.ScaleLinear<number, number> | null = null;
    private y2: d3.ScaleLinear<number, number> | null = null;
    private drawn: Drawn[] = [];
    private hoverId: string | null = null;
    private focusKey = -1;
    private focusSeries = 0;
    private hasFocus = false;
    /** Selección propia: clave → id. "s␟<leyenda>" serie; "p␟<k>␟<leyenda>" punto. */
    private selKeys = new Map<string, ISelectionId>();
    private pendingRestore: ISelectionId[] | null = null;
    private fmtCache = new Map<string, valueFormatter.IValueFormatter>();
    private canvasCtx: CanvasRenderingContext2D | null = null;

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.events = options.host.eventService;
        this.selectionManager = options.host.createSelectionManager();
        this.loc = options.host.createLocalizationManager();

        this.root = document.createElement("div");
        this.root.className = "lc-root";
        options.element.appendChild(this.root);
        this.svg = d3.select(this.root).append("svg").attr("class", "lc-svg") as unknown as Sel<SVGSVGElement>;
        this.live = document.createElement("div");
        this.live.className = "lc-live";
        this.live.setAttribute("aria-live", "polite");
        this.root.appendChild(this.live);
        this.canvas = this.svg.append("g") as unknown as Sel<SVGGElement>;
        // Marca de la vista previa (como Pareto): texto blanco con sombra, dos líneas (el rótulo y QUÉ función la
        // enciende), sin capturar clics y fuera del lector de pantalla.
        this.watermarkEl = document.createElement("div");
        this.watermarkEl.className = "lc-watermark";
        this.watermarkEl.setAttribute("aria-hidden", "true");
        this.watermarkTitle = document.createElement("div");
        this.watermarkWhy = document.createElement("div");
        this.watermarkEl.appendChild(this.watermarkTitle);
        this.watermarkEl.appendChild(this.watermarkWhy);
        this.root.appendChild(this.watermarkEl);
        this.injectStyles();

        this.subSelectionHelper = HtmlSubSelectionHelper.createHtmlSubselectionHelper({
            hostElement: options.element,
            subSelectionService: options.host.subSelectionService,
            selectionIdCallback: () => undefined,
        });
        this.visualOnObjectFormatting = {
            getSubSelectionStyles: (subs) => this.getSubSelectionStyles(subs),
            getSubSelectionShortcuts: (subs) => this.getSubSelectionShortcuts(subs),
            getSubSelectables: (filter) => this.subSelectionHelper.getAllSubSelectables(filter),
        };

        // Marcadores y selección desde fuera: solo derivar y repintar. Nunca persistProperties aquí.
        const sm = this.selectionManager as any;
        if (typeof sm.registerOnSelectCallback === "function") {
            sm.registerOnSelectCallback((ids: ISelectionId[]) => {
                this.restoreSelection(ids || []);
                this.paintState();
            });
        }

        const node = this.svg.node() as SVGSVGElement;
        node.addEventListener("keydown", (e: KeyboardEvent) => this.onKey(e));
        node.addEventListener("focus", () => { this.hasFocus = true; this.onFocus(); });
        node.addEventListener("blur", () => { this.hasFocus = false; this.hideTip(); this.drawCross(-1); });
    }

    // ── Textos y formato ─────────────────────────────────────────────────────

    /** Primero la tabla del bundle (Desktop solo traduce las claves de capabilities.json), luego el gestor, luego inglés. */
    private t(key: string, fallback: string): string {
        const loc = String(this.host?.locale || "");
        const tabla = STRINGS[loc] || STRINGS[Object.keys(STRINGS).find(l => l.slice(0, 2) === loc.slice(0, 2)) || ""];
        if (tabla && tabla[key]) return tabla[key];
        try {
            const s = this.loc?.getDisplayName(key);
            return s && s !== key ? s : fallback;
        } catch { return fallback; }
    }

    private tf(key: string, fallback: string, ...args: string[]): string {
        return this.t(key, fallback).replace(/\{(\d+)\}/g, (_m, i) => args[Number(i)] ?? "");
    }

    private static isPct(fmt: string | undefined): boolean {
        return !!fmt && /%/.test(fmt.replace(/"[^"]*"|\\./g, ""));
    }

    private formatter(format: string | undefined, scale?: number): valueFormatter.IValueFormatter {
        const pct = Visual.isPct(format);
        const k = (format ?? "") + "|" + (pct || scale === undefined ? "" : String(scale));
        let f = this.fmtCache.get(k);
        if (!f) {
            f = pct || scale === undefined
                ? valueFormatter.create({ format, cultureSelector: this.host.locale })
                : valueFormatter.create({ format, value: scale, displayUnitSystemType: 2, cultureSelector: this.host.locale });
            this.fmtCache.set(k, f);
        }
        return f;
    }

    /** Valor completo (tooltip): el formato del punto (dinámico) o el de la medida, sin unidades. */
    private fmtFull(v: number | null, fmt: string | undefined): string {
        if (v === null || v === undefined || !isFinite(v)) return this.t("UI_Blank", "(Blank)");
        return this.formatter(fmt).format(v);
    }

    /** Valor corto (etiquetas, ejes): unidades automáticas, salvo porcentajes. */
    private fmtShort(v: number, fmt: string | undefined, scale?: number): string {
        return this.formatter(fmt, scale ?? Math.abs(v)).format(v);
    }

    /** Marcas de un eje: misma unidad y mismos decimales en todas (0,8K · 1,0K · 1,2K, no 0.8K · 1K). */
    private tickFormatter(ticks: number[], fmt: string | undefined): (v: number) => string {
        const maxAbs = Math.max(...ticks.map(Math.abs), 0);
        if (Visual.isPct(fmt) || maxAbs < 1000) return (v: number) => this.fmtShort(v, fmt, maxAbs);
        const unit = maxAbs >= 1e12 ? 1e12 : maxAbs >= 1e9 ? 1e9 : maxAbs >= 1e6 ? 1e6 : 1e3;
        const step = ticks.length > 1 ? Math.abs(ticks[1] - ticks[0]) : maxAbs;
        const precision = Math.max(0, Math.min(4, Math.ceil(-Math.log10(step / unit) - 1e-9)));
        const f = valueFormatter.create({ format: fmt, value: maxAbs, precision, displayUnitSystemType: 2, cultureSelector: this.host.locale });
        return (v: number) => (v === 0 ? this.formatter(fmt).format(0) : f.format(v));
    }

    private intlDate(d: Date, opts: Intl.DateTimeFormatOptions): string {
        try { return new Intl.DateTimeFormat(this.host.locale || "en-US", opts).format(d); } catch { return d.toDateString(); }
    }

    /** Etiqueta de una clave del eje, con el formato de su columna. */
    private keyLabel(k: number): string {
        const m = this.model;
        if (!m || k < 0 || k >= m.keys.length) return "";
        return m.keys[k].raw.map((v, i) => {
            const src = m.axisCols[i].source;
            if (v instanceof Date) {
                return src.format ? this.formatter(src.format).format(v) : this.intlDate(v, { day: "numeric", month: "short", year: "numeric" });
            }
            if (typeof v === "number") return src.format ? this.formatter(src.format).format(v) : String(v);
            return String(v);
        }).join(" ");
    }

    private measure(text: string, size: number, bold = false): number {
        if (!this.canvasCtx) {
            try { this.canvasCtx = document.createElement("canvas").getContext("2d"); } catch { this.canvasCtx = null; }
        }
        if (!this.canvasCtx) return text.length * size * 0.56;
        this.canvasCtx.font = (bold ? "600 " : "") + size + "px " + (this.look?.font ?? FONT_DEFAULT);
        return this.canvasCtx.measureText(text).width;
    }

    private fit(text: string, size: number, maxW: number): string {
        if (this.measure(text, size) <= maxW) return text;
        let lo = 0, hi = text.length;
        while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (this.measure(text.slice(0, mid) + "…", size) <= maxW) lo = mid; else hi = mid - 1; }
        return lo > 0 ? text.slice(0, lo) + "…" : "";
    }

    // ── Ajustes ──────────────────────────────────────────────────────────────

    private readSettings(dv: DataView | null, tpl: string): Settings {
        const o: any = dv?.metadata?.objects ?? {};
        const t = TEMPLATES[tpl] ?? {};
        const out: Settings = {};
        for (const obj of Object.keys(OBJECTS)) {
            out[obj] = {};
            for (const p of OBJECTS[obj].props) {
                const saved = o?.[obj]?.[p.name];
                let v: any = p.type === "fill" ? saved?.solid?.color : saved;
                if (v === undefined || v === null) v = t?.[obj]?.[p.name];
                if (v === undefined || v === null) v = p.def;
                if (p.type === "num") {
                    v = Number(v);
                    if (!isFinite(v)) v = p.def;
                    if (p.min !== undefined) v = Math.max(p.min, v);
                    if (p.max !== undefined) v = Math.min(p.max, v);
                }
                out[obj][p.name] = v;
            }
        }
        return out;
    }

    /** La plantilla que se dibuja: un estilo de la colección solo con Pro o en la vista previa; si no, Report theme. */
    private plantillaEfectiva(dv: DataView | null): string {
        const t = String((dv?.metadata?.objects as any)?.style?.template ?? "report");
        if (!TEMPLATES[t]) return "report";
        return PRO_STYLES.indexOf(t) < 0 || this.previewOf("style templates") ? t : "report";
    }

    /** Tokens del estilo de la colección que se dibuja (null con Report theme, Classic o alto contraste). */
    private get look(): StyleTokens | null {
        return !this.hc && PRO_STYLES.indexOf(this.tplEfectiva) >= 0 ? STYLE_TOKENS[this.tplEfectiva] : null;
    }

    /** Fondo sobre el que se dibuja: para los bordes de los marcadores, el anillo de selección y el contraste. */
    private get bgColor(): string {
        if (this.hc) return this.hcBg;
        return this.look?.bg ?? (this.host.colorPalette as any)?.background?.value ?? "#FFFFFF";
    }

    /** Tinta principal (anillo de selección, títulos). */
    private get ink(): string {
        if (this.hc) return this.hcFg;
        return this.look?.text ?? (this.host.colorPalette as any)?.foreground?.value ?? "#252423";
    }

    /** Fondo y fuente del estilo, en el contenedor del visual (Aurora con su degradado). */
    private aplicarAspecto(): void {
        const look = this.look;
        this.root.style.background = this.hc ? this.hcBg : (look ? (look.grad ?? look.bg) : "");
        this.root.style.fontFamily = look?.font ?? "";
    }

    /**
     * Qué funciones Pro está PIDIENDO el informe ahora. Se lee de metadata.objects (solo lo que el informe guardó) y del
     * valor ACTUAL de cada ajuste: volver al valor gratis quita la marca. Poner el campo Small multiples ES la petición.
     * La banda y el desvío solo cuentan si hay Plan o Prior year: sin referencia no dibujan nada y la marca mentiría.
     */
    private attemptedProFeatures(): { labels: string[]; signature: string; touched: Set<string> } {
        const dv = this.dataView;
        const objs: any = dv?.metadata?.objects ?? {};
        const cols = dv?.metadata?.columns ?? [];
        const hasRef = cols.some(c => !!(c.roles?.plan || c.roles?.previousYear));
        const hasSm = cols.some(c => !!c.roles?.smallMultiple);
        // Eventos y anotaciones: poner el campo ES la petición (como Small multiples), salvo que la tarjeta esté apagada.
        const hasEv = cols.some(c => !!c.roles?.events) && objs.events?.show !== false;
        const hasAn = cols.some(c => !!c.roles?.annotations) && objs.annotations?.show !== false;
        const tpl = String(objs.style?.template ?? "");
        const variance = String(objs.endLabels?.variance ?? "off");
        const groups: [string, boolean, string][] = [
            ["style templates", PRO_STYLES.indexOf(tpl) >= 0, "style=" + tpl],
            ["gap shading", objs.references?.gapShading === true && objs.references?.show !== false && hasRef, "gap=" + (objs.references?.gapShading === true)],
            ["variance label", (variance === "pct" || variance === "abs") && objs.endLabels?.show !== false && hasRef, "var=" + variance],
            ["small multiples", hasSm, "sm=" + hasSm],
            ["events", hasEv, "ev=" + hasEv],
            ["annotations", hasAn, "an=" + hasAn],
        ];
        const labels: string[] = [];
        const parts: string[] = [];
        const touched = new Set<string>();
        for (const [label, activa, firma] of groups) {
            if (!activa) continue;
            labels.push(label); touched.add(label); parts.push(firma);
        }
        return { labels, signature: parts.join("|"), touched };
    }

    /** Lo que se DIBUJA, función a función: la vista previa solo vale para la función que el autor ha tocado. */
    private previewOf(feature: string): boolean {
        if (this.isPro) return true;
        if (!this.proPreview) return false;
        return this.attemptedProFeatures().touched.has(feature);
    }

    private featName(id: string): string {
        switch (id) {
            case "style templates": return this.t("Feat_styles", "collection styles");
            case "gap shading": return this.t("Feat_gap", "gap shading");
            case "variance label": return this.t("Feat_variance", "variance label");
            case "small multiples": return this.t("Feat_panels", "small multiples");
            case "events": return this.t("Feat_events", "events");
            case "annotations": return this.t("Feat_annotations", "annotations");
            default: return id;
        }
    }

    /** La marca solo con una función Pro realmente puesta y solo editando: un gráfico gratis correcto no se ensucia. */
    private updateWatermark(W: number, H: number): void {
        const { labels } = this.attemptedProFeatures();
        const activa = this.proPreview && labels.length > 0 && !!this.model;
        this.watermarkEl.style.display = activa ? "flex" : "none";
        if (!activa) return;
        this.watermarkTitle.textContent = this.t("UI_ProPreview", "Pro preview");
        const nombres = labels.map(l => this.featName(l));
        this.watermarkWhy.textContent = (nombres.length <= 2 ? nombres : nombres.slice(0, 2).concat(["+" + (nombres.length - 2)])).join(" · ");
        const size = Math.round(Math.max(22, Math.min(84, W / 8, H / 3.5)));
        this.watermarkEl.style.fontSize = size + "px";
        this.watermarkWhy.style.fontSize = Math.round(size * 0.34) + "px";
    }

    private cancelLicenseIcon(): void {
        if (this.licenseIconTimer !== null) { window.clearTimeout(this.licenseIconTimer); this.licenseIconTimer = null; }
    }

    /** Quita el aviso: la licencia se resolvió o el autor quitó todas las funciones Pro. */
    private clearLicenseNotice(): void {
        this.lastBlockedNotice = "";
        this.cancelLicenseIcon();
        if (!this.licenseIconShown) return;
        this.licenseIconShown = false;
        try { (this.host.licenseManager as any)?.clearLicenseNotification?.(); } catch { /* best-effort */ }
    }

    /**
     * Avisos de licencia del propio Power BI (Microsoft: el visual no muestra UX de licencia propia). Secuencia de Pareto
     * 1.4.1+: quitar lo que haya, el aviso que nombra la función y, ~10 s después, la barra persistente de Upgrade (la
     * que lleva a la compra; si fuera antes, el aviso la taparía). Solo ante un cambio NUEVO de un ajuste Pro.
     */
    private notifyProFeatureBlocked(): void {
        const lm: any = this.host.licenseManager;
        if (!lm || !this.licenseResolved) return;
        if (this.isPro) { this.clearLicenseNotice(); return; }
        const { labels, signature } = this.attemptedProFeatures();
        if (!labels.length) { this.clearLicenseNotice(); return; }
        // Entorno sin licencias o licencia ilegible: un cliente Pro caería aquí; nunca pedirle que compre.
        if (this.licenseEnvUnsupported) return;
        if (signature === this.lastBlockedNotice) return;
        this.lastBlockedNotice = signature;
        this.licenseIconShown = true;
        const list = labels.map(l => this.featName(l)).join(", ");
        const msg = this.proPreview
            ? this.tf("UI_NoticePreview", "Line Chart: {0} — part of the Pro plan, shown here as a watermarked preview. Reading view shows the free chart.", list)
            : this.tf("UI_NoticeBlocked", "Line Chart: {0} — part of the Pro plan. Get a licence to enable it.", list);
        const show = () => {
            try { lm.notifyFeatureBlocked?.(msg.slice(0, 500)); } catch { /* best-effort */ }
            this.cancelLicenseIcon();
            this.licenseIconTimer = window.setTimeout(() => {
                this.licenseIconTimer = null;
                if (this.isPro || !this.licenseIconShown) return;
                // const enum: TypeScript lo sustituye por 0 (General).
                try { lm.notifyLicenseRequired?.(powerbi.LicenseNotificationType.General); } catch { /* best-effort */ }
            }, 10500);
        };
        // clearLicenseNotification puede devolver una promesa: mostrar antes de que acabe dejaría que borrase el aviso.
        let cleared: any;
        try { cleared = lm.clearLicenseNotification?.(); } catch { /* best-effort */ }
        if (cleared && typeof cleared.then === "function") cleared.then(show, show); else show();
    }

    private get canInteract(): boolean {
        if (this.formatMode) return false;
        // hostCapabilities es donde la API 5.x lo pone; host.allowInteractions era el sitio antiguo.
        const h: any = this.host;
        return (h?.hostCapabilities?.allowInteractions ?? h?.allowInteractions) !== false;
    }

    private get hc(): boolean { return !!(this.host.colorPalette as any)?.isHighContrast; }
    private get hcFg(): string { return (this.host.colorPalette as any)?.foreground?.value ?? "#000000"; }
    private get hcBg(): string { return (this.host.colorPalette as any)?.background?.value ?? "#FFFFFF"; }
    private get hcSel(): string { return (this.host.colorPalette as any)?.foregroundSelected?.value ?? this.hcFg; }

    // ── Update ───────────────────────────────────────────────────────────────

    public update(options: VisualUpdateOptions): void {
        this.events.renderingStarted(options);
        try {
            this.lastOptions = options;
            const dv = options.dataViews?.[0] ?? null;
            this.dataView = dv;
            const vm = (options as any).viewMode;
            this.editing = typeof vm === "number" && vm !== 0;
            this.formatMode = !!(options as any).formatMode;
            this.subSelectionHelper.setFormatMode(this.formatMode);
            if (dv) {
                // Elegir una plantilla la aplica de verdad: solo al CAMBIARLA y editando; nunca al abrir el informe.
                const ahora = String(((dv.metadata?.objects as any)?.style?.template) ?? "report");
                if (this.editing && this.tplVisto !== null && this.tplVisto !== ahora) this.aplicarPlantilla(ahora);
                this.tplVisto = ahora;
            }
            this.fmtCache.clear();
            this.render(options);
            if (this.formatMode) this.subSelectionHelper.updateOutlinesFromSubSelections((options as any).subSelections ?? [], true);
            this.events.renderingFinished(options);
        } catch (e) {
            this.events.renderingFailed(options, String(e));
            console.error("[LineChart]", e);
        }
        // Fuera del try: un fallo de licencia nunca convierte un render correcto en renderingFailed.
        this.requestLicenseDeferred();
        try { this.notifyProFeatureBlocked(); } catch { /* best-effort */ }
    }

    /** Repinta con las últimas options fuera de update(): no emite rendering events. */
    private repaint(): void {
        if (!this.lastOptions) return;
        try { this.render(this.lastOptions); } catch (e) { console.error("[LineChart]", e); }
    }

    /** Pide la licencia una vez, fuera del camino crítico. Si no resuelve, se queda en Free. */
    private requestLicenseDeferred(): void {
        if (this.licenseRequested || this.isPro) return;
        this.licenseRequested = true;
        window.setTimeout(() => {
            try {
                const lm: any = this.host.licenseManager;
                if (!lm) { this.licenseEnvUnsupported = true; this.licenseResolved = true; return; }
                lm.getAvailableServicePlans().then(
                    (r: any) => {
                        if (r?.isLicenseUnsupportedEnv === true || r?.isLicenseInfoAvailable === false) this.licenseEnvUnsupported = true;
                        this.licenseResolved = true;
                        // Solo Active y Warning (periodo de gracia: el cliente ha pagado) son licencias utilizables.
                        const pro = (r?.plans ?? []).some((p: any) => PLAN_IDS.some(id => matchesPlan(p.spIdentifier, id)) &&
                            (p.state === STATE_ACTIVE || p.state === STATE_WARNING));
                        if (pro) this.isPro = true;
                        // Repinta sin emitir rendering events (la vista previa o el Pro dependen de esto) y avisa si toca.
                        this.repaint();
                        try { this.notifyProFeatureBlocked(); } catch { /* best-effort */ }
                    },
                    () => { this.licenseEnvUnsupported = true; this.licenseResolved = true; });
            } catch {
                this.licenseEnvUnsupported = true;
                this.licenseResolved = true;
            }
        }, 0);
    }

    private clearDrawing(): void {
        this.svg.selectAll("*").remove();
        d3.select(this.root).selectAll(".lc-landing, .lc-msg").remove();
        this.canvas = this.svg.append("g").attr("class", "lc-canvas") as unknown as Sel<SVGGElement>;
        this.drawn = [];
        this.L = null;
        this.panels = [];
        this.curPanel = null;
        this.sharedDomains = null;
    }

    private render(options: VisualUpdateOptions): void {
        const dv = this.dataView;
        TEMPLATES.report = reportTemplate(this.host);
        // Ya se sabe si hay licencia: de ahí sale si toca vista previa (solo editando y con la licencia resuelta).
        this.proPreview = !this.isPro && this.editing && this.licenseResolved && !this.licenseEnvUnsupported;
        this.tplEfectiva = this.plantillaEfectiva(dv);
        this.settings = this.readSettings(dv, this.tplEfectiva);
        this.clearDrawing();
        const W = Math.max(0, options.viewport.width), H = Math.max(0, options.viewport.height);
        this.svg.attr("width", W).attr("height", H);
        this.aplicarAspecto();

        // Small multiples: con Pro, todos los paneles; en la vista previa, los 4 primeros. Sin licencia en lectura, el
        // PRIMER panel con un aviso (no la suma de los paneles: ver el informe del bloque 2). En un mosaico, uno.
        const blank = this.t("UI_Blank", "(Blank)");
        const smVals = dv ? panelValues(dv) : [];
        const room = W >= 220 && H >= 140;
        this.multi = smVals.length > 0 && room && this.previewOf("small multiples");
        const shown = this.multi ? (this.isPro ? smVals : smVals.slice(0, PREVIEW_PANELS)) : [];
        this.models = !dv ? [] : this.multi
            ? shown.map(v => buildModel(dv, blank, v)).filter((m): m is Model => !!m)
            : [buildModel(dv, blank)].filter((m): m is Model => !!m);
        if (!this.models.length) this.multi = false;
        this.model = this.models[0] ?? null;
        const m = this.model;
        if (!m) {
            this.renderLanding(W, H);
            this.renderGuide(W, H);
            this.updateWatermark(W, H);
            return;
        }
        this.allSeries = [];
        const seen = new Set<string>();
        for (const pm of this.models) for (const s of pm.series) if (!seen.has(s.id)) { seen.add(s.id); this.allSeries.push(s); }
        this.assignColors();
        if (this.pendingRestore) { this.restoreSelection(this.pendingRestore); }
        else if (!this.selKeys.size) {
            const ids = this.selectionManager.getSelectionIds?.() as ISelectionId[] | undefined;
            if (ids && ids.length) this.restoreSelection(ids);
        }
        this.pruneSelection();
        if (!m.keys.length) {
            this.message(W, H, m.missingAxis
                ? this.tf("UI_NoAxisAll", "{0} values have no date on the axis: nothing to draw.", this.int(m.missingAxis))
                : this.t("UI_NoData", "No data to draw."));
            this.renderGuide(W, H);
            this.updateWatermark(W, H);
            return;
        }
        // Nota de fuente: una vez, al pie de todo; su alto se resta del gráfico (o de la rejilla de paneles).
        const noteH = this.sourceNoteHeight(W, H);
        const Hc = H - noteH;
        if (this.multi) this.drawPanels(W, Hc);
        else {
            const p = this.newPanel(m, this.canvas, 0, 0);
            this.draw(W, Hc, false);
            this.savePanel(p);
        }
        if (noteH) this.drawSourceNote(W, H, noteH);
        if (TEST_STAMP && W >= 200) {
            this.svg.append("text").attr("x", W - 4).attr("y", noteH ? 10 : H - 3).attr("text-anchor", "end").style("font-size", "9px")
                .attr("fill", this.hc ? this.hcFg : "#A19F9D").text("[" + TEST_STAMP + "]");
        }
        this.activate(this.panels[0]);
        this.paintState();
        this.markSubSelectables();
        this.renderGuide(W, H);
        this.updateWatermark(W, H);
        if (this.focusKey >= m.keys.length) this.focusKey = m.keys.length - 1;
        if (this.hasFocus) this.onFocus();
    }

    private int(n: number): string { return this.formatter("#,0").format(n); }

    // ── Nota de fuente (gratis) ──────────────────────────────────────────────

    /** Alto de la nota de fuente (0 si está apagada, vacía o no cabe: en un mosaico pequeño manda el gráfico). */
    private sourceNoteHeight(W: number, H: number): number {
        const n = this.settings.sourceNote;
        if (!n?.show || !String(n.text ?? "").trim() || W < 120) return 0;
        const fs = Number(n.fontSize);
        const h = Math.ceil(fs * 1.25) + 6;
        return H - h >= 100 ? h : 0;
    }

    private drawSourceNote(W: number, H: number, h: number): void {
        const n = this.settings.sourceNote;
        const fs = Number(n.fontSize);
        const align = String(n.align);
        const x = align === "center" ? W / 2 : align === "right" ? W - 6 : 6;
        const text = String(n.text).replace(/\s+/g, " ").trim();
        const color = this.hc ? this.hcFg : (n.color ? String(n.color) : this.axisColor("xAxis"));
        const t = this.svg.append("text").attr("class", "lc-source").attr("x", x).attr("y", H - h / 2).attr("dy", "0.32em")
            .attr("text-anchor", align === "center" ? "middle" : align === "right" ? "end" : "start")
            .style("font-size", fs + "px").attr("fill", color).text(this.fit(text, fs, W - 12));
        t.append("title").text(text);
    }

    /** Colores sobre TODAS las series (de todos los paneles), para que una marca tenga el mismo en cada panel. */
    private assignColors(): void {
        const classic = this.tplEfectiva === "classic";
        const look = this.look;
        const pal: any = this.host.colorPalette;
        const byId = new Map<string, string>();
        this.allSeries.forEach((s, i) => {
            let c: string;
            if (this.hc) c = this.hcFg;
            else if (s.customColor) c = s.customColor;
            else if (look) c = look.series[i % look.series.length];
            else if (classic) c = CLASSIC[i % CLASSIC.length];
            else c = pal?.getColor?.(s.name)?.value ?? CLASSIC[i % CLASSIC.length];
            byId.set(s.id, c);
        });
        for (const pm of this.models) for (const s of pm.series) s.color = byId.get(s.id) ?? s.color;
    }

    // ── Paneles ──────────────────────────────────────────────────────────────

    private newPanel(model: Model, g: Sel<SVGGElement>, ox: number, oy: number): PanelState {
        const p: PanelState = { model, g, ox, oy, L: null, x: () => 0, y1: null, y2: null, drawn: [] };
        this.panels.push(p);
        this.curPanel = p;
        this.model = model; this.canvas = g; this.drawn = []; this.L = null;
        return p;
    }

    private savePanel(p: PanelState): void {
        p.L = this.L; p.x = this.x; p.y1 = this.y1; p.y2 = this.y2; p.drawn = this.drawn;
    }

    /** El puntero o el teclado pasan a este panel: el resto del código trabaja sobre this.model, this.x, etc. */
    private activate(p: PanelState | null | undefined): void {
        if (!p) return;
        this.curPanel = p;
        this.model = p.model; this.canvas = p.g; this.L = p.L; this.x = p.x; this.y1 = p.y1; this.y2 = p.y2; this.drawn = p.drawn;
    }

    /**
     * Small multiples: una rejilla de paneles con las 9 opciones comunes (como Histogram y Pareto). Eje X compartido
     * siempre (las claves salen de todas las filas); eje Y compartido por defecto (sharedY). Leyenda y avisos, una vez
     * para todo el visual. Con fondo o borde, el panel es una caja con 6 px de aire alrededor del título y el gráfico.
     */
    private drawPanels(W: number, H: number): void {
        const s = this.settings, sm = s.smallMultiples;
        const n = this.models.length;
        // Leyenda y avisos globales
        const notes = this.notices();
        const noticeH = notes.length ? notes.length * 13 + 4 : 0;
        let legendRows: LegendItem[][] = [];
        let legendH = 0;
        if (s.legend.show && H >= 170) {
            const items = this.legendItems();
            if (items.length > 1 || (items.length === 1 && this.model.legendCol)) {
                const fs = Number(s.legend.fontSize);
                legendRows = this.wrapLegend(items, W - 8, fs).slice(0, H >= 320 ? 2 : 1);
                legendH = legendRows.length * (fs + 8) + 4;
                if (legendH > H * 0.2) { legendRows = []; legendH = 0; }
            }
        }
        const legTop = s.legend.position !== "bottom";
        const top = legTop ? legendH : 0;
        const availH = Math.max(1, H - noticeH - legendH);
        const cols = Number(sm.columns) >= 1 ? Math.min(n, Math.round(Number(sm.columns)))
            // Celdas unas 1,6 veces más anchas que altas: una serie temporal se lee de izquierda a derecha.
            : Math.max(1, Math.min(n, Math.round(Math.sqrt(n * (W / availH) / 1.6))));
        const rows = Math.ceil(n / cols);
        const gap = Math.max(0, Math.min(40, Number(sm.gap)));
        const boxed = !!sm.border || !!sm.background;
        const pad = boxed ? 6 : 0;
        const tfs = Math.max(7, Number(sm.titleFontSize));
        const titleH = tfs + 8 + pad;
        const cellW = Math.max(1, (W - gap * (cols - 1)) / cols);
        const cellH = Math.max(1, (availH - gap * (rows - 1)) / rows);
        // Eje Y compartido: los dominios salen de todos los paneles.
        if (sm.sharedY !== false) {
            const hasY1 = this.models.some(pm => pm.series.some(x => x.role === "values"));
            const hasY2 = this.models.some(pm => pm.series.some(x => x.role === "secondaryValues"));
            const refsOn = !!s.references.show;
            this.sharedDomains = {
                d1: this.domainOf(hasY1 ? "values" : "secondaryValues", !!s.yAxis.zero, refsOn, this.models),
                d2: hasY1 && hasY2 ? this.domainOf("secondaryValues", !!s.y2Axis.zero, false, this.models) : null,
            };
        }
        const hc = this.hc;
        this.models.forEach((pm, i) => {
            const cx = (i % cols) * (cellW + gap);
            const cy = top + Math.floor(i / cols) * (cellH + gap);
            const pg = this.svg.append("g").attr("class", "lc-panel").attr("transform", `translate(${cx},${cy})`);
            if (boxed) {
                pg.append("rect").attr("class", "lc-sm-box").attr("x", 0.5).attr("y", 0.5)
                    .attr("width", Math.max(0, cellW - 1)).attr("height", Math.max(0, cellH - 1)).attr("rx", 2)
                    .attr("fill", hc ? "none" : (sm.background || "none"))
                    .attr("stroke", sm.border ? (hc ? this.hcFg : String(sm.borderColor)) : "none").style("pointer-events", "none");
            }
            const centro = sm.titleAlign === "center";
            const title = pm.smShown ?? "";
            pg.append("text").attr("class", "lc-sm-title").attr("x", centro ? cellW / 2 : pad + 2).attr("y", tfs + pad)
                .attr("text-anchor", centro ? "middle" : "start").style("font-size", tfs + "px")
                .style("font-weight", sm.titleBold ? "600" : "400").attr("fill", hc ? this.hcFg : String(sm.titleColor))
                .text(this.fit(title === "" ? this.t("UI_Blank", "(Blank)") : title, tfs, cellW - 2 * pad - 4));
            const body = pg.append("g").attr("transform", `translate(${pad},${titleH})`) as unknown as Sel<SVGGElement>;
            const p = this.newPanel(pm, body, cx + pad, cy + titleH);
            this.draw(Math.max(1, cellW - 2 * pad), Math.max(1, cellH - titleH - pad), true);
            this.savePanel(p);
        });
        const gl: any = { W, H, legendRows, legendH, noticeH };
        if (legendRows.length) this.drawLegend(gl);
        if (noticeH) this.drawNotices(gl);
    }

    // ── Dibujo ───────────────────────────────────────────────────────────────

    /** Avisos de todo el visual (no por panel). */
    private notices(): string[] {
        const m = this.models[0];
        const out: string[] = [];
        if (!m) return out;
        if (m.segment) out.push(this.t("UI_Segment", "Power BI sent only part of the data (over 30,000 combinations): the chart is incomplete. Filter it or use a coarser axis."));
        const missing = this.models.reduce((a, pm) => a + pm.missingAxis, 0);
        if (missing) out.push(this.tf("UI_NoAxis", "{0} values without a date on the axis", this.int(missing)));
        // Un campo de texto que llega como número (Power BI lo dejó en Count): no se pinta "1"; se avisa al autor.
        if (this.editing) {
            if (m.eventsField && this.models.some(pm => (pm.eventsField?.nonText ?? 0) > 0)) {
                out.push(this.t("UI_EventsNotText", "Events expects text: set the field to First"));
            }
            if (m.notesField && this.models.some(pm => (pm.notesField?.nonText ?? 0) > 0)) {
                out.push(this.t("UI_NotesNotText", "Annotations expects text: set the field to First"));
            }
        }
        const blank = this.t("UI_Blank", "(Blank)");
        if (m.smCol && m.smPanels > 1 && !this.multi) {
            out.push(this.tf("UI_SmFirst", "Small multiples are part of Pro: showing {0} only", m.smShown || blank));
        } else if (this.multi && m.smPanels > this.models.length) {
            out.push(this.tf("UI_SmPreview", "Pro preview: the first {0} of {1} panels", String(this.models.length), String(m.smPanels)));
        }
        return out;
    }

    /** El rol del eje Y principal (el izquierdo): Values, o Secondary si solo hay secundarios. */
    private primaryRole(m: Model): "values" | "secondaryValues" {
        return m.series.some(x => x.role === "values") ? "values" : "secondaryValues";
    }

    private yFormat(role: "values" | "secondaryValues"): string | undefined {
        const s = this.model?.series.find(x => x.role === role);
        return s?.format;
    }

    private domainOf(role: "values" | "secondaryValues", zero: boolean, withRefs: boolean, models: Model[] = [this.model]): [number, number] | null {
        let lo = Infinity, hi = -Infinity;
        const take = (v: number | null) => { if (v !== null && isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } };
        const targetOn = !!this.settings.targetLine?.show;
        for (const m of models) {
            for (const s of m.series) {
                if (s.role !== role) continue;
                s.values.forEach(take);
                if (withRefs) for (const r of s.refs) r.values.forEach(take);
            }
            // La línea de objetivo va en el eje principal: cuenta en su escala (no se sale por arriba).
            if (targetOn && m.target && this.primaryRole(m) === role) m.target.values.forEach(take);
        }
        if (lo === Infinity) return null;
        if (this.settings.lines.missing === "zero" || zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
        if (lo === hi) { const d = Math.abs(lo) || 1; lo -= d * 0.1; hi += d * 0.1; }
        return [lo, hi];
    }

    /** Dibuja el panel activo (this.model) en this.canvas. inPanel: una celda de small multiples (sin leyenda ni avisos). */
    private draw(W: number, H: number, inPanel: boolean): void {
        const m = this.model;
        const s = this.settings;
        const hc = this.hc;
        const mode: Layout["mode"] = H < 120 ? "spark" : (W < 220 || H < 140) ? "mini" : "full";
        const refsOn = s.references.show && mode !== "spark";
        const hasY2 = m.series.some(x => x.role === "secondaryValues");
        const hasY1 = m.series.some(x => x.role === "values");

        const sd = this.sharedDomains;
        const d1 = sd ? sd.d1 : this.domainOf(hasY1 ? "values" : "secondaryValues", s.yAxis.zero, refsOn);
        const d2 = sd ? (hasY1 && hasY2 ? sd.d2 : null) : (hasY1 && hasY2 ? this.domainOf("secondaryValues", s.y2Axis.zero, false) : null);
        this.y1 = d3.scaleLinear().domain(d1 ?? [0, 1]).nice();
        this.y2 = d2 ? d3.scaleLinear().domain(d2).nice() : null;
        const onY2 = (x: Series) => !!this.y2 && x.role === "secondaryValues";
        const yOf = (x: Series) => (onY2(x) ? this.y2 : this.y1);

        const L = this.layoutFor(W, H, mode, m, inPanel);
        this.L = L;
        this.y1.range([L.top + L.plotH, L.top]);
        if (this.y2) this.y2.range([L.top + L.plotH, L.top]);

        // X
        const keys = m.keys;
        const K = keys.length;
        if (m.isTime) {
            const lo = keys[0].pos, hi = keys[K - 1].pos;
            const pad = K === 1 ? m.cadence / 2 : 0;
            const sx = d3.scaleTime().domain([new Date(lo - pad), new Date(hi + pad)]).range([L.left, L.left + L.plotW]);
            this.x = (p: number) => sx(new Date(p));
            if (L.xAxis) this.drawTimeAxis(sx, L);
        } else {
            const inset = K === 1 ? L.plotW / 2 : Math.min(L.plotW / (K * 2), 12);
            const sx = d3.scaleLinear().domain([0, Math.max(1, K - 1)]).range([L.left + inset, L.left + L.plotW - inset]);
            this.x = K === 1 ? () => L.left + L.plotW / 2 : (p: number) => sx(p);
            if (L.xAxis) this.drawCatAxis(L);
        }
        if (mode === "full") this.drawYAxes(L, hasY1, hasY2);

        // Capas: banda debajo de todo, luego referencias y líneas.
        const gEvents = this.canvas.append("g").attr("class", "lc-events");
        const gBands = this.canvas.append("g").attr("class", "lc-bands");
        const gRefs = this.canvas.append("g").attr("class", "lc-refs");
        const gTarget = this.canvas.append("g").attr("class", "lc-target");
        const gLines = this.canvas.append("g").attr("class", "lc-lines");
        this.canvas.append("g").attr("class", "lc-sel");
        this.canvas.append("g").attr("class", "lc-cross");

        const missing = String(s.lines.missing);
        const lw = Number(s.lines.width);
        const line = d3.line<Pt>().x(p => this.x(p.pos)).y(() => 0);
        const markerMode = String(s.lines.markers);
        const showMarkers = mode !== "spark" && (markerMode === "on" || (markerMode === "auto" && K <= 40 && L.plotW / K >= 10) || hc);
        const series = mode === "spark" ? m.series.slice(0, 8) : m.series;
        // Banda real-vs-referencia (Pro): no en el mosaico pequeño (< 220 × 140), donde solo sería ruido.
        const bandOn = refsOn && mode === "full" && !!s.references.gapShading && this.previewOf("gap shading");

        series.forEach((ser, si) => {
            const y = yOf(ser);
            const segs = segmentsOf(ser.values, keys, missing, ser.cadence, m.cadence, m.isTime);
            this.drawn.push({ s: ser, y, segs });
            const g = gLines.append("g").attr("class", "lc-series").attr("data-id", ser.id);
            const color = ser.color;
            // Trazo por serie (panel Lines): grosor y estilo propios; alto contraste mantiene sus trazos distintos.
            const slw = ser.customStroke.width ?? lw;
            const dash = hc ? HC_DASH[si % HC_DASH.length] : this.seriesDash(ser, slw);
            const path = (pts: Pt[], cls: string, opacity: number) => {
                line.y(p => y(p.v));
                g.append("path").attr("class", cls).attr("d", line(pts)).attr("fill", "none").attr("stroke", color)
                    .attr("stroke-width", hc ? Math.max(slw, 2) : slw).attr("stroke-dasharray", dash || null)
                    .attr("stroke-linejoin", "round").attr("stroke-linecap", "round").attr("opacity", opacity);
            };
            const isolated = (pts: Pt[], opacity: number) => {
                g.append("circle").attr("class", "lc-dot").attr("cx", this.x(pts[0].pos)).attr("cy", y(pts[0].v))
                    .attr("r", Math.max(slw, 2)).attr("fill", color).attr("opacity", opacity);
            };
            const base = m.hasHighlights ? 0.28 : 1;
            for (const seg of segs) { if (seg.length > 1) path(seg, "lc-line", base); else isolated(seg, base); }
            if (m.hasHighlights && ser.highlights) {
                for (const seg of segmentsOf(ser.highlights, keys, missing, ser.cadence, m.cadence, m.isTime)) {
                    if (seg.length > 1) path(seg, "lc-line lc-hl", 1); else isolated(seg, 1);
                }
            }
            const sm = ser.customStroke.markers;
            const serMarkers = mode !== "spark" && (hc ? showMarkers : sm === "on" ? true : sm === "off" ? false : showMarkers);
            if (serMarkers) {
                const sym = hc ? d3.symbol().type(HC_SYMBOLS[si % HC_SYMBOLS.length]).size(Math.pow(Number(s.lines.markerSize) * 2 + 1, 2)) : null;
                // Alto contraste: un marcador propio cada pocos puntos, desfasado por serie para que no se tapen.
                const step = Math.max(1, Math.ceil(K / 16));
                const off = Math.round((si * step) / Math.max(1, Math.min(series.length, 8))) % step;
                ser.values.forEach((v, k) => {
                    if (v === null || (hc && step > 1 && (k % step) !== off)) return;
                    const cx = this.x(keys[k].pos), cy = y(v);
                    if (sym) g.append("path").attr("class", "lc-marker").attr("d", sym()).attr("transform", `translate(${cx},${cy})`)
                        .attr("fill", this.hcBg).attr("stroke", color).attr("stroke-width", 1.5);
                    else g.append("circle").attr("class", "lc-marker").attr("cx", cx).attr("cy", cy).attr("r", Number(s.lines.markerSize))
                        .attr("fill", color).attr("stroke", this.bgColor).attr("stroke-width", 1);
                });
            }
            if (refsOn) this.drawRefs(gRefs, ser, y);
            if (bandOn) this.drawBand(gBands, ser, y, segs);
        });

        // Objetivo (gratis) sobre las referencias; eventos (Pro) detrás de las líneas; anotaciones (Pro) encima de todo.
        const evBoxes: Box[] = [];
        if (mode !== "spark" && s.targetLine.show && m.target) this.drawTarget(gTarget, L, evBoxes);
        if (mode !== "spark" && this.eventsOn()) this.drawEvents(gEvents, L, evBoxes);
        if (mode === "full" && this.notesOn()) this.drawAnnotations(L, yOf, evBoxes);

        if (L.labels) this.drawEndLabels(L, yOf);
        if (L.legend) this.drawLegend(L);
        if (mode === "spark") this.drawSparkValue(L);
        if (L.noticeH) this.drawNotices(L);
        this.drawOverlay(L);
    }

    /** La referencia contra la que se mide la serie real: el plan si hay, si no el año anterior. */
    private bandRef(ser: Series): RefLine | null {
        return ser.refs.find(r => r.kind === "plan") ?? ser.refs.find(r => r.kind === "previousYear") ?? null;
    }

    /**
     * Banda real-vs-referencia: verde por encima, rojo por debajo, partida en el cruce exacto (gapBands). Opacidad ≤ 30 %.
     * Alto contraste: sin color, con trama (diagonales por encima, puntos por debajo) en el color del primer plano.
     */
    private drawBand(g: d3.Selection<SVGGElement, unknown, null, undefined>, ser: Series, y: d3.ScaleLinear<number, number>, segs: Pt[][]): void {
        const ref = this.bandRef(ser);
        if (!ref) return;
        const bands = gapBands(segs, this.refSegments(ser, ref));
        if (!bands.length) return;
        const s = this.settings.references;
        const op = Math.max(0.05, Math.min(0.3, Number(s.gapOpacity) / 100));
        const gg = g.append("g").attr("class", "lc-band").attr("data-id", ser.id).attr("data-kind", ref.kind);
        const hc = this.hc;
        if (hc) this.ensureHatches();
        for (const b of bands) {
            const fwd = b.pts.map(p => this.x(p.pos).toFixed(2) + "," + y(p.a).toFixed(2));
            const back = b.pts.slice().reverse().map(p => this.x(p.pos).toFixed(2) + "," + y(p.b).toFixed(2));
            const up = b.sign > 0;
            gg.append("path").attr("class", up ? "lc-band-up" : "lc-band-down").attr("d", "M" + fwd.concat(back).join("L") + "Z")
                .attr("fill", hc ? `url(#${this.hatchId}-${up ? "up" : "down"})` : String(up ? s.aboveColor : s.belowColor))
                .attr("fill-opacity", hc ? 1 : op).attr("stroke", "none").style("pointer-events", "none");
        }
    }

    /** Tramas del alto contraste, una vez por dibujo. */
    private ensureHatches(): void {
        if (!this.svg.select(`#${this.hatchId}-up`).empty()) return;
        const defs = this.svg.insert("defs", ":first-child");
        const fg = this.hcFg;
        const up = defs.append("pattern").attr("id", this.hatchId + "-up").attr("patternUnits", "userSpaceOnUse").attr("width", 7).attr("height", 7);
        up.append("path").attr("d", "M-1,8 L8,-1").attr("stroke", fg).attr("stroke-width", 1.2);
        const down = defs.append("pattern").attr("id", this.hatchId + "-down").attr("patternUnits", "userSpaceOnUse").attr("width", 6).attr("height", 6);
        down.append("circle").attr("cx", 3).attr("cy", 3).attr("r", 1.1).attr("fill", fg);
    }

    private layoutFor(W: number, H: number, mode: Layout["mode"], m: Model, inPanel = false): Layout {
        const s = this.settings;
        const L: Layout = {
            mode, W, H, left: 4, right: 4, top: 4, bottom: 4, plotW: 0, plotH: 0,
            xAxis: false, yAxis: false, y2Axis: false, xTitle: false, yTitle: false, y2Title: false,
            legend: false, legendRows: [], legendH: 0, labels: false, labelW: 0, y1W: 0, y2W: 0, noticeH: 0,
        };
        if (mode === "spark") {
            const s0 = m.series[0];
            const txt = s0 && s0.lastIndex >= 0 ? this.fmtShort(s0.values[s0.lastIndex], s0.formats[s0.lastIndex] ?? s0.format) : "";
            const fs = Math.max(10, Math.min(inPanel ? 14 : 22, H * 0.32));
            L.right = W >= 120 && txt ? Math.min(W * 0.45, this.measure(txt, fs, true) + 10) : 4;
            L.plotW = Math.max(1, W - L.left - L.right);
            L.plotH = Math.max(1, H - 8);
            return L;
        }
        if (mode === "mini") {
            L.left = L.right = L.top = L.bottom = 6;
            L.plotW = Math.max(1, W - 12);
            L.plotH = Math.max(1, H - 12);
            return L;
        }
        const notes = inPanel ? [] : this.notices();
        L.noticeH = notes.length ? notes.length * 13 + 4 : 0;
        const plotMin = Math.max(36, H * 0.45);
        // Lo que el usuario activa es el MÁXIMO: si no cabe, se quita (no se encoge). Lo último en irse, las líneas.
        const xfs = Number(s.xAxis.fontSize), yfs = Number(s.yAxis.fontSize), y2fs = Number(s.y2Axis.fontSize);
        L.xAxis = !!s.xAxis.show;
        L.xTitle = !inPanel && L.xAxis && !!s.xAxis.title && H >= 220;
        L.yAxis = !!s.yAxis.show && m.series.some(x => x.role === "values" || !this.y2);
        L.yTitle = !inPanel && L.yAxis && !!s.yAxis.title && W >= 300 && H >= 180;
        L.y2Axis = !!this.y2 && !!s.y2Axis.show;
        L.y2Title = !inPanel && L.y2Axis && !!s.y2Axis.title && W >= 300 && H >= 180;
        // Legend (en small multiples va una sola, para todo el visual)
        if (!inPanel && s.legend.show && H >= 170) {
            const items = this.legendItems();
            if (items.length > 1 || (items.length === 1 && m.legendCol)) {
                const fs = Number(s.legend.fontSize);
                const rows = this.wrapLegend(items, W - 8, fs);
                const maxRows = H >= 320 ? 2 : 1;
                L.legendRows = rows.slice(0, maxRows);
                L.legendH = L.legendRows.length * (fs + 8) + 4;
                L.legend = L.legendH <= H * 0.2;
            }
        }
        // Medir ejes Y
        const tickW = (y: d3.ScaleLinear<number, number>, fmt: string | undefined, fs: number) => {
            const ticks = y.ticks(Math.max(2, Math.floor(H / 50)));
            const tf = this.tickFormatter(ticks, fmt);
            return Math.max(...ticks.map(tk => this.measure(tf(tk), fs))) + 8;
        };
        if (L.yAxis) L.y1W = Math.min(tickW(this.y1, this.yFormat(this.y2 ? "values" : (m.series.some(x => x.role === "values") ? "values" : "secondaryValues")), yfs), W * 0.25);
        if (L.y2Axis) L.y2W = Math.min(tickW(this.y2, this.yFormat("secondaryValues"), y2fs), W * 0.2);
        // Etiquetas al final
        if (s.endLabels.show && W >= (inPanel ? 220 : 320)) {
            const fs = Number(s.endLabels.fontSize);
            const cands = this.labelCandidates();
            const lab = cands.map(c => this.measure(c.text, fs)).reduce((a, b) => Math.max(a, b), 0);
            // Con desvío la etiqueta es más larga: un poco más de sitio (el nombre se acorta antes que el desvío).
            const cap = cands.some(c => c.vari) ? 0.38 : 0.3;
            if (lab > 0) { L.labels = true; L.labelW = Math.min(lab + 16, W * cap); }
        }
        const compute = () => {
            L.top = 6 + (L.legend && s.legend.position === "top" ? L.legendH : 0);
            L.bottom = 4 + L.noticeH + (L.legend && s.legend.position === "bottom" ? L.legendH : 0) +
                (L.xAxis ? xfs + 8 : 0) + (L.xTitle ? xfs + 8 : 0);
            L.left = 6 + (L.yAxis ? L.y1W : 0) + (L.yTitle ? yfs + 8 : 0);
            L.right = 8 + (L.labels ? L.labelW : 0) + (L.y2Axis ? L.y2W : 0) + (L.y2Title ? y2fs + 8 : 0);
            L.plotW = W - L.left - L.right;
            L.plotH = H - L.top - L.bottom;
        };
        compute();
        const drops: (() => boolean)[] = [
            () => (L.legend ? (L.legend = false, true) : false),
            () => (L.xTitle || L.yTitle || L.y2Title ? (L.xTitle = L.yTitle = L.y2Title = false, true) : false),
            () => (L.labels ? (L.labels = false, true) : false),
            () => (L.y2Axis ? (L.y2Axis = false, true) : false),
            () => (L.xAxis ? (L.xAxis = false, true) : false),
            () => (L.yAxis ? (L.yAxis = false, true) : false),
        ];
        for (const d of drops) {
            if (L.plotH >= plotMin && L.plotW >= Math.max(60, W * 0.4)) break;
            if (d()) compute();
        }
        L.plotW = Math.max(1, L.plotW);
        L.plotH = Math.max(1, L.plotH);
        return L;
    }

    private axisColor(obj: string): string { return this.hc ? this.hcFg : String(this.settings[obj]?.color ?? "#605E5C"); }

    private drawTimeAxis(sx: d3.ScaleTime<number, number>, L: Layout): void {
        const s = this.settings, m = this.model;
        const fs = Number(s.xAxis.fontSize);
        const count = Math.max(2, Math.floor(L.plotW / 90));
        let ticks = sx.ticks(count);
        const step = ticks.length > 1 ? ticks[1].getTime() - ticks[0].getTime() : m.cadence;
        const day = 86400000;
        // Granularidad: nunca más fina que la cadencia de los datos (un eje mensual no enseña días).
        const unit = Math.max(step, m.cadence);
        const opts: Intl.DateTimeFormatOptions = unit >= 300 * day ? { year: "numeric" }
            : unit >= 27 * day ? { month: "short", year: "numeric" }
            : { day: "numeric", month: "short" };
        if (m.cadence >= 27 * day) ticks = ticks.filter(t => t.getDate() === 1);
        const g = this.canvas.append("g").attr("class", "lc-x lc-axis");
        const y = L.top + L.plotH;
        const color = this.axisColor("xAxis");
        let lastRight = -Infinity;
        for (const tk of ticks) {
            const x = sx(tk);
            const label = this.intlDate(tk, opts);
            const w = this.measure(label, fs);
            if (x - w / 2 < lastRight + 6 || x - w / 2 < 0 || x + w / 2 > L.W) continue;
            lastRight = x + w / 2;
            g.append("line").attr("x1", x).attr("x2", x).attr("y1", y).attr("y2", y + 4).attr("stroke", this.hc ? this.hcFg : String(s.yAxis.gridColor));
            g.append("text").attr("x", x).attr("y", y + 5 + fs * 0.8).attr("text-anchor", "middle").style("font-size", fs + "px").attr("fill", color).text(label);
        }
        this.drawXTitle(L, g);
    }

    private drawCatAxis(L: Layout): void {
        const s = this.settings, m = this.model;
        const fs = Number(s.xAxis.fontSize);
        const K = m.keys.length;
        const labels = m.keys.map((_k, i) => this.keyLabel(i));
        const widest = Math.max(...labels.map(l => this.measure(l, fs)));
        const slot = L.plotW / Math.max(1, K);
        const maxW = Math.max(30, Math.min(widest, 140));
        const every = Math.max(1, Math.ceil((maxW + 8) / slot));
        const g = this.canvas.append("g").attr("class", "lc-x lc-axis");
        const y = L.top + L.plotH;
        const color = this.axisColor("xAxis");
        for (let i = 0; i < K; i += every) {
            const x = this.x(m.keys[i].pos);
            const room = Math.max(20, Math.min(slot * every - 6, 160));
            g.append("text").attr("x", x).attr("y", y + 5 + fs * 0.8).attr("text-anchor", "middle").style("font-size", fs + "px")
                .attr("fill", color).text(this.fit(labels[i], fs, room)).append("title").text(labels[i]);
        }
        this.drawXTitle(L, g);
    }

    private drawXTitle(L: Layout, g: Sel<SVGGElement> | d3.Selection<SVGGElement, unknown, null, undefined>): void {
        if (!L.xTitle) return;
        const fs = Number(this.settings.xAxis.fontSize);
        g.append("text").attr("class", "lc-axis-title").attr("x", L.left + L.plotW / 2).attr("y", L.top + L.plotH + fs * 2 + 12)
            .attr("text-anchor", "middle").style("font-size", fs + "px").style("font-weight", "600").attr("fill", this.axisColor("xAxis"))
            .text(this.fit(this.model.axisName, fs, L.plotW));
    }

    private drawYAxes(L: Layout, hasY1: boolean, hasY2: boolean): void {
        const s = this.settings, m = this.model;
        const count = Math.max(2, Math.floor(L.plotH / 40));
        const gridOn = !!s.yAxis.grid;
        const gridColor = this.hc ? this.hcFg : String(s.yAxis.gridColor);
        const g1 = this.canvas.append("g").attr("class", "lc-y lc-axis");
        const primRole = this.y2 ? "values" : (hasY1 ? "values" : "secondaryValues");
        const fmt1 = this.yFormat(primRole);
        const t1 = this.y1.ticks(count);
        const tf1 = this.tickFormatter(t1, fmt1);
        const fs1 = Number(s.yAxis.fontSize);
        for (const tk of t1) {
            const y = this.y1(tk);
            if (gridOn) g1.append("line").attr("class", "lc-grid").attr("x1", L.left).attr("x2", L.left + L.plotW).attr("y1", y).attr("y2", y)
                .attr("stroke", gridColor).attr("stroke-width", 1).attr("stroke-dasharray", this.hc ? "1,3" : null);
            if (L.yAxis) g1.append("text").attr("x", L.left - 6).attr("y", y).attr("dy", "0.32em").attr("text-anchor", "end")
                .style("font-size", fs1 + "px").attr("fill", this.axisColor("yAxis")).text(tf1(tk));
        }
        if (L.yTitle) {
            const names = Array.from(new Set(m.series.filter(x => x.role === primRole).map(x => x.measure))).join(", ");
            const x = 6 + fs1 * 0.8;
            g1.append("text").attr("class", "lc-axis-title").attr("transform", `translate(${x},${L.top + L.plotH / 2}) rotate(-90)`)
                .attr("text-anchor", "middle").style("font-size", fs1 + "px").style("font-weight", "600").attr("fill", this.axisColor("yAxis"))
                .text(this.fit(names, fs1, L.plotH));
        }
        if (this.y2 && L.y2Axis && hasY2) {
            const g2 = this.canvas.append("g").attr("class", "lc-y2 lc-axis");
            const fs2 = Number(s.y2Axis.fontSize);
            const fmt2 = this.yFormat("secondaryValues");
            const t2 = this.y2.ticks(count);
            const tf2 = this.tickFormatter(t2, fmt2);
            const sec = m.series.filter(x => x.role === "secondaryValues");
            // El título va en el color de su serie (si es una sola): así se sabe qué línea lee el eje derecho.
            const tcolor = this.hc ? this.hcFg : (sec.length === 1 ? sec[0].color : this.axisColor("yAxis"));
            const x0 = L.W - L.right + (L.labels ? L.labelW : 0) + 6;
            for (const tk of t2) {
                g2.append("text").attr("x", x0).attr("y", this.y2(tk)).attr("dy", "0.32em").attr("text-anchor", "start")
                    .style("font-size", fs2 + "px").attr("fill", this.axisColor("yAxis")).text(tf2(tk));
            }
            if (L.y2Title) {
                const names = Array.from(new Set(sec.map(x => x.measure))).join(", ");
                const x = L.W - 6 - fs2 * 0.3;
                g2.append("text").attr("class", "lc-axis-title").attr("transform", `translate(${x},${L.top + L.plotH / 2}) rotate(90)`)
                    .attr("text-anchor", "middle").style("font-size", fs2 + "px").style("font-weight", "600").attr("fill", tcolor)
                    .text(this.fit(names, fs2, L.plotH));
            }
        }
    }

    private refName(kind: RefKind): string {
        const [k, d] = REF_DEFAULT_NAME[kind];
        return this.t(k, d);
    }

    /** Tramos de una referencia tal como se dibuja (la previsión arranca en el último real). */
    private refSegments(ser: Series, r: RefLine): Pt[][] {
        const s = this.settings, m = this.model;
        let values = r.values;
        let from = 0;
        if (r.kind === "forecast" && ser.lastIndex >= 0 && r.values.some((v, k) => v !== null && k > ser.lastIndex)) {
            values = r.values.slice();
            values[ser.lastIndex] = ser.values[ser.lastIndex];
            from = ser.lastIndex;
        }
        const own: number[] = [];
        values.forEach((v, k) => { if (v !== null && k >= from) own.push(m.keys[k].pos); });
        const cad = cadenceOf(own) || m.cadence;
        return segmentsOf(values, m.keys, s.lines.missing === "connect" ? "connect" : "break", cad, m.cadence, m.isTime, from);
    }

    /**
     * Color de una referencia: gris (o el de su serie). Con un estilo de la colección, el plan lleva el color de plan del
     * estilo (targetColor de KPI Card) mientras el usuario no haya elegido su propio gris.
     */
    private refColor(kind: RefKind, ser: Series | null): string {
        const s = this.settings;
        if (this.hc) return this.hcFg;
        if (s.references.colorMode === "series" && ser) return ser.color;
        const saved = (this.dataView?.metadata?.objects as any)?.references?.color;
        if (kind === "plan" && this.look && !saved) return this.look.plan;
        return String(s.references.color);
    }

    /** Plan, año anterior y previsión: líneas finas discontinuas, grises (o del color de su serie). */
    private drawRefs(g: Sel<SVGGElement>, ser: Series, y: d3.ScaleLinear<number, number>): void {
        const s = this.settings;
        const width = Number(s.references.width);
        const line = d3.line<Pt>().x(p => this.x(p.pos)).y(p => y(p.v));
        for (const r of ser.refs) {
            const color = this.refColor(r.kind, ser);
            const segs = this.refSegments(ser, r);
            const gg = g.append("g").attr("class", "lc-ref").attr("data-id", ser.id).attr("data-kind", r.kind);
            for (const seg of segs) {
                if (seg.length > 1) {
                    gg.append("path").attr("d", line(seg)).attr("fill", "none").attr("stroke", color).attr("stroke-width", this.hc ? 1 : width)
                        .attr("stroke-dasharray", REF_DASH[r.kind]).attr("opacity", this.hc ? 1 : 0.95);
                } else {
                    gg.append("circle").attr("cx", this.x(seg[0].pos)).attr("cy", y(seg[0].v)).attr("r", Math.max(width, 1.5)).attr("fill", color);
                }
            }
        }
    }

    // ── Trazo por serie, objetivo, eventos y anotaciones ─────────────────────

    /** Patrón de trazo para Solid / Dashed / Dotted, proporcional al grosor (Dotted necesita linecap round). */
    private lineDash(style: string, w: number): string {
        if (style === "dashed") return Math.max(4, 3 * w).toFixed(1) + "," + Math.max(3, 2 * w).toFixed(1);
        if (style === "dotted") return "0.1," + Math.max(3, 2.5 * w).toFixed(1);
        return "";
    }

    private seriesDash(ser: Series, w: number): string {
        return this.lineDash(ser.customStroke.style ?? "solid", w);
    }

    /** Eventos: con campo, con algún texto, tarjeta encendida y Pro (o su vista previa editando). */
    private eventsOn(): boolean {
        const m = this.model;
        return !!this.settings.events?.show && !!m?.events && m.events.some(t => t !== null) && this.previewOf("events");
    }

    private notesOn(): boolean {
        const m = this.model;
        return !!this.settings.annotations?.show && !!m?.series.some(s => s.notes?.some(t => t !== null)) && this.previewOf("annotations");
    }

    /** Color del objetivo: el elegido; si no, el de referencia/plan del estilo activo (como el plan). */
    private targetColor(): string {
        if (this.hc) return this.hcFg;
        const c = this.settings.targetLine.color;
        return c ? String(c) : this.refColor("plan", null);
    }

    private static overlaps(a: Box, list: Box[], pad = 2): boolean {
        return list.some(b => a.x0 < b.x1 + pad && a.x1 + pad > b.x0 && a.y0 < b.y1 + pad && a.y1 + pad > b.y0);
    }

    /**
     * Línea de objetivo (rol Target line). Un único valor en todo el eje: recta horizontal de lado a lado. Si cambia
     * con el eje: escalones, cada valor cubre SU periodo (centrado en su punto; si el objetivo es más grueso que el eje,
     * p. ej. mensual sobre eje diario, desde su punto hasta el siguiente). Un hueco de más de 1,5 periodos la corta.
     * Etiqueta al final con nombre y último valor.
     */
    private drawTarget(g: d3.Selection<SVGGElement, unknown, null, undefined>, L: Layout, boxes: Box[]): void {
        const m = this.model, t = m.target, s = this.settings.targetLine;
        const y = this.y1;
        const color = this.targetColor();
        const w = this.hc ? 1.5 : Number(s.width);
        const dash = this.lineDash(String(s.lineStyle), w);
        const xl = L.left, xr = L.left + L.plotW;
        const clamp = (x: number) => Math.max(xl, Math.min(xr, x));
        const pts: { k: number; x: number; v: number }[] = [];
        t.values.forEach((v, k) => { if (v !== null) pts.push({ k, x: this.x(m.keys[k].pos), v }); });
        if (!pts.length) return;
        let d = "";
        let endX = xr, endV = pts[pts.length - 1].v, endK = pts[pts.length - 1].k;
        if (t.constant) {
            const yy = y(pts[0].v);
            d = `M${xl.toFixed(2)},${yy.toFixed(2)}H${xr.toFixed(2)}`;
        } else {
            const own = cadenceOf(pts.map(p => m.keys[p.k].pos)) || m.cadence;
            const coarse = own > m.cadence * 1.5;
            const gapPos = own * 1.5 + 1e-9;
            const segs: typeof pts[] = [];
            let cur: typeof pts = [pts[0]];
            for (let i = 1; i < pts.length; i++) {
                if (m.keys[pts[i].k].pos - m.keys[pts[i - 1].k].pos > gapPos) { segs.push(cur); cur = [pts[i]]; } else cur.push(pts[i]);
            }
            segs.push(cur);
            // Medio periodo en píxeles, para un tramo de un solo punto.
            const halfPx = Math.max(4, Math.abs(this.x(m.keys[0].pos + own) - this.x(m.keys[0].pos)) / 2);
            for (const sg of segs) {
                const n = sg.length;
                const b: number[] = [];
                for (let i = 0; i <= n; i++) {
                    if (coarse) b.push(i < n ? sg[i].x : sg[n - 1].x + (n > 1 ? sg[n - 1].x - sg[n - 2].x : 2 * halfPx));
                    else if (i === 0) b.push(sg[0].x - (n > 1 ? (sg[1].x - sg[0].x) / 2 : halfPx));
                    else if (i === n) b.push(sg[n - 1].x + (n > 1 ? (sg[n - 1].x - sg[n - 2].x) / 2 : halfPx));
                    else b.push((sg[i - 1].x + sg[i].x) / 2);
                }
                d += `M${clamp(b[0]).toFixed(2)},${y(sg[0].v).toFixed(2)}`;
                for (let i = 0; i < n; i++) {
                    if (i > 0 && sg[i].v !== sg[i - 1].v) d += `V${y(sg[i].v).toFixed(2)}`;
                    d += `H${clamp(b[i + 1]).toFixed(2)}`;
                }
                endX = clamp(b[n]); endV = sg[n - 1].v; endK = sg[n - 1].k;
            }
        }
        g.append("path").attr("class", "lc-target-line").attr("d", d).attr("fill", "none").attr("stroke", color)
            .attr("stroke-width", w).attr("stroke-dasharray", dash || null).attr("stroke-linecap", "round")
            .style("pointer-events", this.formatMode ? null : "none");
        if (!s.showLabel || L.mode !== "full") return;
        const fs = Number(s.fontSize);
        const txt = this.fit(t.name + "  " + this.fmtShort(endV, t.formats[endK] ?? t.format), fs, Math.max(40, L.plotW * 0.45));
        if (!txt) return;
        const tw = this.measure(txt, fs, true);
        const ly = y(endV);
        const above = ly - 4 - fs >= L.top;
        const ty = above ? ly - 5 : ly + fs + 3;
        const lbl = this.canvas.append("text").attr("class", "lc-target-label").attr("x", endX - 3).attr("y", ty)
            .attr("text-anchor", "end").style("font-size", fs + "px").style("font-weight", "600")
            .attr("fill", this.readable(color, this.ink)).attr("stroke", this.bgColor).attr("stroke-width", 3)
            .attr("stroke-linejoin", "round").style("paint-order", "stroke").style("pointer-events", this.formatMode ? null : "none").text(txt);
        lbl.append("title").text(t.name);
        boxes.push({ x0: endX - 3 - tw, y0: ty - fs, x1: endX - 3, y1: ty + 3 });
    }

    /**
     * Eventos (Pro): una línea vertical fina por punto del eje con texto, y su etiqueta arriba (o abajo) en una caja.
     * Anticolisión: de izquierda a derecha, cada etiqueta va en la primera fila libre (hasta 4); si no cabe entera, se
     * recorta con … hasta el siguiente evento; si ni así, no se pinta (el texto completo siempre está en el tooltip).
     */
    private drawEvents(g: d3.Selection<SVGGElement, unknown, null, undefined>, L: Layout, boxes: Box[]): void {
        const m = this.model, s = this.settings.events;
        const color = this.hc ? this.hcFg : (s.color ? String(s.color) : this.axisColor("xAxis"));
        const dash = this.lineDash(String(s.lineStyle), 1);
        const items: { k: number; t: string; x: number }[] = [];
        m.events.forEach((t, k) => { if (t) items.push({ k, t, x: this.x(m.keys[k].pos) }); });
        for (const it of items) {
            g.append("line").attr("class", "lc-event").attr("x1", it.x).attr("x2", it.x).attr("y1", L.top).attr("y2", L.top + L.plotH)
                .attr("stroke", color).attr("stroke-width", 1).attr("stroke-dasharray", dash || null).attr("stroke-linecap", "round")
                .attr("opacity", this.hc ? 1 : 0.8).style("pointer-events", this.formatMode ? null : "none");
        }
        // Visual pequeño: solo las líneas (las etiquetas taparían los datos; el texto sigue en el tooltip).
        if (!s.showLabels || L.mode !== "full" || L.plotH < 160 || L.plotW < 300) return;
        const fs = Number(s.fontSize);
        const rowH = fs + 7;
        const maxRows = Math.max(1, Math.min(4, Math.floor((L.plotH * 0.3) / rowH)));
        const maxW = Math.max(48, Math.min(170, L.plotW * 0.3));
        const right: number[] = new Array(maxRows).fill(-Infinity);
        const bottom = String(s.labelPosition) === "bottom";
        const xr = L.left + L.plotW;
        const gl = this.canvas.append("g").attr("class", "lc-event-labels").style("pointer-events", this.formatMode ? null : "none");
        const textColor = this.hc ? this.hcFg : this.readable(color, this.ink);
        const rowY = (row: number) => bottom ? L.top + L.plotH - 2 - (row + 1) * rowH + 1 : L.top + 2 + row * rowH;
        const fixed = boxes.slice();   // lo ya colocado (la etiqueta del objetivo)
        const place = (it: { x: number }, txt: string): { x0: number; w: number; row: number } | null => {
            const w = this.measure(txt, fs) + 8;
            let x0 = it.x + 2;
            if (x0 + w > xr) x0 = it.x - 2 - w;
            if (x0 < L.left) return null;
            for (let row = 0; row < maxRows; row++) {
                if (x0 <= right[row] + 3) continue;
                const y0 = rowY(row);
                if (Visual.overlaps({ x0, y0, x1: x0 + w, y1: y0 + rowH - 2 }, fixed)) continue;
                return { x0, w, row };
            }
            return null;
        };
        items.forEach((it, i) => {
            let txt = this.fit(it.t, fs, maxW);
            let p = txt ? place(it, txt) : null;
            if (!p) {
                // Recortar hasta el siguiente evento (mínimo unas letras); si no, se queda sin etiqueta.
                const next = i + 1 < items.length ? items[i + 1].x : xr;
                const room = Math.min(maxW, next - it.x - 14);
                txt = room >= 34 ? this.fit(it.t, fs, room) : "";
                p = txt ? place(it, txt) : null;
            }
            if (!p) return;
            right[p.row] = p.x0 + p.w;
            const y0 = rowY(p.row);
            const h = rowH - 2;
            gl.append("rect").attr("class", "lc-event-box").attr("x", p.x0).attr("y", y0).attr("width", p.w).attr("height", h).attr("rx", 2)
                .attr("fill", this.hc ? this.hcBg : this.bgColor).attr("fill-opacity", this.hc ? 1 : 0.88)
                .attr("stroke", color).attr("stroke-width", 0.6).attr("stroke-opacity", 0.7);
            gl.append("text").attr("class", "lc-event-label").attr("x", p.x0 + 4).attr("y", y0 + h / 2).attr("dy", "0.34em")
                .style("font-size", fs + "px").attr("fill", textColor).text(txt);
            boxes.push({ x0: p.x0, y0, x1: p.x0 + p.w, y1: y0 + h });
        });
    }

    /**
     * Anotaciones (Pro): nota anclada al punto de la serie (primera medida; con leyenda, la de su marca). Punto
     * resaltado + caja semitransparente con línea guía corta. Cuatro posiciones candidatas alrededor del punto; la
     * primera que no pisa otra nota, una etiqueta de evento o el objetivo. Si ninguna cabe, solo el punto (el texto,
     * en el tooltip). Como mucho 60 cajas: con miles de filas no se paga el coste.
     */
    private drawAnnotations(L: Layout, yOf: (x: Series) => d3.ScaleLinear<number, number>, obstacles: Box[]): void {
        const s = this.settings.annotations;
        const fs = Number(s.fontSize);
        const hc = this.hc;
        const textColor = hc ? this.hcFg : (s.color ? String(s.color) : this.ink);
        const bg = hc ? this.hcBg : (s.background ? String(s.background) : this.bgColor);
        const op = hc ? 1 : Math.max(0, Math.min(1, Number(s.opacity) / 100));
        const g = this.canvas.append("g").attr("class", "lc-annotations").style("pointer-events", this.formatMode ? null : "none");
        const boxes = obstacles.slice();
        const maxW = Math.max(50, Math.min(180, L.plotW * 0.35));
        const xl = L.left, xr = L.left + L.plotW, yt = L.top, yb = L.top + L.plotH;
        const items: { ser: Series; k: number; t: string; x: number; y: number }[] = [];
        for (const d of this.drawn) {
            if (!d.s.notes) continue;
            const y = yOf(d.s);
            d.s.notes.forEach((t, k) => {
                const v = d.s.values[k];
                if (t && v !== null) items.push({ ser: d.s, k, t, x: this.x(this.model.keys[k].pos), y: y(v) });
            });
        }
        items.sort((a, b) => a.x - b.x);
        // Visual pequeño: solo el punto resaltado (las cajas taparían la línea); el texto, en el tooltip.
        let placed = L.plotH >= 150 && L.plotW >= 260 ? 0 : Infinity;
        const h = fs + 8;
        for (const it of items) {
            const ng = g.append("g").attr("class", "lc-note").attr("data-id", it.ser.id);
            const stroke = hc ? this.hcFg : it.ser.color;
            if (placed >= 60) { this.notePoint(ng, it, stroke, bg); continue; }
            let box: Box | null = null;
            let txt = "";
            for (const lim of [maxW, maxW * 0.55]) {
                txt = this.fit(it.t, fs, lim);
                if (!txt) break;
                const w = this.measure(txt, fs) + 10;
                const cands: [number, number][] = [[it.x + 8, it.y - 14 - h], [it.x - 8 - w, it.y - 14 - h], [it.x + 8, it.y + 14], [it.x - 8 - w, it.y + 14]];
                for (const [x0, y0] of cands) {
                    const b: Box = { x0, y0, x1: x0 + w, y1: y0 + h };
                    if (b.x0 < xl || b.x1 > xr || b.y0 < yt || b.y1 > yb || Visual.overlaps(b, boxes)) continue;
                    box = b; break;
                }
                if (box) break;
            }
            if (box) {
                const right = box.x0 > it.x, above = box.y1 < it.y;
                const ax = right ? box.x0 + 3 : box.x1 - 3, ay = above ? box.y1 : box.y0;
                ng.append("line").attr("x1", it.x).attr("y1", it.y).attr("x2", ax).attr("y2", ay).attr("stroke", stroke).attr("stroke-width", 1);
                ng.append("rect").attr("x", box.x0).attr("y", box.y0).attr("width", box.x1 - box.x0).attr("height", h).attr("rx", 3)
                    .attr("fill", bg).attr("fill-opacity", op).attr("stroke", stroke).attr("stroke-width", 0.8);
                ng.append("text").attr("class", "lc-note-text").attr("x", box.x0 + 5).attr("y", box.y0 + h / 2).attr("dy", "0.34em")
                    .style("font-size", fs + "px").attr("fill", textColor).text(txt);
                boxes.push(box);
                placed++;
            }
            this.notePoint(ng, it, stroke, bg);
        }
    }

    private notePoint(g: d3.Selection<SVGGElement, unknown, null, undefined>, it: { x: number; y: number }, stroke: string, bg: string): void {
        g.append("circle").attr("class", "lc-note-pt").attr("cx", it.x).attr("cy", it.y).attr("r", 4.5)
            .attr("fill", bg).attr("stroke", stroke).attr("stroke-width", 2.2);
    }

    // ── Etiquetas al final ───────────────────────────────────────────────────

    /**
     * Desvío del último valor contra su referencia (plan, o año anterior si no hay plan): "−9,1 % vs plan" o
     * "+120K vs PY". Signo siempre explícito, menos tipográfico, % con el locale del informe. Null sin referencia.
     */
    private varianceText(x: Series, k: number): { text: string; sign: number } | null {
        const ref = this.bandRef(x);
        if (!ref || k < 0) return null;
        const rv = ref.values[k], v = x.values[k];
        if (rv === null || v === null || !isFinite(rv) || !isFinite(v)) return null;
        const d = v - rv;
        let str: string;
        if (String(this.settings.endLabels.variance) === "pct") {
            if (rv === 0) return null;
            const pct = d / Math.abs(rv);
            try {
                str = new Intl.NumberFormat(this.host.locale || "en-US",
                    { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: "exceptZero" } as Intl.NumberFormatOptions).format(pct);
            } catch {
                str = (pct > 0 ? "+" : "") + (pct * 100).toFixed(1) + "%";
            }
        } else {
            const f = x.formats[k] ?? x.format;
            str = (d > 0 ? "+" : d < 0 ? "-" : "") + this.fmtShort(Math.abs(d), f, Math.abs(d));
        }
        str = str.replace("-", "−");
        const text = ref.kind === "plan" ? this.tf("UI_VsPlan", "{0} vs plan", str) : this.tf("UI_VsPY", "{0} vs PY", str);
        return { text, sign: Math.sign(d) };
    }

    /** head = el nombre (lo que se acorta primero); rest = valor y fecha; vari = el desvío (Pro). */
    private labelCandidates(): { s: Series; text: string; v: number; head: string; rest: string; vari: string; sign: number }[] {
        const m = this.model, s = this.settings;
        const content = String(s.endLabels.content);
        const lastPos = m.keys[m.keys.length - 1]?.pos;
        const varOn = String(s.endLabels.variance) !== "off" && this.previewOf("variance label");
        const out = m.series.filter(x => x.lastIndex >= 0).map(x => {
            const v = x.values[x.lastIndex];
            const val = this.fmtShort(v, x.formats[x.lastIndex] ?? x.format);
            const head = content === "value" ? "" : x.name;
            let rest = content === "value" ? val : content === "name" ? "" : "  " + val;
            // Si su último valor es anterior al final del eje, se dice cuándo.
            if (content !== "name" && m.keys[x.lastIndex].pos < lastPos) rest += " · " + this.keyLabel(x.lastIndex);
            const vt = varOn ? this.varianceText(x, x.lastIndex) : null;
            const vari = vt ? vt.text : "";
            const text = head + rest + (vari ? " · " + vari : "");
            return { s: x, text, v, head, rest, vari, sign: vt ? vt.sign : 0 };
        });
        out.sort((a, b) => b.v - a.v);
        return out.slice(0, Math.max(1, Number(s.endLabels.maxLabels)));
    }

    private drawEndLabels(L: Layout, yOf: (x: Series) => d3.ScaleLinear<number, number>): void {
        const s = this.settings;
        const fs = Number(s.endLabels.fontSize);
        const gap = fs * 1.25;
        const items = this.labelCandidates().map(c => ({ ...c, want: yOf(c.s)(c.v), y: 0 }));
        items.sort((a, b) => a.want - b.want);
        // Anticolisión: de arriba abajo empujando, y si se sale por abajo, de abajo arriba.
        const top = L.top + fs / 2, bottom = L.top + L.plotH - fs / 2;
        let prev = -Infinity;
        for (const it of items) { it.y = Math.max(it.want, prev + gap, top); prev = it.y; }
        let next = Infinity;
        for (let i = items.length - 1; i >= 0; i--) { items[i].y = Math.min(items[i].y, next - gap, bottom); next = items[i].y; }
        const g = this.canvas.append("g").attr("class", "lc-endlabels");
        const x0 = L.left + L.plotW;
        const tx = x0 + 12;
        const maxW = L.labelW - 14;
        for (const it of items) {
            const px = this.x(this.model.keys[it.s.lastIndex].pos);
            const color = this.hc ? this.hcFg : (s.endLabels.seriesColor ? this.readable(it.s.color, String(s.endLabels.color)) : String(s.endLabels.color));
            const lg = g.append("g").attr("class", "lc-endlabel").attr("data-id", it.s.id);
            // Línea guía: del último punto a la etiqueta, si está desplazada o el punto no llega al final.
            if (Math.abs(it.y - it.want) > 1.5 || px < x0 - 2) {
                lg.append("polyline").attr("points", `${px},${it.want} ${x0 + 3},${it.want} ${tx - 2},${it.y}`).attr("fill", "none")
                    .attr("stroke", this.hc ? this.hcFg : it.s.color).attr("stroke-width", 0.8).attr("opacity", 0.6)
                    .attr("stroke-dasharray", px < x0 - 2 ? "2,2" : null);
            }
            const t = lg.append("text").attr("x", tx).attr("y", it.y).attr("dy", "0.32em").style("font-size", fs + "px").attr("fill", color)
                .style("font-weight", "600");
            if (!it.vari) {
                t.text(this.fit(it.text, fs, maxW));
            } else {
                // Lo último en acortarse es el desvío: primero el nombre, luego todo.
                const tail = it.rest + " · ";
                let head = it.head;
                if (this.measure(it.text, fs) > maxW) {
                    const room = maxW - this.measure(tail + it.vari, fs);
                    head = head && room > this.measure("…", fs) + 8 ? this.fit(head, fs, room) : "";
                }
                const main = (head + tail).replace(/^ +/, "");
                if (this.measure(main + it.vari, fs) > maxW + 1) {
                    t.text(this.fit(it.text, fs, maxW));
                } else {
                    t.append("tspan").text(main);
                    const up = it.sign > 0, down = it.sign < 0;
                    const vc = this.hc ? this.hcFg : up ? this.readable(String(s.references.aboveColor), color)
                        : down ? this.readable(String(s.references.belowColor), color) : color;
                    t.append("tspan").attr("class", "lc-variance").attr("fill", vc).text(it.vari);
                }
            }
            t.append("title").text(it.text);
        }
    }

    /** El color de la serie si se lee sobre el fondo del informe (contraste ≥ 3:1); si no, el color de texto. */
    private readable(color: string, fallback: string): string {
        return contrast(color, this.bgColor) >= 3 ? color : fallback;
    }

    private drawSparkValue(L: Layout): void {
        const s0 = this.model.series[0];
        if (!s0 || s0.lastIndex < 0 || L.right < 20) return;
        const fs = Math.max(10, Math.min(this.multi ? 14 : 22, L.H * 0.32));
        const v = s0.values[s0.lastIndex];
        this.canvas.append("text").attr("class", "lc-endlabel").attr("x", L.W - 4).attr("y", L.H / 2).attr("dy", "0.32em")
            .attr("text-anchor", "end").style("font-size", fs + "px").style("font-weight", "600")
            .attr("fill", this.hc ? this.hcFg : this.readable(s0.color, String(this.settings.endLabels.color))).text(this.fmtShort(v, s0.formats[s0.lastIndex] ?? s0.format));
    }

    // ── Leyenda ──────────────────────────────────────────────────────────────

    private legendItems(): LegendItem[] {
        const m = this.model, s = this.settings;
        const fs = Number(s.legend.fontSize);
        // Todas las series de todos los paneles (una leyenda para todo el visual).
        const items: LegendItem[] = this.allSeries.map((x, i) => ({ label: x.name, color: x.color, kind: "series" as const,
            dash: this.hc ? HC_DASH[i % HC_DASH.length] : this.seriesDash(x, 2), series: x, w: 0, idx: i }));
        if (s.references.show && s.references.legend) {
            const kinds = REF_KINDS_ORDER.filter(k => this.models.some(pm => pm.refKinds.indexOf(k) >= 0));
            void m;
            for (const k of kinds) items.push({ label: this.refName(k), color: this.refColor(k, null),
                kind: "ref", dash: REF_DASH[k], ref: k, w: 0, idx: -1 });
        }
        for (const it of items) it.w = 22 + Math.min(this.measure(it.label, fs), 160) + 12;
        return items;
    }

    private wrapLegend(items: LegendItem[], maxW: number, fs: number): LegendItem[][] {
        const rows: LegendItem[][] = [[]];
        let w = 0;
        for (const it of items) {
            if (w + it.w > maxW && rows[rows.length - 1].length) { rows.push([]); w = 0; }
            rows[rows.length - 1].push(it);
            w += it.w;
        }
        void fs;
        return rows;
    }

    private drawLegend(L: Layout): void {
        const s = this.settings;
        const fs = Number(s.legend.fontSize);
        const all = this.legendItems();
        const shown = L.legendRows.reduce((a, r) => a + r.length, 0);
        const g = this.svg.append("g").attr("class", "lc-legend").attr("role", "list");
        const y0 = s.legend.position === "top" ? 4 : L.H - L.noticeH - L.legendH + 2;
        const color = this.hc ? this.hcFg : String(s.legend.color);
        L.legendRows.forEach((row, ri) => {
            let x = 6;
            const cy = y0 + ri * (fs + 8) + fs / 2 + 4;
            row.forEach((it, ii) => {
                const last = ri === L.legendRows.length - 1 && ii === row.length - 1 && shown < all.length;
                const ig = g.append("g").attr("class", "lc-legend-item").attr("role", "listitem")
                    .attr("data-id", it.series ? it.series.id : "ref:" + it.ref);
                ig.append("line").attr("x1", x).attr("x2", x + 16).attr("y1", cy).attr("y2", cy).attr("stroke", it.color)
                    .attr("stroke-width", it.kind === "ref" ? 1.5 : 2.5).attr("stroke-dasharray", it.dash || null)
                    .attr("stroke-linecap", it.dash && it.dash.indexOf("0.1,") === 0 ? "round" : null);
                const extra = last ? "  " + this.tf("UI_More", "+{0} more", String(all.length - shown)) : "";
                const lbl = this.fit(it.label, fs, 160);
                ig.append("text").attr("x", x + 21).attr("y", cy).attr("dy", "0.32em").style("font-size", fs + "px").attr("fill", color)
                    .text(lbl + extra).append("title").text(it.label);
                if (it.series) {
                    const ser = it.series;
                    ig.style("cursor", "pointer")
                        .on("mouseenter", () => { this.hoverId = ser.id; this.paintState(); })
                        .on("mouseleave", () => { this.hoverId = null; this.paintState(); })
                        .on("click", (e: MouseEvent) => {
                            e.stopPropagation();
                            if (!this.canInteract) return;
                            if (this.model.legendCol) this.toggle(this.seriesKey(ser), this.seriesId(ser), e.ctrlKey || e.metaKey);
                        });
                }
                x += it.w;
            });
        });
    }

    private drawNotices(L: Layout): void {
        const notes = this.notices();
        const g = this.svg.append("g").attr("class", "lc-notice").attr("role", "status");
        notes.forEach((n, i) => {
            const t = g.append("text").attr("x", 6).attr("y", L.H - L.noticeH + 12 + i * 13).style("font-size", "10px")
                .attr("fill", this.hc ? this.hcFg : (i === 0 && this.model.segment ? (this.look?.down ?? "#A4262C") : this.axisColor("xAxis")))
                .text("⚠ " + this.fit(n, 10, L.W - 20));
            t.append("title").text(n);
        });
    }

    private message(W: number, H: number, text: string): void {
        const m = this.model;
        this.svg.append("text").attr("class", "lc-msg-text").attr("x", W / 2).attr("y", H / 2).attr("text-anchor", "middle")
            .style("font-size", "12px").attr("fill", this.axisColor("xAxis")).text(this.fit(text, 12, W - 16));
        if (m && m.segment) {
            this.svg.append("text").attr("x", W / 2).attr("y", H / 2 + 18).attr("text-anchor", "middle").style("font-size", "10px")
                .attr("fill", this.hc ? this.hcFg : "#A4262C").text(this.fit(this.notices()[0], 10, W - 16));
        }
    }

    // ── Interacción ──────────────────────────────────────────────────────────

    private drawOverlay(L: Layout): void {
        const r = this.canvas.append("rect").attr("class", "lc-overlay").attr("x", L.left).attr("y", L.top)
            .attr("width", L.plotW).attr("height", L.plotH).attr("fill", "transparent")
            .style("pointer-events", this.formatMode ? "none" : "all");
        // Cada panel tiene su capa: el puntero activa su panel antes de nada.
        const p = this.curPanel;
        r.on("pointermove", (e: PointerEvent) => { this.activate(p); this.onMove(e); })
            .on("pointerleave", () => { this.activate(p); this.hoverId = null; this.drawCross(-1); this.hideTip(); this.paintState(); })
            .on("click", (e: MouseEvent) => { this.activate(p); this.onClick(e); })
            .on("contextmenu", (e: MouseEvent) => { this.activate(p); this.onContext(e); });
        const node = this.svg.node() as SVGSVGElement;
        node.setAttribute("tabindex", L.mode === "full" || this.multi ? "0" : "-1");
        node.setAttribute("role", "application");
        node.setAttribute("aria-roledescription", this.t("UI_AriaChart", "line chart"));
        node.setAttribute("aria-label", this.tf("UI_AriaSummary", "{0} series over {1} points. Arrow keys move between points and series, Enter selects.",
            String(this.model.series.length), String(this.model.keys.length)));
    }

    /** Clave del eje más cercana a una x de pantalla. */
    private nearestKey(px: number): number {
        const m = this.model;
        const K = m.keys.length;
        let lo = 0, hi = K - 1;
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (this.x(m.keys[mid].pos) < px) lo = mid; else hi = mid; }
        return Math.abs(this.x(m.keys[lo].pos) - px) <= Math.abs(this.x(m.keys[hi].pos) - px) ? lo : hi;
    }

    /** y de la serie bajo una x (interpolada entre sus puntos con valor vecinos del mismo tramo). */
    private yAt(d: Drawn, px: number): number | null {
        for (const seg of d.segs) {
            if (!seg.length) continue;
            const a0 = this.x(seg[0].pos), a1 = this.x(seg[seg.length - 1].pos);
            if (px < a0 - 3 || px > a1 + 3) continue;
            if (seg.length === 1) return d.y(seg[0].v);
            let i = 1;
            while (i < seg.length - 1 && this.x(seg[i].pos) < px) i++;
            const p = seg[i - 1], q = seg[i];
            const xp = this.x(p.pos), xq = this.x(q.pos);
            const t = xq === xp ? 0 : Math.max(0, Math.min(1, (px - xp) / (xq - xp)));
            return d.y(p.v + (q.v - p.v) * t);
        }
        return null;
    }

    private hit(px: number, py: number): { k: number; d: Drawn | null; onPoint: boolean } {
        const k = this.nearestKey(px);
        let best: Drawn | null = null, bestDist = Infinity;
        for (const d of this.drawn) {
            const y = this.yAt(d, px);
            if (y === null) continue;
            const dist = Math.abs(y - py);
            if (dist < bestDist) { bestDist = dist; best = d; }
        }
        const near = best && bestDist <= 12 ? best : null;
        let onPoint = false;
        if (near) {
            const v = near.s.values[k];
            if (v !== null) onPoint = Math.hypot(this.x(this.model.keys[k].pos) - px, near.y(v) - py) <= 10;
        }
        return { k, d: near, onPoint };
    }

    /** Coordenadas del puntero en el sistema del panel activo. */
    private localXY(e: MouseEvent): [number, number] {
        const r = (this.svg.node() as SVGSVGElement).getBoundingClientRect();
        const p = this.curPanel;
        return [e.clientX - r.left - (p ? p.ox : 0), e.clientY - r.top - (p ? p.oy : 0)];
    }

    private onMove(e: PointerEvent): void {
        if (!this.model || !this.L) return;
        const [px, py] = this.localXY(e);
        const h = this.hit(px, py);
        const id = h.d ? h.d.s.id : null;
        if (id !== this.hoverId) { this.hoverId = id; this.paintState(); }
        this.drawCross(h.k);
        this.showTip(h.k, h.d ? h.d.s : null, px, py);
    }

    private onClick(e: MouseEvent): void {
        e.stopPropagation();
        if (!this.canInteract || !this.model) return;
        const [px, py] = this.localXY(e);
        const h = this.hit(px, py);
        const multi = e.ctrlKey || e.metaKey;
        const m = this.model;
        if (h.d && (h.onPoint || !m.legendCol)) {
            const id = this.pointId(h.k, h.d.s);
            if (id) this.toggle(this.pointKey(h.k, h.d.s), id, multi);
        } else if (h.d && m.legendCol) {
            this.toggle(this.seriesKey(h.d.s), this.seriesId(h.d.s), multi);
        } else {
            this.selKeys.clear();
            this.selectionManager.clear().then(() => this.paintState());
            this.paintState();
        }
    }

    private onContext(e: MouseEvent): void {
        e.preventDefault();
        e.stopPropagation();
        if (!this.canInteract || !this.model) return;
        const [px, py] = this.localXY(e);
        const h = this.hit(px, py);
        const id = h.d ? (h.onPoint || !this.model.legendCol ? this.pointId(h.k, h.d.s) : this.seriesId(h.d.s)) : null;
        this.selectionManager.showContextMenu(id ?? ({} as ISelectionId), { x: e.clientX, y: e.clientY });
    }

    private drawCross(k: number): void {
        const g = this.canvas.select<SVGGElement>(".lc-cross");
        g.selectAll("*").remove();
        if (k < 0 || !this.model || !this.L || this.L.mode === "spark") return;
        const L = this.L, m = this.model;
        const x = this.x(m.keys[k].pos);
        const color = this.hc ? this.hcFg : this.axisColor("xAxis");
        g.append("line").attr("x1", x).attr("x2", x).attr("y1", L.top).attr("y2", L.top + L.plotH).attr("stroke", color)
            .attr("stroke-width", 1).attr("stroke-dasharray", "3,3").style("pointer-events", "none");
        this.drawn.forEach((d, i) => {
            const v = d.s.values[k];
            if (v === null) return;
            const focused = this.hasFocus && i === this.focusSeries;
            g.append("circle").attr("cx", x).attr("cy", d.y(v)).attr("r", focused ? 5.5 : 3.5)
                .attr("fill", this.bgColor).attr("stroke", this.hc ? (focused ? this.hcSel : this.hcFg) : d.s.color)
                .attr("stroke-width", focused ? 3 : 2).style("pointer-events", "none");
        });
    }

    private tipItems(k: number, focus: Series | null): VisualTooltipDataItem[] {
        const m = this.model;
        const items: VisualTooltipDataItem[] = [];
        if (this.multi && m.smCol) items.push({ displayName: m.smCol.source.displayName, value: m.smShown || this.t("UI_Blank", "(Blank)") });
        items.push({ displayName: m.axisName, value: this.keyLabel(k) });
        // El texto completo del evento (la etiqueta puede ir recortada o sin pintar por anticolisión).
        if (this.eventsOn() && m.events[k]) items.push({ displayName: m.eventsField.name, value: m.events[k] });
        const notesOn = this.notesOn();
        const list = m.series.filter(s => s.rows[k] >= 0 || s.values[k] !== null).slice();
        list.sort((a, b) => (a === focus ? -1 : b === focus ? 1 : (b.values[k] ?? -Infinity) - (a.values[k] ?? -Infinity)));
        for (const s of list) {
            if (items.length >= 24) break;
            if (s.values[k] !== null) items.push({ displayName: s.name, value: this.fmtFull(s.values[k], s.formats[k] ?? s.format), color: s.color });
            for (const r of s.refs) {
                if (r.values[k] === null) continue;
                const nm = m.legendCol ? r.name + " · " + (s.legend ?? "") : r.name;
                items.push({ displayName: nm, value: this.fmtFull(r.values[k], r.formats[k] ?? r.format), color: this.hc ? this.hcFg : "#8A8886" });
            }
            if (notesOn && s.notes?.[k]) {
                items.push({ displayName: m.legendCol ? m.notesField.name + " · " + (s.legend ?? "") : m.notesField.name, value: s.notes[k] });
            }
        }
        const tg = m.target;
        if (tg && this.settings.targetLine.show && tg.values[k] !== null) {
            items.push({ displayName: tg.name, value: this.fmtFull(tg.values[k], tg.formats[k] ?? tg.format), color: this.targetColor() });
        }
        const rowOf = (focus ?? list[0])?.rows[k] ?? -1;
        if (rowOf >= 0) for (const c of m.tooltipCols) {
            const v = c.values[rowOf];
            items.push({ displayName: c.name, value: typeof v === "number" ? this.fmtFull(v, c.format) : String(v ?? "") });
        }
        return items;
    }

    private showTip(k: number, focus: Series | null, px: number, py: number): void {
        const ts: any = this.host.tooltipService;
        if (!ts || (ts.enabled && !ts.enabled())) return;
        const ids: ISelectionId[] = [];
        const s = focus ?? this.drawn[0]?.s;
        if (s) { const id = this.pointId(k, s); if (id) ids.push(id); }
        const p = this.curPanel;
        ts.show({ dataItems: this.tipItems(k, focus), identities: ids, coordinates: [px + (p ? p.ox : 0), py + (p ? p.oy : 0)], isTouchEvent: false });
    }

    private hideTip(): void {
        try { this.host.tooltipService?.hide({ immediately: true, isTouchEvent: false }); } catch { /* nada */ }
    }

    // ── Selección ────────────────────────────────────────────────────────────

    private seriesKey(s: Series): string { return "s␟" + (s.legend ?? ""); }
    /** Clave de un punto: eje × leyenda, y el panel cuando se dibujan varios. */
    private pointKey(k: number, s: Series, m: Model = this.model): string {
        return "p␟" + m.keys[k].key + "␟" + (m.legendCol ? (s.legend ?? "") : "") + (this.multi ? "␟" + (m.smShown ?? "") : "");
    }

    /** Serie = el valor de leyenda (filtra por esa columna, en todos los paneles). */
    private seriesId(s: Series, m: Model = this.model): ISelectionId {
        const row = s.rows.find(r => r >= 0);
        return this.host.createSelectionIdBuilder().withCategory(m.legendCol, row).createSelectionId();
    }

    /**
     * Punto = eje × leyenda (× panel con small multiples dibujados). Sin leyenda, solo el eje: la identidad del valor
     * del eje cubre TODAS las filas de esa fecha (regla filtros-todas-las-filas), también las de otros paneles cuando
     * solo se ve uno.
     */
    private pointId(k: number, s: Series, m: Model = this.model): ISelectionId | null {
        const row = s.rows[k];
        if (row < 0) return null;
        let b = this.host.createSelectionIdBuilder();
        for (const c of m.axisCols) b = b.withCategory(c, row);
        if (m.legendCol) b = b.withCategory(m.legendCol, row);
        if (this.multi && m.smCol) b = b.withCategory(m.smCol, row);
        return b.createSelectionId();
    }

    /** select(lista) no alterna: la selección se calcula aquí y se pasa entera (o clear si queda vacía). */
    private toggle(key: string, id: ISelectionId, multi: boolean): void {
        if (multi) { if (this.selKeys.has(key)) this.selKeys.delete(key); else this.selKeys.set(key, id); }
        else if (this.selKeys.size === 1 && this.selKeys.has(key)) this.selKeys.clear();
        else { this.selKeys.clear(); this.selKeys.set(key, id); }
        if (this.selKeys.size) this.selectionManager.select(Array.from(this.selKeys.values()), false);
        else this.selectionManager.clear();
        this.paintState();
    }

    /** Marcadores / selección externa: se casa por equals (getKey no coincide entre clic y marcador). Solo deriva. */
    private restoreSelection(ids: ISelectionId[]): void {
        if (!this.models.length) { this.pendingRestore = ids; return; }
        this.pendingRestore = null;
        this.selKeys.clear();
        if (!ids.length) return;
        const eq = (a: ISelectionId, b: ISelectionId) => { try { return a.equals(b) || b.equals(a); } catch { return false; } };
        const left = ids.slice();
        for (const m of this.models) {
            if (m.legendCol) for (const s of m.series) {
                const id = this.seriesId(s, m);
                if (left.some(x => eq(x, id))) this.selKeys.set(this.seriesKey(s), id);
            }
        }
        if (this.selKeys.size === ids.length) return;
        for (const m of this.models) {
            const firsts = m.legendCol ? m.series.filter((s, i, a) => a.findIndex(o => o.legend === s.legend) === i) : m.series.slice(0, 1);
            for (const s of firsts) for (let k = 0; k < m.keys.length; k++) {
                const id = this.pointId(k, s, m);
                if (id && left.some(x => eq(x, id))) this.selKeys.set(this.pointKey(k, s, m), id);
            }
        }
    }

    private pruneSelection(): void {
        if (!this.selKeys.size) return;
        const valid = new Set<string>();
        for (const m of this.models) for (const s of m.series) {
            valid.add(this.seriesKey(s));
            for (let k = 0; k < m.keys.length; k++) if (s.rows[k] >= 0) valid.add(this.pointKey(k, s, m));
        }
        for (const k of Array.from(this.selKeys.keys())) if (!valid.has(k)) this.selKeys.delete(k);
    }

    /** Opacidades y anillos en TODOS los paneles; deja activo el que lo estaba. */
    private paintState(): void {
        if (!this.panels.length) return;
        const keep = this.curPanel;
        for (const p of this.panels) { this.activate(p); this.paintPanel(); }
        this.activate(keep);
    }

    private paintPanel(): void {
        const m = this.model;
        if (!m || !this.L) return;
        const selSeries = new Set<string>();
        const selPoints: [number, Series][] = [];
        for (const key of this.selKeys.keys()) {
            const parts = key.split("␟");
            if (parts[0] === "s") selSeries.add(parts[1]);
        }
        for (const d of this.drawn) for (let k = 0; k < m.keys.length; k++) {
            if (d.s.values[k] !== null && this.selKeys.has(this.pointKey(k, d.s))) selPoints.push([k, d.s]);
        }
        const anySeries = selSeries.size > 0;
        const anyPoint = selPoints.length > 0;
        this.canvas.selectAll<SVGGElement, unknown>(".lc-series, .lc-ref, .lc-band, .lc-endlabel, .lc-note").each((_d, i, nodes) => {
            const el = nodes[i];
            const id = el.getAttribute("data-id");
            const ser = m.series.find(s => s.id === id);
            let op = 1;
            if (ser) {
                if (anySeries && !selSeries.has(ser.legend ?? "")) op = 0.3;
                if (anyPoint && !anySeries && !selPoints.some(p => p[1].legend === ser.legend)) op = 0.45;
                if (this.hoverId && this.hoverId !== id) op = Math.min(op, 0.2);
            }
            el.setAttribute("opacity", String(op));
        });
        const g = this.canvas.select<SVGGElement>(".lc-sel");
        g.selectAll("*").remove();
        const ring = this.hc ? this.hcSel : this.ink;
        for (const [k, s] of selPoints) {
            const d = this.drawn.find(x => x.s === s);
            g.append("circle").attr("cx", this.x(m.keys[k].pos)).attr("cy", d.y(s.values[k])).attr("r", 5.5)
                .attr("fill", s.color).attr("stroke", ring).attr("stroke-width", 2).style("pointer-events", "none");
        }
    }

    // ── Teclado: una parada de Tab, flechas entre puntos y series, Enter selecciona ──

    private keyboardSeries(k: number): Drawn[] {
        return this.drawn.filter(d => d.s.values[k] !== null).sort((a, b) => a.y(a.s.values[k]) - b.y(b.s.values[k]));
    }

    private onFocus(): void {
        const m = this.model;
        if (!m || !this.L || !m.keys.length) return;
        if (this.focusKey < 0) this.focusKey = m.keys.length - 1;
        this.announce();
    }

    private announce(): void {
        const m = this.model;
        const k = this.focusKey;
        const list = this.keyboardSeries(k);
        if (!list.length) {
            this.drawCross(k);
            this.live.textContent = this.keyLabel(k) + (this.eventsOn() && m.events[k] ? ". " + m.eventsField.name + ": " + m.events[k] : "");
            return;
        }
        this.focusSeries = Math.max(0, Math.min(this.focusSeries, list.length - 1));
        const d = list[this.focusSeries];
        const idx = this.drawn.indexOf(d);
        const save = this.focusSeries;
        this.focusSeries = idx;
        this.drawCross(k);
        this.focusSeries = save;
        const v = d.s.values[k];
        const x = this.x(m.keys[k].pos), y = d.y(v);
        this.showTip(k, d.s, x, y);
        const panel = this.multi ? (m.smShown || this.t("UI_Blank", "(Blank)")) + ", " : "";
        let extra = "";
        if (this.eventsOn() && m.events[k]) extra += ". " + m.eventsField.name + ": " + m.events[k];
        if (this.notesOn() && d.s.notes?.[k]) extra += ". " + m.notesField.name + ": " + d.s.notes[k];
        this.live.textContent = panel + d.s.name + ", " + this.keyLabel(k) + ": " + this.fmtFull(v, d.s.formats[k] ?? d.s.format) + extra;
    }

    private onKey(e: KeyboardEvent): void {
        const m = this.model;
        if (!m || !this.L || !m.keys.length) return;
        const K = m.keys.length;
        let handled = true;
        // Small multiples: Mayús + flechas izquierda/derecha cambian de panel (mismo punto del eje).
        if (this.multi && e.shiftKey && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
            const i = this.panels.indexOf(this.curPanel);
            const j = Math.max(0, Math.min(this.panels.length - 1, i + (e.key === "ArrowRight" ? 1 : -1)));
            if (j !== i) { this.drawCross(-1); this.activate(this.panels[j]); }
            e.preventDefault(); e.stopPropagation(); this.announce();
            return;
        }
        switch (e.key) {
            case "ArrowRight": this.focusKey = Math.min(K - 1, this.focusKey + 1); break;
            case "ArrowLeft": this.focusKey = Math.max(0, this.focusKey - 1); break;
            case "Home": this.focusKey = 0; break;
            case "End": this.focusKey = K - 1; break;
            case "PageUp": this.focusKey = Math.max(0, this.focusKey - Math.max(1, Math.round(K / 10))); break;
            case "PageDown": this.focusKey = Math.min(K - 1, this.focusKey + Math.max(1, Math.round(K / 10))); break;
            case "ArrowUp": this.focusSeries = Math.max(0, this.focusSeries - 1); break;
            case "ArrowDown": this.focusSeries = this.focusSeries + 1; break;
            case "Enter": case " ": {
                const d = this.keyboardSeries(this.focusKey)[this.focusSeries];
                if (d && this.canInteract) { const id = this.pointId(this.focusKey, d.s); if (id) this.toggle(this.pointKey(this.focusKey, d.s), id, e.ctrlKey || e.metaKey); }
                break;
            }
            case "Escape":
                if (this.canInteract) { this.selKeys.clear(); this.selectionManager.clear(); this.paintState(); }
                break;
            case "ContextMenu": case "F10": {
                if (e.key === "F10" && !e.shiftKey) { handled = false; break; }
                const d = this.keyboardSeries(this.focusKey)[this.focusSeries];
                const r = (this.svg.node() as SVGSVGElement).getBoundingClientRect();
                if (d && this.canInteract) {
                    this.selectionManager.showContextMenu(this.pointId(this.focusKey, d.s) ?? ({} as ISelectionId),
                        { x: r.left + (this.curPanel?.ox ?? 0) + this.x(m.keys[this.focusKey].pos), y: r.top + (this.curPanel?.oy ?? 0) + d.y(d.s.values[this.focusKey]) });
                }
                break;
            }
            default: handled = false;
        }
        if (handled) { e.preventDefault(); e.stopPropagation(); this.announce(); }
    }

    // ── Landing, asistente ───────────────────────────────────────────────────

    private landingIcon(size: number): SVGSVGElement {
        const NS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(NS, "svg") as SVGSVGElement;
        svg.setAttribute("width", String(size)); svg.setAttribute("height", String(size)); svg.setAttribute("viewBox", "0 0 44 44");
        svg.setAttribute("aria-hidden", "true"); svg.setAttribute("class", "lc-l-icon");
        const hc = this.hc;
        const rect = document.createElementNS(NS, "rect");
        rect.setAttribute("width", "44"); rect.setAttribute("height", "44"); rect.setAttribute("rx", "9");
        rect.setAttribute("fill", hc ? this.hcBg : "#1F4E8C");
        if (hc) { rect.setAttribute("stroke", this.hcFg); rect.setAttribute("stroke-width", "1.5"); }
        svg.appendChild(rect);
        const mk = (pts: string, color: string, dash?: string) => {
            const p = document.createElementNS(NS, "polyline");
            p.setAttribute("points", pts); p.setAttribute("fill", "none"); p.setAttribute("stroke", color);
            p.setAttribute("stroke-width", "3"); p.setAttribute("stroke-linecap", "round"); p.setAttribute("stroke-linejoin", "round");
            if (dash) { p.setAttribute("stroke-dasharray", dash); p.setAttribute("stroke-width", "2"); }
            svg.appendChild(p);
        };
        mk("7,30 15,24 22,27 30,15 37,12", hc ? this.hcFg : "#BFD7F2", "3,3");
        mk("7,34 15,28 21,31 29,20 37,18", hc ? this.hcFg : "#3FBF7F");
        return svg;
    }

    private renderLanding(W: number, H: number): void {
        const size = (W >= 600 && H >= 340) ? "l" : (W >= 360 && H >= 220) ? "m" : "s";
        const hc = this.hc;
        const fg = hc ? this.hcFg : "";
        const el = document.createElement("div");
        el.className = "lc-landing lc-landing-" + size;
        if (hc) el.style.background = this.hcBg;
        const mk = (tag: string, cls?: string, text?: string): HTMLElement => {
            const n = document.createElement(tag);
            if (cls) n.className = cls;
            if (text !== undefined) n.textContent = text;
            if (fg) n.style.color = fg;
            return n;
        };
        const axis = this.t("Role_Axis", "Axis"), val = this.t("Role_Values", "Values"), leg = this.t("Role_Legend", "Legend");
        const head = mk("div", "lc-l-head");
        head.appendChild(this.landingIcon(size === "l" ? 44 : size === "m" ? 34 : 26));
        const titles = mk("div");
        titles.appendChild(mk("div", "lc-l-title", "Line Chart by TCViz"));
        if (size !== "s") titles.appendChild(mk("div", "lc-l-tag", size === "l"
            ? this.t("Landing_Tagline", "Time series the honest way: real dates, visible gaps and the last value at the end of every line.")
            : this.t("Landing_TaglineShort", "Real dates, visible gaps, last value.")));
        head.appendChild(titles);
        el.appendChild(head);
        const link = (txt: string, url: string, cls: string): HTMLElement => {
            const a = mk("a", cls) as HTMLAnchorElement;
            a.href = url; a.tabIndex = 0; a.textContent = txt;
            if (hc) { a.style.background = "transparent"; a.style.borderColor = fg; }
            const open = (e: Event) => { e.preventDefault(); e.stopPropagation(); if (this.canInteract) this.host.launchUrl(url); };
            a.addEventListener("click", open);
            a.addEventListener("keydown", (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") open(e); });
            return a;
        };
        const links: [string, string, string][] = [
            [this.t("Landing_Guide", "Guide"), this.t("Landing_GuideSub", "support page"), URL_GUIDE],
            [this.t("Landing_Product", "Product page"), "tcviz.com", URL_PRODUCT],
        ];
        if (size === "s") {
            el.appendChild(mk("p", "lc-l-do", this.tf("Landing_Small", "Add {0} and {1}.", axis, val)));
            const row = mk("div", "lc-l-inline");
            row.appendChild(link(links[0][0], links[0][2], "lc-l-a"));
            el.appendChild(row);
            this.root.appendChild(el);
            return;
        }
        const big = size === "l";
        const steps = mk("ol", "lc-l-steps");
        const step = (n: number, well: string, txt: string) => {
            const li = mk("li");
            const num = mk("b", "lc-l-n", String(n));
            if (hc) { num.style.background = fg; num.style.color = this.hcBg; }
            li.appendChild(num);
            const sp = mk("span");
            sp.appendChild(mk("strong", "lc-l-well", well));
            sp.appendChild(document.createTextNode(" · " + txt));
            li.appendChild(sp);
            steps.appendChild(li);
        };
        step(1, axis, big ? this.t("Landing_Step1", "a date column (or a date hierarchy, or categories)") : this.t("Landing_Step1Short", "a date column"));
        step(2, val, big ? this.t("Landing_Step2", "one or more measures; Secondary values go on a right axis") : this.t("Landing_Step2Short", "one or more measures"));
        step(3, leg, big ? this.t("Landing_Step3", "optional: one line per brand, region or team. Plan and Prior year as grey references") : this.t("Landing_Step3Short", "optional: one line per item"));
        if (big) {
            const cols = mk("div", "lc-l-cols");
            const c1 = mk("div");
            c1.appendChild(mk("div", "lc-l-lbl", this.t("Landing_Start", "Start in 3 steps")));
            c1.appendChild(steps);
            const c2 = mk("div");
            c2.appendChild(mk("div", "lc-l-lbl", this.t("Landing_Help", "Help")));
            const list = mk("div", "lc-l-links");
            for (const [txt, sub, url] of links) {
                const a = link(txt, url, "lc-l-card");
                a.appendChild(mk("small", "lc-l-sub", sub));
                list.appendChild(a);
            }
            c2.appendChild(list);
            cols.appendChild(c1); cols.appendChild(c2);
            el.appendChild(cols);
        } else {
            el.appendChild(steps);
            const row = mk("div", "lc-l-inline");
            for (const l of links) row.appendChild(link(l[1] === "tcviz.com" ? "tcviz.com" : l[0], l[2], "lc-l-a"));
            el.appendChild(row);
        }
        this.root.appendChild(el);
    }

    /**
     * Asistente, solo editando y con sitio: (1) los campos, (2) el estilo. No toca los pozos. persistProperties solo
     * desde un clic. ✕ o Terminar lo cierran (style.guide = false); se reabre en Formato → Style template.
     */
    private renderGuide(W: number, H: number): void {
        if (!this.guideEl) {
            this.guideEl = document.createElement("div");
            this.guideEl.className = "lc-guide";
            this.root.appendChild(this.guideEl);
        }
        const el = this.guideEl;
        while (el.firstChild) el.removeChild(el.firstChild);
        el.style.display = "none";
        const on = this.settings.style?.guide !== false;
        if (!this.editing || this.formatMode || !on || !this.canInteract || !this.model || W < 420 || H < 260) return;
        const m = this.model;
        const hc = this.hc;
        const azul = hc ? this.hcSel : "#2B6CB0";
        const fg = hc ? this.hcFg : "#252423";
        const muted = hc ? fg : "#605E5C";
        el.style.display = "block";
        el.style.background = hc ? this.hcBg : "#FFFFFF";
        el.style.borderColor = azul;
        el.style.color = fg;
        el.setAttribute("role", "dialog");
        el.setAttribute("aria-label", this.t("Guide_Title", "Setup guide"));
        el.onclick = e => e.stopPropagation();
        el.onkeydown = e => e.stopPropagation();
        const mk = (tag: string, cls: string, text?: string): HTMLElement => {
            const n = document.createElement(tag); n.className = cls; if (text !== undefined) n.textContent = text; return n;
        };
        const boton = (texto: string, principal: boolean, accion: () => void): HTMLButtonElement => {
            const b = mk("button", "lc-g-btn", texto) as HTMLButtonElement;
            b.type = "button";
            b.style.borderColor = azul;
            b.style.background = principal ? azul : "transparent";
            b.style.color = principal ? (hc ? this.hcBg : "#FFFFFF") : azul;
            b.addEventListener("click", accion);
            return b;
        };
        const terminar = () => { this.guideStep = 1; this.persistir("style", { guide: false }); };
        const cab = mk("div", "lc-g-head");
        const paso = mk("div", "", this.tf("Guide_Step", "Setup · step {0} of 3", String(this.guideStep)));
        paso.style.color = azul;
        const cerrar = mk("button", "lc-g-close", "✕") as HTMLButtonElement;
        cerrar.type = "button";
        cerrar.title = this.t("Guide_Close", "Close the guide");
        cerrar.setAttribute("aria-label", cerrar.title);
        cerrar.style.color = muted;
        cerrar.addEventListener("click", terminar);
        cab.appendChild(paso); cab.appendChild(cerrar);
        el.appendChild(cab);
        const titulo = mk("div", "lc-g-title");
        el.appendChild(titulo);
        const pie = mk("div", "lc-g-foot");
        const fila = (hecho: boolean, nombre: string, porque: string) => {
            const f = mk("div", "lc-g-item");
            const marca = mk("span", "", hecho ? "✓" : "○");
            marca.setAttribute("aria-label", hecho ? this.t("Guide_Done", "added") : this.t("Guide_Todo", "not added"));
            marca.style.color = hecho ? (hc ? fg : "#107C10") : muted;
            const txt = mk("span", "");
            txt.appendChild(mk("b", "", nombre));
            txt.appendChild(document.createTextNode(" — " + porque));
            txt.style.color = hecho ? muted : fg;
            f.appendChild(marca); f.appendChild(txt);
            el.appendChild(f);
        };
        const has = (role: string) => !!this.dataView?.metadata?.columns?.some(c => c.roles?.[role]);
        if (this.guideStep === 1) {
            titulo.textContent = this.t("Guide_Fields", "Your data");
            fila(true, this.t("Role_Axis", "Axis"), m.isTime ? this.t("Guide_AxisTime", "a real date axis: a missing period breaks the line")
                : this.t("Guide_AxisCat", "categories: points evenly spaced"));
            fila(has("values") || has("secondaryValues"), this.t("Role_Values", "Values"), this.t("Guide_ValuesWhy", "one line per measure"));
            fila(has("legend"), this.t("Role_Legend", "Legend"), this.t("Guide_LegendWhy", "one line per brand, region or team"));
            fila(has("secondaryValues"), this.t("Role_SecondaryValues", "Secondary values"), this.t("Guide_SecondaryWhy", "a measure in other units, on a right axis"));
            fila(has("plan") || has("previousYear") || has("forecast"), this.t("Guide_Refs", "Plan · Prior year · Forecast"),
                this.t("Guide_RefsWhy", "your own measures, drawn as grey dashed lines"));
            const nota = mk("div", "lc-g-note", this.t("Guide_Wells", "Drag the fields into the field wells; this list updates by itself."));
            nota.style.color = muted;
            el.appendChild(nota);
            pie.appendChild(boton(this.t("Guide_Next", "Next"), true, () => { this.guideStep = 2; this.renderGuide(W, H); }));
        } else if (this.guideStep === 2) {
            // Probar el Pro con sus datos: cada botón cambia UN ajuste, solo desde el clic (persistProperties).
            titulo.textContent = this.isPro ? this.t("Guide_TryPro2", "Pro features on your data") : this.t("Guide_TryPro", "Try Pro on your data");
            const objs: any = this.dataView?.metadata?.objects ?? {};
            const hasRef = has("plan") || has("previousYear");
            const estilo = PRO_STYLES.indexOf(String(objs.style?.template ?? "")) >= 0;
            const banda = objs.references?.gapShading === true;
            const desvio = ["pct", "abs"].indexOf(String(objs.endLabels?.variance ?? "off")) >= 0;
            const needRef = this.t("Guide_NeedsRef", "add Plan or Prior year first");
            const evOn = has("events") && objs.events?.show !== false;
            const anOn = has("annotations") && objs.annotations?.show !== false;
            const pruebas: [string, string, boolean, boolean, () => void, string][] = [
                [this.t("Guide_TryStyles", "Collection styles"), this.t("Guide_TryStylesWhy", "six looks shared with KPI Card, Pareto and the rest of TCViz"),
                    estilo, true, () => this.persistir("style", { template: estilo ? "report" : "boardroom" }), ""],
                [this.t("Guide_TryGap", "Gap shading"), this.t("Guide_TryGapWhy", "green above the plan, red below, split exactly where the lines cross"),
                    banda, hasRef, () => this.persistir("references", banda ? { gapShading: false } : { gapShading: true, show: true }), needRef],
                [this.t("Guide_TryVariance", "Variance on the end label"), this.t("Guide_TryVarianceWhy", "the last value and how far it is from plan: −9.1% vs plan"),
                    desvio, hasRef, () => this.persistir("endLabels", desvio ? { variance: "off" } : { variance: "pct", show: true }), needRef],
                // Eventos y anotaciones se piden poniendo el campo: el botón solo enciende o apaga su tarjeta.
                [this.t("Guide_TryEvents", "Events"), this.t("Guide_TryEventsWhy", "a vertical line with its text wherever your Events field is not blank"),
                    evOn, has("events"), () => this.persistir("events", { show: !evOn }), this.t("Guide_NeedsEvents", "drag a text field into Events first")],
                [this.t("Guide_TryNotes", "Annotations"), this.t("Guide_TryNotesWhy", "a note on the line wherever your Annotations field is not blank"),
                    anOn, has("annotations"), () => this.persistir("annotations", { show: !anOn }), this.t("Guide_NeedsNotes", "drag a text field into Annotations first")],
            ];
            for (const [nombre, porque, activa, posible, accion, falta] of pruebas) {
                const f = mk("div", "lc-g-try");
                const txt = mk("span", "");
                txt.appendChild(mk("b", "", nombre));
                if (!this.isPro) {
                    const chip = mk("span", "lc-g-chip", "Pro");
                    if (hc) { chip.style.background = "transparent"; chip.style.border = "1px solid " + fg; chip.style.color = fg; }
                    txt.appendChild(chip);
                }
                txt.appendChild(document.createTextNode(" — " + (posible ? porque : falta)));
                txt.style.color = posible ? fg : muted;
                const b = boton(activa ? this.t("Guide_On", "On") : this.t("Guide_Try", "Try"), activa, accion);
                b.setAttribute("aria-pressed", String(activa));
                if (!posible) { b.disabled = true; b.style.opacity = "0.45"; b.style.cursor = "default"; }
                f.appendChild(txt); f.appendChild(b);
                el.appendChild(f);
            }
            if (!this.isPro) {
                const nota = mk("div", "lc-g-note", this.t("Guide_TryNote", "Without a licence they show under a watermark while you edit; reading view shows the free chart."));
                nota.style.color = muted;
                el.appendChild(nota);
            }
            pie.appendChild(boton(this.t("Guide_Back", "Back"), false, () => { this.guideStep = 1; this.renderGuide(W, H); }));
            pie.appendChild(boton(this.t("Guide_Next", "Next"), true, () => { this.guideStep = 3; this.renderGuide(W, H); }));
        } else {
            titulo.textContent = this.t("Guide_Style", "Pick a style");
            const actual = String((this.dataView?.metadata?.objects as any)?.style?.template ?? "report");
            const rejilla = mk("div", "lc-g-grid");
            const nombres: [string, string, string][] = [["report", "Enum_template_report", "Report theme"], ["classic", "Enum_template_classic", "Classic"],
                ["boardroom", "Enum_template_boardroom", "Boardroom (Pro)"], ["ledger", "Enum_template_ledger", "Ledger (Pro)"],
                ["editorial", "Enum_template_editorial", "Editorial (Pro)"], ["signal", "Enum_template_signal", "Signal (Pro)"],
                ["aurora", "Enum_template_aurora", "Aurora (Pro)"], ["terrace", "Enum_template_terrace", "Terrace (Pro)"]];
            for (const [nombre, clave, def] of nombres) {
                const chip = mk("button", "lc-g-tpl") as HTMLButtonElement;
                chip.type = "button";
                chip.setAttribute("aria-pressed", String(nombre === actual));
                chip.style.borderColor = nombre === actual ? azul : "#C8C6C4";
                chip.style.borderWidth = nombre === actual ? "2px" : "1px";
                chip.appendChild(this.miniLines(nombre, hc));
                // Con licencia, el "(Pro)" del nombre sobra.
                chip.appendChild(mk("div", "", this.isPro ? this.t(clave, def).replace(/\s*\(Pro\)\s*$/, "") : this.t(clave, def)));
                chip.addEventListener("click", () => this.persistir("style", { template: nombre }));
                rejilla.appendChild(chip);
            }
            el.appendChild(rejilla);
            pie.appendChild(boton(this.t("Guide_Back", "Back"), false, () => { this.guideStep = 2; this.renderGuide(W, H); }));
            pie.appendChild(boton(this.t("Guide_Finish", "Finish"), true, terminar));
        }
        el.appendChild(pie);
    }

    private miniLines(nombre: string, hc: boolean): SVGSVGElement {
        const NS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(NS, "svg") as SVGSVGElement;
        svg.setAttribute("width", "64"); svg.setAttribute("height", "36"); svg.setAttribute("aria-hidden", "true");
        const pal: any = this.host.colorPalette;
        const tok = STYLE_TOKENS[nombre];
        if (tok && !hc) svg.style.background = tok.grad ?? tok.bg;
        const cols = tok ? [tok.series[0], tok.plan, tok.series[1]] : nombre === "classic" ? CLASSIC.slice(0, 3)
            : [0, 1, 2].map(i => pal?.getColor?.("tcviz-mini-" + i)?.value ?? CLASSIC[i]);
        ["4,28 18,22 30,25 44,12 60,9", "4,32 18,30 30,20 44,22 60,18", "4,20 18,14 30,16 44,26 60,28"].forEach((pts, i) => {
            const p = document.createElementNS(NS, "polyline");
            p.setAttribute("points", pts); p.setAttribute("fill", "none"); p.setAttribute("stroke", hc ? "#FFFFFF" : cols[i]);
            p.setAttribute("stroke-width", "2");
            svg.appendChild(p);
        });
        return svg;
    }

    private aplicarPlantilla(nombre: string): void {
        const t = TEMPLATES[nombre] ?? {};
        const remove: any[] = Object.keys(t).map(obj => ({
            objectName: obj, selector: null,
            properties: Object.keys(t[obj]).reduce((acc: any, p) => { acc[p] = null; return acc; }, {}),
        }));
        if (remove.length) this.host.persistProperties({ remove });
    }

    private persistir(objectName: string, properties: any): void {
        this.host.persistProperties({ merge: [{ objectName, selector: null as any, properties }] });
    }

    private injectStyles(): void {
        const ID = "line-chart-tcviz-styles";
        const doc = this.root.ownerDocument ?? document;
        if (doc.getElementById(ID)) return;
        const st = doc.createElement("style");
        st.id = ID;
        st.textContent = [
            ".lc-root .lc-svg:focus{outline:none}",
            ".lc-root .lc-svg:focus-visible{outline:2px solid #2B6CB0;outline-offset:-2px}",
            "@media (forced-colors: active){.lc-root .lc-svg:focus-visible{outline-color:Highlight}}",
        ].join("");
        (doc.head ?? this.root).appendChild(st);
    }

    // ── Panel de formato (desde la tabla de tools/formato.py) ───────────────

    private slice(obj: string, p: PropSpec): powerbi.visuals.FormattingSlice {
        const value = this.settings?.[obj]?.[p.name] ?? p.def;
        const descriptor = { objectName: obj, propertyName: p.name };
        const base = { uid: obj + "-" + p.name, displayName: this.t(p.key, p.label) };
        if (p.type === "bool") return { ...base, control: { type: "ToggleSwitch" as any, properties: { descriptor, value: !!value } } } as any;
        if (p.type === "num") return { ...base, control: { type: "NumUpDown" as any, properties: { descriptor, value: Number(value),
            options: { minValue: p.min !== undefined ? { type: 0, value: p.min } : undefined, maxValue: p.max !== undefined ? { type: 1, value: p.max } : undefined } } } } as any;
        if (p.type === "fill") return { ...base, control: { type: "ColorPicker" as any, properties: { descriptor, value: { value: String(value) } } } } as any;
        if (p.type === "enum") {
            const items = (p.items ?? []).map(([v, k, l]) => ({ value: v, displayName: this.t(k, l) }));
            const cur = items.find(it => it.value === value) ?? items[0];
            return { ...base, control: { type: "Dropdown" as any, properties: { descriptor, value: cur, items } } } as any;
        }
        return { ...base, control: { type: "TextInput" as any, properties: { descriptor, value: String(value), placeholder: "" } } } as any;
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        const hasY2 = !!this.model?.series.some(s => s.role === "secondaryValues") && !!this.model?.series.some(s => s.role === "values");
        const cards: powerbi.visuals.FormattingCard[] = [];
        for (const c of PANE) {
            const revert: powerbi.visuals.FormattingDescriptor[] = [];
            const groups: powerbi.visuals.FormattingGroup[] = [];
            let cardToggle: any;
            // Small multiples: la tarjeta aparece con el campo puesto (como el nativo).
            if (c.uid === "smallMultiples" && !this.model?.smCol) continue;
            for (const g of c.groups) {
                if (g.obj === "y2Axis" && !hasY2) continue;
                const spec = OBJECTS[g.obj];
                const slices = spec.props.filter(p => p.name !== g.toggle).map(p => this.slice(g.obj, p));
                spec.props.forEach(p => revert.push({ objectName: g.obj, propertyName: p.name }));
                const grp: any = { uid: c.uid + "-" + g.obj + "-group", displayName: g.key ? this.t(g.key, g.label) : undefined, slices };
                if (g.toggle) {
                    const tp = spec.props.find(p => p.name === g.toggle);
                    const ts: any = this.slice(g.obj, tp);
                    ts.suppressDisplayName = true;
                    if (c.groups.length === 1) cardToggle = ts; else grp.topLevelToggle = ts;
                }
                groups.push(grp);
            }
            if (c.uid === "lines") {
                const colors = this.colorSlices();
                if (colors.length) {
                    groups.push({ uid: "lines-dataColors-group", displayName: this.t("Grp_dataColors", "Colors"), slices: colors } as any);
                    colors.forEach((sl: any) => revert.push(sl.control.properties.descriptor));
                }
                const stroke = this.strokeGroup(revert);
                if (stroke) groups.push(stroke);
            }
            const card: any = { uid: c.uid + "-card", displayName: this.t(c.key, c.label), groups, revertToDefaultDescriptors: revert };
            if (cardToggle) card.topLevelToggle = cardToggle;
            cards.push(card);
        }
        return { cards };
    }

    /**
     * Color por serie (gratis, como el nativo). Sin leyenda: uno por medida (selector metadata, se guarda en la columna).
     * Con leyenda: uno por valor de leyenda (selector de categoría, como Risk Matrix), que pinta la serie de la PRIMERA
     * medida de ese valor; las demás medidas siguen el automático. Límite: no hay color por medida × leyenda, porque los
     * values van sin group (el mapeo validado) y no existe una identidad para esa combinación.
     */
    /** Una entrada por serie configurable: su nombre, el selector donde se guarda y la serie que pinta. */
    private seriesEntries(): { uid: string; name: string; selector: any; ser: Series | undefined }[] {
        const m = this.models[0];
        if (!m) return [];
        const out: { uid: string; name: string; selector: any; ser: Series | undefined }[] = [];
        if (m.legendCol) {
            const firstMeasure = this.allSeries[0]?.measure;
            m.legendValues.slice(0, 40).forEach((lv, i) => {
                const selector = (this.host.createSelectionIdBuilder().withCategory(m.legendCol, lv.row).createSelectionId() as any).getSelector?.();
                out.push({ uid: "legend-" + i, name: lv.name, selector, ser: this.allSeries.find(s => s.legend === lv.name && s.measure === firstMeasure) });
            });
        } else {
            const seen = new Set<string>();
            for (const c of (this.dataView?.categorical?.values ?? []) as any[]) {
                const src = c.source;
                if (!src || !(src.roles?.values || src.roles?.secondaryValues) || seen.has(src.queryName)) continue;
                seen.add(src.queryName);
                out.push({ uid: "measure-" + seen.size, name: src.displayName, selector: { metadata: src.queryName },
                    ser: this.allSeries.find(s => s.measure === src.displayName) });
            }
        }
        return out;
    }

    private colorSlices(): powerbi.visuals.FormattingSlice[] {
        if (this.hc) return [];
        return this.seriesEntries().map(e => ({ uid: "dataColors-" + e.uid, displayName: e.name, control: { type: "ColorPicker", properties: {
            descriptor: { objectName: "dataColors", propertyName: "fill", selector: e.selector },
            value: { value: e.ser?.color ?? "#118DFF" } } } })) as any;
    }

    /**
     * Trazo por serie (gratis): estilo, grosor y marcadores, con el MISMO selector que el color (misma limitación con
     * leyenda: se guarda por valor de leyenda y pinta la serie de la primera medida). Contenedor con selector de serie,
     * como el "Aplicar a la serie" del nativo, para no listar 3 × N controles.
     */
    private strokeGroup(revert: powerbi.visuals.FormattingDescriptor[]): any | null {
        const entries = this.seriesEntries();
        if (!entries.length) return null;
        const spec = OBJECTS.dataColors;
        const lw = Number(this.settings.lines.width);
        const items = entries.map(e => {
            const cs = e.ser?.customStroke;
            const cur: Record<string, any> = { lineStyle: cs?.style ?? "solid", lineWidth: cs?.width ?? lw, markers: cs?.markers ?? "auto" };
            const slices = spec.props.filter(p => p.name !== "fill").map(p => {
                const sl: any = this.slice("dataColors", p);
                sl.uid = "dataColors-" + p.name + "-" + e.uid;
                sl.control.properties.descriptor = { objectName: "dataColors", propertyName: p.name, selector: e.selector };
                if (p.type === "enum") sl.control.properties.value = sl.control.properties.items.find((it: any) => it.value === cur[p.name]) ?? sl.control.properties.items[0];
                else sl.control.properties.value = Number(cur[p.name]);
                revert.push(sl.control.properties.descriptor);
                return sl;
            });
            return { displayName: e.name, slices };
        });
        return { uid: "lines-seriesStroke-group", displayName: this.t("Grp_seriesStroke", "Line style by series"),
            container: { displayName: this.t("UI_Series", "Series"), containerItems: items } };
    }

    // ── Formato desde el lienzo (on-object) ──────────────────────────────────

    private cardLabel(obj: string): string {
        const spec = OBJECTS[obj];
        return spec ? this.t(spec.key, spec.label) : obj;
    }

    private propLabel(obj: string, prop: string): string {
        const p = OBJECTS[obj]?.props.find(x => x.name === prop);
        return p ? this.t(p.key, p.label) : prop;
    }

    private markSubSelectables(): void {
        const marcar = (sel: string, objeto: string, tipo: number) => {
            this.root.querySelectorAll(sel).forEach(el => {
                if (!this.formatMode) { el.classList.remove(HtmlSubSelectableClass); return; }
                el.classList.add(HtmlSubSelectableClass);
                el.setAttribute(SubSelectableObjectNameAttribute, objeto);
                el.setAttribute(SubSelectableDisplayNameAttribute, this.cardLabel(objeto));
                el.setAttribute(SubSelectableTypeAttribute, String(tipo));
            });
        };
        marcar(".lc-series", "lines", 3);
        marcar(".lc-ref", "references", 3);
        marcar(".lc-band", "references", 3);
        marcar(".lc-sm-title", "smallMultiples", 1);
        marcar(".lc-endlabel", "endLabels", 1);
        marcar(".lc-x", "xAxis", 1);
        marcar(".lc-y", "yAxis", 1);
        marcar(".lc-y2", "y2Axis", 1);
        marcar(".lc-legend", "legend", 1);
        marcar(".lc-target-line, .lc-target-label", "targetLine", 3);
        marcar(".lc-event, .lc-event-labels", "events", 3);
        marcar(".lc-note", "annotations", 1);
        marcar(".lc-source", "sourceNote", 1);
    }

    private getSubSelectionStyles(subs: powerbi.visuals.CustomVisualSubSelection[]): powerbi.visuals.SubSelectionStyles | undefined {
        const name = subs[0]?.customVisualObjects[0]?.objectName;
        const ref = (o: string, p: string) => ({ reference: { objectName: o, propertyName: p }, label: this.propLabel(o, p) });
        switch (name) {
            case "lines": return { type: 3, width: ref("lines", "width") } as any;
            case "references": return { type: 3, stroke: ref("references", "color"), width: ref("references", "width") } as any;
            case "endLabels": return { type: 1, fontSize: ref("endLabels", "fontSize"), fontColor: ref("endLabels", "color") } as any;
            case "xAxis": return { type: 1, fontSize: ref("xAxis", "fontSize"), fontColor: ref("xAxis", "color") } as any;
            case "yAxis": return { type: 1, fontSize: ref("yAxis", "fontSize"), fontColor: ref("yAxis", "color") } as any;
            case "y2Axis": return { type: 1, fontSize: ref("y2Axis", "fontSize") } as any;
            case "legend": return { type: 1, fontSize: ref("legend", "fontSize"), fontColor: ref("legend", "color") } as any;
            case "smallMultiples": return { type: 1, fontSize: ref("smallMultiples", "titleFontSize"), fontColor: ref("smallMultiples", "titleColor") } as any;
            case "targetLine": return { type: 3, stroke: ref("targetLine", "color"), width: ref("targetLine", "width") } as any;
            case "events": return { type: 3, stroke: ref("events", "color") } as any;
            case "annotations": return { type: 1, fontSize: ref("annotations", "fontSize"), fontColor: ref("annotations", "color") } as any;
            case "sourceNote": return { type: 1, fontSize: ref("sourceNote", "fontSize"), fontColor: ref("sourceNote", "color") } as any;
        }
        return undefined;
    }

    private getSubSelectionShortcuts(subs: powerbi.visuals.CustomVisualSubSelection[]): powerbi.visuals.VisualSubSelectionShortcuts | undefined {
        const name = subs[0]?.customVisualObjects[0]?.objectName;
        if (!name || !OBJECTS[name]) return undefined;
        const id = (o: string, p: string) => ({ objectName: o, propertyName: p });
        const toggle = (o: string, p: string) => ({ type: 2, ...id(o, p), relatedToggledFormattingIds: [id(o, p)],
            disabledLabel: this.propLabel(o, p), enabledLabel: this.propLabel(o, p) });
        const reset = (o: string) => ({ type: 0, relatedResetFormattingIds: OBJECTS[o].props.map(p => id(o, p.name)) });
        const nav = (o: string, card: string) => ({ type: 1, destinationInfo: { cardUid: "Visual-" + card + "-card" }, label: this.cardLabel(o) });
        const div = { type: 7 };
        switch (name) {
            case "lines": return [{ type: 3, ...id("lines", "missing"), label: this.propLabel("lines", "missing") }, div, reset("lines"), nav("lines", "lines")] as any;
            case "references": return [toggle("references", "show"), toggle("references", "legend"), toggle("references", "gapShading"), div, reset("references"), nav("references", "references")] as any;
            case "smallMultiples": return [toggle("smallMultiples", "titleBold"), toggle("smallMultiples", "border"), toggle("smallMultiples", "sharedY"), div, reset("smallMultiples"), nav("smallMultiples", "smallMultiples")] as any;
            case "endLabels": return [toggle("endLabels", "show"), toggle("endLabels", "seriesColor"), div, reset("endLabels"), nav("endLabels", "endLabels")] as any;
            case "xAxis": case "yAxis": case "y2Axis": return [toggle(name, "show"), toggle(name, "title"), div, reset(name), nav(name, "axes")] as any;
            case "targetLine": return [toggle("targetLine", "show"), toggle("targetLine", "showLabel"), div, reset("targetLine"), nav("targetLine", "targetLine")] as any;
            case "events": return [toggle("events", "show"), toggle("events", "showLabels"), { type: 3, ...id("events", "labelPosition"), label: this.propLabel("events", "labelPosition") }, div, reset("events"), nav("events", "events")] as any;
            case "annotations": return [toggle("annotations", "show"), div, reset("annotations"), nav("annotations", "annotations")] as any;
            case "sourceNote": return [toggle("sourceNote", "show"), { type: 3, ...id("sourceNote", "align"), label: this.propLabel("sourceNote", "align") }, div, reset("sourceNote"), nav("sourceNote", "sourceNote")] as any;
            case "legend": return [{ type: 3, ...id("legend", "position"), label: this.propLabel("legend", "position") }, toggle("legend", "show"), div, reset("legend"), nav("legend", "legend")] as any;
        }
        return undefined;
    }

    public destroy(): void {
        // Un temporizador vivo sobre un visual retirado lanzaría un aviso de compra sin visual.
        this.cancelLicenseIcon();
        this.hideTip();
        this.root.remove();
    }
}

function luminance(hex: string): number {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) return 0.5;
    const n = parseInt(m[1], 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(c => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

function contrast(a: string, b: string): number {
    const la = luminance(a), lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
