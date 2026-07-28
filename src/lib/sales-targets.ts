// Pure business logic for sales targets and achievements

export type TargetType = 'STORE' | 'EMPLOYEE' | 'PRODUCT_CATEGORY'
export type TargetPeriod = 'DAILY' | 'WEEKLY' | 'MONTHLY'

export interface SalesTarget {
  id: string
  storeId: string
  targetType: TargetType
  targetId: string
  period: TargetPeriod
  targetAmount: number
  startDate: string
  endDate: string
  createdAt: string
  updatedAt: string
}

export interface SalesAchievement {
  id: string
  targetId: string
  storeId: string
  actualAmount: number
  achievementPct: number
  period: string
  computedAt: string
}

export interface AchievementWithTarget extends SalesAchievement {
  target?: SalesTarget
  targetName?: string
  isOverAchieved?: boolean
}

/**
 * Calculate achievement percentage
 */
export function calcAchievementPct(actual: number, target: number): number {
  if (target <= 0) return 0
  return Math.round((actual / target) * 100)
}

/**
 * Check if achievement is over target
 */
export function isOverAchieved(achievementPct: number): boolean {
  return achievementPct >= 100
}

/**
 * Detect if two date ranges overlap
 */
export function dateRangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  const aS = new Date(aStart).getTime()
  const aE = new Date(aEnd).getTime()
  const bS = new Date(bStart).getTime()
  const bE = new Date(bEnd).getTime()
  return aS < bE && bS < aE
}

/**
 * Calculate period boundaries for a given period type
 */
export function calcPeriodBoundaries(
  period: TargetPeriod,
  referenceDate = new Date()
): { startDate: string; endDate: string } {
  // Use UTC accessors to avoid local-timezone shifts
  const year = referenceDate.getUTCFullYear()
  const month = referenceDate.getUTCMonth()
  const date = referenceDate.getUTCDate()
  const dayOfWeek = referenceDate.getUTCDay() // 0=Sun

  // Format a UTC Date as YYYY-MM-DD
  const fmt = (dt: Date) => dt.toISOString().split('T')[0]

  if (period === 'DAILY') {
    const start = new Date(Date.UTC(year, month, date))
    const end = new Date(Date.UTC(year, month, date + 1))
    return { startDate: fmt(start), endDate: fmt(end) }
  } else if (period === 'WEEKLY') {
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek // Monday start
    const start = new Date(Date.UTC(year, month, date + diff))
    const end = new Date(Date.UTC(year, month, date + diff + 7))
    return { startDate: fmt(start), endDate: fmt(end) }
  } else {
    // MONTHLY
    const start = new Date(Date.UTC(year, month, 1))
    const end = new Date(Date.UTC(year, month + 1, 1))
    return { startDate: fmt(start), endDate: fmt(end) }
  }
}

/**
 * Rank achievements by percentage (descending) for leaderboard
 */
export function rankByAchievement(
  achievements: AchievementWithTarget[]
): AchievementWithTarget[] {
  return [...achievements].sort((a, b) => b.achievementPct - a.achievementPct)
}

/**
 * Filter achievements for a specific period string (YYYY-MM-DD or YYYY-Www)
 */
export function filterByPeriod(
  achievements: AchievementWithTarget[],
  periodStr: string
): AchievementWithTarget[] {
  return achievements.filter((a) => a.period === periodStr)
}

/**
 * Get current period string for a given period type
 */
export function getCurrentPeriodString(period: TargetPeriod, date = new Date()): string {
  if (period === 'DAILY') {
    return date.toISOString().split('T')[0] // YYYY-MM-DD
  } else if (period === 'WEEKLY') {
    const year = date.getFullYear()
    const firstDayOfYear = new Date(year, 0, 1)
    const dayOfYear = Math.floor(
      (date.getTime() - firstDayOfYear.getTime()) / (1000 * 60 * 60 * 24)
    )
    const weekNum = Math.ceil((dayOfYear + firstDayOfYear.getDay() + 1) / 7)
    return `${year}-W${String(weekNum).padStart(2, '0')}`
  } else {
    // MONTHLY
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    return `${year}-${month}`
  }
}
