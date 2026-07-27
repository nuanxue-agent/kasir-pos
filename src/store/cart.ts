import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface CartItem {
  id: string
  productId: string
  variantId?: string
  name: string
  variantName?: string
  price: number
  qty: number
  discount: number
  subtotal: number
}

export interface CartState {
  storeId: string | null
  items: CartItem[]
  customerId: string | null
  discountId: string | null
  discountCode: string | null
  discountAmt: number
  note: string

  // actions
  setStore: (storeId: string) => void
  addItem: (item: Omit<CartItem, 'subtotal'>) => void
  updateQty: (id: string, qty: number) => void
  removeItem: (id: string) => void
  setItemDiscount: (id: string, discount: number) => void
  setCustomer: (customerId: string | null) => void
  setDiscount: (discountId: string | null, code: string | null, amt: number) => void
  setNote: (note: string) => void
  clearCart: () => void

  // computed
  subtotal: () => number
  taxAmt: (taxRate: number) => number
  total: (taxRate: number) => number
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      storeId: null,
      items: [],
      customerId: null,
      discountId: null,
      discountCode: null,
      discountAmt: 0,
      note: '',

      setStore: (storeId) => set({ storeId }),

      addItem: (item) => set((state) => {
        const existing = state.items.find(
          i => i.productId === item.productId && i.variantId === item.variantId
        )
        if (existing) {
          return {
            items: state.items.map(i =>
              i.id === existing.id
                ? { ...i, qty: i.qty + item.qty, subtotal: (i.qty + item.qty) * (i.price - i.discount) }
                : i
            ),
          }
        }
        return {
          items: [...state.items, {
            ...item,
            subtotal: item.qty * (item.price - item.discount),
          }],
        }
      }),

      updateQty: (id, qty) => set((state) => ({
        items: qty <= 0
          ? state.items.filter(i => i.id !== id)
          : state.items.map(i =>
              i.id === id ? { ...i, qty, subtotal: qty * (i.price - i.discount) } : i
            ),
      })),

      removeItem: (id) => set((state) => ({
        items: state.items.filter(i => i.id !== id),
      })),

      setItemDiscount: (id, discount) => set((state) => ({
        items: state.items.map(i =>
          i.id === id ? { ...i, discount, subtotal: i.qty * (i.price - discount) } : i
        ),
      })),

      setCustomer: (customerId) => set({ customerId }),

      setDiscount: (discountId, discountCode, discountAmt) =>
        set({ discountId, discountCode, discountAmt }),

      setNote: (note) => set({ note }),

      clearCart: () => set({
        items: [],
        customerId: null,
        discountId: null,
        discountCode: null,
        discountAmt: 0,
        note: '',
      }),

      subtotal: () => get().items.reduce((sum, i) => sum + i.subtotal, 0),

      taxAmt: (taxRate) => {
        const sub = get().subtotal() - get().discountAmt
        return Math.round(sub * taxRate)
      },

      total: (taxRate) => {
        const sub = get().subtotal()
        return Math.round(sub - get().discountAmt + get().taxAmt(taxRate))
      },
    }),
    { name: 'kasir-cart' }
  )
)
