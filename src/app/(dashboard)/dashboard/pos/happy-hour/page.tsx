import { Suspense } from 'react'
import HappyHourClient from '@/components/pos/HappyHourClient'

export default function HappyHourPage() {
  return (
    <Suspense fallback={<div className="flex h-64 items-center justify-center">Loading...</div>}>
      <HappyHourClient storeId="" />
    </Suspense>
  )
}
