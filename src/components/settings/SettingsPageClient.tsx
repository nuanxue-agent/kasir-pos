'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Save, Store, Receipt, Globe } from 'lucide-react'
import { cn } from '@/lib/utils'

const schema = z.object({
  name: z.string().min(1, 'Required'),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  taxRate: z.coerce.number().min(0).max(100),
  currency: z.string().min(1),
  receiptNote: z.string().optional(),
  timezone: z.string().optional(),
})

type FormData = z.infer<typeof schema>

interface SettingsPageClientProps {
  storeId: string
  store: {
    name: string
    address?: string | null
    phone?: string | null
    email?: string | null
    taxRate: number
    currency: string
    receiptNote?: string | null
    timezone: string
  }
}

export default function SettingsPageClient({ storeId, store }: SettingsPageClientProps) {
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: store.name,
      address: store.address ?? '',
      phone: store.phone ?? '',
      email: store.email ?? '',
      taxRate: store.taxRate * 100,
      currency: store.currency,
      receiptNote: store.receiptNote ?? '',
      timezone: store.timezone,
    },
  })

  const onSubmit = async (data: FormData) => {
    setSaving(true)
    setError('')
    setSuccess(false)
    try {
      const res = await fetch('/api/settings/store', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, ...data, taxRate: data.taxRate / 100 }),
      })
      if (!res.ok) throw new Error('Failed to save')
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch {
      setError('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Store Settings</h1>
        <p className="text-slate-400 mt-1 text-sm">Configure your store information and preferences</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Store Info */}
        <section className="bg-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2 text-slate-300 font-medium mb-2">
            <Store size={16} />
            <span>Store Information</span>
          </div>

          <Field label="Store Name" error={errors.name?.message}>
            <input {...register('name')} className={inputCls} />
          </Field>
          <Field label="Address" error={errors.address?.message}>
            <textarea {...register('address')} rows={2} className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Phone" error={errors.phone?.message}>
              <input {...register('phone')} className={inputCls} />
            </Field>
            <Field label="Email" error={errors.email?.message}>
              <input {...register('email')} className={inputCls} />
            </Field>
          </div>
        </section>

        {/* Tax & Currency */}
        <section className="bg-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2 text-slate-300 font-medium mb-2">
            <Globe size={16} />
            <span>Tax & Currency</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Tax Rate (%)" error={errors.taxRate?.message}>
              <input type="number" step="0.1" min="0" max="100" {...register('taxRate')} className={inputCls} />
            </Field>
            <Field label="Currency" error={errors.currency?.message}>
              <select {...register('currency')} className={inputCls}>
                <option value="IDR">IDR — Indonesian Rupiah</option>
                <option value="USD">USD — US Dollar</option>
                <option value="SGD">SGD — Singapore Dollar</option>
                <option value="MYR">MYR — Malaysian Ringgit</option>
              </select>
            </Field>
          </div>
          <Field label="Timezone" error={errors.timezone?.message}>
            <select {...register('timezone')} className={inputCls}>
              <option value="Asia/Jakarta">Asia/Jakarta (WIB, UTC+7)</option>
              <option value="Asia/Makassar">Asia/Makassar (WITA, UTC+8)</option>
              <option value="Asia/Jayapura">Asia/Jayapura (WIT, UTC+9)</option>
              <option value="Asia/Singapore">Asia/Singapore (SGT, UTC+8)</option>
              <option value="UTC">UTC</option>
            </select>
          </Field>
        </section>

        {/* Receipt */}
        <section className="bg-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2 text-slate-300 font-medium mb-2">
            <Receipt size={16} />
            <span>Receipt</span>
          </div>
          <Field label="Receipt Footer Note" error={errors.receiptNote?.message}>
            <textarea
              {...register('receiptNote')}
              rows={3}
              placeholder="e.g. Thank you for shopping with us!"
              className={inputCls}
            />
          </Field>
        </section>

        {error && <p className="text-red-400 text-sm bg-red-400/10 rounded-lg px-4 py-2">{error}</p>}

        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white px-5 py-2.5 rounded-lg font-medium text-sm transition-colors"
          >
            <Save size={16} />
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
          {success && <p className="text-green-400 text-sm">✓ Settings saved</p>}
        </div>
      </form>
    </div>
  )
}

const inputCls = 'w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-400'

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1.5">{label}</label>
      {children}
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  )
}
