import { describe, it, expect } from 'vitest'

// ── HR & Payroll business logic ───────────────────────────────────────────────

type EmploymentStatus = 'ACTIVE' | 'INACTIVE' | 'TERMINATED'
type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'HALF_DAY' | 'LEAVE'
type PayrollStatus = 'DRAFT' | 'APPROVED' | 'PAID'

interface Employee {
  id: string
  name: string
  position: string
  department: string
  baseSalary: number
  employmentStatus: EmploymentStatus
  joinDate: string
}

interface Allowance { name: string; amount: number }
interface Deduction { name: string; amount: number }

interface PayrollCalculation {
  baseSalary: number
  allowances: Allowance[]
  deductions: Deduction[]
}

// ── Pure functions ─────────────────────────────────────────────────────────────

function calcGrossSalary(base: number, allowances: Allowance[]): number {
  return base + allowances.reduce((s, a) => s + a.amount, 0)
}

function calcTotalDeductions(deductions: Deduction[]): number {
  return deductions.reduce((s, d) => s + d.amount, 0)
}

function calcNetSalary(gross: number, deductions: number): number {
  return Math.max(0, gross - deductions)
}

function calcPPh21(grossSalary: number, annualMultiplier: number = 12): number {
  // Simplified PPh 21 (Indonesian income tax) calculation
  // PTKP (non-taxable income) K/0 = 54,000,000 / year
  const PTKP_YEAR = 54_000_000
  const annualGross = grossSalary * annualMultiplier
  const ptkp = PTKP_YEAR
  const pkp = Math.max(0, annualGross - ptkp)

  let annualTax = 0
  if (pkp <= 60_000_000)        annualTax = pkp * 0.05
  else if (pkp <= 250_000_000)  annualTax = 3_000_000 + (pkp - 60_000_000) * 0.15
  else if (pkp <= 500_000_000)  annualTax = 31_500_000 + (pkp - 250_000_000) * 0.25
  else if (pkp <= 5_000_000_000) annualTax = 94_000_000 + (pkp - 500_000_000) * 0.30
  else                           annualTax = 1_444_000_000 + (pkp - 5_000_000_000) * 0.35

  return Math.round(annualTax / annualMultiplier)
}

function calcBPJSHealth(grossSalary: number, employeeRate = 0.01, employerRate = 0.04): {
  employee: number; employer: number
} {
  // BPJS Kesehatan cap: 12,000,000
  const capped = Math.min(grossSalary, 12_000_000)
  return {
    employee: Math.round(capped * employeeRate),
    employer: Math.round(capped * employerRate),
  }
}

function calcBPJSEmployment(grossSalary: number): {
  jht_employee: number; jht_employer: number; jkk: number; jkm: number
} {
  return {
    jht_employee: Math.round(grossSalary * 0.02),  // JHT 2% employee
    jht_employer: Math.round(grossSalary * 0.037), // JHT 3.7% employer
    jkk: Math.round(grossSalary * 0.0024),         // JKK 0.24% employer
    jkm: Math.round(grossSalary * 0.003),          // JKM 0.3% employer
  }
}

function calcLateMinutes(checkIn: string, scheduleStart: string): number {
  const [ch, cm] = checkIn.split(':').map(Number)
  const [sh, sm] = scheduleStart.split(':').map(Number)
  const checkInMins = ch * 60 + cm
  const scheduleMins = sh * 60 + sm
  return Math.max(0, checkInMins - scheduleMins)
}

function getAttendanceStatus(checkIn: string | null, scheduleStart: string, toleranceMinutes = 15): AttendanceStatus {
  if (!checkIn) return 'ABSENT'
  const late = calcLateMinutes(checkIn, scheduleStart)
  if (late <= toleranceMinutes) return 'PRESENT'
  return 'LATE'
}

