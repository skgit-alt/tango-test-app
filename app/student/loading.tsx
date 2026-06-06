export default function StudentLoading() {
  return (
    <div className="min-h-screen bg-blue-50 flex flex-col">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center">
          <div className="h-5 w-28 bg-gray-200 rounded animate-pulse" />
        </div>
      </header>
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-400">読み込み中...</p>
        </div>
      </div>
    </div>
  )
}
