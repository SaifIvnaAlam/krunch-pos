import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SESSION_COOKIE = 'upos_admin_session';

function isAuthed(req: NextRequest): boolean {
  return req.cookies.get(SESSION_COOKIE)?.value === '1';
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith('/app')) {
    if (!isAuthed(req)) {
      const url = req.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }
  }

  if (pathname === '/login' && isAuthed(req)) {
    const url = req.nextUrl.clone();
    url.pathname = '/app';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/app/:path*', '/login'],
};

