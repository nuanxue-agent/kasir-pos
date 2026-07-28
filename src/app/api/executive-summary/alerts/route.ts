import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export type AlertSeverity = 'critical' | 'warning' | 'info'

export interface ExecutiveAlert {
  id: string
  type: 'low_stock' | 'overdue_invoice' | 'pending_approval' | 'expiring_contract'
  severity: AlertSeverity
  title: string
  message: string
  entityId?: string
  entityName?: string
  amount?: number
  createdAt: string
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get('storeId')
    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 })

    const alerts: ExecutiveAlert[] = []
    const now = new Date()
    const nowISO = now.toISOString()
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()

    // Low stock alerts
    const lowStockRows = await query(
      `SELECT p.id, p.name, p.reorderPoint, COALESCE(i.quantity, 0) as qty
       FROM Product p
       LEFT JOIN Inventory i ON i.productId = p.id AND i.storeId = ?
       WHERE p.storeId = ? AND p.active = 1
         AND COALESCE(i.quantity, 0) <= p.reorderPoint
         AND p.reorderPoint > 0
       ORDER BY (COALESCE(i.quantity, 0) - p.reorderPoint) ASC
       LIMIT 20`,
      [storeId, storeId],
    ).catch(() => [])
    for (const r of lowStockRows as any[]) {
      const isCritical = (r.qty ?? 0) === 0
      alerts.push({
        id: `low_stock_${r.id}`,
        type: 'low_stock',
        severity: isCritical ? 'critical' : 'warning',
        title: isCritical ? 'Stok Habis' : 'Stok Rendah',
        message: `${r.name}: ${r.qty} tersisa (reorder point: ${r.reorderPoint})`,
        entityId: r.id,
        entityName: r.name,
        createdAt: nowISO,
      })
    }

    // Overdue AR invoices
    const arRows = await query(
      `SELECT id, invoiceNumber, customerName, amount, amountPaid, dueDate
       FROM SalesInvoice
       WHERE storeId = ? AND status = 'OVERDUE'
       ORDER BY dueDate ASC
       LIMIT 10`,
      [storeId],
    ).catch(() => [])
    for (const r of arRows as any[]) {
      const outstanding = (r.amount ?? 0) - (r.amountPaid ?? 0)
      const daysOverdue = Math.floor(
        (now.getTime() - new Date(r.dueDate).getTime()) / (1000 * 60 * 60 * 24),
      )
      alerts.push({
        id: `overdue_ar_${r.id}`,
        type: 'overdue_invoice',
        severity: daysOverdue > 30 ? 'critical' : 'warning',
        title: 'Faktur Piutang Jatuh Tempo',
        message: `${r.invoiceNumber} — ${r.customerName}: ${daysOverdue} hari terlambat`,
        entityId: r.id,
        entityName: r.customerName,
        amount: outstanding,
        createdAt: nowISO,
      })
    }

    // Overdue AP invoices
    const apRows = await query(
      `SELECT id, invoiceNumber, supplierName, amount, amountPaid, dueDate
       FROM PurchaseInvoice
       WHERE storeId = ? AND status = 'OVERDUE'
       ORDER BY dueDate ASC
       LIMIT 10`,
      [storeId],
    ).catch(() => [])
    for (const r of apRows as any[]) {
      const outstanding = (r.amount ?? 0) - (r.amountPaid ?? 0)
      const daysOverdue = Math.floor(
        (now.getTime() - new Date(r.dueDate).getTime()) / (1000 * 60 * 60 * 24),
      )
      alerts.push({
        id: `overdue_ap_${r.id}`,
        type: 'overdue_invoice',
        severity: daysOverdue > 30 ? 'critical' : 'warning',
        title: 'Faktur Hutang Jatuh Tempo',
        message: `${r.invoiceNumber} — ${r.supplierName}: ${daysOverdue} hari terlambat`,
        entityId: r.id,
        entityName: r.supplierName,
        amount: outstanding,
        createdAt: nowISO,
      })
    }

    // Pending purchase order approvals
    const poRows = await query(
      `SELECT id, orderNumber, supplierName, total
       FROM PurchaseOrder
       WHERE storeId = ? AND status = 'PENDING'
       ORDER BY createdAt DESC
       LIMIT 10`,
      [storeId],
    ).catch(() => [])
    for (const r of poRows as any[]) {
      alerts.push({
        id: `pending_po_${r.id}`,
        type: 'pending_approval',
        severity: 'info',
        title: 'PO Menunggu Persetujuan',
        message: `${r.orderNumber} — ${r.supplierName}`,
        entityId: r.id,
        entityName: r.supplierName,
        amount: r.total,
        createdAt: nowISO,
      })
    }

    // Expiring vendor contracts (within 30 days)
    const contractRows = await query(
      `SELECT id, contractNumber, vendorName, endDate
       FROM VendorContract
       WHERE storeId = ? AND status = 'ACTIVE' AND endDate <= ? AND endDate >= ?
       ORDER BY endDate ASC
       LIMIT 10`,
      [storeId, in30Days, nowISO],
    ).catch(() => [])
    for (const r of contractRows as any[]) {
      const daysLeft = Math.ceil(
        (new Date(r.endDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      )
      alerts.push({
        id: `expiring_contract_${r.id}`,
        type: 'expiring_contract',
        severity: daysLeft <= 7 ? 'critical' : 'warning',
        title: 'Kontrak Hampir Berakhir',
        message: `${r.contractNumber} — ${r.vendorName}: berakhir dalam ${daysLeft} hari`,
        entityId: r.id,
        entityName: r.vendorName,
        createdAt: nowISO,
      })
    }

    // Sort: critical first, then warning, then info
    const severityOrder: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 }
    alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])

    return NextResponse.json({ alerts, total: alerts.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
