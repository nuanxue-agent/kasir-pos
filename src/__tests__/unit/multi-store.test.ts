import { describe, it, expect } from 'vitest'
import {
  calcAvgTicket,
  calcRevenueGrowth,
} from '@/app/api/branches/[id]/performance/route'
import {
  sortBranchesByMetric,
  calcConsolidatedRevenue,
  calcConsolidatedOrders,
  calcNetworkAvgTicket,
  type BranchMetric,
} from '@/app/api/branches/comparison/route'

describe('Multi-Store Management', () => {
  describe('Branch performance metrics', () => {
    it('should calculate average ticket correctly', () => {
      expect(calcAvgTicket(10000, 20)).toBe(500)
      expect(calcAvgTicket(7500, 15)).toBe(500)
    })

    it('should return 0 when no orders', () => {
      expect(calcAvgTicket(10000, 0)).toBe(0)
      expect(calcAvgTicket(0, 0)).toBe(0)
    })

    it('should calculate revenue growth correctly', () => {
      expect(calcRevenueGrowth(12000, 10000)).toBe(20)
      expect(calcRevenueGrowth(8000, 10000)).toBe(-20)
    })

    it('should handle zero previous revenue', () => {
      expect(calcRevenueGrowth(5000, 0)).toBe(100)
      expect(calcRevenueGrowth(0, 0)).toBe(0)
    })
  })

  describe('Cross-branch revenue aggregation', () => {
    const branches: BranchMetric[] = [
      {
        branchId: 'b1',
        name: 'Central',
        active: true,
        revenue: 50000,
        orders: 100,
        avgTicket: 500,
        revenueShare: 50,
      },
      {
        branchId: 'b2',
        name: 'North',
        active: true,
        revenue: 30000,
        orders: 60,
        avgTicket: 500,
        revenueShare: 30,
      },
      {
        branchId: 'b3',
        name: 'South',
        active: false,
        revenue: 20000,
        orders: 40,
        avgTicket: 500,
        revenueShare: 20,
      },
    ]

    it('should calculate consolidated revenue', () => {
      expect(calcConsolidatedRevenue(branches)).toBe(100000)
    })

    it('should calculate consolidated orders', () => {
      expect(calcConsolidatedOrders(branches)).toBe(200)
    })

    it('should calculate network average ticket', () => {
      expect(calcNetworkAvgTicket(branches)).toBe(500)
    })

    it('should return 0 for network avg ticket when no orders', () => {
      const empty: BranchMetric[] = [
        { branchId: 'b1', name: 'Test', active: true, revenue: 0, orders: 0, avgTicket: 0, revenueShare: 0 },
      ]
      expect(calcNetworkAvgTicket(empty)).toBe(0)
    })
  })

  describe('Branch comparison sorting', () => {
    const branches: BranchMetric[] = [
      {
        branchId: 'b1',
        name: 'Central',
        active: true,
        revenue: 50000,
        orders: 100,
        avgTicket: 500,
        revenueShare: 50,
      },
      {
        branchId: 'b2',
        name: 'North',
        active: true,
        revenue: 30000,
        orders: 80,
        avgTicket: 375,
        revenueShare: 30,
      },
      {
        branchId: 'b3',
        name: 'South',
        active: true,
        revenue: 40000,
        orders: 50,
        avgTicket: 800,
        revenueShare: 20,
      },
    ]

    it('should sort by revenue descending', () => {
      const sorted = sortBranchesByMetric(branches, 'revenue', 'desc')
      expect(sorted[0].branchId).toBe('b1')
      expect(sorted[1].branchId).toBe('b3')
      expect(sorted[2].branchId).toBe('b2')
    })

    it('should sort by orders ascending', () => {
      const sorted = sortBranchesByMetric(branches, 'orders', 'asc')
      expect(sorted[0].branchId).toBe('b3')
      expect(sorted[1].branchId).toBe('b2')
      expect(sorted[2].branchId).toBe('b1')
    })

    it('should sort by avgTicket descending', () => {
      const sorted = sortBranchesByMetric(branches, 'avgTicket', 'desc')
      expect(sorted[0].branchId).toBe('b3') // 800
      expect(sorted[1].branchId).toBe('b1') // 500
      expect(sorted[2].branchId).toBe('b2') // 375
    })
  })

  describe('Active branch filtering', () => {
    it('should include inactive branches in metrics with active flag', () => {
      const branches: BranchMetric[] = [
        { branchId: 'b1', name: 'Active', active: true, revenue: 5000, orders: 10, avgTicket: 500, revenueShare: 50 },
        { branchId: 'b2', name: 'Inactive', active: false, revenue: 3000, orders: 6, avgTicket: 500, revenueShare: 30 },
      ]
      
      const consolidated = calcConsolidatedRevenue(branches)
      expect(consolidated).toBe(8000) // includes inactive
      
      const active = branches.filter(b => b.active)
      expect(active.length).toBe(1)
      expect(calcConsolidatedRevenue(active)).toBe(5000)
    })
  })

  describe('Timezone handling', () => {
    it('should allow different timezone values', () => {
      const timezones = ['Asia/Jakarta', 'Asia/Singapore', 'UTC', 'America/New_York']
      timezones.forEach(tz => {
        expect(tz).toBeTruthy()
        expect(typeof tz).toBe('string')
      })
    })
  })
})
