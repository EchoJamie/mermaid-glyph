// ============================================================================
// ASCII renderer — multi-line label utilities
// ============================================================================

/**
 * Split a label into lines. Labels are already normalized by the parser
 * (`<br>` and literal `\n` become newlines).
 */
export function splitLines(label: string): string[] {
  return label.split('\n')
}
