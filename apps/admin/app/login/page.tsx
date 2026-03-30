import { redirect } from 'next/navigation';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { getIsAuthed } from '../../lib/session';

export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  if (getIsAuthed()) redirect('/app');

  const next =
    typeof searchParams.next === 'string' ? searchParams.next : '/app';

  return (
    <main className="min-h-screen bg-page px-6 py-16">
      <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-content items-center">
        <div className="grid w-full grid-cols-1 gap-10 md:grid-cols-2">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-label">
              Sign in
            </p>
            <h1 className="mt-3 text-[clamp(24px,3vw,32px)] font-bold leading-[1.1] tracking-[-0.03em] text-white">
              Owner and admin portal
            </h1>
            <p className="mt-4 max-w-[55ch] text-[15px] leading-[1.7] text-body">
              For restaurant owners and branch admins using Krunch pos. Manage
              locations, staff invites, and roles from one place.
            </p>

            <div className="mt-8 rounded-bento border border-0 bg-card p-5 text-[13px] text-caption">
              <p className="font-semibold text-white">Demo credentials</p>
              <p className="mt-2">
                Email{' '}
                <span className="font-mono text-[#ccc]">
                  demo@universalpos.local
                </span>
              </p>
              <p className="mt-1">
                Password <span className="font-mono text-[#ccc]">demo</span>
              </p>
            </div>
          </div>

          <Card className="rounded-bento">
            <CardHeader>
              <div className="text-base font-semibold text-white">Login</div>
            </CardHeader>
            <CardContent>
              <form action="/api/auth/login" method="post" className="space-y-4">
                <input type="hidden" name="next" value={next} />
                <div>
                  <div className="mb-1 text-[12px] text-label">Email</div>
                  <Input
                    name="email"
                    type="email"
                    required
                    placeholder="you@company.com"
                    defaultValue="demo@universalpos.local"
                  />
                </div>
                <div>
                  <div className="mb-1 text-[12px] text-label">Password</div>
                  <Input
                    name="password"
                    type="password"
                    required
                    defaultValue="demo"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <Button type="submit">Sign in</Button>
                  <Button variant="secondary" type="button" asChild>
                    <a href="/">Back to site</a>
                  </Button>
                </div>
                <p className="pt-2 text-[12px] text-caption">
                  You will access the owner onboarding demo after sign in.
                </p>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
