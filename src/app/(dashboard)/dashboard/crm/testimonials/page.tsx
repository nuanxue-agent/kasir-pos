import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { exec } from '@/lib/db'
import TestimonialClient from '@/components/crm/TestimonialClient'
import { PageSkeleton } from '@/components/ui/PageSkeleton'

export const metadata = { title: 'Testimonials — CRM' }

export default async function TestimonialsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const user = session.user as any
  const store = user.stores?.[0]
  if (!store) redirect('/dashboard')

  await exec(`CREATE TABLE IF NOT EXISTS Testimonial (
    id           TEXT PRIMARY KEY,
    storeId      TEXT NOT NULL,
    customerId   TEXT,
    customerName TEXT NOT NULL,
    content      TEXT NOT NULL,
    rating       REAL NOT NULL DEFAULT 5,
    source       TEXT NOT NULL DEFAULT 'IN_APP',
    status       TEXT NOT NULL DEFAULT 'PENDING',
    mediaUrl     TEXT,
    createdAt    TEXT NOT NULL,
    updatedAt    TEXT NOT NULL
  )`)

  return (
    <Suspense fallback={<PageSkeleton />}>
      <TestimonialClient
        storeId={store.id}
        currency={store.currency ?? 'IDR'}
      />
    </Suspense>
  )
}
