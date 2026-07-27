import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#fffdf7] p-6 text-center">
      <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mb-6 shadow-lg shadow-amber-200">
        <span className="text-4xl font-black text-white">4</span>
        <span className="text-3xl">🔍</span>
        <span className="text-4xl font-black text-white">4</span>
      </div>
      <h1 className="text-2xl font-bold text-stone-800 mb-2">Page not found</h1>
      <p className="text-stone-400 text-sm mb-8 max-w-xs">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Link
        href="/dashboard"
        className="px-6 py-3 bg-amber-500 text-white font-semibold rounded-xl hover:bg-amber-600 transition-colors shadow-md shadow-amber-200"
      >
        Go to Dashboard
      </Link>
    </div>
  )
}
