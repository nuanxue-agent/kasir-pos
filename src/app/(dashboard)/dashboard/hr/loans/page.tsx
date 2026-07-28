import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { exec, query } from '@/lib/db'
import LoanClient from '@/components/hr/LoanClient'

export const metadata = { title: 'Employee Loans — HR' }

export default async function LoansPage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')
  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  if (!storeId) redirect('/dashboard')

  await exec(`CREATE TABLE IF NOT EXISTS EmployeeLoan (
    id               TEXT PRIMARY KEY,
    storeId          TEXT NOT NULL,
    employeeId       TEXT NOT NULL,
    type             TEXT NOT NULL DEFAULT 'LOAN',
    amount           REAL NOT NULL DEFAULT 0,
    interestRate     REAL NOT NULL DEFAULT 0,
    installments     INTEGER NOT NULL DEFAULT 1,
    installmentAmount REAL NOT NULL DEFAULT 0,
    status           TEXT NOT NULL DEFAULT 'PENDING',
    approvedBy       TEXT,
    approvedAt       TEXT,
    startDate        TEXT,
    createdAt        TEXT NOT NULL,
    updatedAt        TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS LoanRepayment (
    id        TEXT PRIMARY KEY,
    loanId    TEXT NOT NULL,
    storeId   TEXT NOT NULL,
    amount    REAL NOT NULL DEFAULT 0,
    dueDate   TEXT NOT NULL,
    paidAt    TEXT,
    status    TEXT NOT NULL DEFAULT 'PENDING',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`)

  const [loansRaw, employeesRaw] = await Promise.all([
    query(
      `SELECT l.*, e.name as employeeName
       FROM EmployeeLoan l
       LEFT JOIN Employee e ON e.id = l.employeeId
       WHERE l.storeId = ?
       ORDER BY l.createdAt DESC`,
      [storeId],
    ),
    query(
      `SELECT id, name, baseSalary FROM Employee WHERE storeId = ? ORDER BY name ASC`,
      [storeId],
    ).catch(() => []),
  ])

  const currency = user.stores?.[0]?.currency ?? 'IDR'

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <LoanClient
        storeId={storeId}
        currency={currency}
        initialLoans={loansRaw as any[]}
        employees={employeesRaw as any[]}
      />
    </main>
  )
}
