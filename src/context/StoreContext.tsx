'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

interface Store {
  id: string
  name: string
  address?: string
  phone?: string
  email?: string
  currency: string
  timezone: string
  taxRate: number
  receiptNote?: string
  modules: string[]
}

interface StoreContextValue {
  currentStore: Store | null
  stores: Store[]
  setCurrentStoreId: (id: string) => void
}

const StoreContext = createContext<StoreContextValue>({
  currentStore: null,
  stores: [],
  setCurrentStoreId: () => {},
})

export function StoreProvider({
  children,
  stores,
  initialStoreId,
}: {
  children: ReactNode
  stores: Store[]
  initialStoreId?: string
}) {
  const [currentStoreId, setCurrentStoreId] = useState(initialStoreId ?? stores[0]?.id)
  const currentStore = stores.find(s => s.id === currentStoreId) ?? stores[0] ?? null

  return (
    <StoreContext.Provider value={{ currentStore, stores, setCurrentStoreId }}>
      {children}
    </StoreContext.Provider>
  )
}

export function useStore(): StoreContextValue {
  return useContext(StoreContext)
}

export function useCurrentStore(): Store | null {
  return useContext(StoreContext).currentStore
}

export function useStoreId(): string {
  const store = useContext(StoreContext).currentStore
  return store?.id ?? ''
}

export function useCurrency(): string {
  return useContext(StoreContext).currentStore?.currency ?? 'IDR'
}

export function useTaxRate(): number {
  return useContext(StoreContext).currentStore?.taxRate ?? 0
}
