/**
 * Tabla del panel de formato. Generado por tools/formato.py: no editar a mano.
 * Los nombres internos (objeto.propiedad) no se renombran nunca: los informes guardados dejarían de leerlos.
 */
export type PropType = "bool" | "num" | "fill" | "enum" | "text";
export interface PropSpec { name: string; type: PropType; def: string | number | boolean; key: string; label: string;
    items?: [string, string, string][]; min?: number; max?: number; }
export interface ObjSpec { name: string; key: string; label: string; props: PropSpec[]; }
export interface GroupSpec { obj: string; toggle: string | null; key?: string; label?: string; }
export interface CardSpec { uid: string; key: string; label: string; groups: GroupSpec[]; }
export const OBJECTS: Record<string, ObjSpec> = {
    "style": {
        "name": "style",
        "key": "Obj_style",
        "label": "Style template",
        "props": [
            {
                "name": "template",
                "type": "enum",
                "def": "report",
                "key": "Prop_style_template",
                "label": "Template",
                "items": [
                    [
                        "report",
                        "Enum_template_report",
                        "Report theme"
                    ],
                    [
                        "classic",
                        "Enum_template_classic",
                        "Classic"
                    ],
                    [
                        "boardroom",
                        "Enum_template_boardroom",
                        "Boardroom (Pro)"
                    ],
                    [
                        "ledger",
                        "Enum_template_ledger",
                        "Ledger (Pro)"
                    ],
                    [
                        "editorial",
                        "Enum_template_editorial",
                        "Editorial (Pro)"
                    ],
                    [
                        "signal",
                        "Enum_template_signal",
                        "Signal (Pro)"
                    ],
                    [
                        "aurora",
                        "Enum_template_aurora",
                        "Aurora (Pro)"
                    ],
                    [
                        "terrace",
                        "Enum_template_terrace",
                        "Terrace (Pro)"
                    ]
                ]
            },
            {
                "name": "guide",
                "type": "bool",
                "def": true,
                "key": "Prop_style_guide",
                "label": "Setup guide"
            }
        ]
    },
    "lines": {
        "name": "lines",
        "key": "Obj_lines",
        "label": "Lines",
        "props": [
            {
                "name": "width",
                "type": "num",
                "def": 2,
                "key": "Prop_lines_width",
                "label": "Line width",
                "min": 0.5,
                "max": 8
            },
            {
                "name": "markers",
                "type": "enum",
                "def": "auto",
                "key": "Prop_lines_markers",
                "label": "Markers",
                "items": [
                    [
                        "auto",
                        "Enum_markers_auto",
                        "Automatic"
                    ],
                    [
                        "on",
                        "Enum_markers_on",
                        "On"
                    ],
                    [
                        "off",
                        "Enum_markers_off",
                        "Off"
                    ]
                ]
            },
            {
                "name": "markerSize",
                "type": "num",
                "def": 3,
                "key": "Prop_lines_markerSize",
                "label": "Marker size",
                "min": 1,
                "max": 10
            },
            {
                "name": "missing",
                "type": "enum",
                "def": "break",
                "key": "Prop_lines_missing",
                "label": "Missing values",
                "items": [
                    [
                        "break",
                        "Enum_missing_break",
                        "Break the line"
                    ],
                    [
                        "connect",
                        "Enum_missing_connect",
                        "Connect the points"
                    ],
                    [
                        "zero",
                        "Enum_missing_zero",
                        "Treat as zero"
                    ]
                ]
            }
        ]
    },
    "endLabels": {
        "name": "endLabels",
        "key": "Obj_endLabels",
        "label": "End labels",
        "props": [
            {
                "name": "show",
                "type": "bool",
                "def": true,
                "key": "Prop_endLabels_show",
                "label": "Show end labels"
            },
            {
                "name": "content",
                "type": "enum",
                "def": "nameValue",
                "key": "Prop_endLabels_content",
                "label": "Content",
                "items": [
                    [
                        "nameValue",
                        "Enum_content_nameValue",
                        "Name and value"
                    ],
                    [
                        "value",
                        "Enum_content_value",
                        "Value"
                    ],
                    [
                        "name",
                        "Enum_content_name",
                        "Name"
                    ]
                ]
            },
            {
                "name": "maxLabels",
                "type": "num",
                "def": 8,
                "key": "Prop_endLabels_maxLabels",
                "label": "Maximum labels",
                "min": 1,
                "max": 50
            },
            {
                "name": "fontSize",
                "type": "num",
                "def": 10,
                "key": "Prop_endLabels_fontSize",
                "label": "Text size",
                "min": 7,
                "max": 24
            },
            {
                "name": "seriesColor",
                "type": "bool",
                "def": true,
                "key": "Prop_endLabels_seriesColor",
                "label": "Use the series color"
            },
            {
                "name": "color",
                "type": "fill",
                "def": "#252423",
                "key": "Prop_endLabels_color",
                "label": "Text color"
            },
            {
                "name": "variance",
                "type": "enum",
                "def": "off",
                "key": "Prop_endLabels_variance",
                "label": "Variance vs plan or PY (Pro)",
                "items": [
                    [
                        "off",
                        "Enum_variance_off",
                        "Off"
                    ],
                    [
                        "pct",
                        "Enum_variance_pct",
                        "Percentage"
                    ],
                    [
                        "abs",
                        "Enum_variance_abs",
                        "Absolute"
                    ]
                ]
            }
        ]
    },
    "references": {
        "name": "references",
        "key": "Obj_references",
        "label": "Plan, prior year and forecast",
        "props": [
            {
                "name": "show",
                "type": "bool",
                "def": true,
                "key": "Prop_references_show",
                "label": "Show reference lines"
            },
            {
                "name": "colorMode",
                "type": "enum",
                "def": "gray",
                "key": "Prop_references_colorMode",
                "label": "Line color",
                "items": [
                    [
                        "gray",
                        "Enum_colorMode_gray",
                        "Gray"
                    ],
                    [
                        "series",
                        "Enum_colorMode_series",
                        "Color of its series"
                    ]
                ]
            },
            {
                "name": "color",
                "type": "fill",
                "def": "#8A8886",
                "key": "Prop_references_color",
                "label": "Gray"
            },
            {
                "name": "width",
                "type": "num",
                "def": 1.5,
                "key": "Prop_references_width",
                "label": "Line width",
                "min": 0.5,
                "max": 6
            },
            {
                "name": "legend",
                "type": "bool",
                "def": true,
                "key": "Prop_references_legend",
                "label": "Show in legend"
            },
            {
                "name": "gapShading",
                "type": "bool",
                "def": false,
                "key": "Prop_references_gapShading",
                "label": "Gap shading (Pro)"
            },
            {
                "name": "aboveColor",
                "type": "fill",
                "def": "#2E7D32",
                "key": "Prop_references_aboveColor",
                "label": "Above the reference"
            },
            {
                "name": "belowColor",
                "type": "fill",
                "def": "#C62828",
                "key": "Prop_references_belowColor",
                "label": "Below the reference"
            },
            {
                "name": "gapOpacity",
                "type": "num",
                "def": 18,
                "key": "Prop_references_gapOpacity",
                "label": "Shading opacity (%)",
                "min": 5,
                "max": 30
            }
        ]
    },
    "xAxis": {
        "name": "xAxis",
        "key": "Obj_xAxis",
        "label": "X axis",
        "props": [
            {
                "name": "show",
                "type": "bool",
                "def": true,
                "key": "Prop_xAxis_show",
                "label": "Show X axis"
            },
            {
                "name": "fontSize",
                "type": "num",
                "def": 10,
                "key": "Prop_xAxis_fontSize",
                "label": "Text size",
                "min": 7,
                "max": 24
            },
            {
                "name": "color",
                "type": "fill",
                "def": "#605E5C",
                "key": "Prop_xAxis_color",
                "label": "Text color"
            },
            {
                "name": "title",
                "type": "bool",
                "def": false,
                "key": "Prop_xAxis_title",
                "label": "Title"
            }
        ]
    },
    "yAxis": {
        "name": "yAxis",
        "key": "Obj_yAxis",
        "label": "Y axis",
        "props": [
            {
                "name": "show",
                "type": "bool",
                "def": true,
                "key": "Prop_yAxis_show",
                "label": "Show Y axis"
            },
            {
                "name": "fontSize",
                "type": "num",
                "def": 10,
                "key": "Prop_yAxis_fontSize",
                "label": "Text size",
                "min": 7,
                "max": 24
            },
            {
                "name": "color",
                "type": "fill",
                "def": "#605E5C",
                "key": "Prop_yAxis_color",
                "label": "Text color"
            },
            {
                "name": "title",
                "type": "bool",
                "def": true,
                "key": "Prop_yAxis_title",
                "label": "Title"
            },
            {
                "name": "zero",
                "type": "bool",
                "def": false,
                "key": "Prop_yAxis_zero",
                "label": "Start at zero"
            },
            {
                "name": "grid",
                "type": "bool",
                "def": true,
                "key": "Prop_yAxis_grid",
                "label": "Gridlines"
            },
            {
                "name": "gridColor",
                "type": "fill",
                "def": "#E1DFDD",
                "key": "Prop_yAxis_gridColor",
                "label": "Gridline color"
            }
        ]
    },
    "y2Axis": {
        "name": "y2Axis",
        "key": "Obj_y2Axis",
        "label": "Secondary Y axis",
        "props": [
            {
                "name": "show",
                "type": "bool",
                "def": true,
                "key": "Prop_y2Axis_show",
                "label": "Show secondary Y axis"
            },
            {
                "name": "fontSize",
                "type": "num",
                "def": 10,
                "key": "Prop_y2Axis_fontSize",
                "label": "Text size",
                "min": 7,
                "max": 24
            },
            {
                "name": "title",
                "type": "bool",
                "def": true,
                "key": "Prop_y2Axis_title",
                "label": "Title"
            },
            {
                "name": "zero",
                "type": "bool",
                "def": false,
                "key": "Prop_y2Axis_zero",
                "label": "Start at zero"
            }
        ]
    },
    "legend": {
        "name": "legend",
        "key": "Obj_legend",
        "label": "Legend",
        "props": [
            {
                "name": "show",
                "type": "bool",
                "def": true,
                "key": "Prop_legend_show",
                "label": "Show legend"
            },
            {
                "name": "position",
                "type": "enum",
                "def": "top",
                "key": "Prop_legend_position",
                "label": "Position",
                "items": [
                    [
                        "top",
                        "Enum_position_top",
                        "Top"
                    ],
                    [
                        "bottom",
                        "Enum_position_bottom",
                        "Bottom"
                    ]
                ]
            },
            {
                "name": "fontSize",
                "type": "num",
                "def": 10,
                "key": "Prop_legend_fontSize",
                "label": "Text size",
                "min": 7,
                "max": 24
            },
            {
                "name": "color",
                "type": "fill",
                "def": "#605E5C",
                "key": "Prop_legend_color",
                "label": "Text color"
            }
        ]
    },
    "smallMultiples": {
        "name": "smallMultiples",
        "key": "Obj_smallMultiples",
        "label": "Small multiples (Pro)",
        "props": [
            {
                "name": "columns",
                "type": "num",
                "def": 0,
                "key": "Prop_smallMultiples_columns",
                "label": "Columns (0 = automatic)",
                "min": 0,
                "max": 12
            },
            {
                "name": "gap",
                "type": "num",
                "def": 8,
                "key": "Prop_smallMultiples_gap",
                "label": "Space between panels",
                "min": 0,
                "max": 40
            },
            {
                "name": "titleFontSize",
                "type": "num",
                "def": 12,
                "key": "Prop_smallMultiples_titleFontSize",
                "label": "Title size",
                "min": 7,
                "max": 24
            },
            {
                "name": "titleColor",
                "type": "fill",
                "def": "#252423",
                "key": "Prop_smallMultiples_titleColor",
                "label": "Title color"
            },
            {
                "name": "titleBold",
                "type": "bool",
                "def": true,
                "key": "Prop_smallMultiples_titleBold",
                "label": "Bold title"
            },
            {
                "name": "titleAlign",
                "type": "enum",
                "def": "left",
                "key": "Prop_smallMultiples_titleAlign",
                "label": "Title alignment",
                "items": [
                    [
                        "left",
                        "Enum_titleAlign_left",
                        "Left"
                    ],
                    [
                        "center",
                        "Enum_titleAlign_center",
                        "Center"
                    ]
                ]
            },
            {
                "name": "background",
                "type": "fill",
                "def": "",
                "key": "Prop_smallMultiples_background",
                "label": "Panel background"
            },
            {
                "name": "border",
                "type": "bool",
                "def": false,
                "key": "Prop_smallMultiples_border",
                "label": "Panel border"
            },
            {
                "name": "borderColor",
                "type": "fill",
                "def": "#E1DFDD",
                "key": "Prop_smallMultiples_borderColor",
                "label": "Panel border color"
            },
            {
                "name": "sharedY",
                "type": "bool",
                "def": true,
                "key": "Prop_smallMultiples_sharedY",
                "label": "Shared Y axis"
            }
        ]
    },
    "dataColors": {
        "name": "dataColors",
        "key": "Obj_dataColors",
        "label": "Series colors",
        "props": [
            {
                "name": "fill",
                "type": "fill",
                "def": "",
                "key": "Prop_dataColors_fill",
                "label": "Color"
            }
        ]
    }
};
export const PANE: CardSpec[] = [
    {
        "uid": "style",
        "key": "Obj_style",
        "label": "Style template",
        "groups": [
            {
                "obj": "style",
                "toggle": null
            }
        ]
    },
    {
        "uid": "lines",
        "key": "Obj_lines",
        "label": "Lines",
        "groups": [
            {
                "obj": "lines",
                "toggle": null
            }
        ]
    },
    {
        "uid": "endLabels",
        "key": "Obj_endLabels",
        "label": "End labels",
        "groups": [
            {
                "obj": "endLabels",
                "toggle": "show"
            }
        ]
    },
    {
        "uid": "references",
        "key": "Obj_references",
        "label": "Plan, prior year and forecast",
        "groups": [
            {
                "obj": "references",
                "toggle": "show"
            }
        ]
    },
    {
        "uid": "axes",
        "key": "Obj_axes",
        "label": "Axes",
        "groups": [
            {
                "obj": "xAxis",
                "toggle": "show",
                "key": "Grp_xAxis",
                "label": "X axis"
            },
            {
                "obj": "yAxis",
                "toggle": "show",
                "key": "Grp_yAxis",
                "label": "Y axis"
            },
            {
                "obj": "y2Axis",
                "toggle": "show",
                "key": "Grp_y2Axis",
                "label": "Secondary Y axis"
            }
        ]
    },
    {
        "uid": "legend",
        "key": "Obj_legend",
        "label": "Legend",
        "groups": [
            {
                "obj": "legend",
                "toggle": "show"
            }
        ]
    },
    {
        "uid": "smallMultiples",
        "key": "Obj_smallMultiples",
        "label": "Small multiples (Pro)",
        "groups": [
            {
                "obj": "smallMultiples",
                "toggle": null
            }
        ]
    }
];
