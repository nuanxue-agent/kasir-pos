'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, Loader2, Save, Award } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

// ─── Types ────────────────────────────────────────────────────────────────────

interface LoyaltyTier {
  id?: string
  name: string
  minPoints: number
  discount: number
  color: string
  icon: string
}

interface LoyaltySettingsClientProps {
  storeId: string
}

const DEFAULT_TIERS: LoyaltyTier[] = [
  { name: 'Bronze', minPoints: 0, discount: 0, color: '#cd7f32', icon: '🥉' },
  { name: 'Silver', minPoints: 500, discount: 5, color: '#9ca3af', icon: '🥈' },
  { name: 'Gold', minPoints: 1000, discount: 10, color: '#f59e0b', icon: '🥇' },
  { name: 'Platinum', minPoints: 5000, discount: 15, color: '#8b5cf6', icon: '💎' },
]

const PRESET_COLORS = [
  '#cd7f32',
  '#9ca3af',
  '#f59e0b',
  '#8b5cf6',
  '#3b82f6',
  '#10b981',
  '#ef4444',
  '#ec4899',
]

// ─── Component ────────────────────────────────────────────────────────────────

export function LoyaltySettingsClient({ storeId }: LoyaltySettingsClientProps) {
  const [tiers, setTiers] = useState<LoyaltyTier[]>(DEFAULT_TIERS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load existing tiers on mount
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/loyalty/tiers?storeId=${storeId}`)
        if (res.ok) {
          const rows = (await res.json()) as LoyaltyTier[]
          if (rows.length > 0) setTiers(rows)
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [storeId])

  const handleChange = (index: number, field: keyof LoyaltyTier, value: string | number) => {
    setTiers(prev => prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)))
  }

  const handleAddTier = () => {
    setTiers(prev => [
      ...prev,
      { name: 'New Tier', minPoints: 0, discount: 0, color: '#6b7280', icon: '⭐' },
    ])
  }

  const handleRemoveTier = (index: number) => {
    setTiers(prev => prev.filter((_, i) => i !== index))
  }

  const handleSave = async () => {
    // Validate
    for (const tier of tiers) {
      if (!tier.name.trim()) {
        setError('All tiers must have a name')
        return
      }
      if (tier.minPoints < 0) {
        setError('Min points cannot be negative')
        return
      }
      if (tier.discount < 0 || tier.discount > 100) {
        setError('Discount must be between 0 and 100')
        return
      }
    }

    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/loyalty/tiers?storeId=${storeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tiers }),
      })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? 'Failed to save')
      }
      const updated = (await res.json()) as LoyaltyTier[]
      if (Array.isArray(updated)) setTiers(updated)
      toast.success('Loyalty tiers saved')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to save tiers'
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setTiers(DEFAULT_TIERS)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Award className="h-4 w-4 text-amber-500" />
          <h2 className="text-sm font-semibold text-[var(--text-1)]">Loyalty Tiers</h2>
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="text-xs text-[var(--text-3)] transition-colors hover:text-[var(--text-2)]"
        >
          Reset to defaults
        </button>
      </div>

      <p className="text-xs text-[var(--text-3)]">
        Define tiers that customers unlock based on their points balance. Discount % is applied
        automatically at checkout.
      </p>

      {/* Tier rows */}
      <div className="space-y-3">
        {tiers.map((tier, i) => (
          <div
            key={i}
            className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4"
          >
            {/* Tier header with color preview */}
            <div className="flex items-center justify-between">
              <div
                className="flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold text-white"
                style={{ backgroundColor: tier.color }}
              >
                <span>{tier.icon}</span>
                <span>{tier.name || 'Unnamed'}</span>
              </div>
              <button
                type="button"
                onClick={() => handleRemoveTier(i)}
                disabled={tiers.length <= 1}
                className="rounded-lg p-1.5 text-[var(--text-3)] transition-colors hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30"
                aria-label="Remove tier"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {/* Name */}
              <TierField label="Name">
                <input
                  type="text"
                  value={tier.name}
                  onChange={e => handleChange(i, 'name', e.target.value)}
                  placeholder="e.g. Gold"
                  className={inputCls}
                />
              </TierField>

              {/* Icon */}
              <TierField label="Icon (emoji)">
                <input
                  type="text"
                  value={tier.icon}
                  onChange={e => handleChange(i, 'icon', e.target.value)}
                  placeholder="⭐"
                  maxLength={4}
                  className={inputCls}
                />
              </TierField>

              {/* Min Points */}
              <TierField label="Min Points">
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={tier.minPoints}
                  onChange={e => handleChange(i, 'minPoints', parseInt(e.target.value) || 0)}
                  className={inputCls}
                />
              </TierField>

              {/* Discount */}
              <TierField label="Discount (%)">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={tier.discount}
                  onChange={e => handleChange(i, 'discount', parseFloat(e.target.value) || 0)}
                  className={inputCls}
                />
              </TierField>
            </div>

            {/* Color picker */}
            <div>
              <p className="mb-2 text-xs text-[var(--text-3)]">Color</p>
              <div className="flex flex-wrap items-center gap-2">
                {PRESET_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => handleChange(i, 'color', c)}
                    className={cn(
                      'h-6 w-6 rounded-full transition-all hover:scale-110 focus:outline-none',
                      tier.color === c ? 'ring-2 ring-[var(--border)] ring-offset-1' : '',
                    )}
                    style={{ backgroundColor: c }}
                    aria-label={`Color ${c}`}
                  />
                ))}
                <input
                  type="color"
                  value={tier.color}
                  onChange={e => handleChange(i, 'color', e.target.value)}
                  className="h-6 w-6 cursor-pointer rounded-full border-0 bg-transparent p-0"
                  title="Custom color"
                />
                <span className="font-mono text-xs text-[var(--text-3)]">{tier.color}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add tier */}
      <button
        type="button"
        onClick={handleAddTier}
        className="flex w-full items-center gap-2 rounded-xl border border-dashed border-[var(--border)] py-2.5 text-xs font-medium text-[var(--text-3)] transition-all hover:border-amber-400/50 hover:bg-amber-50/40 hover:text-amber-600"
      >
        <Plus className="h-3.5 w-3.5" />
        Add Tier
      </button>

      {/* Error */}
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-500">
          {error}
        </p>
      )}

      {/* Save */}
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-amber-200 transition-all hover:shadow-amber-300 disabled:from-stone-200 disabled:to-stone-200 disabled:text-[var(--text-3)]"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {saving ? 'Menyimpan…' : 'Simpan Tier'}
      </button>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const inputCls =
  'w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2 text-[var(--text-1)] text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 placeholder-stone-400 transition-all'

function TierField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">{label}</label>
      {children}
    </div>
  )
}
