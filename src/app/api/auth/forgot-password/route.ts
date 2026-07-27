import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { queryOne, exec, newId, nowISO } from '@/lib/db'

const schema = z.object({
  email: z.string().email(),
})

// Ensure PasswordResetToken table exists (D1 doesn't support ALTER TABLE IF NOT EXISTS,
// so we manage schema migrations inline with CREATE TABLE IF NOT EXISTS)
async function ensureTable() {
  await exec(`
    CREATE TABLE IF NOT EXISTS PasswordResetToken (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expiresAt TEXT NOT NULL,
      usedAt TEXT,
      createdAt TEXT NOT NULL
    )
  `)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Email tidak valid' }, { status: 400 })
    }
    const { email } = parsed.data

    await ensureTable()

    // Always return success to avoid user enumeration
    const user = await queryOne<any>(
      `SELECT id, email, name FROM User WHERE email = ? AND active = 1`,
      [email],
    )

    if (user) {
      // Invalidate any existing unused tokens for this user
      await exec(`UPDATE PasswordResetToken SET usedAt = ? WHERE userId = ? AND usedAt IS NULL`, [
        nowISO(),
        user.id,
      ])

      const token = newId() + '-' + newId() // ~40 char random token
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour

      await exec(
        `INSERT INTO PasswordResetToken (id, userId, token, expiresAt, createdAt) VALUES (?, ?, ?, ?, ?)`,
        [newId(), user.id, token, expiresAt, nowISO()],
      )

      // TODO: Wire up a real email provider (e.g. Resend, SendGrid, Mailgun).
      // For now we log the reset link to the console.
      const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/reset-password?token=${token}`
      console.log(`[password-reset] Reset link for ${user.email}: ${resetUrl}`)
    }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error('Forgot password error:', e)
    return NextResponse.json({ error: 'Terjadi kesalahan' }, { status: 500 })
  }
}
