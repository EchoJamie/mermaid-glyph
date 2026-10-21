import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import pkg from '../package.json'

const root = join(import.meta.dir, '..')

describe('package contract', () => {
  test('name, version, license and zero runtime dependencies', () => {
    expect(pkg.name).toBe('mermaid-glyph')
    expect(pkg.version).toBe('0.1.0')
    expect(pkg.license).toBe('MIT')
    const manifest = pkg as Record<string, unknown>
    expect(manifest.dependencies ?? {}).toEqual({})
    expect(manifest.peerDependencies ?? {}).toEqual({})
  })

  test('no source file imports a runtime package', () => {
    const offenders: string[] = []

    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) {
          walk(path)
          continue
        }
        if (!entry.name.endsWith('.ts')) continue

        const source = readFileSync(path, 'utf8')
        for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
          const specifier = match[1] as string
          if (!specifier.startsWith('.') && !specifier.startsWith('node:')) {
            offenders.push(`${path}: ${specifier}`)
          }
        }
      }
    }

    walk(join(root, 'src'))
    expect(offenders).toEqual([])
  })

  test('LICENSE and NOTICE keep the attribution chain', () => {
    const license = readFileSync(join(root, 'LICENSE'), 'utf8')
    const notice = readFileSync(join(root, 'NOTICE'), 'utf8')

    expect(license).toContain('MIT License')
    expect(license).toContain('Copyright (c) 2026 EchoJamie')
    expect(notice).toContain('Copyright (c) 2026 Craft Docs')
    expect(notice).toContain('Copyright (c) 2023 Alexander Grooff')
    expect(notice).toContain('https://github.com/lukilabs/beautiful-mermaid')
    expect(notice).toContain('https://github.com/AlexanderGrooff/mermaid-ascii')
  })
})
