'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Award, Users, TrendingUp, AlertCircle, CheckCircle2, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/Toaster'

// ─── Types ─────────────────────────────────────────────────────────────────────

type SkillCategory = 'TECHNICAL' | 'SOFT' | 'OPERATIONAL' | 'LEADERSHIP'
type Proficiency = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT'

interface Skill {
  id: string
  storeId: string
  name: string
  category: SkillCategory
  description: string | null
  createdAt: string
  updatedAt: string
}

interface EmployeeSkill {
  id: string
  employeeId: string
  skillId: string
  storeId: string
  proficiency: Proficiency
  certifiedAt: string | null
  expiresAt: string | null
  skillName?: string
  skillCategory?: string
  createdAt: string
  updatedAt: string
}

interface SkillsMatrixClientProps {
  storeId: string
  employees: Array<{ id: string; name: string; role: string }>
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const inputCls =
  'w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-1)] placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all'

const btnPrimary =
  'inline-flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

const btnSecondary =
  'inline-flex items-center gap-2 px-4 py-2.5 bg-[var(--bg-2)] hover:bg-[var(--bg-3)] text-[var(--text-1)] text-sm font-medium rounded-xl border border-[var(--border)] transition-colors'

const CATEGORY_LABELS: Record<SkillCategory, string> = {
  TECHNICAL: 'Teknis',
  SOFT: 'Soft Skill',
  OPERATIONAL: 'Operasional',
  LEADERSHIP: 'Kepemimpinan',
}

const PROFICIENCY_LABELS: Record<Proficiency, string> = {
  BEGINNER: 'Pemula',
  INTERMEDIATE: 'Menengah',
  ADVANCED: 'Mahir',
  EXPERT: 'Ahli',
}

const PROFICIENCY_COLORS: Record<Proficiency, string> = {
  BEGINNER: 'bg-stone-100 text-stone-600',
  INTERMEDIATE: 'bg-blue-100 text-blue-600',
  ADVANCED: 'bg-amber-100 text-amber-600',
  EXPERT: 'bg-emerald-100 text-emerald-600',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt) < new Date()
}

// ─── SkillsMatrixClient ───────────────────────────────────────────────────────

