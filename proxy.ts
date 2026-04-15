import { NextResponse, type NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 認証不要のパス
  const publicPaths = ['/auth/login', '/auth/callback']
  if (publicPaths.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Supabaseのセッションクッキーを確認
  const projectRef = 'ngpuboildeyedwevfodt'
  const authCookie = request.cookies.get(`sb-${projectRef}-auth-token`)
    || request.cookies.getAll().find(c => c.name.startsWith('sb-') && c.name.endsWith('-auth-token'))

  if (!authCookie) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
