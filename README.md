# mermaid-glyph

Render Mermaid **flowcharts** as terminal character art — with real column
widths, a width budget, and structured output that leaves color and interaction
to the host.

- **CJK / emoji aware.** Labels are measured in terminal columns, not UTF-16
  code units. Fullwidth characters occupy two cells; combining marks and ZWJ
  sequences are treated as graphemes.
- **Width is an input, not a surprise.** Pass the columns you have; choose what
  happens when the diagram is wider.
- **Host agnostic.** No terminal probing, no Ink/React, no DOM, no product
  palette. Plain text by default.
- **Zero runtime dependencies.** TypeScript, ESM, MIT.

> Status: **0.1.1**, flowcharts only. Published on npm as `mermaid-glyph`.

## Install

```sh
npm install mermaid-glyph
# or
bun add mermaid-glyph
```

To work from source instead:

```sh
# a checkout next to your project
bun add link:../mermaid-glyph
# or the repository directly
bun add github:EchoJamie/mermaid-glyph
```

Bun resolves the TypeScript source through the package's `bun` export. Other
runtimes consume the built ESM (`bun run build` → `dist/`).

## Usage

```ts
import { renderMermaidGlyph } from 'mermaid-glyph'

const result = renderMermaidGlyph(
  `flowchart LR
    A[接收请求] --> B{校验}
    B -->|通过| C[写入数据库]
    B -->|拒绝| D[返回错误]`,
  { width: 100 },
)

if (result.status === 'ok') {
  console.log(result.text)
} else {
  // result.status === 'fallback' | 'truncated'
  console.log(result.source) // show the original Mermaid block
}
```

Output:

```
┌──────────┐     ◇──────◇           ┌────────────┐
│          │     │      │           │            │
│ 接收请求 ├────►│ 校验 │  ├─通过──►│ 写入数据库 │
│          │     │      │           │            │
└──────────┘     ◇───┬──◇           └────────────┘
                     │
                     │
                     │
                     │
                     │
                     │              ┌────────────┐
                     │              │            │
                     └────拒绝─────►│  返回错误  │
                                    │            │
                                    └────────────┘
```

Every line is also available as semantic segments:

```ts
for (const line of result.lines) {
  for (const segment of line.segments) {
    // segment.text  — plain text
    // segment.token — 'text' | 'border' | 'line' | 'arrow' | 'corner' | 'junction'
  }
}
```

## API

### `renderMermaidGlyph(source, options)`

Returns a `GlyphResult`. Never throws for invalid input: parse errors,
unsupported diagram types, node limits and width limits become
`status: 'fallback'` with a `reason`.

Throws `TypeError` only for an invalid `options.width`.

### `renderGraphGlyph(graph, source, options)`

Same pipeline for an already parsed `MermaidGraph`. `source` is carried through
for fallback output.

### `parseFlowchart(source)`

Parses flowcharts only and throws `GlyphParseError` otherwise. Useful when the
host wants to distinguish “not a flowchart” from “no room to draw”.

### Width helpers

`displayWidth(text)`, `cellsOf(text)`, `wrapToWidth(text, width)`,
`truncateToWidth(text, width)`, `padToWidth(text, width)` use the same ruler as
the renderer.

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `width` | required | Available terminal columns (positive integer). |
| `profile` | `'unicode'` | `'unicode'` / `'cjk'`: box-drawing characters. `'ascii'`: `+-|<>`, safe where ambiguous-width glyphs render double. `cjk` is currently the same character set as `unicode`; column measurement is CJK-aware in every profile. |
| `overflow` | `'source'` | `'fit'` (compact + wrap labels), `'compact'` (tighter spacing), `'clip'` (cut lines), `'source'` (return the Mermaid text). |
| `maxNodes` | `50` | Refuse larger graphs with `reason: 'too-many-nodes'`. |
| `paddingX` | `5` | Horizontal spacing between nodes. |
| `paddingY` | `5` | Vertical spacing between nodes. |
| `boxPadding` | `1` | Padding inside node boxes. |
| `ansi` | `false` | Build ANSI-colored strings as well. |
| `style` | `{}` | Token → SGR parameter string, e.g. `{ border: '90', text: '37' }`. No palette is shipped. |

