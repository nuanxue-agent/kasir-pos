import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { query, exec } from '@/lib/db'
import AttendanceClient from '@/components/hr/AttendanceClient'

export const metadata = { title: 'Absensi Karyawan — HR' }

export default async function AttendancePage() {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')
  const user = session.user as any
  const storeId: string = user.stores?.[0]?.id ?? ''
  if (!storeId) redirect('/dashboard')

  // Lazy table init
  await exec(`CREATE TABLE IF NOT EXISTS Attendance (
    id TEXT PRIMARY KEY,
    storeId TEXT NOT NULL,
    employeeId TEXT NOT NULL,
    date TEXT NOT NULL,
    clockIn TEXT,
    clockOut TEXT,
    status TEXT NOT NULL DEFAULT 'ABSENT',
    lateMinutes INTEGER NOT NULL DEFAULT 0,
    earlyLeaveMinutes INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`)
  await exec(`CREATE TABLE IF NOT EXISTS AttendanceSetting (
    id TEXT PRIMARY KEY,
    storeId TEXT NOT NULL UNIQUE,
    workStartTime TEXT NOT NULL DEFAULT '08:00',
    workEndTime TEXT NOT NULL DEFAULT '17:00',
    lateThresholdMinutes INTEGER NOT NULL DEFAULT 15,
    graceMinutes INTEGER NOT NULL DEFAULT 10,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`)

  const employees = await query(
    `SELECT id, name FROM Employee WHERE storeId = ? AND (active = 1 OR active IS NULL) ORDER BY name ASC`,
    [storeId],
  ).catch(() => [])

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <AttendanceClient
        storeId={storeId}
        employees={employees as any[]}
      />
    </main>
  )
}
