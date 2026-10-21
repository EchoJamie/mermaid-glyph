import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import stringWidth from 'string-width'
import {
  GlyphParseError,
  displayWidth,
  parseFlowchart,
  renderGraphGlyph,
  renderMermaidGlyph,
} from '../src/index.ts'

const CJK = `flowchart LR
  A[接收请求] --> B{校验}
  B -->|通过| C[写入数据库]
  B -->|拒绝| D[返回错误]`

const expectWithinWidth = (text: readonly string[], width: number): void => {
  for (const line of text) expect(displayWidth(line)).toBeLessThanOrEqual(width)
}

describe('basic rendering', () => {
  test('single CJK node closes its box and aligns every row', () => {
    const result = renderMermaidGlyph('flowchart TD\n  A[中文]', { width: 40 })

    expect(result.status).toBe('ok')
    expect(result.lines.map((line) => line.text)).toEqual([
      '┌──────┐',
      '│      │',
      '│ 中文 │',
      '│      │',
      '└──────┘',
    ])
    // Every row is exactly eight terminal columns wide.
    for (const line of result.lines) expect(displayWidth(line.text)).toBe(8)
    expect(result.width).toBe(8)
    expect(result.height).toBe(5)
  })

  test('CJK, emoji and Hangul labels size their boxes by columns, not code units', () => {
    for (const label of ['中文', '👩‍💻', '한글', '🇨🇳']) {
      const result = renderMermaidGlyph(`flowchart TD\n  A[${label}]`, { width: 40 })
      expect(result.status).toBe('ok')
      const boxWidth = result.width
      for (const line of result.lines) expect(displayWidth(line.text)).toBe(boxWidth)
      expect(boxWidth).toBe(displayWidth(label) + 4)
    }
  })

  test('ascii profile emits no box-drawing characters', () => {
    const result = renderMermaidGlyph(CJK, { width: 100, profile: 'ascii' })
    expect(result.status).toBe('ok')
    expect(result.text).not.toMatch(/[┌┐└┘─│◇▼►]/)
    expect(result.text).toContain('+')
  })

  test('BT flips the drawing without breaking widths', () => {
    const result = renderMermaidGlyph('flowchart BT\n  A[下] --> B[上]', { width: 40 })
    expect(result.status).toBe('ok')
    // BT arrowheads point up.
    expect(result.text).toContain('▲')
    expectWithinWidth(result.lines.map((line) => line.text), 40)
  })
})

