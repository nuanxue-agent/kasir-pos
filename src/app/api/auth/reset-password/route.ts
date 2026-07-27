import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { queryOne, exec, nowISO } from '@/lib/db'
import bcrypt from 'bcryptjs'

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(6, 'Password minimal 6 karakter'),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
    }
    const { token, password } = parsed.data

    // Look up the token
    const record = await queryOne<any>(
      `SELECT * FROM PasswordResetToken WHERE token = ? AND usedAt IS NULL`,
      [token],
    )

    if (!record) {
      return NextResponse.json({ error: 'Token tidak valid atau sudah digunakan' }, { status: 400 })
    }

    // Check expiry
    if (new Date(record.expiresAt) < new Date()) {
      return NextResponse.json(
        { error: 'Token sudah kadaluarsa. Minta link reset baru.' },
        { status: 400 },
      )
    }

    const user = await queryOne<any>(`SELECT id FROM User WHERE id = ? AND active = 1`, [
      record.userId,
    ])
    if (!user) {
      return NextResponse.json({ error: 'Akun tidak ditemukan' }, { status: 400 })
    }

    const hashedPassword = await bcrypt.hash(password, 12)
    const now = nowISO()

    // Update password and mark token used in one go
    await exec(`UPDATE User SET password = ?, updatedAt = ? WHERE id = ?`, [
      hashedPassword,
      now,
      user.id,
    ])
    await exec(`UPDATE PasswordResetToken SET usedAt = ? WHERE token = ?`, [now, token])

    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error('Reset password error:', e)
    return NextResponse.json({ error: 'Terjadi kesalahan' }, { status: 500 })
  }
}
