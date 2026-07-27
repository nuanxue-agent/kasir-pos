import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import OnboardingWizard from '@/components/onboarding/OnboardingWizard'

export default async function OnboardingPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const user = session.user as any
  // If already onboarded, go straight to dashboard
  if (user.onboarded) redirect('/dashboard')

  const storeId = user.stores?.[0]?.id ?? ''
  const storeName = user.stores?.[0]?.name ?? ''

  return (
    <OnboardingWizard
      userName={user.name ?? ''}
      storeName={storeName}
      storeId={storeId}
    />
  )
}
