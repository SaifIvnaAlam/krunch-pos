import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '../../../../lib/session';

function getPassword(): string {
  return process.env.ADMIN_PORTAL_PASSWORD?.trim() || 'demo';
}

export async function POST(req: Request) {
  const form = await req.formData();
  const email = String(form.get('email') || '').trim().toLowerCase();
  const password = String(form.get('password') || '');
  const next = String(form.get('next') || '/app');

  if (!email || !password) {
    return new NextResponse('Missing credentials.', { status: 400 });
  }

  if (password !== getPassword()) {
    return new NextResponse('Invalid credentials.', { status: 401 });
  }

  cookies().set(SESSION_COOKIE, '1', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });

  return NextResponse.redirect(new URL(next, req.url));
}

