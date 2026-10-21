// ============================================================================
// Public render pipeline — Mermaid text → terminal rows
// ============================================================================

import type {
  GlyphLine,
  GlyphOptions,
  GlyphReason,
  GlyphResult,
  GlyphSegment,
  GlyphStatus,
  GlyphToken,
} from './config.ts'
import {
  DEFAULT_BOX_PADDING,
  DEFAULT_MAX_NODES,
  DEFAULT_PADDING_X,
  DEFAULT_PADDING_Y,
} from './config.ts'
import type { AsciiConfig, Canvas, RoleCanvas } from './ascii/types.ts'
import { convertToAsciiGraph } from './ascii/converter.ts'
import { createMapping } from './ascii/grid.ts'
import { drawGraph } from './ascii/draw.ts'
import {
  flipCanvasVertically,
  flipRoleCanvasVertically,
  getCanvasSize,
} from './ascii/canvas.ts'
import { parseMermaid } from './parser.ts'
import type { MermaidGraph, MermaidNode, MermaidSubgraph } from './types.ts'
import { displayWidth, truncateToWidth, wrapToWidth } from './width.ts'

/** Error raised when the source cannot be turned into a flowchart IR. */
export class GlyphParseError extends Error {
  readonly reason: GlyphReason

  constructor(reason: GlyphReason, message: string) {
    super(message)
    this.name = 'GlyphParseError'
    this.reason = reason
  }
}

/** Parse only flowcharts. Other Mermaid diagram types are rejected explicitly
 * so the host can fall back to the source code block. */
export function parseFlowchart(source: string): MermaidGraph {
  const header =
    source
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line !== '' && !line.startsWith('%%')) ?? ''

  if (header === '') throw new GlyphParseError('parse-error', 'empty mermaid diagram')

  if (!/^(?:graph|flowchart)\s+(?:TD|TB|LR|BT|RL)\s*$/i.test(header)) {
    if (/^(?:stateDiagram|sequenceDiagram|classDiagram|erDiagram|xychart)\b/i.test(header)) {
      throw new GlyphParseError(
        'unsupported-diagram',
        `unsupported diagram type: ${header.split(/\s+/)[0]}`,
      )
    }
    throw new GlyphParseError('parse-error', `invalid mermaid header: ${header}`)
  }

  return parseMermaid(source)
}

/** Render Mermaid flowchart text. Never throws on bad input — parse failures,
 * unsupported diagram types, node limits and width limits become `fallback`. */
export function renderMermaidGlyph(source: string, options: GlyphOptions): GlyphResult {
  const config = normalize(options)

  let graph: MermaidGraph
  try {
    graph = parseFlowchart(source)
  } catch (error) {
    if (error instanceof GlyphParseError) return fallback(source, error.reason, config)
    return fallback(source, 'parse-error', config)
  }

  return renderWith(graph, source, config)
}

/** Render an already parsed graph. `source` is carried through for fallbacks. */
export function renderGraphGlyph(
  graph: MermaidGraph,
  source: string,
  options: GlyphOptions,
): GlyphResult {
  return renderWith(graph, source, normalize(options))
}

function renderWith(graph: MermaidGraph, source: string, config: Normalized): GlyphResult {
  if (graph.nodes.size > config.maxNodes) {
    return fallback(source, 'too-many-nodes', config)
  }

  try {
    const natural = drawWith(graph, config, baseSpacing(config), null)
    if (natural.width <= config.width) return result('ok', natural.lines, source, config)

    switch (config.overflow) {
      default:
      case 'source':
        return fallback(source, 'too-wide', config)

      case 'clip': {
        const clipped = natural.lines.map((line) => clipLine(line, config))
        return result('truncated', clipped, source, config, 'too-wide')
      }

      case 'compact': {
        const compact = drawWith(graph, config, compactSpacing(config), null)
        if (compact.width <= config.width) return result('ok', compact.lines, source, config)
        return fallback(source, 'too-wide', config)
      }

      case 'fit': {
        const compact = drawWith(graph, config, compactSpacing(config), null)
        if (compact.width <= config.width) return result('ok', compact.lines, source, config)

        for (const labelWidth of wrapCandidates(config.width)) {
          const wrapped = drawWith(graph, config, compactSpacing(config), labelWidth)
          if (wrapped.width <= config.width) return result('ok', wrapped.lines, source, config)
        }

        return fallback(source, 'too-wide', config)
      }
    }
  } catch {
    return fallback(source, 'internal-error', config)
  }
}

// ══ Layout ═══════════════════════════════════════════════════════════════

type Spacing = {
  readonly paddingX: number
  readonly paddingY: number
  readonly boxPadding: number
}

type Drawing = {
  readonly lines: readonly GlyphLine[]
  readonly width: number
  readonly height: number
}

