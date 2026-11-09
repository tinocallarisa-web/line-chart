# Line Chart — prueba del mapeo de datos en Desktop

Esto **no es el visual**: es un diagnóstico que escribe en pantalla lo que Power BI le entrega.
Sirve para decidir el día 1 si el mapeo `categories [axis, smallMultiple]` + `values group by legend`
aguanta antes de dibujar nada.

## Preparar

1. **Copia** la carpeta `C:\tcviz\datos\demo_rtm\DemoRTM\` entera (p. ej. a `DemoRTM_LineDiag\`) y abre
   el `.pbip` de la copia. **Nunca el original**: lleva incrustados los visuales de organización.
2. Importa `C:\tcviz\dev\LineChart\dist\lineChartTCVizD8CCBAB58761478B9C59A5FA700EC503_test.1.0.0.2.pbiviz`
   (o el de número más alto en `dist\`).
3. Página nueva, visual "Line Chart by TCViz (test)" a tamaño grande. Arriba a la derecha de la primera
   línea sale la marca `[test AAAA-MM-DD HH:MM v1.0.0.N]`: si no coincide con el paquete importado,
   Desktop está sirviendo uno anterior (quita el visual del panel, cierra Desktop y reimporta).
4. Para cada caso: **captura de pantalla** del diagnóstico (el texto se desplaza si no cabe).

## Casos

| | Campos | Qué mirar |
|---|---|---|
| a | Axis = `dim_fecha[fecha]` · Values = `Ventas netas` | `tipo=dateTime`, `jerarquía=no`, ~730 filas (oct-24 → sep-26), `primero/último` correctos, 1 grupo, `segment` no llega |
| b | + Legend = `dim_sku[marca]` | GRUPOS = nº de marcas (10); cada grupo con `Ventas netas rol=values`; `nulos` > 0 donde una marca no vendió (vacío ≠ cero: confirma que llega ∅ y no 0) |
| c | + Secondary values = `Margen bruto %` | En cada grupo aparece una 2.ª medida `rol=secondaryValues` con su `format` de porcentaje |
| d | + Plan = `Plan ventas netas` · Prior year = `Ventas netas AA` | `rol=plan` y `rol=previousYear` dentro de cada grupo. Ojo: el plan es mensual; en eje diario mira cuántos ∅ trae |
| e | + Small multiples = `dim_zona[zona]` | CATEGORÍAS: 2 (axis + smallMultiple); FILAS = días × zonas; columna `panel=` en las filas; ¿el orden viene por fecha o por zona? |
| f | Quita Small multiples. En la copia, crea una jerarquía en `dim_fecha` (clic derecho en `anio` → Crear jerarquía, añade `mes_inicio`). Pon la jerarquía en Axis | ¿Desktop acepta la jerarquía con Axis máx. 1? `jerarquía=SÍ nivel=...` y `queryName`. Luego "Expandir todo un nivel" y "Explorar en profundidad": ¿llegan 1 o 2 categorías con rol axis? ¿qué tipo tiene cada nivel (dateTime / numeric / text)? |
| g | Axis = `dim_fecha[fecha]` (diario, todo el rango) · Legend con ≥ 12 series (`dim_sku[sku]`, 57) · Values + Plan + Prior year | Riesgo visto en Pareto: **`metadata.segment` sale en rojo** = Power BI recortó y quiere paginar; `operationKind`; FILAS totales y `último` (¿llega hasta sep-26?); GRUPOS: ¿los 57 o un tope (declarado top 100)? ¿bloques de 500? |
| g2 | Opcional, para forzar el tope: Axis = fecha · Small multiples = `dim_pdv[id_pdv]` (1.800) | Más de 30.000 filas: debería salir `segment` o recorte a 30.000. Apunta FILAS y `último` |

Para cada caso apunta: CATEGORÍAS, FILAS, GRUPOS, roles por medida, si sale `segment` (rojo) y si hubo
algún error o el visual se quedó en blanco. Con eso basta.

## Si algo no encaja

- Axis no admite la jerarquía (caso f): apúntalo; es una línea en `capabilities.json` (quitar `axis.max: 1`).
- Desktop rechaza un campo en un pozo: anota cuál y el mensaje.
