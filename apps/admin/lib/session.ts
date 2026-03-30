import { cookies } from 'next/headers';

export const SESSION_COOKIE = 'upos_admin_session';

export function getIsAuthed(): boolean {
  return cookies().get(SESSION_COOKIE)?.value === '1';
}

