'use client'

import { useState, useRef, useEffect } from 'react'
import { Building2, ChevronDown, Plus, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Store {
  id: string
  name: string
  address?: string
  currency?: string
}

interface StoreSwitcherProps {
  stores: Store[]
  currentStoreId: string
  onSwitch: (storeId: string) => void
  onAddStore?: () => void
}

export default function StoreSwitcher({ stores, currentStoreId, onSwitch, onAddStore }: StoreSwitcherProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const current = stores.find(s => s.id === currentStoreId) ?? stores[0]

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  if (stores.length <= 1 && !onAddStore) return (
    <div className="flex items-center gap-2 px-3 py-2">
      <div className="w-6 h-6 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
        <Building2 className="h-3.5 w-3.5 text-amber-600" />
      </div>
      <span className="text-sm font-semibold text-stone-700 truncate">{current?.name}</span>
    </div>
  )

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-stone-100 transition-colors"
      >
        <div className="w-6 h-6 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
          <Building2 className="h-3.5 w-3.5 text-amber-600" />
        </div>
        <span className="text-sm font-semibold text-stone-700 truncate flex-1 text-left">{current?.name}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-stone-400 transition-transform shrink-0', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-[var(--bg-card)] border border-stone-200 rounded-2xl shadow-xl z-50 overflow-hidden">
          <div className="p-2 space-y-0.5">
            {stores.map(store => (
              <button
                key={store.id}
                onClick={() => { onSwitch(store.id); setOpen(false) }}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left transition-colors',
                  store.id === currentStoreId
                    ? 'bg-amber-50 text-amber-700'
                    : 'text-stone-700 hover:bg-stone-50'
                )}
              >
                <div className={cn(
                  'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold',
                  store.id === currentStoreId ? 'bg-amber-200 text-amber-700' : 'bg-stone-100 text-stone-500'
                )}>
                  {store.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{store.name}</p>
                  {store.address && <p className="text-xs text-stone-400 truncate">{store.address}</p>}
                </div>
                {store.id === currentStoreId && <Check className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
              </button>
            ))}
          </div>
          {onAddStore && (
            <div className="border-t border-stone-100 p-2">
              <button
                onClick={() => { onAddStore(); setOpen(false) }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-stone-500 hover:bg-stone-50 transition-colors text-sm"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Store / Branch</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