function drawWith(
  graph: MermaidGraph,
  config: Normalized,
  spacing: Spacing,
  labelWidth: number | null,
): Drawing {
  const prepared = labelWidth === null ? graph : wrapGraphLabels(graph, labelWidth)

  const asciiConfig: AsciiConfig = {
    useAscii: config.profile === 'ascii',
    paddingX: spacing.paddingX,
    paddingY: spacing.paddingY,
    boxBorderPadding: spacing.boxPadding,
    graphDirection:
      prepared.direction === 'LR' || prepared.direction === 'RL' ? 'LR' : 'TD',
  }

  const asciiGraph = convertToAsciiGraph(prepared, asciiConfig)
  createMapping(asciiGraph)
  drawGraph(asciiGraph)

  if (prepared.direction === 'BT') {
    flipCanvasVertically(asciiGraph.canvas)
    flipRoleCanvasVertically(asciiGraph.roleCanvas)
  }

  const lines = extractLines(asciiGraph.canvas, asciiGraph.roleCanvas, config)
  let width = 0
  for (const line of lines) width = Math.max(width, displayWidth(line.text))

  return { lines, width, height: lines.length }
}

function baseSpacing(config: Normalized): Spacing {
  return {
    paddingX: config.paddingX,
    paddingY: config.paddingY,
    boxPadding: config.boxPadding,
  }
}

function compactSpacing(config: Normalized): Spacing {
  return {
    paddingX: Math.min(config.paddingX, 1),
    paddingY: Math.min(config.paddingY, 1),
    boxPadding: Math.min(config.boxPadding, 0),
  }
}

/** Label widths to try for `fit`, widest first. */
function wrapCandidates(width: number): number[] {
  const values = [width - 2, Math.ceil(width / 2), Math.floor(width / 3), 24, 16, 12, 9, 6, 4]
  const out: number[] = []
  for (const value of values) {
    if (value >= 4 && value < width && !out.includes(value)) out.push(value)
  }
  return out
}

// ══ Label wrapping ═══════════════════════════════════════════════════════

function wrapGraphLabels(graph: MermaidGraph, width: number): MermaidGraph {
  const nodes = new Map<string, MermaidNode>()
  for (const [id, node] of graph.nodes) {
    nodes.set(id, { ...node, label: wrapLabel(node.label, width) })
  }

  const seen = new Map<MermaidSubgraph, MermaidSubgraph>()
  const cloneSubgraph = (sg: MermaidSubgraph): MermaidSubgraph => {
    const cached = seen.get(sg)
    if (cached !== undefined) return cached

    const copy: MermaidSubgraph = {
      ...sg,
      label: wrapLabel(sg.label, width),
      nodeIds: [...sg.nodeIds],
      children: [],
    }
    seen.set(sg, copy)
    copy.children = sg.children.map(cloneSubgraph)
    return copy
  }

  return {
    ...graph,
    nodes,
    edges: graph.edges.map((edge) =>
      edge.label === undefined
        ? edge
        : { ...edge, label: wrapLabel(edge.label, width) },
    ),
    subgraphs: graph.subgraphs.map(cloneSubgraph),
  }
}

function wrapLabel(label: string, width: number): string {
  return label
    .split('\n')
    .map((line) => wrapToWidth(line, width).join('\n'))
    .join('\n')
}

// ══ Canvas → structured lines ════════════════════════════════════════════

function extractLines(
  canvas: Canvas,
  roleCanvas: RoleCanvas,
  config: Normalized,
): GlyphLine[] {
  const [maxX, maxY] = getCanvasSize(canvas)
  const lines: GlyphLine[] = []

  for (let y = 0; y <= maxY; y++) {
    // Ignore trailing blank cells so the reported width is the real drawing.
    let last = -1
    for (let x = 0; x <= maxX; x++) {
      const cell = canvas[x]?.[y] ?? ' '
      if (cell !== ' ' && cell !== '') last = x
    }

    const segments: GlyphSegment[] = []
    let text = ''
    let previous: GlyphToken | undefined

    for (let x = 0; x <= last; x++) {
      const cell = canvas[x]?.[y] ?? ' '
      if (cell === '') continue // continuation of a wide character

      let token: GlyphToken | undefined
      if (cell !== ' ') {
        token = roleCanvas[x]?.[y] ?? undefined
        previous = token
      } else {
        token = previous
      }

      append(segments, cell, token)
      text += cell
    }

    const line: GlyphLine = {
      text,
      segments,
      ...(config.ansi ? { ansi: ansiOf(segments, config.style) } : {}),
    }
    lines.push(line)
  }

  return lines
}

