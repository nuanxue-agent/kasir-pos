'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X, UserPlus, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  address: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface CustomerFormModalProps {
  storeId: string
  /** If provided, we're editing an existing customer */
  customer?: {
    id: string
    name: string
    phone: string | null
    email: string | null
    address: string | null
  }
  onClose: () => void
  onSuccess: () => void
}

export function CustomerFormModal({
  storeId,
  customer,
  onClose,
  onSuccess,
}: CustomerFormModalProps) {
  const isEdit = !!customer

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: customer?.name ?? '',
      phone: customer?.phone ?? '',
      email: customer?.email ?? '',
      address: customer?.address ?? '',
    },
  })

  // Reset when customer prop changes (reuse modal for edit)
  useEffect(() => {
    reset({
      name: customer?.name ?? '',
      phone: customer?.phone ?? '',
      email: customer?.email ?? '',
      address: customer?.address ?? '',
    })
  }, [customer, reset])

  const onSubmit = async (values: FormValues) => {
    const url = isEdit ? `/api/customers/${customer!.id}` : '/api/customers'
    const method = isEdit ? 'PATCH' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...values,
        ...(isEdit ? {} : { storeId }),
      }),
    })

    if (res.ok) {
      toast.success('Pelanggan disimpan')
      onSuccess()
      return
    }

    const data = await res.json() as any
    if (data.error?.fieldErrors) {
      const fieldErrors = data.error.fieldErrors as Record<string, string[]>
      for (const [field, msgs] of Object.entries(fieldErrors)) {
        setError(field as keyof FormValues, { message: msgs[0] })
      }
      toast.error('Gagal menyimpan', 'Periksa kembali isian form')
    } else {
      const msg = data.error ?? 'Something went wrong'
      setError('root', { message: msg })
      toast.error('Gagal menyimpan', msg)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-amber-600" />
            <h2 className="text-lg font-semibold text-[var(--text-1)]">
              {isEdit ? 'Edit Customer' : 'Add Customer'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--bg-muted)] transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          {/* Root error */}
          {errors.root && (
            <div className="px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-400">{errors.root.message}</p>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-2)] mb-1.5">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              {...register('name')}
              type="text"
              placeholder="Customer name"
              className={cn(
                'w-full px-3 py-2 bg-[var(--bg-muted)] border rounded-lg text-[var(--text-1)] placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition',
                errors.name ? 'border-red-500' : 'border-[var(--border)]'
              )}
            />
            {errors.name && (
              <p className="mt-1 text-xs text-red-400">{errors.name.message}</p>
            )}
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-2)] mb-1.5">
              Phone
            </label>
            <input
              {...register('phone')}
              type="tel"
              placeholder="+62 812 3456 7890"
              className={cn(
                'w-full px-3 py-2 bg-[var(--bg-muted)] border rounded-lg text-[var(--text-1)] placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition',
                errors.phone ? 'border-red-500' : 'border-[var(--border)]'
              )}
            />
            {errors.phone && (
              <p className="mt-1 text-xs text-red-400">{errors.phone.message}</p>
            )}
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-2)] mb-1.5">
              Email
            </label>
            <input
              {...register('email')}
              type="email"
              placeholder="customer@example.com"
              className={cn(
                'w-full px-3 py-2 bg-[var(--bg-muted)] border rounded-lg text-[var(--text-1)] placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition',
                errors.email ? 'border-red-500' : 'border-[var(--border)]'
              )}
            />
            {errors.email && (
              <p className="mt-1 text-xs text-red-400">{errors.email.message}</p>
            )}
          </div>

          {/* Address */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-2)] mb-1.5">
              Address
            </label>
            <textarea
              {...register('address')}
              rows={3}
              placeholder="Customer address"
              className={cn(
                'w-full px-3 py-2 bg-[var(--bg-muted)] border rounded-lg text-[var(--text-1)] placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition resize-none',
                errors.address ? 'border-red-500' : 'border-[var(--border)]'
              )}
            />
            {errors.address && (
              <p className="mt-1 text-xs text-red-400">{errors.address.message}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-[var(--bg-muted)] hover:bg-stone-200 text-[var(--text-2)] rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-amber-500 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? 'Save Changes' : 'Add Customer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
