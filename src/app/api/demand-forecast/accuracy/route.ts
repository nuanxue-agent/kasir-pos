import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query } from '@/lib/db'
import { calcMAPE } from '@/lib/demand-forecast'
import { ensureForecastTables } from '../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any
  const storeId = req.nextUrl.searchParams.get('storeId') ?? user.stores?.[0]?.id
  if (!storeId) return err('storeId required', 400, 'MISSING_FIELD')

  await ensureForecastTables()

  const models = await query(
    `SELECT fm.*, p.name as productName
     FROM ForecastModel fm
     LEFT JOIN Product p ON fm.productId = p.id
     WHERE fm.storeId = ?`,
    [storeId]
  )

  const results: any[] = []

  for (const model of models as any[]) {
    // Get results that have both predicted and actual quantities
    const evalRows = await query(
      `SELECT predictedQty, actualQty
       FROM ForecastResult
       WHERE modelId = ? AND actualQty IS NOT NULL
       ORDER BY forecastDate ASC`,
      [model.id]
    )

    const actuals = (evalRows as any[]).map(r => r.actualQty as number)
    const predictions = (evalRows as any[]).map(r => r.predictedQty as number)
    const mape = calcMAPE(actuals, predictions)

    results.push({
      modelId: model.id,
      productId: model.productId,
      productName: model.productName ?? null,
      method: model.method,
      windowDays: model.windowDays,
      alpha: model.alpha,
      lastTrainedAt: model.lastTrainedAt ?? null,
      evaluatedPeriods: actuals.length,
      mape: Math.round(mape * 100) / 100,
      accuracy: actuals.length > 0 ? Math.round((100 - Math.min(mape, 100)) * 100) / 100 : null,
    })
  }

  return NextResponse.json(results)
}
