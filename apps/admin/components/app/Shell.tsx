import { Button } from '../ui/button';
import { Card } from '../ui/card';

export function Shell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto grid max-w-content grid-cols-1 gap-6 px-6 py-8 md:grid-cols-[220px_1fr]">
      <aside className="md:sticky md:top-16 md:h-[calc(100vh-96px)]">
        <Card className="rounded-bento bg-card p-3">
          <nav>
            <div className="rounded-xl border border-0 bg-elevated p-3">
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-label">
                Krunch pos
              </div>
              <div className="mt-2 text-[13px] font-semibold text-white">
                Owner control room
              </div>
              <div className="mt-1 text-[12px] leading-[1.6] text-caption">
                Record and review daily operational entries.
              </div>
            </div>
            <div className="mt-3 space-y-1">
              <a
                className="block rounded-md px-3 py-2 text-[13px] text-body transition-colors duration-150 hover:bg-elevated hover:text-white"
                href="/app/daily-entry"
              >
                Daily Entry Form
              </a>
            </div>
            <form action="/api/auth/logout" method="post" className="mt-3">
              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                type="submit"
              >
                Sign out
              </Button>
            </form>
          </nav>
        </Card>
      </aside>

      <section>
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-label">
              Admin / owner
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-[-0.02em] text-white">
              {title}
            </h1>
          </div>
          <a
            className="text-[13px] text-body transition-colors duration-150 hover:text-white"
            href="/"
          >
            Marketing site
          </a>
        </div>
        {children}
      </section>
    </div>
  );
}
