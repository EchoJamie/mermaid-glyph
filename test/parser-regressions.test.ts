import { describe, expect, test } from 'bun:test'
import { renderMermaidGlyph } from '../src/index.ts'

const render = (source: string, width = 80) => renderMermaidGlyph(source, { width })

describe('edges without spaces', () => {
  test('solid, dotted and open edges parse like their spaced forms', () => {
    const pairs = [
      ['flowchart LR\n  A-->B', 'flowchart LR\n  A --> B'],
      ['flowchart LR\n  A-.->B', 'flowchart LR\n  A -.-> B'],
      ['flowchart LR\n  A---B', 'flowchart LR\n  A --- B'],
      ['flowchart LR\n  A==>B', 'flowchart LR\n  A ==> B'],
    ]

    for (const [compact, spaced] of pairs) {
      const tight = render(compact as string)
      const loose = render(spaced as string)
      expect(tight.status).toBe('ok')
      expect(tight.text).toBe(loose.text)
      expect(tight.text).toContain('A')
      expect(tight.text).toContain('B')
    }
  })

  test('edge labels work without spaces around the pipe', () => {
    const tight = render('flowchart LR\n  A-->|标签|B')
    const loose = render('flowchart LR\n  A -->|标签| B')

    expect(tight.status).toBe('ok')
    expect(tight.text).toBe(loose.text)
    expect(tight.text).toContain('标签')
  })

  test('chains without spaces produce every edge', () => {
    const result = render('flowchart LR\n  A-->B-->C')
    expect(result.status).toBe('ok')
    expect(result.text).toContain('A')
    expect(result.text).toContain('B')
    expect(result.text).toContain('C')
    // Two horizontal connectors, i.e. two arrows.
    expect((result.text.match(/►/g) ?? []).length).toBe(2)
  })
})

describe('semicolon-separated statements', () => {
  test('a single-line header and statement', () => {
    const result = render('flowchart TD; A --> B')
    expect(result.status).toBe('ok')
    expect(result.text).toContain('A')
    expect(result.text).toContain('B')
  })

  test('multiple statements on one line', () => {
    const result = render('flowchart LR; A --> B; B --> C')
    expect(result.status).toBe('ok')
    expect(result.text).toContain('A')
    expect(result.text).toContain('B')
    expect(result.text).toContain('C')
    expect((result.text.match(/►/g) ?? []).length).toBe(2)
  })

  test('semicolons inside labels are not separators', () => {
    const nodeLabel = render('flowchart LR; A["甲;乙"] --> B')
    expect(nodeLabel.status).toBe('ok')
    expect(nodeLabel.text).toContain('甲;乙')

    const edgeLabel = render('flowchart LR; A -->|是;否| B')
    expect(edgeLabel.status).toBe('ok')
    expect(edgeLabel.text).toContain('是;否')
  })

  test('empty statements and trailing semicolons are tolerated', () => {
    const result = render('flowchart TD;;; A --> B;')
    expect(result.status).toBe('ok')
    expect(result.text).toContain('A')
  })
})

describe('post declarations', () => {
  test('a later declaration updates an existing node label', () => {
    const result = render('flowchart LR\n  A --> B\n  B["乙"]')
    expect(result.status).toBe('ok')
    expect(result.text).toContain('乙')
    expect(result.text).not.toContain('│ B │')
  })

  test('a later shape declaration also updates the shape', () => {
    const result = render('flowchart LR\n  A --> B\n  B{判断}')
    expect(result.status).toBe('ok')
    expect(result.text).toContain('判断')
    expect(result.text).toContain('◇')
  })

  test('bare references never overwrite an explicit label', () => {
    const result = render('flowchart LR\n  B["乙"]\n  A --> B')
    expect(result.status).toBe('ok')
    expect(result.text).toContain('乙')
    expect(result.text).not.toContain('│ B │')
  })
})

describe('invalid identifiers', () => {
  test('non-ASCII node ids fall back as parse errors', () => {
    for (const source of [
      'flowchart LR\n  甲["甲"] --> 乙["乙"]',
      'flowchart LR\n  A --> 甲["甲"]',
      'flowchart LR\n  甲 --> 乙',
    ]) {
      const result = render(source)
      expect(result.status).toBe('fallback')
      expect(result.reason).toBe('parse-error')
      expect(result.text).toBe(source)
    }
  })

  test('non-ASCII labels on ASCII ids remain valid', () => {
    const result = render('flowchart LR\n  A["甲"] --> B["乙"]')
    expect(result.status).toBe('ok')
    expect(result.text).toContain('甲')
    expect(result.text).toContain('乙')
  })
})

describe('empty diagrams', () => {
  test('a header without nodes falls back with empty-diagram', () => {
    for (const source of [
      'flowchart TD',
      'flowchart TD\n%% 只是注释',
      '%% 只有注释',
      'graph LR;',
      '   ',
    ]) {
      const result = render(source)
      expect(result.status).toBe('fallback')
      expect(result.reason).toBe('empty-diagram')
    }
  })

  test('a single declared node is not empty', () => {
    const result = render('flowchart TD\n  A[唯一]')
    expect(result.status).toBe('ok')
    expect(result.text).toContain('唯一')
  })
})

describe('right-to-left', () => {
  test('RL reverses node order and points arrows left', () => {
    const result = render('flowchart RL\n  A[甲] --> B[乙]')

    expect(result.status).toBe('ok')
    const body = result.lines.find((line) => line.text.includes('甲'))?.text ?? ''
    expect(body.indexOf('乙')).toBeLessThan(body.indexOf('甲'))
    expect(result.text).toContain('◄')
    expect(result.text).not.toContain('►')
  })

  test('RL keeps labels upright and edge labels readable', () => {
    const result = render('flowchart RL\n  A[甲] -->|去| B[乙]')
    expect(result.status).toBe('ok')
    expect(result.text).toContain('去')
    expect(result.text).toContain('乙')
    expect(result.text).toContain('甲')
    expect(result.text).toContain('◄')
  })

  test('RL chains flow from right to left', () => {
    const result = render('flowchart RL\n  A[甲] --> B[乙] --> C[丙]')
    expect(result.status).toBe('ok')
    const body = result.lines.find((line) => line.text.includes('丙'))?.text ?? ''
    expect(body.indexOf('丙')).toBeLessThan(body.indexOf('乙'))
    expect(body.indexOf('乙')).toBeLessThan(body.indexOf('甲'))
    expect((result.text.match(/◄/g) ?? []).length).toBe(2)
  })

  test('bidirectional RL keeps both arrowheads', () => {
    const result = render('flowchart RL\n  A[甲] <--> B[乙]')
    expect(result.status).toBe('ok')
    expect(result.text).toContain('◄')
    expect(result.text).toContain('►')
  })
})