function append(segments: GlyphSegment[], text: string, token: GlyphToken | undefined): void {
  if (text === '') return
  const last = segments[segments.length - 1]
  if (last !== undefined && last.token === token) {
    segments[segments.length - 1] = { ...last, text: last.text + text }
    return
  }
  segments.push(token === undefined ? { text } : { text, token })
}

function ansiOf(
  segments: readonly GlyphSegment[],
  style: Partial<Record<GlyphToken, string>>,
): string {
  let out = ''
  for (const segment of segments) {
    const code = segment.token === undefined ? undefined : style[segment.token]
    out += code === undefined ? segment.text : `\x1b[${code}m${segment.text}\x1b[0m`
  }
  return out
}

// ══ Results ══════════════════════════════════════════════════════════════

function result(
  status: GlyphStatus,
  lines: readonly GlyphLine[],
  source: string,
  config: Normalized,
  reason?: GlyphReason,
): GlyphResult {
  let width = 0
  for (const line of lines) width = Math.max(width, displayWidth(line.text))

  return {
    status,
    ...(reason === undefined ? {} : { reason }),
    source,
    lines,
    width,
    height: lines.length,
    text: lines.map((line) => line.text).join('\n'),
    ...(config.ansi ? { ansi: lines.map((line) => line.ansi ?? line.text).join('\n') } : {}),
  }
}

function fallback(source: string, reason: GlyphReason, config: Normalized): GlyphResult {
  const raw = source.split('\n')
  if (raw.length > 0 && raw[raw.length - 1] === '') raw.pop()

  const lines: GlyphLine[] = raw.map((text) => {
    const segments: GlyphSegment[] = [{ text, token: 'text' }]
    return {
      text,
      segments,
      ...(config.ansi ? { ansi: ansiOf(segments, config.style) } : {}),
    }
  })

  return result('fallback', lines, source, config, reason)
}

function clipLine(line: GlyphLine, config: Normalized): GlyphLine {
  const text = truncateToWidth(line.text, config.width).replace(/ +$/, '')
  // Re-use the segment boundaries by walking the truncated text.
  const segments: GlyphSegment[] = []
  let used = 0
  for (const segment of line.segments) {
    const remaining = config.width - used
    if (remaining <= 0) break
    const piece = truncateToWidth(segment.text, remaining)
    if (piece !== '') {
      append(segments, piece, segment.token)
      used += displayWidth(piece)
    }
  }

  // Drop any trailing spaces the cut may have left behind.
  while (segments.length > 0) {
    const last = segments[segments.length - 1] as GlyphSegment
    const trimmed = last.text.replace(/ +$/, '')
    if (trimmed === last.text) break
    if (trimmed === '') segments.pop()
    else segments[segments.length - 1] = { ...last, text: trimmed }
  }

  return {
    text,
    segments,
    ...(config.ansi ? { ansi: ansiOf(segments, config.style) } : {}),
  }
}

// ══ Options ══════════════════════════════════════════════════════════════

type Normalized = {
  readonly width: number
  readonly profile: 'unicode' | 'cjk' | 'ascii'
  readonly overflow: 'fit' | 'compact' | 'clip' | 'source'
  readonly maxNodes: number
  readonly paddingX: number
  readonly paddingY: number
  readonly boxPadding: number
  readonly ansi: boolean
  readonly style: Partial<Record<GlyphToken, string>>
}

function normalize(options: GlyphOptions): Normalized {
  if (!Number.isInteger(options.width) || options.width < 1) {
    throw new TypeError('mermaid-glyph: options.width must be a positive integer')
  }

  const profile = options.profile ?? 'unicode'
  if (profile !== 'unicode' && profile !== 'cjk' && profile !== 'ascii') {
    throw new TypeError(`mermaid-glyph: unknown profile "${String(profile)}"`)
  }

  const overflow = options.overflow ?? 'source'
  if (
    overflow !== 'fit' &&
    overflow !== 'compact' &&
    overflow !== 'clip' &&
    overflow !== 'source'
  ) {
    throw new TypeError(`mermaid-glyph: unknown overflow policy "${String(overflow)}"`)
  }

  return {
    width: options.width,
    profile,
    overflow,
    maxNodes: nonNegative(options.maxNodes ?? DEFAULT_MAX_NODES, 'maxNodes'),
    paddingX: nonNegative(options.paddingX ?? DEFAULT_PADDING_X, 'paddingX'),
    paddingY: nonNegative(options.paddingY ?? DEFAULT_PADDING_Y, 'paddingY'),
    boxPadding: nonNegative(options.boxPadding ?? DEFAULT_BOX_PADDING, 'boxPadding'),
    ansi: options.ansi === true,
    style: options.style ?? {},
  }
}

function nonNegative(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`mermaid-glyph: options.${name} must be a non-negative number`)
  }
  return value
}
