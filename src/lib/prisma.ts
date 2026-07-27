import { PrismaClient } from '@prisma/client'

// Lazy singleton — never instantiates at module load time
// This prevents Prisma from trying to connect during Next.js build

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined
}

function createClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  } as any)
}

// Export a proxy that lazily initialises on first property access
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    if (!global.__prisma) {
      global.__prisma = createClient()
    }
    const value = (global.__prisma as any)[prop]
    return typeof value === 'function' ? value.bind(global.__prisma) : value
  },
})
