// API route: POST /api/reports/break-even
// Calculates break-even analysis given fixed costs, variable costs, and price per unit
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

function ok(data: unknown) {
  return NextResponse.json(data)
}
function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

interface BreakEvenRequest {
  fixedCosts: number
  variableCostPerUnit: number
  pricePerUnit: number
}

interface BreakEvenResponse {
  breakEvenUnits: number
  breakEvenRevenue: number
  contributionMargin: number
  contributionMarginPct: number
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return err('Unauthorized', 401)

  try {
    const body = (await req.json()) as BreakEvenRequest

    const { fixedCosts, variableCostPerUnit, pricePerUnit } = body

    // Validate inputs
    if (
      typeof fixedCosts !== 'number' ||
      typeof variableCostPerUnit !== 'number' ||
      typeof pricePerUnit !== 'number'
    ) {
      return err('Invalid input: fixedCosts, variableCostPerUnit, and pricePerUnit must be numbers')
    }

    if (fixedCosts < 0 || variableCostPerUnit < 0 || pricePerUnit < 0) {
      return err('Invalid input: all values must be non-negative')
    }

    // Calculate contribution margin
    const contributionMargin = pricePerUnit - variableCostPerUnit
    const contributionMarginPct = pricePerUnit === 0 ? 0 : (contributionMargin / pricePerUnit) * 100

    // Calculate break-even units
    let breakEvenUnits: number
    if (contributionMargin <= 0) {
      breakEvenUnits = Infinity
    } else {
      breakEvenUnits = fixedCosts / contributionMargin
    }

    const breakEvenRevenue = Number.isFinite(breakEvenUnits) ? breakEvenUnits * pricePerUnit : Infinity

    const result: BreakEvenResponse = {
      breakEvenUnits,
      breakEvenRevenue,
      contributionMargin,
      contributionMarginPct,
    }

    return ok(result)
  } catch (error: any) {
    console.error('Break-even calculation error:', error)
    return err(error.message || 'Internal server error', 500)
  }
}
