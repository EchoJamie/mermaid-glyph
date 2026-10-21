// ============================================================================
// Terminal column measurement — the single ruler used by the whole library
// ============================================================================
//
// Measurement, wrapping, truncation and canvas writing all go through this
// module. Widths are terminal columns, not UTF-16 code units:
//
//   - CJK / Hangul / fullwidth forms ............ 2 columns
//   - emoji sequences (ZWJ, VS16, flags, ...) ... 2 columns
//   - combining marks / variation selectors ...... 0 columns
//   - everything else ............................ 1 column
//
// Box-drawing characters (U+2500–U+257F) are treated as narrow. Most CJK
// terminals render them narrow too; a host configured for ambiguous-wide
// rendering can use the `ascii` profile instead.

/** Zero-width code points. */
function isZeroWidth(code: number): boolean {
  return (
    code === 0x200b || // zero width space
    code === 0x200c || // zero width non-joiner
    code === 0x200d || // zero width joiner
    code === 0x2060 || // word joiner
    code === 0xfeff || // BOM / zero width no-break space
    (code >= 0xfe00 && code <= 0xfe0f) || // variation selectors
    (code >= 0xe0100 && code <= 0xe01ef) || // variation selectors supplement
    (code >= 0x0300 && code <= 0x036f) || // combining diacritical marks
    (code >= 0x1ab0 && code <= 0x1aff) ||
    (code >= 0x1dc0 && code <= 0x1dff) ||
    (code >= 0x20d0 && code <= 0x20ff) ||
    (code >= 0xfe20 && code <= 0xfe2f) ||
    (code >= 0x1f3fb && code <= 0x1f3ff) // emoji skin-tone modifiers
  )
}

/** East Asian Wide / Fullwidth code points (terminal columns 2). */
function isWide(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) || // Hangul Jamo
    (code >= 0x2e80 && code <= 0x303e) ||
    (code >= 0x3041 && code <= 0x33ff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xa000 && code <= 0xa4cf) ||
    (code >= 0xa960 && code <= 0xa97f) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe10 && code <= 0xfe19) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1b000 && code <= 0x1b2ff) ||
    (code >= 0x1f200 && code <= 0x1f251) ||
    (code >= 0x20000 && code <= 0x3fffd)
  )
}

const PICTOGRAPHIC = /\p{Extended_Pictographic}/u
const EMOJI_PRESENTATION = /\p{Emoji_Presentation}/u

/** Regional indicator pair (a flag) is one grapheme. */
function isRegionalIndicator(code: number): boolean {
  return code >= 0x1f1e6 && code <= 0x1f1ff
}

/** Split text into terminal cells; a wide character occupies two cells (the
 * second one is the empty string, a continuation marker). */
export function cellsOf(text: string): string[] {
  const cells: string[] = []
  for (const cluster of graphemes(text)) {
    const width = clusterWidth(cluster)
    if (width === 0) {
      // Zero-width marks join the previous cell when one exists.
      if (cells.length > 0) cells[cells.length - 1] += cluster
      continue
    }
    cells.push(cluster)
    if (width === 2) cells.push('')
  }
  return cells
}

/** Display width of one grapheme cluster. */
export function clusterWidth(cluster: string): number {
  if (cluster === '') return 0

  let hasBase = false
  let wideBase = 0
  let emojiPresentation = false
  let pictographic = false
  let hasVS16 = false
  let hasZWJ = false
  let skinTone = false
  let regional = 0

  for (const char of cluster) {
    const code = char.codePointAt(0) ?? 0

    // Zero-width modifiers that decide whether the base is an emoji.
    if (code === 0xfe0f) { hasVS16 = true; continue }
    if (code === 0x200d) { hasZWJ = true; continue }
    if (code === 0x20e3) { emojiPresentation = true; hasBase = true; continue }
    if (code >= 0x1f3fb && code <= 0x1f3ff) { skinTone = true; continue }
    if (isRegionalIndicator(code)) regional += 1

    if (isZeroWidth(code)) continue
    if (code < 0x20 || code === 0x7f) continue

    hasBase = true
    if (isWide(code)) wideBase = 2
    if (EMOJI_PRESENTATION.test(char)) emojiPresentation = true
    if (PICTOGRAPHIC.test(char)) pictographic = true
  }

  if (!hasBase) return 0
  const emoji =
    emojiPresentation ||
    hasVS16 ||
    skinTone ||
    regional >= 2 ||
    (hasZWJ && pictographic)
  return emoji || wideBase === 2 ? 2 : 1
}

