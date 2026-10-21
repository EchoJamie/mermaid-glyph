// ============================================================================
// Public errors
// ============================================================================

/** Reasons a source document can be rejected before layout. */
export type ParseReason = 'parse-error' | 'unsupported-diagram' | 'empty-diagram'

/** Error raised when the source cannot be turned into a flowchart IR. */
export class GlyphParseError extends Error {
  readonly reason: ParseReason

  constructor(reason: ParseReason, message: string) {
    super(message)
    this.name = 'GlyphParseError'
    this.reason = reason
  }
}
