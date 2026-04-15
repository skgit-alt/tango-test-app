import Link from 'next/link'

export default function LoginTopPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="bg-white rounded-2xl shadow-lg p-10 w-full max-w-sm flex flex-col items-center gap-8">
        <div className="text-5xl">📝</div>
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-gray-800">単語テストアプリ</h1>
          <p className="text-gray-500 text-sm">ログイン方法を選んでください</p>
        </div>

        <div className="w-full space-y-3">
          <Link
            href="/auth/login/student"
            className="flex items-center justify-center gap-3 w-full bg-blue-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-blue-700 active:scale-95 transition-all shadow-md"
          >
            <span className="text-2xl">🎓</span>
            生徒ログイン
          </Link>
          <Link
            href="/auth/login/teacher"
            className="flex items-center justify-center gap-3 w-full bg-green-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-green-700 active:scale-95 transition-all shadow-md"
          >
            <span className="text-2xl">👨‍🏫</span>
            先生ログイン
          </Link>
        </div>
      </div>
    </div>
  )
}
