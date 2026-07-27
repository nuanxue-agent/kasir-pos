import { DefaultSession } from 'next-auth'
import { UserRole } from '@prisma/client'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: UserRole
      isSuperAdmin: boolean
      tenantId: string | null
      tenant: {
        id: string
        name: string
        slug: string
        plan: {
          name: string
        }
      } | null
      stores: Array<{
        id: string
        name: string
      }>
    } & DefaultSession['user']
  }

  interface User {
    role: UserRole
    isSuperAdmin: boolean
    tenantId: string | null
    tenant: any
    stores: any[]
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role: UserRole
    isSuperAdmin: boolean
    tenantId: string | null
    tenant: any
    stores: any[]
  }
}
