import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        try {
          // Get D1 binding via getRequestContext in edge runtime
          const { getRequestContext } = await import('@cloudflare/next-on-pages')
          const { env } = getRequestContext()
          const db = (env as any).DB as D1Database

          const { queryOne, query } = await import('@/lib/db')

          const user = await queryOne<any>(db,
            `SELECT * FROM User WHERE email = ? AND active = 1 LIMIT 1`,
            [credentials.email]
          )

          if (!user) return null

          const bcrypt = await import('bcryptjs')
          const valid = await bcrypt.compare(credentials.password as string, user.password ?? '')
          if (!valid) return null

          // Get all store access
          const stores = await query<any>(db,
            `SELECT su.storeId as id, s.name, su.role, s.currency, s.taxRate
             FROM StoreUser su JOIN Store s ON su.storeId = s.id
             WHERE su.userId = ?`,
            [user.id]
          )

          return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            stores,
          }
        } catch (e) {
          console.error('Auth error:', e)
          return null
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id
        token.role = (user as any).role
        token.stores = (user as any).stores ?? []
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        ;(session.user as any).role = token.role as string
        ;(session.user as any).stores = (token.stores as any[]) ?? []
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
  session: { strategy: 'jwt' },
  secret: process.env.NEXTAUTH_SECRET,
})
