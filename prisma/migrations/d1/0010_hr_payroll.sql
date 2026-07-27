-- Employee table
CREATE TABLE IF NOT EXISTS "Employee" (
  "id" TEXT PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  "userId" TEXT,
  "name" TEXT NOT NULL,
  "nik" TEXT,
  "position" TEXT NOT NULL,
  "department" TEXT,
  "baseSalary" REAL NOT NULL DEFAULT 0,
  "employmentStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
  "employmentType" TEXT NOT NULL DEFAULT 'FULL_TIME',
  "joinDate" TEXT NOT NULL,
  "endDate" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "address" TEXT,
  "bankName" TEXT,
  "bankAccount" TEXT,
  "bankAccountName" TEXT,
  "emergencyContact" TEXT,
  "notes" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL,
  "updatedAt" DATETIME NOT NULL,
  FOREIGN KEY ("storeId") REFERENCES "Store"("id"),
  FOREIGN KEY ("userId") REFERENCES "User"("id")
);

-- Attendance
CREATE TABLE IF NOT EXISTS "Attendance" (
  "id" TEXT PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "checkIn" TEXT,
  "checkOut" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PRESENT',
  "lateMinutes" INTEGER NOT NULL DEFAULT 0,
  "overtimeMinutes" INTEGER NOT NULL DEFAULT 0,
  "note" TEXT,
  "createdAt" DATETIME NOT NULL,
  "updatedAt" DATETIME NOT NULL,
  FOREIGN KEY ("storeId") REFERENCES "Store"("id"),
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id"),
  UNIQUE("employeeId", "date")
);

-- Payroll Run (monthly)
CREATE TABLE IF NOT EXISTS "PayrollRun" (
  "id" TEXT PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "totalGross" REAL NOT NULL DEFAULT 0,
  "totalDeductions" REAL NOT NULL DEFAULT 0,
  "totalNet" REAL NOT NULL DEFAULT 0,
  "paidAt" DATETIME,
  "note" TEXT,
  "createdAt" DATETIME NOT NULL,
  "updatedAt" DATETIME NOT NULL,
  FOREIGN KEY ("storeId") REFERENCES "Store"("id")
);

-- Payslip per employee per run
CREATE TABLE IF NOT EXISTS "Payslip" (
  "id" TEXT PRIMARY KEY,
  "runId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "baseSalary" REAL NOT NULL DEFAULT 0,
  "allowances" TEXT NOT NULL DEFAULT '[]',
  "deductions" TEXT NOT NULL DEFAULT '[]',
  "grossSalary" REAL NOT NULL DEFAULT 0,
  "totalDeductions" REAL NOT NULL DEFAULT 0,
  "netSalary" REAL NOT NULL DEFAULT 0,
  "workedDays" INTEGER NOT NULL DEFAULT 0,
  "workingDays" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "paidAt" DATETIME,
  "createdAt" DATETIME NOT NULL,
  "updatedAt" DATETIME NOT NULL,
  FOREIGN KEY ("runId") REFERENCES "PayrollRun"("id"),
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
);

-- Leave / time-off requests
CREATE TABLE IF NOT EXISTS "LeaveRequest" (
  "id" TEXT PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'ANNUAL',
  "fromDate" TEXT NOT NULL,
  "toDate" TEXT NOT NULL,
  "days" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "reason" TEXT,
  "approvedBy" TEXT,
  "approvedAt" DATETIME,
  "createdAt" DATETIME NOT NULL,
  "updatedAt" DATETIME NOT NULL,
  FOREIGN KEY ("storeId") REFERENCES "Store"("id"),
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
);

CREATE INDEX IF NOT EXISTS idx_employee_store ON "Employee"("storeId");
CREATE INDEX IF NOT EXISTS idx_attendance_emp ON "Attendance"("employeeId");
CREATE INDEX IF NOT EXISTS idx_attendance_date ON "Attendance"("date");
CREATE INDEX IF NOT EXISTS idx_payslip_run ON "Payslip"("runId");
CREATE INDEX IF NOT EXISTS idx_payslip_emp ON "Payslip"("employeeId");
CREATE INDEX IF NOT EXISTS idx_leave_emp ON "LeaveRequest"("employeeId");
