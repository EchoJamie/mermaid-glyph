// ============================================================================
// mermaid-glyph — Mermaid flowcharts as terminal character rows
// ============================================================================
//
// The library knows nothing about terminals, TUI frameworks or product
// palettes. Callers pass Mermaid text (or a parsed graph) and an available
// column width; they get plain lines, semantic segments and a status.

export { renderMermaidGlyph, renderGraphGlyph, parseFlowchart } from './render.ts'
export { GlyphParseError } from './errors.ts'
export type { ParseReason } from './errors.ts'
export { splitStatements } from './parser.ts'
export {
  DEFAULT_BOX_PADDING,
  DEFAULT_MAX_NODES,
  DEFAULT_PADDING_X,
  DEFAULT_PADDING_Y,
} from './config.ts'
export type {
  GlyphLine,
  GlyphOptions,
  GlyphOverflow,
  GlyphProfile,
  GlyphReason,
  GlyphResult,
  GlyphSegment,
  GlyphStatus,
  GlyphToken,
} from './config.ts'
export { displayWidth, cellsOf, wrapToWidth, truncateToWidth, padToWidth } from './width.ts'
export type {
  Direction,
  EdgeStyle,
  MermaidEdge,
  MermaidGraph,
  MermaidNode,
  MermaidSubgraph,
  NodeShape,
} from './types.ts'
