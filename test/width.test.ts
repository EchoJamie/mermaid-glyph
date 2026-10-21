import { describe, expect, test } from 'bun:test'
import stringWidth from 'string-width'
import {
  cellsOf,
  displayWidth,
  padToWidth,
  truncateToWidth,
  wrapToWidth,
} from '../src/width.ts'

describe('displayWidth', () => {
  test('ASCII and box drawing occupy one column', () => {
    expect(displayWidth('abc')).toBe(3)
    expect(displayWidth('┌─┐')).toBe(3)
  })

  test('CJK / Hangul / fullwidth occupy two columns', () => {
    expect(displayWidth('中文')).toBe(4)
    expect(displayWidth('한글')).toBe(4)
    expect(displayWidth('ＡＢ')).toBe(4)
    expect(displayWidth('１２')).toBe(4)
  })

  test('emoji sequences count as one two-column grapheme', () => {
    expect(displayWidth('👩‍💻')).toBe(2) // ZWJ sequence
    expect(displayWidth('🇨🇳')).toBe(2) // regional indicator pair
    expect(displayWidth('🏳️‍🌈')).toBe(2) // VS16 + ZWJ
    expect(displayWidth('1️⃣')).toBe(2) // keycap
    expect(displayWidth('👍🏽')).toBe(2) // skin tone
  })

  test('combining marks and variation selectors add no columns', () => {
    expect(displayWidth('é')).toBe(1)
    expect(displayWidth('♥️')).toBe(2) // VS16 promotes the heart to emoji presentation
    expect(displayWidth('​')).toBe(0)
  })

  test('mixed text sums correctly', () => {
    expect(displayWidth('A中B👩‍💻')).toBe(1 + 2 + 1 + 2)
  })
})

describe('cellsOf', () => {
  test('wide characters occupy two cells, the second being a continuation', () => {
    expect(cellsOf('中a')).toEqual(['中', '', 'a'])
    expect(cellsOf('👩‍💻')).toEqual(['👩‍💻', ''])
  })

  test('zero-width marks stay attached to the previous cell', () => {
    expect(cellsOf('éx')).toEqual(['é', 'x'])
  })
})

describe('wrapToWidth', () => {
  test('breaks between CJK characters with no spaces', () => {
    expect(wrapToWidth('中文中文', 5)).toEqual(['中文', '中文'])
  })

  test('prefers breaking at spaces', () => {
    expect(wrapToWidth('alpha beta gamma', 11)).toEqual(['alpha beta', 'gamma'])
  })

  test('preserves explicit line breaks', () => {
    expect(wrapToWidth('甲\n乙', 10)).toEqual(['甲', '乙'])
  })

  test('never splits a wide character', () => {
    const lines = wrapToWidth('中中中', 3)
    expect(lines).toEqual(['中', '中', '中'])
    for (const line of lines) expect(displayWidth(line)).toBeLessThanOrEqual(4)
  })
})

describe('truncate / pad', () => {
  test('truncation stops before a wide character that would overflow', () => {
    expect(truncateToWidth('中文', 3)).toBe('中')
    expect(truncateToWidth('中文', 4)).toBe('中文')
    expect(truncateToWidth('abc', 0)).toBe('')
  })

  test('padding reaches exactly the requested columns', () => {
    expect(padToWidth('中', 4)).toBe('中  ')
    expect(padToWidth('中', 2)).toBe('中')
  })
})

describe('differential check against string-width', () => {
  test('matches the de facto terminal ruler on representative text', () => {
    const samples = [
      '中文', '한글', 'ＡＢ', '１２', 'こんにちは', 'Σίσυφος',
      '👩‍💻', '🇨🇳', '🏳️‍🌈', '1️⃣', '👍🏽', '♥️', '⚠️', '©', '™', '™️',
      'é', '┌─┐', '→', '·', '中文abc', '\u200b',
    ]
    for (const sample of samples) {
      expect({ sample, width: displayWidth(sample) }).toEqual({
        sample,
        width: stringWidth(sample),
      })
    }
  })
})
