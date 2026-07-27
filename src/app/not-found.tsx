import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#fffdf7] p-6 text-center">
      {/* Animated illustration */}
      <div className="relative mb-8">
        {/* Floating circle */}
        <div
          className="flex h-32 w-32 items-center justify-center rounded-full bg-gradient-to-br from-amber-100 to-orange-100 shadow-lg shadow-amber-100"
          style={{ animation: 'float 3s ease-in-out infinite' }}
        >
          {/* Inner badge */}
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-md shadow-amber-200">
            <span className="text-3xl font-black tracking-tighter text-white">404</span>
          </div>
        </div>

        {/* Orbiting dot */}
        <div
          className="absolute top-2 right-2 h-4 w-4 rounded-full bg-amber-400 shadow-sm"
          style={{ animation: 'orbit 4s linear infinite' }}
        />
        {/* Second orbiting dot */}
        <div
          className="absolute bottom-4 left-0 h-3 w-3 rounded-full bg-orange-300 shadow-sm"
          style={{ animation: 'orbit 6s linear infinite reverse' }}
        />
      </div>

      <h1 className="mb-2 text-2xl font-bold text-stone-800">Halaman tidak ditemukan</h1>
      <p className="mb-8 max-w-xs text-sm leading-relaxed text-stone-400">
        Halaman yang kamu cari tidak ada atau telah dipindahkan.
      </p>

      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-6 py-3 font-semibold text-white shadow-md shadow-amber-200 transition-all hover:bg-amber-600 active:scale-95"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
          />
        </svg>
        Kembali ke Dashboard
      </Link>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-10px); }
        }
        @keyframes orbit {
          from { transform: rotate(0deg) translateX(52px) rotate(0deg); }
          to   { transform: rotate(360deg) translateX(52px) rotate(-360deg); }
        }
      `}</style>
    </div>
  )
}
