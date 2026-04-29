'use client'

import { usePathname } from 'next/navigation'

export default function TeacherNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname()

  const links = [
    { href: '/teacher', label: 'テスト一覧', exact: true },
    ...(isAdmin ? [
      { href: '/teacher/points', label: 'ポイント管理', exact: false },
      { href: '/teacher/medals', label: '👑 勲章管理', exact: false },
      { href: '/teacher/admins', label: 'スタッフ管理', exact: false },
      { href: '/teacher/students', label: '生徒管理', exact: false },
    ] : []),
  ]

  return (
    <nav className="hidden sm:flex items-center gap-4 text-sm text-gray-600">
      {links.map(({ href, label, exact }) => {
        const isActive = exact ? pathname === href : pathname.startsWith(href)
        return (
          <a
            key={href}
            href={href}
            className={`transition font-medium ${
              isActive
                ? 'text-blue-600 border-b-2 border-blue-600 pb-0.5'
                : 'text-gray-600 hover:text-blue-600'
            }`}
          >
            {label}
          </a>
        )
      })}
    </nav>
  )
}
