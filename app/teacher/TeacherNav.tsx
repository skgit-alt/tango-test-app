'use client'

import { usePathname } from 'next/navigation'

export default function TeacherNav({
  isAdmin,
  pendingNameChangeCount = 0,
}: {
  isAdmin: boolean
  pendingNameChangeCount?: number
}) {
  const pathname = usePathname()

  const links = [
    { href: '/teacher', label: 'テスト一覧', exact: true, badge: 0 },
    ...(isAdmin ? [
      { href: '/teacher/points', label: 'ポイント管理', exact: false, badge: 0 },
      { href: '/teacher/admins', label: 'スタッフ管理', exact: false, badge: 0 },
      { href: '/teacher/students', label: '生徒管理', exact: false, badge: pendingNameChangeCount },
    ] : []),
  ]

  return (
    <nav className="hidden sm:flex items-center gap-4 text-sm text-gray-600">
      {links.map(({ href, label, exact, badge }) => {
        const isActive = exact ? pathname === href : pathname.startsWith(href)
        return (
          <a
            key={href}
            href={href}
            className={`relative transition font-medium ${
              isActive
                ? 'text-blue-600 border-b-2 border-blue-600 pb-0.5'
                : 'text-gray-600 hover:text-blue-600'
            }`}
          >
            {label}
            {badge > 0 && (
              <span className="absolute -top-2 -right-3 bg-red-500 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 leading-none">
                {badge}
              </span>
            )}
          </a>
        )
      })}
    </nav>
  )
}
