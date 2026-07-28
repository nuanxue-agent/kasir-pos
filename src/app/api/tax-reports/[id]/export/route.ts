import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { ensureTaxTables } from '../../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

/**
 * GET /api/tax-reports/[id]/export
 *
 * Returns a JSON SPT (Surat Pemberitahuan) summary suitable for filing
 * or downstream PDF generation. Includes report header + all line items.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureTaxTables()

  const reports = (await query(
    `SELECT * FROM TaxReport WHERE id = ? AND storeId = ?`,
    [id, storeId],
  )) as any[]
  if (reports.length === 0) return err('Not found', 404, 'NOT_FOUND')

  const report = reports[0]

  const items = (await query(
    `SELECT * FROM TaxItem WHERE reportId = ? ORDER BY createdAt ASC`,
    [id],
  )) as any[]

  const TAX_TYPE_LABELS: Record<string, string> = {
    PPH21: 'PPh Pasal 21 — Pajak Penghasilan Karyawan',
    PPH23: 'PPh Pasal 23 — Pemotongan Pajak',
    PPN:   'PPN — Pajak Pertambahan Nilai',
  }

  const spt = {
    sptSummary: {
      documentType: 'SPT',
      taxType: report.type,
      taxTypeLabel: TAX_TYPE_LABELS[report.type] ?? report.type,
      period: report.period,
      storeId: report.storeId,
      reportId: report.id,
      status: report.status,
      filedAt: report.filedAt,
      dueDate: report.dueDate,
      exportedAt: new Date().toISOString(),
    },
    taxBase: {
      totalTaxable: report.totalTaxable,
      taxAmount: report.taxAmount,
      effectiveRate:
        report.totalTaxable > 0
          ? Math.round((report.taxAmount / report.totalTaxable) * 10000) / 100
          : 0,
    },
    lineItems: items.map((item: any) => ({
      id: item.id,
      reference: item.reference,
      description: item.description,
      taxableAmount: item.taxableAmount,
      taxRate: item.taxRate,
      taxRatePct: Math.round(item.taxRate * 10000) / 100,
      taxAmount: item.taxAmount,
    })),
    totals: {
      itemCount: items.length,
      sumTaxable: items.reduce((s: number, i: any) => s + i.taxableAmount, 0),
      sumTax: items.reduce((s: number, i: any) => s + i.taxAmount, 0),
    },
  }

  return NextResponse.json(spt)
}