function calcWorkingDays(from: string, to: string, holidays: string[] = []): number {
  const start = new Date(from)
  const end = new Date(to)
  let count = 0
  const cur = new Date(start)
  while (cur <= end) {
    const dayOfWeek = cur.getDay()
    const dateStr = cur.toISOString().slice(0, 10)
    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidays.includes(dateStr)) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

function calcProrateSalary(baseSalary: number, workedDays: number, totalWorkingDays: number): number {
  if (totalWorkingDays === 0) return 0
  return Math.round(baseSalary * (workedDays / totalWorkingDays))
}

function validateEmployee(data: any): string | null {
  if (!data.name || data.name.trim().length < 2) return 'Nama karyawan minimal 2 karakter'
  if (!data.position || data.position.trim().length < 2) return 'Posisi harus diisi'
  if (!data.baseSalary || data.baseSalary < 0) return 'Gaji pokok tidak boleh negatif'
  if (!data.joinDate) return 'Tanggal bergabung harus diisi'
  if (data.nik && !/^\d{16}$/.test(data.nik)) return 'NIK harus 16 digit angka'
  return null
}

function calcEmployeeTenure(joinDate: string, asOf: string = new Date().toISOString().slice(0, 10)): {
  years: number; months: number; totalMonths: number
} {
  const join = new Date(joinDate)
  const as = new Date(asOf)
  const totalMonths = (as.getFullYear() - join.getFullYear()) * 12 + (as.getMonth() - join.getMonth())
  return {
    years: Math.floor(totalMonths / 12),
    months: totalMonths % 12,
    totalMonths,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Gross salary calculation', () => {
  it('base only', () => {
    expect(calcGrossSalary(5_000_000, [])).toBe(5_000_000)
  })
  it('base + allowances', () => {
    expect(calcGrossSalary(5_000_000, [
      { name: 'Transport', amount: 500_000 },
      { name: 'Makan', amount: 300_000 },
    ])).toBe(5_800_000)
  })
  it('handles empty allowances', () => {
    expect(calcGrossSalary(3_000_000, [])).toBe(3_000_000)
  })
})

describe('Net salary calculation', () => {
  it('gross minus deductions', () => {
    expect(calcNetSalary(6_000_000, 500_000)).toBe(5_500_000)
  })
  it('never goes below 0', () => {
    expect(calcNetSalary(1_000_000, 2_000_000)).toBe(0)
  })
  it('zero deductions', () => {
    expect(calcNetSalary(5_000_000, 0)).toBe(5_000_000)
  })
})

describe('Total deductions', () => {
  it('sums all deductions', () => {
    expect(calcTotalDeductions([
      { name: 'BPJS Kesehatan', amount: 100_000 },
      { name: 'PPh 21', amount: 50_000 },
      { name: 'Pinjaman', amount: 200_000 },
    ])).toBe(350_000)
  })
  it('returns 0 for empty', () => {
    expect(calcTotalDeductions([])).toBe(0)
  })
})

describe('PPh 21 calculation (Indonesian income tax)', () => {
  it('no tax for income below PTKP', () => {
    // 3,500,000/month = 42,000,000/year < 54,000,000 PTKP
    expect(calcPPh21(3_500_000)).toBe(0)
  })
  it('5% bracket', () => {
    // 5,000,000/month = 60,000,000/year; PKP = 60M - 54M = 6M; tax = 6M * 5% = 300K/year = 25K/month
    expect(calcPPh21(5_000_000)).toBe(25_000)
  })
  it('returns 0 for zero salary', () => {
    expect(calcPPh21(0)).toBe(0)
  })
})

describe('BPJS Kesehatan', () => {
  it('calculates employee and employer portions', () => {
    const bpjs = calcBPJSHealth(5_000_000)
    expect(bpjs.employee).toBe(50_000)   // 1%
    expect(bpjs.employer).toBe(200_000)  // 4%
  })
  it('caps at 12,000,000', () => {
    const bpjs = calcBPJSHealth(20_000_000)
    expect(bpjs.employee).toBe(120_000)  // 1% of 12M cap
    expect(bpjs.employer).toBe(480_000)  // 4% of 12M cap
  })
  it('handles zero salary', () => {
    const bpjs = calcBPJSHealth(0)
    expect(bpjs.employee).toBe(0)
    expect(bpjs.employer).toBe(0)
  })
})

describe('BPJS Ketenagakerjaan', () => {
  it('calculates JHT, JKK, JKM correctly', () => {
    const bpjs = calcBPJSEmployment(5_000_000)
    expect(bpjs.jht_employee).toBe(100_000)  // 2%
    expect(bpjs.jht_employer).toBe(185_000)  // 3.7%
    expect(bpjs.jkk).toBe(12_000)            // 0.24%
    expect(bpjs.jkm).toBe(15_000)            // 0.3%
  })
})

describe('Late calculation', () => {
  it('no late when on time', () => {
    expect(calcLateMinutes('08:00', '08:00')).toBe(0)
  })
  it('calculates minutes late', () => {
    expect(calcLateMinutes('08:30', '08:00')).toBe(30)
  })
  it('returns 0 when early', () => {
    expect(calcLateMinutes('07:50', '08:00')).toBe(0)
  })
  it('handles hour boundary', () => {
    expect(calcLateMinutes('09:15', '08:00')).toBe(75)
  })
})

describe('Attendance status', () => {
  it('PRESENT when on time', () => {
    expect(getAttendanceStatus('08:00', '08:00')).toBe('PRESENT')
  })
  it('PRESENT within tolerance', () => {
    expect(getAttendanceStatus('08:10', '08:00', 15)).toBe('PRESENT')
  })
  it('LATE when past tolerance', () => {
    expect(getAttendanceStatus('08:20', '08:00', 15)).toBe('LATE')
  })
  it('ABSENT when no check-in', () => {
    expect(getAttendanceStatus(null, '08:00')).toBe('ABSENT')
  })
})

describe('Working days calculation', () => {
  it('counts weekdays only', () => {
    // June 2025: 1 full week Mon-Fri
    expect(calcWorkingDays('2025-06-02', '2025-06-06')).toBe(5)
  })
  it('excludes weekends', () => {
    expect(calcWorkingDays('2025-06-07', '2025-06-08')).toBe(0) // Sat-Sun
  })
  it('excludes public holidays', () => {
    expect(calcWorkingDays('2025-06-02', '2025-06-06', ['2025-06-04'])).toBe(4)
  })
  it('handles single day', () => {
    expect(calcWorkingDays('2025-06-02', '2025-06-02')).toBe(1) // Monday
  })
})

describe('Prorate salary', () => {
  it('full month = full salary', () => {
    expect(calcProrateSalary(5_000_000, 22, 22)).toBe(5_000_000)
  })
  it('half month = half salary', () => {
    expect(calcProrateSalary(5_000_000, 11, 22)).toBe(2_500_000)
  })
  it('returns 0 when zero working days', () => {
    expect(calcProrateSalary(5_000_000, 5, 0)).toBe(0)
  })
})

describe('Employee validation', () => {
  it('accepts valid employee', () => {
    expect(validateEmployee({
      name: 'Budi Santoso',
      position: 'Kasir',
      baseSalary: 3_500_000,
      joinDate: '2024-01-15',
    })).toBeNull()
  })
  it('rejects short name', () => {
    expect(validateEmployee({ name: 'A', position: 'Kasir', baseSalary: 3_000_000, joinDate: '2024-01-01' }))
      .toBe('Nama karyawan minimal 2 karakter')
  })
  it('rejects missing position', () => {
    expect(validateEmployee({ name: 'Budi', position: '', baseSalary: 3_000_000, joinDate: '2024-01-01' }))
      .toBe('Posisi harus diisi')
  })
  it('rejects negative salary', () => {
    expect(validateEmployee({ name: 'Budi', position: 'Kasir', baseSalary: -1, joinDate: '2024-01-01' }))
      .toBe('Gaji pokok tidak boleh negatif')
  })
  it('rejects invalid NIK', () => {
    expect(validateEmployee({ name: 'Budi', position: 'Kasir', baseSalary: 3_000_000, joinDate: '2024-01-01', nik: '1234' }))
      .toBe('NIK harus 16 digit angka')
  })
  it('accepts valid 16-digit NIK', () => {
    expect(validateEmployee({ name: 'Budi', position: 'Kasir', baseSalary: 3_000_000, joinDate: '2024-01-01', nik: '1234567890123456' })).toBeNull()
  })
})

describe('Employee tenure', () => {
  it('calculates years and months', () => {
    const tenure = calcEmployeeTenure('2022-01-15', '2025-01-15')
    expect(tenure.years).toBe(3)
    expect(tenure.months).toBe(0)
    expect(tenure.totalMonths).toBe(36)
  })
  it('calculates partial year', () => {
    const tenure = calcEmployeeTenure('2024-01-01', '2025-07-01')
    expect(tenure.years).toBe(1)
    expect(tenure.months).toBe(6)
    expect(tenure.totalMonths).toBe(18)
  })
  it('new employee = 0', () => {
    const today = new Date().toISOString().slice(0, 10)
    const tenure = calcEmployeeTenure(today, today)
    expect(tenure.totalMonths).toBe(0)
  })
})
