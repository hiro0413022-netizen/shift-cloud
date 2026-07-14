/**
 * xlsxHelper.ts
 * Cloudflare Workers 環境で動作する軽量 xlsx 生成ユーティリティ。
 * 外部ライブラリ不要、純粋な OOXML (ZIP) 生成。
 */

// ── ZIP ユーティリティ（最小実装） ────────────────────────────────────────────

function u8(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

function crc32(data: Uint8Array): number {
  const table = makeCrcTable()
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xff]
  }
  return (crc ^ 0xffffffff) >>> 0
}

let _crcTable: number[] | null = null
function makeCrcTable(): number[] {
  if (_crcTable) return _crcTable
  _crcTable = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    _crcTable[n] = c
  }
  return _crcTable
}

function writeUint16LE(v: number): Uint8Array {
  return new Uint8Array([v & 0xff, (v >> 8) & 0xff])
}
function writeUint32LE(v: number): Uint8Array {
  return new Uint8Array([v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff])
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((s, p) => s + p.length, 0)
  const out = new Uint8Array(len)
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

interface ZipEntry {
  name: string
  data: Uint8Array
  crc: number
  localOffset: number
}

/** 最小限の非圧縮 ZIP を生成 */
function buildZip(files: { name: string; content: string | Uint8Array }[]): Uint8Array {
  const entries: ZipEntry[] = []
  const localParts: Uint8Array[] = []
  let offset = 0

  for (const f of files) {
    const data = typeof f.content === 'string' ? u8(f.content) : f.content
    const crc = crc32(data)
    const nameBytes = u8(f.name)

    // Local file header
    const localHeader = concat(
      new Uint8Array([0x50, 0x4b, 0x03, 0x04]), // signature
      writeUint16LE(20),   // version needed
      writeUint16LE(0),    // flags
      writeUint16LE(0),    // compression: stored
      writeUint16LE(0),    // mod time
      writeUint16LE(0),    // mod date
      writeUint32LE(crc),
      writeUint32LE(data.length),
      writeUint32LE(data.length),
      writeUint16LE(nameBytes.length),
      writeUint16LE(0),    // extra length
      nameBytes
    )

    entries.push({ name: f.name, data, crc, localOffset: offset })
    localParts.push(localHeader, data)
    offset += localHeader.length + data.length
  }

  // Central directory
  const centralParts: Uint8Array[] = []
  for (const e of entries) {
    const nameBytes = u8(e.name)
    centralParts.push(
      concat(
        new Uint8Array([0x50, 0x4b, 0x01, 0x02]), // signature
        writeUint16LE(20),   // version made by
        writeUint16LE(20),   // version needed
        writeUint16LE(0),    // flags
        writeUint16LE(0),    // compression
        writeUint16LE(0),    // mod time
        writeUint16LE(0),    // mod date
        writeUint32LE(e.crc),
        writeUint32LE(e.data.length),
        writeUint32LE(e.data.length),
        writeUint16LE(nameBytes.length),
        writeUint16LE(0),  // extra
        writeUint16LE(0),  // comment
        writeUint16LE(0),  // disk start
        writeUint16LE(0),  // internal attr
        writeUint32LE(0),  // external attr
        writeUint32LE(e.localOffset),
        nameBytes
      )
    )
  }

  const centralDir = concat(...centralParts)
  const cdOffset = offset
  const cdSize = centralDir.length

  // End of central directory
  const eocd = concat(
    new Uint8Array([0x50, 0x4b, 0x05, 0x06]),
    writeUint16LE(0), writeUint16LE(0),
    writeUint16LE(entries.length),
    writeUint16LE(entries.length),
    writeUint32LE(cdSize),
    writeUint32LE(cdOffset),
    writeUint16LE(0)
  )

  return concat(...localParts, centralDir, eocd)
}

// ── XML エスケープ ────────────────────────────────────────────────────────────

function xmlEsc(s: string | null | undefined): string {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// ── セル値ヘルパー ────────────────────────────────────────────────────────────

export type CellValue = string | number | null | undefined

/** 共有文字列テーブルを使わずインライン文字列で書き込む */
function cellXml(col: number, row: number, value: CellValue, styleId = 0): string {
  const addr = colName(col) + row
  if (value == null || value === '') {
    return `<c r="${addr}" s="${styleId}"/>`
  }
  if (typeof value === 'number') {
    return `<c r="${addr}" t="n" s="${styleId}"><v>${value}</v></c>`
  }
  // inline string
  return `<c r="${addr}" t="inlineStr" s="${styleId}"><is><t>${xmlEsc(String(value))}</t></is></c>`
}

function colName(col: number): string {
  let name = ''
  let n = col
  while (n >= 0) {
    name = String.fromCharCode(65 + (n % 26)) + name
    n = Math.floor(n / 26) - 1
  }
  return name
}

// ── スタイル定義 ─────────────────────────────────────────────────────────────

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="3">
    <font><sz val="11"/><name val="游ゴシック"/></font>
    <font><sz val="11"/><b/><name val="游ゴシック"/></font>
    <font><sz val="11"/><color rgb="FFFFFFFF"/><b/><name val="游ゴシック"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1E3A5F"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEEF2F8"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFBDC6D4"/></left>
      <right style="thin"><color rgb="FFBDC6D4"/></right>
      <top style="thin"><color rgb="FFBDC6D4"/></top>
      <bottom style="thin"><color rgb="FFBDC6D4"/></bottom>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="6">
    <xf numFmtId="0"  fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
    <xf numFmtId="0"  fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="3"  fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyNumberFormat="1"/>
    <xf numFmtId="10" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyNumberFormat="1"/>
    <xf numFmtId="14" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyNumberFormat="1"/>
    <xf numFmtId="0"  fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
  </cellXfs>
</styleSheet>`
// styleId 0: 通常  1: ヘッダ(濃紺)  2: 数値カンマ  3: パーセント  4: 日付  5: 合計行

// ── シート XML 生成 ───────────────────────────────────────────────────────────

export interface SheetRow {
  cells: CellValue[]
  /** 各セルのstyleId (省略時は行デフォルト) */
  styles?: number[]
  /** 行全体のデフォルトstyleId */
  rowStyle?: number
}

export interface ColWidth { col: number; width: number }

function buildSheetXml(rows: SheetRow[], colWidths: ColWidth[] = []): string {
  const colDefs = colWidths
    .map(c => `<col min="${c.col + 1}" max="${c.col + 1}" width="${c.width}" customWidth="1"/>`)
    .join('')

  const rowXmls = rows.map((row, ri) => {
    const rn = ri + 1
    const cells = row.cells.map((v, ci) => {
      const sid = row.styles?.[ci] ?? row.rowStyle ?? 0
      return cellXml(ci, rn, v, sid)
    }).join('')
    return `<row r="${rn}">${cells}</row>`
  }).join('')

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
           xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetViews><sheetView workbookViewId="0" showGridLines="1"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>${colDefs}</cols>
  <sheetData>${rowXmls}</sheetData>
</worksheet>`
}

// ── workbook / rels XML ───────────────────────────────────────────────────────

const WORKBOOK_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="納品履歴" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`

// ── 公開 API ─────────────────────────────────────────────────────────────────

/**
 * 行データから xlsx バイナリを生成して返す。
 * @param rows ヘッダ行を含む全行
 * @param colWidths 列幅の指定
 */
export function buildXlsx(rows: SheetRow[], colWidths: ColWidth[] = []): Uint8Array {
  const sheetXml = buildSheetXml(rows, colWidths)

  return buildZip([
    { name: '[Content_Types].xml', content: CONTENT_TYPES },
    { name: '_rels/.rels', content: ROOT_RELS },
    { name: 'xl/workbook.xml', content: WORKBOOK_XML },
    { name: 'xl/_rels/workbook.xml.rels', content: WORKBOOK_RELS },
    { name: 'xl/styles.xml', content: STYLES_XML },
    { name: 'xl/worksheets/sheet1.xml', content: sheetXml },
  ])
}
