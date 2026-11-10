# Line Chart by TCViz

A Power BI custom visual: a line chart for business time series that answers "are we on plan?". Actual against plan and
prior year with the gap shaded green or red, the plan carried on past the last actual month, the last value at the end of
every line, and an empty period drawn as a gap, never as a zero. Free: real date axis, several measures with a legend and a
secondary axis, end labels, plan / prior year / forecast with gap shading, target and trend lines, peaks and lows, zoom.
Pro adds events and annotations on the timeline, the variance in the end label, small multiples, "Show values as" (index,
% change, running total) and six collection styles.

- Documentation: https://tinocallarisa-web.github.io/line-chart/support.html
- Privacy: https://tinocallarisa-web.github.io/line-chart/privacy.html · Terms: https://tinocallarisa-web.github.io/line-chart/terms.html
- Changelog: https://tinocallarisa-web.github.io/line-chart/changelog.html
- Questions: https://github.com/tinocallarisa-web/line-chart/discussions · Bugs: https://github.com/tinocallarisa-web/line-chart/issues
- Video: https://www.youtube.com/watch?v=R7EQ3PDNhMs · Product page: https://tcviz.com/product/line-chart/
- Support: support@tcviz.com

Version 1.0.0.0 · Power BI visuals API 5.11.1 · no network access (`"privileges": []`).

## Build

```
npm ci
node build-test.js          # test package, Pro forced (_test)
node build-test.js --free   # test package, real licence (_testfree)
```

Format pane and texts are generated: `python tools/formato.py` (Format pane), `python tools/i18n.py` (12 languages).
Documentation pages (`docs/support.html`, `privacy.html`, `terms.html`, `changelog.html`, `index.html`,
`TIPS-AND-HINTS-PLAIN.txt`): `python tools/gen_docs.py`. AppSource description HTML:
`python C:\tcviz\utillaje\ficha_html.py "C:\tcviz\dev\LineChart"`.

© 2026 TCViz. Source published for transparency and review; see the Terms of Use.