describe('acceptance scenes', () => {
  test('100 columns: CJK flowchart renders completely and closes every box', () => {
    const result = renderMermaidGlyph(CJK, { width: 100 })

    expect(result.status).toBe('ok')
    expect(result.width).toBeLessThanOrEqual(100)
    expectWithinWidth(result.lines.map((line) => line.text), 100)

    for (const label of ['接收请求', '校验', '写入数据库', '返回错误']) {
      expect(result.text).toContain(label)
    }

    // Each row that opens boxes closes the same number on that row.
    for (const line of result.lines) {
      const opens = (line.text.match(/[┌╭]/g) ?? []).length
      const closes = (line.text.match(/[┐╮]/g) ?? []).length
      expect(closes).toBe(opens)
      // An independent ruler agrees with the canvas cell model.
      expect(displayWidth(line.text)).toBe(stringWidth(line.text))
    }
  })

  test('200 columns: a realistic 18-node architecture renders whole', () => {
    const source = readFileSync(
      join(import.meta.dir, 'fixtures', 'architecture.mmd'),
      'utf8',
    )
    const result = renderMermaidGlyph(source, { width: 200 })

    expect(result.status).toBe('ok')
    expect(result.width).toBeLessThanOrEqual(200)
    for (const label of [
      '用户', 'Web 前端', 'API 网关', '认证服务', '限流服务',
      '用户服务', '订单服务', '通知服务', '搜索服务',
      '用户库', '订单库', '消息队列', '搜索索引',
      '邮件工人', '推送工人', '定时任务', '监控',
    ]) {
      expect(result.text).toContain(label)
    }

    // The same architecture also survives a 100-column budget with `fit`.
    const narrow = renderMermaidGlyph(source, { width: 100, overflow: 'fit' })
    expect(narrow.status).toBe('ok')
    expectWithinWidth(narrow.lines.map((line) => line.text), 100)
  })

  test('simple stacked subgraphs keep their labels', () => {
    const source = `flowchart TD
  subgraph 前端
    A[页面] --> B[状态]
  end
  subgraph 后端
    C[接口] --> D[(数据库)]
  end
  B --> C`
    const result = renderMermaidGlyph(source, { width: 80 })

    expect(result.status).toBe('ok')
    expect(result.text).toContain('前端')
    expect(result.text).toContain('后端')
    expect(result.text).toContain('页面')
    expect(result.text).toContain('数据库')
  })

  test('interleaved sibling subgraphs fall back instead of drawing a broken box', () => {
    const source = readFileSync(
      join(import.meta.dir, 'fixtures', 'overlapping-subgraphs.mmd'),
      'utf8',
    )
    const result = renderMermaidGlyph(source, { width: 200 })

    expect(result.status).toBe('fallback')
    expect(result.reason).toBe('unsupported-layout')
    expect(result.text).toBe(source.replace(/\n$/, ''))
  })

  test('200 columns: a 20-node architecture is not truncated or elided', () => {
    const labels = Array.from({ length: 20 }, (_, index) => `节点${index + 1}`)
    const lines = ['flowchart TD', `  A1[${labels[0]}]`]
    for (let index = 1; index < labels.length; index += 1) {
      lines.push(`  A${index + 1}[${labels[index]}]`)
      lines.push(`  A${index} --> A${index + 1}`)
    }

    const result = renderMermaidGlyph(lines.join('\n'), { width: 200 })

    expect(result.status).toBe('ok')
    expect(result.width).toBeLessThanOrEqual(200)
    for (const label of labels) expect(result.text).toContain(label)
  })
})

describe('overflow policies', () => {
  const narrow = `flowchart LR
  A[这是一个非常非常长的中文节点名称用于测试换行] --> B[另一个同样很长的节点名称]`

  test('source (default) falls back to the complete source when too wide', () => {
    const result = renderMermaidGlyph(narrow, { width: 30 })

    expect(result.status).toBe('fallback')
    expect(result.reason).toBe('too-wide')
    expect(result.lines.map((line) => line.text)).toEqual(narrow.split('\n'))
    expect(result.text).toBe(narrow)
  })

  test('compact tries tighter spacing, then falls back', () => {
    const result = renderMermaidGlyph(narrow, { width: 30, overflow: 'compact' })
    expect(result.status).toBe('fallback')
    expect(result.reason).toBe('too-wide')
  })

  test('fit wraps labels and keeps every character', () => {
    const result = renderMermaidGlyph(narrow, { width: 30, overflow: 'fit' })

    expect(result.status).toBe('ok')
    expectWithinWidth(result.lines.map((line) => line.text), 30)
    // Boxes sit side by side, so their wrapped lines interleave. Verify that
    // every label character survives the wrap by counting, not by substring.
    const flattened = result.text.replace(/[^\p{L}\p{N}]/gu, '')
    const counts = (text: string): Map<string, number> => {
      const map = new Map<string, number>()
      for (const char of text) map.set(char, (map.get(char) ?? 0) + 1)
      return map
    }
    const available = counts(flattened)
    for (const label of [
      '这是一个非常非常长的中文节点名称用于测试换行',
      '另一个同样很长的节点名称',
    ]) {
      for (const [char, count] of counts(label)) {
        expect(available.get(char) ?? 0).toBeGreaterThanOrEqual(count)
      }
    }
  })

  test('clip reports truncated and never exceeds the width', () => {
    const result = renderMermaidGlyph(narrow, { width: 30, overflow: 'clip' })

    expect(result.status).toBe('truncated')
    expect(result.reason).toBe('too-wide')
    expectWithinWidth(result.lines.map((line) => line.text), 30)
    expect(result.text).not.toMatch(/\s+$/m)
  })

  test('a diagram that already fits is not altered by the overflow policy', () => {
    for (const overflow of ['source', 'compact', 'fit', 'clip'] as const) {
      const result = renderMermaidGlyph('flowchart TD\n  A[ok]', { width: 40, overflow })
      expect(result.status).toBe('ok')
    }
  })
})