export default function SkillsMatrixClient({ storeId, employees }: SkillsMatrixClientProps) {
  const qc = useQueryClient()
  const [view, setView] = useState<'matrix' | 'skills' | 'gaps'>('matrix')
  const [showSkillForm, setShowSkillForm] = useState(false)
  const [showAssignForm, setShowAssignForm] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState<string>(employees[0]?.id ?? '')
  const [selectedRole, setSelectedRole] = useState<string>(employees[0]?.role ?? '')

  // Fetch skills
  const { data: skills = [] } = useQuery({
    queryKey: ['skills', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/hr/skills?storeId=${storeId}`)
      if (!res.ok) throw new Error('Failed to fetch skills')
      return (await res.json()) as Skill[]
    },
  })

  // Fetch employee skills
  const { data: employeeSkills = [] } = useQuery({
    queryKey: ['employee-skills', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/hr/employee-skills?storeId=${storeId}`)
      if (!res.ok) throw new Error('Failed to fetch employee skills')
      return (await res.json()) as EmployeeSkill[]
    },
  })

  // Fetch skills gap for selected employee
  const { data: gapData } = useQuery({
    queryKey: ['skills-gap', storeId, selectedRole, selectedEmployee],
    queryFn: async () => {
      const res = await fetch(`/api/hr/skills-gap?storeId=${storeId}&role=${selectedRole}&employeeId=${selectedEmployee}`)
      if (!res.ok) throw new Error('Failed to fetch skills gap')
      return (await res.json()) as any
    },
    enabled: view === 'gaps' && !!selectedEmployee && !!selectedRole,
  })

  const handleCreateSkill = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)
    const res = await fetch(`/api/hr/skills?storeId=${storeId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: fd.get('name'),
        category: fd.get('category'),
        description: fd.get('description'),
      }),
    })
    const json = (await res.json()) as any
    if (json.error) {
      toast.error(json.error)
      return
    }
    toast.success('Skill ditambahkan')
    qc.invalidateQueries({ queryKey: ['skills', storeId] })
    setShowSkillForm(false)
    form.reset()
  }

  const handleAssignSkill = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)
    const res = await fetch(`/api/hr/employee-skills?storeId=${storeId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employeeId: fd.get('employeeId'),
        skillId: fd.get('skillId'),
        proficiency: fd.get('proficiency'),
        certifiedAt: fd.get('certifiedAt') || null,
        expiresAt: fd.get('expiresAt') || null,
      }),
    })
    const json = (await res.json()) as any
    if (json.error) {
      toast.error(json.error)
      return
    }
    toast.success('Skill ditambahkan ke karyawan')
    qc.invalidateQueries({ queryKey: ['employee-skills', storeId] })
    setShowAssignForm(false)
    form.reset()
  }

  const handleUpdateProficiency = async (id: string, proficiency: Proficiency) => {
    const res = await fetch(`/api/hr/employee-skills/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proficiency }),
    })
    const json = (await res.json()) as any
    if (json.error) {
      toast.error(json.error)
      return
    }
    toast.success('Profisiensi diperbarui')
    qc.invalidateQueries({ queryKey: ['employee-skills', storeId] })
  }

  // Group skills by category
  const skillsByCategory = skills.reduce(
    (acc, skill) => {
      if (!acc[skill.category]) acc[skill.category] = []
      acc[skill.category].push(skill)
      return acc
    },
    {} as Record<SkillCategory, Skill[]>,
  )

  // Matrix view: employees x skills
  const getEmployeeSkillMap = () => {
    const map: Record<string, Record<string, EmployeeSkill>> = {}
    for (const es of employeeSkills) {
      if (!map[es.employeeId]) map[es.employeeId] = {}
      map[es.employeeId][es.skillId] = es
    }
    return map
  }

  const empSkillMap = getEmployeeSkillMap()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-[var(--text-1)]">Matriks Kompetensi Karyawan</h1>
        <div className="flex gap-2">
          <button onClick={() => setShowSkillForm(true)} className={btnSecondary}>
            <Plus className="h-4 w-4" />
            Tambah Skill
          </button>
          <button onClick={() => setShowAssignForm(true)} className={btnPrimary}>
            <Award className="h-4 w-4" />
            Assign Skill
          </button>
        </div>
      </div>

      {/* View toggle */}
      <div className="flex gap-2 border-b border-[var(--border)]">
        <button
          onClick={() => setView('matrix')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
            view === 'matrix'
              ? 'border-amber-500 text-amber-600'
              : 'border-transparent text-[var(--text-2)] hover:text-[var(--text-1)]',
          )}
        >
          <Users className="inline h-4 w-4 mr-1.5" />
          Matriks
        </button>
        <button
          onClick={() => setView('skills')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
            view === 'skills'
              ? 'border-amber-500 text-amber-600'
              : 'border-transparent text-[var(--text-2)] hover:text-[var(--text-1)]',
          )}
        >
          <Award className="inline h-4 w-4 mr-1.5" />
          Daftar Skill
        </button>
        <button
          onClick={() => setView('gaps')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
            view === 'gaps'
              ? 'border-amber-500 text-amber-600'
              : 'border-transparent text-[var(--text-2)] hover:text-[var(--text-1)]',
          )}
        >
          <TrendingUp className="inline h-4 w-4 mr-1.5" />
          Gap Analysis
        </button>
      </div>

      {/* Matrix View */}
      {view === 'matrix' && (
        <div className="space-y-4">
          {Object.entries(skillsByCategory).map(([category, categorySkills]) => (
            <div key={category} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
              <h3 className="text-sm font-semibold text-[var(--text-1)] mb-3">
                {CATEGORY_LABELS[category as SkillCategory]}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="text-left py-2 pr-4 text-[var(--text-2)] font-medium">Karyawan</th>
                      {categorySkills.map(skill => (
                        <th key={skill.id} className="text-center px-2 py-2 text-[var(--text-2)] font-medium">
                          {skill.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map(emp => (
                      <tr key={emp.id} className="border-b border-[var(--border)] last:border-0">
                        <td className="py-2 pr-4 text-[var(--text-1)] font-medium">{emp.name}</td>
                        {categorySkills.map(skill => {
                          const es = empSkillMap[emp.id]?.[skill.id]
                          if (!es) return <td key={skill.id} className="text-center px-2 py-2 text-[var(--text-3)]">-</td>
                          const expired = isExpired(es.expiresAt)
                          return (
                            <td key={skill.id} className="text-center px-2 py-2">
                              <div className="flex items-center justify-center gap-1">
                                <span
                                  className={cn(
                                    'px-2 py-0.5 rounded text-xs font-medium',
                                    expired ? 'bg-red-100 text-red-600 line-through' : PROFICIENCY_COLORS[es.proficiency],
                                  )}
                                >
                                  {PROFICIENCY_LABELS[es.proficiency]}
                                </span>
                                {expired && <AlertCircle className="h-3 w-3 text-red-500" />}
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Skills List View */}
      {view === 'skills' && (
        <div className="space-y-4">
          {Object.entries(skillsByCategory).map(([category, categorySkills]) => (
            <div key={category} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
              <h3 className="text-sm font-semibold text-[var(--text-1)] mb-3">
                {CATEGORY_LABELS[category as SkillCategory]}
              </h3>
              <div className="space-y-2">
                {categorySkills.map(skill => {
                  const count = employeeSkills.filter(es => es.skillId === skill.id && !isExpired(es.expiresAt)).length
                  return (
                    <div key={skill.id} className="flex items-start justify-between gap-4 p-3 bg-[var(--bg-subtle)] rounded-lg">
                      <div className="flex-1">
                        <div className="font-medium text-[var(--text-1)]">{skill.name}</div>
                        {skill.description && <div className="text-xs text-[var(--text-3)] mt-1">{skill.description}</div>}
                        <div className="text-xs text-[var(--text-2)] mt-1">{count} karyawan memiliki skill ini</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Gap Analysis View */}
      {view === 'gaps' && (
        <div className="space-y-4">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
            <div className="flex gap-4 mb-4">
              <div className="flex-1">
                <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">Karyawan</label>
                <select value={selectedEmployee} onChange={e => setSelectedEmployee(e.target.value)} className={inputCls}>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">Role</label>
                <input
                  type="text"
                  value={selectedRole}
                  onChange={e => setSelectedRole(e.target.value)}
                  placeholder="Misal: CASHIER, MANAGER"
                  className={inputCls}
                />
              </div>
            </div>

            {gapData?.gaps && (
              <>
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-amber-600" />
                    <span className="text-sm font-medium text-amber-900">
                      Coverage: {gapData.coveragePercent}%
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  {gapData.gaps.map((gap: any) => (
                    <div
                      key={gap.skillId}
                      className={cn(
                        'p-3 rounded-lg border',
                        gap.missing || gap.expired || gap.gap < 0
                          ? 'bg-red-50 border-red-200'
                          : gap.gap === 0
                            ? 'bg-emerald-50 border-emerald-200'
                            : 'bg-blue-50 border-blue-200',
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="font-medium text-[var(--text-1)]">{gap.skillName}</div>
                          <div className="text-xs text-[var(--text-3)] mt-0.5">{CATEGORY_LABELS[gap.category as SkillCategory]}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-[var(--text-2)] mb-1">
                            Dibutuhkan: {PROFICIENCY_LABELS[gap.requiredProficiency as Proficiency]}
                          </div>
                          <div className="text-xs font-medium">
                            {gap.missing ? (
                              <span className="text-red-600 flex items-center gap-1">
                                <X className="h-3 w-3" /> Belum dimiliki
                              </span>
                            ) : gap.expired ? (
                              <span className="text-red-600 flex items-center gap-1">
                                <Clock className="h-3 w-3" /> Expired
                              </span>
                            ) : gap.gap < 0 ? (
                              <span className="text-red-600">
                                Gap: {Math.abs(gap.gap)} level ({PROFICIENCY_LABELS[gap.actualProficiency as Proficiency]})
                              </span>
                            ) : gap.gap === 0 ? (
                              <span className="text-emerald-600 flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" /> Terpenuhi
                              </span>
                            ) : (
                              <span className="text-blue-600">
                                Melebihi +{gap.gap} ({PROFICIENCY_LABELS[gap.actualProficiency as Proficiency]})
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Add Skill Form Modal */}
      {showSkillForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-[var(--bg-card)] rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[var(--text-1)]">Tambah Skill Baru</h2>
              <button onClick={() => setShowSkillForm(false)} className="text-[var(--text-3)] hover:text-[var(--text-1)]">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateSkill} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">Nama Skill *</label>
                <input name="name" required className={inputCls} placeholder="Misal: Microsoft Excel" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">Kategori *</label>
                <select name="category" required className={inputCls}>
                  <option value="TECHNICAL">Teknis</option>
                  <option value="SOFT">Soft Skill</option>
                  <option value="OPERATIONAL">Operasional</option>
                  <option value="LEADERSHIP">Kepemimpinan</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">Deskripsi</label>
                <textarea name="description" rows={2} className={inputCls} placeholder="Opsional" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowSkillForm(false)} className={btnSecondary + ' flex-1'}>
                  Batal
                </button>
                <button type="submit" className={btnPrimary + ' flex-1'}>
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Skill Form Modal */}
      {showAssignForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-[var(--bg-card)] rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[var(--text-1)]">Assign Skill ke Karyawan</h2>
              <button onClick={() => setShowAssignForm(false)} className="text-[var(--text-3)] hover:text-[var(--text-1)]">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleAssignSkill} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">Karyawan *</label>
                <select name="employeeId" required className={inputCls}>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">Skill *</label>
                <select name="skillId" required className={inputCls}>
                  {skills.map(skill => (
                    <option key={skill.id} value={skill.id}>
                      {skill.name} ({CATEGORY_LABELS[skill.category]})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">Profisiensi *</label>
                <select name="proficiency" required className={inputCls}>
                  <option value="BEGINNER">Pemula</option>
                  <option value="INTERMEDIATE">Menengah</option>
                  <option value="ADVANCED">Mahir</option>
                  <option value="EXPERT">Ahli</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">Tanggal Sertifikasi</label>
                  <input name="certifiedAt" type="date" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">Tanggal Kadaluarsa</label>
                  <input name="expiresAt" type="date" className={inputCls} />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowAssignForm(false)} className={btnSecondary + ' flex-1'}>
                  Batal
                </button>
                <button type="submit" className={btnPrimary + ' flex-1'}>
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
