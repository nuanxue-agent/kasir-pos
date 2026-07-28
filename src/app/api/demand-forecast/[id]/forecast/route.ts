import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { query, exec, queryOne, newId, nowISO } from '@/lib/db'
import {
  projectMovingAverage,
  projectExponentialSmoothing,
  projectLinearTrend,
} from '@/lib/demand-forecast'
import { ensureForecastTables } from '../../route'

function err(msg: string, status = 400, code = 'ERROR') {
  return NextResponse.json({ error: msg, code }, { status })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401, 'UNAUTHORIZED')
  const user = session.user as any

  const { id } = await params
  await ensureForecastTables()

  const model = await queryOne(`SELECT * FROM ForecastModel WHERE id = ?`, [id]) as any
  if (!model) return err('Model not found', 404, 'NOT_FOUND')

  const storeId: string = model.storeId
  const b = (await req.json()) as any
  const horizonDays: number = Number(b.horizonDays ?? 30)
  if (horizonDays < 1 || horizonDays > 365) {
    return err('horizonDays must be between 1 and 365', 400, 'INVALID_FIELD')
  }

  // Pull historical daily sales for this product
  const salesRows = await query(
    `SELECT date(o.createdAt) as date, COALESCE(SUM(oi.qty), 0) as qty
     FROM OrderItem oi
     JOIN Orders o ON oi.orderId = o.id
     WHERE o.storeId = ? AND oi.productId = ? AND o.status = 'completed'
     GROUP BY date(o.createdAt)
     ORDER BY date ASC`,
    [storeId, model.productId]
  ).catch(() => [])

  const salesData = (salesRows as any[]).map(r => ({
    date: r.date as string,
    qty: Number(r.qty),
  }))

  if (salesData.length === 0) {
    return err('No historical sales data found for this product', 422, 'NO_DATA')
  }

  const now = new Date()
  let forecastPoints: ReturnType<typeof projectMovingAverage>

  switch (model.method as string) {
    case 'MOVING_AVG':
      forecastPoints = projectMovingAverage(salesData, model.windowDays, horizonDays, now)
      break
    case 'EXPONENTIAL':
      forecastPoints = projectExponentialSmoothing(salesData, model.alpha, horizonDays, now)
      break
    case 'LINEAR_TREND':
      forecastPoints = projectLinearTrend(salesData, horizonDays, now)
      break
    default:
      return err('Unknown forecast method', 400, 'INVALID_FIELD')
  }

  // Persist forecast results (replace existing future forecasts for this model)
  const todayStr = now.toISOString().slice(0, 10)
  await exec(
    `DELETE FROM ForecastResult WHERE modelId = ? AND forecastDate > ?`,
    [id, todayStr]
  )

  const t = nowISO()
  for (const pt of forecastPoints) {
    await exec(
      `INSERT INTO ForecastResult
         (id, modelId, storeId, productId, forecastDate, predictedQty, confidenceLow, confidenceHigh, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId(), id, storeId, model.productId, pt.date, pt.predictedQty, pt.confidenceLow, pt.confidenceHigh, t]
    )
  }

  // Mark model as trained
  await exec(`UPDATE ForecastModel SET lastTrainedAt = ?, updatedAt = ? WHERE id = ?`, [t, t, id])

  return NextResponse.json({
    modelId: id,
    method: model.method,
    horizonDays,
    pointsGenerated: forecastPoints.length,
    forecast: forecastPoints,
  })
}