describe('limits and failures', () => {
  test('node limit becomes a fallback', () => {
    const source = 'flowchart LR\n  A --> B --> C'
    const result = renderMermaidGlyph(source, { width: 80, maxNodes: 2 })

    expect(result.status).toBe('fallback')
    expect(result.reason).toBe('too-many-nodes')
    expect(result.text).toBe(source)
  })

  test('unsupported diagram types fall back', () => {
    for (const source of [
      'stateDiagram-v2\n  A --> B',
      'sequenceDiagram\n  A->>B: hi',
      'classDiagram\n  A <|-- B',
      'erDiagram\n  A ||--o{ B : has',
      'xychart-beta\n  bar [1, 2]',
    ]) {
      const result = renderMermaidGlyph(source, { width: 80 })
      expect(result.status).toBe('fallback')
      expect(result.reason).toBe('unsupported-diagram')
      expect(result.text).toBe(source)
    }
  })

  test('invalid syntax falls back instead of throwing', () => {
    for (const source of ['nonsense', 'flowchart SIDEWAYS\n  A --> B', '']) {
      const result = renderMermaidGlyph(source, { width: 80 })
      expect(result.status).toBe('fallback')
      expect(result.reason).toBe('parse-error')
    }
  })

  test('a single trailing newline is dropped from fallback rows', () => {
    const result = renderMermaidGlyph('nonsense\n', { width: 80 })
    expect(result.lines.map((line) => line.text)).toEqual(['nonsense'])
  })

  test('invalid width is a programmer error', () => {
    expect(() => renderMermaidGlyph('flowchart TD\n  A', { width: 0 })).toThrow(TypeError)
    expect(() => renderMermaidGlyph('flowchart TD\n  A', { width: 1.5 })).toThrow(TypeError)
  })
})

describe('structured output', () => {
  test('lines expose semantic tokens and plain text by default', () => {
    const result = renderMermaidGlyph('flowchart TD\n  A[中文]', { width: 40 })
    const body = result.lines.find((line) => line.text === '│ 中文 │')

    expect(body).toBeDefined()
    expect(body?.segments.some((segment) => segment.token === 'border')).toBe(true)
    expect(body?.segments.some((segment) => segment.token === 'text')).toBe(true)
    expect(result.text).not.toContain('\x1b')
    expect(result.ansi).toBeUndefined()
  })

  test('ANSI output uses only host-provided tokens', () => {
    const result = renderMermaidGlyph('flowchart TD\n  A[中文]', {
      width: 40,
      ansi: true,
      style: { border: '90', text: '37' },
    })

    expect(result.text).not.toContain('\x1b')
    expect(result.ansi).toContain('\x1b[90m')
    expect(result.ansi).toContain('\x1b[37m')
    // Every styled segment is reset, so colors cannot bleed between lines.
    expect(result.ansi?.split('\x1b[0m').length).toBeGreaterThan(result.height)
  })

  test('parsed graphs render through the same pipeline', () => {
    const graph = parseFlowchart(CJK)
    const result = renderGraphGlyph(graph, CJK, { width: 100 })

    expect(result.status).toBe('ok')
    expect(result.text).toContain('接收请求')
  })

  test('parseFlowchart rejects non-flowcharts explicitly', () => {
    expect(() => parseFlowchart('sequenceDiagram\n  A->>B: hi')).toThrow(GlyphParseError)
    try {
      parseFlowchart('sequenceDiagram\n  A->>B: hi')
    } catch (error) {
      expect((error as GlyphParseError).reason).toBe('unsupported-diagram')
    }
  })
})
