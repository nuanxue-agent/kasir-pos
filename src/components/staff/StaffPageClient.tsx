'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { UserCog, Plus, Pencil, Trash2, Key, Mail, Shield, CheckCircle, XCircle } from 'lucide-react'
import { formatDate, cn } from '@/lib/utils'

interface StaffMember {
  id: string
  storeId: string
  userId: string
  role: 'OWNER' | 'MANAGER' | 'CASHIER'
  user: {
    id: string
    name: string
    email: string
    role: 'OWNER' | 'MANAGER' | 'CASHIER'
    active: boolean
    createdAt: string
  }
}

interface StaffPageClientProps {
  storeId: string
}

const ROLE_COLORS = {
  OWNER: 'bg-purple-900/50 text-purple-400',
  MANAGER: 'bg-blue-900/50 text-blue-400',
  CASHIER: 'bg-green-900/50 text-green-400',
}

export default function StaffPageClient({ storeId }: StaffPageClientProps) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<StaffMember | null>(null)

  const { data: rawStaff = [], isLoading } = useQuery({
    queryKey: ['staff', storeId],
    queryFn: () => fetch(`/api/staff?storeId=${storeId}`).then(r => r.json()),
  })

  // Normalize flat API shape → nested shape the template expects
  const staff: StaffMember[] = rawStaff.map((m: any) => ({
    id: m.id,
    storeId,
    userId: m.id,
    role: (m.storeRole ?? m.role) as StaffMember['role'],
    user: {
      id: m.id,
      name: m.name,
      email: m.email,
      role: m.role,
      active: m.active === 1 || m.active === true,
      createdAt: m.createdAt ?? new Date().toISOString(),
    },
  }))

  const deleteMutation = useMutation({
    mutationFn: (userId: string) => fetch(`/api/staff/${userId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff', storeId] }),
  })

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Staff</h1>
          <p className="text-slate-400 mt-1 text-sm">Manage your team members and permissions</p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowForm(true) }}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} /> Add Staff
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 bg-slate-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : staff.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-500">
          <UserCog size={48} strokeWidth={1} className="mb-4" />
          <p>No staff members yet. Add your first one.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {staff.map((member: StaffMember) => (
            <div
              key={member.id}
              className={cn(
                'bg-slate-800 rounded-xl p-4 flex items-center gap-4 border border-slate-700',
                !member.user.active && 'opacity-50'
              )}
            >
              {/* Avatar */}
              <div className="shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-lg">
                {member.user.name[0].toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-white">{member.user.name}</p>
                  <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', ROLE_COLORS[member.role])}>
                    {member.role}
                  </span>
                  {member.user.active ? (
                    <CheckCircle size={14} className="text-green-500" />
                  ) : (
                    <XCircle size={14} className="text-red-500" />
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <Mail size={12} />
                    {member.user.email}
                  </span>
                  <span>Joined {formatDate(member.user.createdAt)}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => { setEditing(member); setShowForm(true) }}
                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                  title="Edit"
                >
                  <Pencil size={15} />
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Deactivate ${member.user.name}?`)) {
                      deleteMutation.mutate(member.userId)
                    }
                  }}
                  className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                  title="Deactivate"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <StaffFormModal
          storeId={storeId}
          staff={editing}
          onClose={() => setShowForm(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['staff', storeId] })
            setShowForm(false)
          }}
        />
      )}
    </div>
  )
}

function StaffFormModal({ storeId, staff, onClose, onSuccess }: {
  storeId: string
  staff: StaffMember | null
  onClose: () => void
  onSuccess: () => void
}) {
  const [form, setForm] = useState({
    name: staff?.user.name ?? '',
    email: staff?.user.email ?? '',
    password: '',
    pin: '',
    role: staff?.role ?? 'CASHIER' as 'OWNER' | 'MANAGER' | 'CASHIER',
    active: staff?.user.active ?? true,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!staff && (!form.name || !form.email || !form.password)) {
      setError('Name, email, and password are required')
      return
    }

    setLoading(true)
    setError('')
    try {
      const url = staff ? `/api/staff/${staff.userId}` : '/api/staff'
      const method = staff ? 'PATCH' : 'POST'
      const body: any = { storeId, ...form }
      if (staff && !form.password) delete body.password
      if (!form.pin) delete body.pin

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to save')
        return
      }
      onSuccess()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-xl w-full max-w-md border border-slate-700 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <UserCog size={20} />
          {staff ? 'Edit Staff Member' : 'Add Staff Member'}
        </h2>

        <div className="space-y-3">
          <input
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Full Name*"
            disabled={!!staff}
            className={inputCls}
          />
          <input
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            placeholder="Email*"
            type="email"
            disabled={!!staff}
            className={inputCls}
          />
          <input
            value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            placeholder={staff ? "Password (leave blank to keep)" : "Password*"}
            type="password"
            className={inputCls}
          />
          <input
            value={form.pin}
            onChange={e => setForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
            placeholder="4-digit PIN (optional)"
            className={cn(inputCls, 'font-mono')}
            maxLength={4}
          />
          <select
            value={form.role}
            onChange={e => setForm(f => ({ ...f, role: e.target.value as any }))}
            className={inputCls}
          >
            <option value="CASHIER">Cashier — POS only</option>
            <option value="MANAGER">Manager — Products, reports, staff</option>
            <option value="OWNER">Owner — Full access</option>
          </select>
          {staff && (
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={form.active}
                onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
                className="rounded"
              />
              Active
            </label>
          )}
        </div>

        {error && <p className="text-red-400 text-sm bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-slate-700 text-slate-400 hover:text-white text-sm transition-colors">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={loading}
            className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white text-sm font-medium transition-colors"
          >
            {loading ? 'Saving...' : staff ? 'Update' : 'Add Staff'}
          </button>
        </div>
      </div>
    </div>
  )
}

const inputCls = 'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-400 disabled:opacity-50 disabled:cursor-not-allowed'
