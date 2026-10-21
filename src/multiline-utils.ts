// ============================================================================
// Label normalization — shared by the flowchart parser
// ============================================================================
//
// Derived from beautiful-mermaid; trimmed to the pieces the ASCII flowchart
// path uses. SVG-specific escaping and inline formatting are intentionally
// left out: terminal output is plain text.

/** Strip surrounding quotes, turn `<br>` and literal `\n` into newlines, and
 * remove HTML tags that have no terminal meaning. */
export function normalizeBrTags(label: string): string {
  const unquoted =
    label.startsWith('"') && label.endsWith('"') ? label.slice(1, -1) : label
  return unquoted
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\\n/g, '\n')
    .replace(/<\/?(?:sub|sup|small|mark)\s*>/gi, '')
    .replace(/<\/?(?:b|strong|i|em|u|s|del)\s*>/gi, '')
}