/** Display width of a string, in terminal columns. */
export function displayWidth(text: string): number {
  let width = 0
  for (const cluster of graphemes(text)) width += clusterWidth(cluster)
  return width
}

/** Wrap text to a maximum display width. Breaks at spaces when possible and
 * between grapheme clusters otherwise (CJK has no spaces). */
export function wrapToWidth(text: string, width: number): string[] {
  if (width <= 0) return [text]

  const out: string[] = []

  for (const paragraph of text.split('\n')) {
    if (paragraph === '') {
      out.push('')
      continue
    }

    const clusters = [...graphemes(paragraph)]
    let line: string[] = []
    let used = 0
    let lastSpace = -1

    const flush = (end: number): void => {
      const kept = line.slice(0, end)
      while (kept.length > 0 && (kept[kept.length - 1] as string).trim() === '') kept.pop()
      out.push(kept.join(''))
      line = line.slice(end)
      used = displayWidth(line.join(''))
      lastSpace = -1
    }

    for (const cluster of clusters) {
      const size = clusterWidth(cluster)
      if (line.length > 0 && used + size > width) {
        // Prefer the last space break; otherwise break here.
        if (lastSpace > 0) flush(lastSpace + 1)
        else flush(line.length)
      }

      line.push(cluster)
      used += size
      if (cluster === ' ') lastSpace = line.length - 1
    }

    if (line.length > 0) {
      while (line.length > 0 && (line[line.length - 1] as string).trim() === '') line.pop()
      out.push(line.join(''))
    } else if (out.length === 0 || out[out.length - 1] !== '') {
      out.push('')
    }
  }

  return out
}

/** Cut text to at most `width` columns without splitting a wide character. */
export function truncateToWidth(text: string, width: number): string {
  if (width <= 0) return ''

  let out = ''
  let used = 0

  for (const cluster of graphemes(text)) {
    const size = clusterWidth(cluster)
    if (used + size > width) break
    out += cluster
    used += size
  }

  return out
}

/** Pad text with spaces on the right to exactly `width` columns (never cuts). */
export function padToWidth(text: string, width: number): string {
  const current = displayWidth(text)
  return current >= width ? text : text + ' '.repeat(width - current)
}

/**
 * Grapheme segmentation. `Intl.Segmenter` is a built-in, not a dependency;
 * the manual fallback handles the sequences that matter for terminal widths
 * if the host lacks it.
 */
let cachedSegmenter: Intl.Segmenter | null | undefined

function segmenter(): Intl.Segmenter | null {
  if (cachedSegmenter !== undefined) return cachedSegmenter
  const Segmenter = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter
  cachedSegmenter =
    Segmenter === undefined ? null : new Segmenter('en', { granularity: 'grapheme' })
  return cachedSegmenter
}

function* graphemes(text: string): Generator<string> {
  const active = segmenter()
  if (active !== null) {
    for (const piece of active.segment(text)) yield piece.segment
    return
  }

  yield* manualGraphemes(text)
}

function* manualGraphemes(text: string): Generator<string> {
  let current = ''
  let joinNext = false
  let regionalRun = 0

  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    const combining = isZeroWidth(code) && code !== 0x200d
    const regional = isRegionalIndicator(code)

    if (current === '') {
      current = char
      regionalRun = regional ? 1 : 0
      continue
    }

    if (joinNext || combining || (regional && regionalRun === 1)) {
      current += char
      joinNext = code === 0x200d
      regionalRun = regional ? regionalRun + 1 : 0
      continue
    }

    yield current
    current = char
    joinNext = code === 0x200d
    regionalRun = regional ? 1 : 0
  }

  if (current !== '') yield current
}
