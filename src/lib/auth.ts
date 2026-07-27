import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from '@/lib/prisma'
import * as bcrypt from 'bcryptjs'

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
          include: {
            tenant: { include: { plan: true } },
            storeAccess: { include: { store: true } },
          },
        })

        if (!user || !user.password || !user.active) return null

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.password
        )

        if (!valid) return null

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          role: user.role,
          isSuperAdmin: user.isSuperAdmin,
          tenantId: user.tenantId,
          tenant: user.tenant,
          stores: user.storeAccess.map(sa => sa.store),
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role
        token.isSuperAdmin = user.isSuperAdmin
        token.tenantId = user.tenantId
        token.tenant = user.tenant
        token.stores = user.stores
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!
        session.user.role = token.role as any
        session.user.isSuperAdmin = token.isSuperAdmin as boolean
        session.user.tenantId = token.tenantId as string | null
        session.user.tenant = token.tenant as any
        session.user.stores = token.stores as any
      }
      return session
    },
  },
})
