// ─── Code128 SVG Barcode Renderer ─────────────────────────────────────────────
// Pure TypeScript implementation — no external libraries.
// Generates Code128B barcodes as SVG strings.

// Code128B encoding table: each entry is an 11-bit bar pattern (1=bar, 0=space)
// plus the checksum value.
const CODE128B: Record<string, { bars: string; value: number }> = {
  ' ': { bars: '11011001100', value: 0 },
  '!': { bars: '11001101100', value: 1 },
  '"': { bars: '11001100110', value: 2 },
  '#': { bars: '10010011000', value: 3 },
  $: { bars: '10010001100', value: 4 },
  '%': { bars: '10001001100', value: 5 },
  '&': { bars: '10011001000', value: 6 },
  "'": { bars: '10011000100', value: 7 },
  '(': { bars: '10001100100', value: 8 },
  ')': { bars: '11001001000', value: 9 },
  '*': { bars: '11001000100', value: 10 },
  '+': { bars: '11000100100', value: 11 },
  ',': { bars: '10110011100', value: 12 },
  '-': { bars: '10011011100', value: 13 },
  '.': { bars: '10011001110', value: 14 },
  '/': { bars: '10111001100', value: 15 },
  '0': { bars: '10011101100', value: 16 },
  '1': { bars: '10011100110', value: 17 },
  '2': { bars: '11001110010', value: 18 },
  '3': { bars: '11001011100', value: 19 },
  '4': { bars: '11001001110', value: 20 },
  '5': { bars: '11011100100', value: 21 },
  '6': { bars: '11001110100', value: 22 },
  '7': { bars: '11101101110', value: 23 },
  '8': { bars: '11101001100', value: 24 },
  '9': { bars: '11100101100', value: 25 },
  ':': { bars: '11100100110', value: 26 },
  ';': { bars: '11101100100', value: 27 },
  '<': { bars: '11100110100', value: 28 },
  '=': { bars: '11100110010', value: 29 },
  '>': { bars: '11011011000', value: 30 },
  '?': { bars: '11011000110', value: 31 },
  '@': { bars: '11000110110', value: 32 },
  A: { bars: '10100011000', value: 33 },
  B: { bars: '10001011000', value: 34 },
  C: { bars: '10001000110', value: 35 },
  D: { bars: '10110001000', value: 36 },
  E: { bars: '10001101000', value: 37 },
  F: { bars: '10001100010', value: 38 },
  G: { bars: '11010001000', value: 39 },
  H: { bars: '11000101000', value: 40 },
  I: { bars: '11000100010', value: 41 },
  J: { bars: '10110111000', value: 42 },
  K: { bars: '10110001110', value: 43 },
  L: { bars: '10001101110', value: 44 },
  M: { bars: '10111011000', value: 45 },
  N: { bars: '10111000110', value: 46 },
  O: { bars: '10001110110', value: 47 },
  P: { bars: '11101110110', value: 48 },
  Q: { bars: '11010001110', value: 49 },
  R: { bars: '11000101110', value: 50 },
  S: { bars: '11011101000', value: 51 },
  T: { bars: '11011100010', value: 52 },
  U: { bars: '11011101110', value: 53 },
  V: { bars: '11101011000', value: 54 },
  W: { bars: '11101000110', value: 55 },
  X: { bars: '11100010110', value: 56 },
  Y: { bars: '11101101000', value: 57 },
  Z: { bars: '11101100010', value: 58 },
  '[': { bars: '11100011010', value: 59 },
  '\\': { bars: '11101111010', value: 60 },
  ']': { bars: '11001000010', value: 61 },
  '^': { bars: '11110001010', value: 62 },
  _: { bars: '10100110000', value: 63 },
  '`': { bars: '10100001100', value: 64 },
  a: { bars: '10010110000', value: 65 },
  b: { bars: '10010000110', value: 66 },
  c: { bars: '10000101100', value: 67 },
  d: { bars: '10000100110', value: 68 },
  e: { bars: '10110010000', value: 69 },
  f: { bars: '10110000100', value: 70 },
  g: { bars: '10011010000', value: 71 },
  h: { bars: '10011000010', value: 72 },
  i: { bars: '10000110100', value: 73 },
  j: { bars: '10000110010', value: 74 },
  k: { bars: '11000010010', value: 75 },
  l: { bars: '11001010000', value: 76 },
  m: { bars: '11110111010', value: 77 },
  n: { bars: '11000010100', value: 78 },
  o: { bars: '10001111010', value: 79 },
  p: { bars: '10100111100', value: 80 },
  q: { bars: '10010111100', value: 81 },
  r: { bars: '10010011110', value: 82 },
  s: { bars: '10111100100', value: 83 },
  t: { bars: '10011110100', value: 84 },
  u: { bars: '10011110010', value: 85 },
  v: { bars: '11110100100', value: 86 },
  w: { bars: '11110010100', value: 87 },
  x: { bars: '11110010010', value: 88 },
  y: { bars: '11011011110', value: 89 },
  z: { bars: '11011110110', value: 90 },
  '{': { bars: '11110110110', value: 91 },
  '|': { bars: '10101111000', value: 92 },
  '}': { bars: '10100011110', value: 93 },
  '~': { bars: '10001011110', value: 94 },
}