## Result

```ts
interface GlyphResult {
  status: 'ok' | 'fallback' | 'truncated'
  reason?: 'parse-error' | 'unsupported-diagram' | 'empty-diagram'
         | 'too-many-nodes' | 'too-wide' | 'unsupported-layout'
         | 'internal-error'
  source: string
  lines: readonly GlyphLine[]
  width: number   // actual maximum display width
  height: number  // number of rows
  text: string    // plain, joined by '\n'
  ansi?: string   // present only when ansi: true
}

interface GlyphLine {
  text: string
  segments: readonly { text: string; token?: GlyphToken }[]
  ansi?: string
}
```

`fallback` lines are the original source split by `\n` (a single trailing
newline is dropped). `clip` produces `status: 'truncated'`; it can cut box
borders, so most hosts should prefer `'source'` or `'fit'`.

## Behavior notes

- **Width overflow.** `fit` first retries with compact spacing, then wraps node,
  edge and subgraph labels at progressively smaller widths. If nothing fits, it
  falls back to the source.
- **Node limit.** Checked before layout; the default is 50 nodes.
- **Subgraphs.** Simple sibling and nested subgraphs render. If sibling
  subgraphs interleave across layers, the upstream spacing pass can invert or
  overlap their boxes; the renderer detects that and falls back with
  `reason: 'unsupported-layout'` rather than printing missing labels.
- **Diagram scope.** `graph` / `flowchart` with `TD`, `TB`, `LR`, `BT`, `RL`.
  `stateDiagram`, `sequenceDiagram`, `classDiagram`, `erDiagram` and `xychart`
  are rejected with `reason: 'unsupported-diagram'`.
- **Syntax.** Statements may be separated by newlines or semicolons, including
  a header on the same line (`flowchart TD; A --> B`). Edge operators do not
  need surrounding spaces (`A-->B`, `A-.->B`, `A---B`, `A==>B`,
  `A-->|label|B`). A later shape-qualified declaration updates an existing
  node (`B["乙"]`).
- **Identifiers.** Node ids must be ASCII (letters, digits, `_`, and single
  hyphens between segments). Non-ASCII ids and statements that cannot be
  understood are `parse-error`, never an empty success.
- **Empty input.** A header with no nodes, or only comments, returns
  `reason: 'empty-diagram'`.
- **Unsupported syntax.** `--o` / `--x` edges and trailing `%%` comments are
  not rendering features; they return `parse-error` and fall back to the source
  safely. Leading whole-line `%%` comments are ignored.
- **Directions.** `BT` flips the finished canvas. `RL` reverses every edge and
  the node order, so the flow runs right-to-left while labels stay upright.
- **No terminal detection.** The caller supplies the width and decides when to
  call; the library never reads `process.stdout.columns`.
- **Terminal support.** Labels are measured with `Intl.Segmenter` when the host
  provides it, with a manual grapheme fallback otherwise. Box-drawing
  characters are treated as one column; if your terminal renders
  ambiguous-width glyphs as double, use `profile: 'ascii'`.

## Development

```sh
bun install
bun run check   # typecheck + tests
bun run build   # dist/index.js + dist/index.d.ts
```

## Derivation and license

The character engine is derived from
[beautiful-mermaid](https://github.com/lukilabs/beautiful-mermaid)
(Copyright © 2026 Craft Docs, MIT), whose ASCII engine is a port of
[mermaid-ascii](https://github.com/AlexanderGrooff/mermaid-ascii)
(Copyright © 2023 Alexander Grooff, MIT).

mermaid-glyph adds terminal column measurement, width budgeting, overflow
strategies, structured semantic output and a rewritten public API. Both
upstream MIT notices are reproduced in [NOTICE](NOTICE); this project is
licensed under [MIT](LICENSE).
