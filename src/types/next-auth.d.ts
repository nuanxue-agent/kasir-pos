import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: string
      stores: Array<{
        id: string
        name: string
        role: string
        currency: string
        taxRate: number
      }>
    } & DefaultSession['user']
  }
}
