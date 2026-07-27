'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Gift, Copy, Check, Users, Star } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { generateReferralCode, REFERRAL_REWARD_POINTS } from '@/lib/rfm'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Referral {
  id: string
  referredCustomerId: string
  referredCustomerName: string
  createdAt: string
  rewarded: boolean
  pointsAwarded: number
}

interface ReferralClientProps {
  customerId: string
  customerName: string
  storeId: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ReferralClient({ customerId, customerName, storeId }: ReferralClientProps) {
  const [copied, setCopied] = useState(false)

  const referralCode = generateReferralCode(customerId)
  const referralLink =
    typeof window !== 'undefined'
      ? `${window.location.origin}/daftar?ref=${referralCode}`
      : `/daftar?ref=${referralCode}`

  const { data, isLoading, isError } = useQuery<Referral[]>({
    queryKey: ['referrals', customerId],
    queryFn: async () => {
      const res = await fetch(`/api/referrals?customerId=${customerId}&storeId=${storeId}`)
      if (!res.ok) throw new Error('Failed to load referrals')
      const json = await res.json() as { data?: unknown }
      return (json.data ?? json) as Referral[]
    },
    staleTime: 2 * 60 * 1000,
  })

  const referrals = data ?? []
  const successfulReferrals = referrals.filter((r) => r.rewarded).length
  const totalPointsEarned = successfulReferrals * REFERRAL_REWARD_POINTS

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(referralLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for environments without clipboard API
      const input = document.createElement('input')
      input.value = referralLink
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Gift className="w-5 h-5 text-amber-500" />
        <h2 className="text-lg font-semibold text-[var(--text-1)]">Program Referral</h2>
      </div>

      {/* Referral code card */}
      <div className="rounded-2xl border border-[var(--border)] bg-gradient-to-br from-amber-50 to-orange-50 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-[var(--text-2)] mb-1">Kode referral {customerName}</p>
            <p className="text-3xl font-bold tracking-widest text-amber-600 font-mono">
              {referralCode}
            </p>
            <p className="mt-2 text-xs text-[var(--text-3)] truncate">{referralLink}</p>
          </div>
          <button
            onClick={handleCopy}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all shrink-0',
              copied
                ? 'bg-emerald-500 text-white'
                : 'bg-amber-500 hover:bg-amber-600 text-white',
            )}
            aria-label="Salin link referral"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                Tersalin!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Bagikan Link
              </>
            )}
          </button>
        </div>

        {/* Reward info */}
        <div className="mt-4 pt-4 border-t border-amber-200 flex items-center gap-2 text-sm text-amber-700">
          <Star className="w-4 h-4 shrink-0" />
          <span>
            Dapatkan <strong>{REFERRAL_REWARD_POINTS.toLocaleString('id-ID')} poin</strong> untuk
            setiap teman yang berhasil bergabung menggunakan kode Anda.
          </span>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          {
            label: 'Total Referral',
            value: referrals.length,
            icon: <Users className="w-4 h-4 text-blue-500" />,
            suffix: 'orang',
          },
          {
            label: 'Berhasil',
            value: successfulReferrals,
            icon: <Check className="w-4 h-4 text-emerald-500" />,
            suffix: 'orang',
          },
          {
            label: 'Poin Diperoleh',
            value: totalPointsEarned.toLocaleString('id-ID'),
            icon: <Star className="w-4 h-4 text-amber-500" />,
            suffix: 'pts',
          },
        ].map(({ label, value, icon, suffix }) => (
          <div
            key={label}
            className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3 text-center"
          >
            <div className="flex justify-center mb-1">{icon}</div>
            <div className="text-xl font-bold text-[var(--text-1)]">{value}</div>
            <div className="text-xs text-[var(--text-3)]">
              {label}
              {suffix && <span className="ml-1 opacity-70">{suffix}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Referral list */}
      <div>
        <h3 className="text-sm font-medium text-[var(--text-2)] mb-2">Riwayat Referral</h3>

        {isLoading && (
          <div className="flex items-center justify-center h-24 text-[var(--text-3)]">
            <div className="animate-spin w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full mr-2" />
            Memuat...
          </div>
        )}

        {isError && (
          <div className="text-center py-8 text-red-500 text-sm">
            Gagal memuat riwayat referral.
          </div>
        )}

        {!isLoading && !isError && referrals.length === 0 && (
          <div className="text-center py-10 text-[var(--text-3)] text-sm">
            Belum ada referral. Bagikan kode Anda sekarang!
          </div>
        )}

        {!isLoading && referrals.length > 0 && (
          <div className="rounded-xl border border-[var(--border)] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--bg-muted)] text-[var(--text-2)] text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-2.5">Nama Teman</th>
                  <th className="text-center px-4 py-2.5">Status</th>
                  <th className="text-right px-4 py-2.5">Poin</th>
                  <th className="text-right px-4 py-2.5">Tanggal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {referrals.map((r) => (
                  <tr key={r.id} className="bg-[var(--bg-card)] hover:bg-[var(--bg-muted)] transition-colors">
                    <td className="px-4 py-3 font-medium text-[var(--text-1)]">
                      {r.referredCustomerName}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium',
                          r.rewarded
                            ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                            : 'bg-amber-100 text-amber-700 border-amber-200',
                        )}
                      >
                        {r.rewarded ? (
                          <>
                            <Check className="w-3 h-3" /> Berhasil
                          </>
                        ) : (
                          'Menunggu'
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--text-2)]">
                      {r.rewarded ? (
                        <span className="text-emerald-600 font-medium">
                          +{r.pointsAwarded.toLocaleString('id-ID')} pts
                        </span>
                      ) : (
                        <span className="text-[var(--text-3)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--text-3)]">
                      {formatDate(r.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