// Special symbols (not in printable ASCII map but needed for encoding)
const START_B = '11010010000'
const STOP = '1100011101011'

/**
 * Encode a string as a Code128B bit string.
 * Returns null if any character is not encodable.
 */
export function encodeCode128(text: string): string | null {
  if (!text || text.length === 0) return null

  let bits = START_B
  // Start B value = 104
  let checksum = 104

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const entry = CODE128B[ch]
    if (!entry) return null // unencodable character
    checksum += entry.value * (i + 1)
    bits += entry.bars
  }

  // Checksum symbol
  const checksumVal = checksum % 103
  // Find the entry whose value matches checksumVal
  const checksumEntry = Object.values(CODE128B).find(e => e.value === checksumVal)
  if (checksumEntry) {
    bits += checksumEntry.bars
  }

  bits += STOP
  return bits
}

export interface BarcodeOptions {
  /** Module width in pixels (default: 2) */
  moduleWidth?: number
  /** Barcode height in pixels (default: 60) */
  height?: number
  /** Quiet zone modules on each side (default: 10) */
  quietZone?: number
  /** Show text label below (default: true) */
  showText?: boolean
  /** Font size for label (default: 11) */
  fontSize?: number
  /** Fill color (default: '#000000') */
  color?: string
  /** Background color (default: '#ffffff') */
  background?: string
}

/**
 * Generate a Code128B barcode as an SVG string.
 * Falls back to a placeholder SVG if the text is unencodable.
 */
export function generateBarcodeSVG(text: string, options: BarcodeOptions = {}): string {
  const {
    moduleWidth = 2,
    height = 60,
    quietZone = 10,
    showText = true,
    fontSize = 11,
    color = '#000000',
    background = '#ffffff',
  } = options

  const bits = encodeCode128(text)

  if (!bits) {
    // Fallback placeholder
    const w = 200
    const h = height + (showText ? fontSize + 6 : 0)
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="${background}"/>
  <text x="${w / 2}" y="${h / 2}" text-anchor="middle" font-size="12" fill="#999">Cannot encode</text>
</svg>`
  }

  const quietPx = quietZone * moduleWidth
  const barsWidth = bits.length * moduleWidth
  const totalWidth = barsWidth + quietPx * 2
  const textHeight = showText ? fontSize + 6 : 0
  const totalHeight = height + textHeight

  // Build bar rectangles
  let rects = ''
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] === '1') {
      const x = quietPx + i * moduleWidth
      rects += `<rect x="${x}" y="0" width="${moduleWidth}" height="${height}" fill="${color}"/>`
    }
  }

  const label = showText
    ? `<text x="${totalWidth / 2}" y="${height + fontSize + 2}" text-anchor="middle" font-family="monospace" font-size="${fontSize}" fill="${color}">${escapeXML(text)}</text>`
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}">
  <rect width="${totalWidth}" height="${totalHeight}" fill="${background}"/>
  ${rects}
  ${label}
</svg>`
}

function escapeXML(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
