// ============================================================================
// Public configuration and result types
// ============================================================================

/** Character repertoire for the diagram frame. */
export type GlyphProfile = 'unicode' | 'cjk' | 'ascii'

/** What to do when the natural drawing is wider than `width`.
 *
 * - `fit`     — compact spacing, then wrap labels until it fits;
 * - `compact` — compact spacing only;
 * - `clip`    — cut every line at `width` (status `truncated`);
 * - `source`  — return the original Mermaid text (the safe default).
 */
export type GlyphOverflow = 'fit' | 'compact' | 'clip' | 'source'

/** Semantic style token carried by a segment. Hosts map these to their own
 * palette; the library ships no product colors. */
export type GlyphToken = 'text' | 'border' | 'line' | 'arrow' | 'corner' | 'junction'

export type GlyphStatus = 'ok' | 'fallback' | 'truncated'

export type GlyphReason =
  | 'parse-error'
  | 'unsupported-diagram'
  | 'too-many-nodes'
  | 'too-wide'
  | 'internal-error'

export interface GlyphOptions {
  /** Available terminal columns. Required; must be a positive integer. */
  readonly width: number
  /** Frame characters. `unicode` and `cjk` use box-drawing characters;
   * `ascii` uses `+-|<>` (safe even where ambiguous-width glyphs are double). */
  readonly profile?: GlyphProfile
  /** Width overflow policy. Default `source`. */
  readonly overflow?: GlyphOverflow
  /** Refuse to draw graphs with more nodes than this. Default 50. */
  readonly maxNodes?: number
  /** Horizontal spacing between nodes, in columns. Default 5. */
  readonly paddingX?: number
  /** Vertical spacing between nodes, in rows. Default 5. */
  readonly paddingY?: number
  /** Padding inside node boxes. Default 1. */
  readonly boxPadding?: number
  /**
   * Wrap `segments` in ANSI SGR sequences. Values are SGR parameter strings,
   * e.g. `{ border: '90', text: '37' }`. No default palette is applied.
   */
  readonly ansi?: boolean
  /** Token → SGR parameter string, used only when `ansi` is true. */
  readonly style?: Partial<Record<GlyphToken, string>>
}

export interface GlyphSegment {
  /** Plain text of this segment. */
  readonly text: string
  /** Semantic role, absent for spacing / untracked cells. */
  readonly token?: GlyphToken
}

export interface GlyphLine {
  /** Plain text (no ANSI), trailing spaces removed. */
  readonly text: string
  readonly segments: readonly GlyphSegment[]
  /** ANSI-colored equivalent, present only when `ansi: true`. */
  readonly ansi?: string
}

export interface GlyphResult {
  readonly status: GlyphStatus
  /** Machine-readable cause when `status` is not `ok`. */
  readonly reason?: GlyphReason
  /** Original Mermaid text, always present for fallback paths. */
  readonly source: string
  /** One entry per terminal row. */
  readonly lines: readonly GlyphLine[]
  /** Actual maximum display width, in columns. */
  readonly width: number
  /** Actual number of rows. */
  readonly height: number
  /** Plain joined text (equivalent to `lines.map(line => line.text).join('\n')`). */
  readonly text: string
  /** ANSI joined text, present only when `ansi: true`. */
  readonly ansi?: string
}

export const DEFAULT_MAX_NODES = 50
export const DEFAULT_PADDING_X = 5
export const DEFAULT_PADDING_Y = 5
export const DEFAULT_BOX_PADDING = 1
