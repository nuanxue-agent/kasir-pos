/**
 * Unit tests for src/lib/export.ts
 * Tests run in jsdom so DOM APIs (Blob, URL, document) are available.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Mock browser APIs not provided by jsdom ────────────────────────────────
const mockClick = vi.fn()
const mockAppendChild = vi.fn()
const mockRemoveChild = vi.fn()
let anchorHref = ''
let anchorDownload = ''

beforeEach(() => {
  anchorHref = ''
  anchorDownload = ''
  mockClick.mockReset()

  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'a') {
      const a = {
        set href(v: string) {
          anchorHref = v
        },
        get href() {
          return anchorHref
        },
        set download(v: string) {
          anchorDownload = v
        },
        get download() {
          return anchorDownload
        },
        style: { display: '' },
        click: mockClick,
      }
      return a as unknown as HTMLElement
    }
    return document.createElement.call(document, tag)
  })

  vi.spyOn(document.body, 'appendChild').mockImplementation(mockAppendChild as any)
  vi.spyOn(document.body, 'removeChild').mockImplementation(mockRemoveChild as any)
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ── Helpers ────────────────────────────────────────────────────────────────

/** Capture the Blob content passed to the anchor click */
async function captureCSV(): Promise<string> {
  // createObjectURL receives the Blob; we inspect via the mock
  const blobArg = (URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Blob
  return blobArg.text()
}

// ── Import subject under test ──────────────────────────────────────────────
import { exportToCSV } from '@/lib/export'

// ═══════════════════════════════════════════════════════════════════════════
// CSV generation
// ═══════════════════════════════════════════════════════════════════════════

describe('exportToCSV — basic generation', () => {
  it('triggers a download with .csv extension', async () => {
    exportToCSV([{ name: 'Alice', age: 30 }], 'test-file')
    expect(anchorDownload).toBe('test-file.csv')
    expect(mockClick).toHaveBeenCalledOnce()
  })

  it('generates correct header row', async () => {
    exportToCSV([{ name: 'Alice', age: 30 }], 'test')
    const text = await captureCSV()
    const firstLine = text.split('\n')[0]
    expect(firstLine).toBe('name,age')
  })

  it('generates correct data rows', async () => {
    exportToCSV(
      [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
      ],
      'test',
    )
    const text = await captureCSV()
    const lines = text.split('\n').filter(Boolean)
    expect(lines).toHaveLength(3) // header + 2 rows
    expect(lines[1]).toBe('Alice,30')
    expect(lines[2]).toBe('Bob,25')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Header ordering
// ═══════════════════════════════════════════════════════════════════════════

describe('exportToCSV — header ordering', () => {
  it('respects explicit headers array order', async () => {
    exportToCSV([{ z: 'last', a: 'first', m: 'mid' }], 'test', ['a', 'm', 'z'])
    const text = await captureCSV()
    const lines = text.split('\n').filter(Boolean)
    expect(lines[0]).toBe('a,m,z')
    expect(lines[1]).toBe('first,mid,last')
  })

  it('only includes columns listed in headers', async () => {
    exportToCSV([{ id: 1, secret: 'hidden', name: 'Alice' }], 'test', ['id', 'name'])
    const text = await captureCSV()
    const lines = text.split('\n').filter(Boolean)
    expect(lines[0]).toBe('id,name')
    expect(lines[1]).toBe('1,Alice')
    expect(lines[1]).not.toContain('hidden')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Special characters escaping
// ═══════════════════════════════════════════════════════════════════════════

describe('exportToCSV — special character escaping', () => {
  it('wraps values with commas in double quotes', async () => {
    exportToCSV([{ desc: 'apples, oranges' }], 'test')
    const text = await captureCSV()
    expect(text).toContain('"apples, oranges"')
  })

  it('escapes double-quote characters by doubling them', async () => {
    exportToCSV([{ note: 'say "hello"' }], 'test')
    const text = await captureCSV()
    expect(text).toContain('"say ""hello"""')
  })

  it('wraps values with newlines in double quotes', async () => {
    exportToCSV([{ multiline: 'line1\nline2' }], 'test')
    const text = await captureCSV()
    expect(text).toContain('"line1\nline2"')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Empty data handling
// ═══════════════════════════════════════════════════════════════════════════

describe('exportToCSV — empty data handling', () => {
  it('produces a file with only a header row when headers provided and data is empty', async () => {
    exportToCSV([], 'empty', ['id', 'name'])
    const text = await captureCSV()
    expect(text.trim()).toBe('id,name')
    expect(mockClick).toHaveBeenCalledOnce()
  })

  it('produces an empty file (just newline) when data is empty and no headers', async () => {
    exportToCSV([], 'empty')
    const text = await captureCSV()
    expect(text.trim()).toBe('')
    expect(mockClick).toHaveBeenCalledOnce()
  })

  it('handles null and undefined cell values gracefully', async () => {
    exportToCSV([{ name: null, value: undefined, count: 0 }], 'test')
    const text = await captureCSV()
    const dataLine = text.split('\n').filter(Boolean)[1]
    expect(dataLine).toBe(',,0')
  })
})
