# Changelog

## 0.1.0 — 2026-10-21

First usable release. Flowcharts only.

- Forked and trimmed the ASCII engine from beautiful-mermaid: flowcharts and
  the graph model only; SVG, ELK, sequence/class/ER/xychart code removed.
- Zero runtime dependencies.
- Terminal column measurement shared by measurement, wrapping, truncation and
  canvas writing. CJK, Hangul, fullwidth forms, emoji sequences, combining marks
  and ZWJ sequences are handled as graphemes/column widths.
- Width budget with `fit`, `compact`, `clip` and `source` overflow strategies.
- `maxNodes` limit.
- Structured result: per-line semantic segments (`text`, `border`, `line`,
  `arrow`, `corner`, `junction`), actual width/height, `status` and `reason`.
- Optional ANSI output driven by host-provided SGR tokens; plain text by
  default.
- `unicode`, `cjk` and `ascii` frame profiles.
- Parse failures, unsupported diagram types and internal errors degrade to the
  original source instead of throwing.
- MIT license with beautiful-mermaid and mermaid-ascii notices.

Known limitations:

- Flowcharts (`graph` / `flowchart`) only. Other diagram types are rejected.
- `RL` is laid out like `LR`; arrowheads point right.
- No SVG output, terminal image protocols, interaction or horizontal scrolling.
- Not published to npm.
