import { redirect } from 'next/navigation';
import { Shell } from '../../../components/app/Shell';
import { Card, CardContent, CardHeader } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import {
  createInvite,
  listInvites,
  listRestaurants,
  type RoleKey,
  revokeInvite,
} from '../../../lib/demoStore';

const roles: { key: RoleKey; label: string; help: string }[] = [
  {
    key: 'owner',
    label: 'Owner',
    help: 'Full access. Billing, settings, staff, everything.',
  },
  {
    key: 'manager',
    label: 'Manager',
    help: 'Reports, voids, discounts, staff oversight.',
  },
  {
    key: 'cashier',
    label: 'Cashier',
    help: 'Orders and payments. No global settings.',
  },
  {
    key: 'kitchen',
    label: 'Kitchen',
    help: 'Kitchen queue only. No prices or payments.',
  },
  {
    key: 'viewer',
    label: 'Viewer',
    help: 'Read-only dashboards and activity.',
  },
];

export default async function TeamPage({
  searchParams,
}: {
  searchParams: { restaurantId?: string };
}) {
  const restaurants = await listRestaurants();
  const selectedId =
    typeof searchParams.restaurantId === 'string'
      ? searchParams.restaurantId
      : restaurants[0]?.id;

  const selected = selectedId
    ? restaurants.find((r) => r.id === selectedId)
    : undefined;

  const invites = selectedId ? await listInvites(selectedId) : [];

  async function invite(formData: FormData) {
    'use server';
    const restaurantId = String(formData.get('restaurantId') || '').trim();
    const email = String(formData.get('email') || '').trim();
    const role = String(formData.get('role') || '').trim() as RoleKey;
    if (!restaurantId || !email) return;
    if (!roles.some((r) => r.key === role)) return;
    await createInvite({ restaurantId, email, role });
    redirect(`/app/team?restaurantId=${encodeURIComponent(restaurantId)}`);
  }

  async function revoke(formData: FormData) {
    'use server';
    const inviteId = String(formData.get('inviteId') || '').trim();
    const restaurantId = String(formData.get('restaurantId') || '').trim();
    if (!inviteId) return;
    await revokeInvite(inviteId);
    redirect(`/app/team?restaurantId=${encodeURIComponent(restaurantId || '')}`);
  }

  return (
    <main className="min-h-screen bg-page">
      <Shell title="Employee List">
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-bento border border-0 bg-card p-3">
            <div className="font-mono text-[18px] font-bold tracking-[-0.02em] text-white">
              {invites.length}
            </div>
            <div className="mt-1 text-[11px] text-label">total invites</div>
          </div>
          <div className="rounded-bento border border-0 bg-card p-3">
            <div className="font-mono text-[18px] font-bold tracking-[-0.02em] text-white">
              {invites.filter((i) => i.status !== 'revoked').length}
            </div>
            <div className="mt-1 text-[11px] text-label">active invites</div>
          </div>
          <div className="rounded-bento border border-0 bg-card p-3">
            <div className="font-mono text-[18px] font-bold tracking-[-0.02em] text-white">5</div>
            <div className="mt-1 text-[11px] text-label">starter roles</div>
          </div>
          <div className="rounded-bento border border-0 bg-card p-3">
            <div className="font-mono text-[18px] font-bold tracking-[-0.02em] text-white">
              {selected ? 'selected' : 'none'}
            </div>
            <div className="mt-1 text-[11px] text-label">location context</div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card className="rounded-bento">
            <CardHeader>
              <div className="text-base font-semibold text-white">Send invite</div>
            </CardHeader>
            <CardContent>
              {restaurants.length === 0 ? (
                <div className="text-[13px] leading-[1.7] text-caption">
                  Create a restaurant first. Invites are tied to a location.
                  <div className="mt-3">
                    <Button asChild>
                      <a href="/app/restaurants">Create restaurant</a>
                    </Button>
                  </div>
                </div>
              ) : (
                <form action={invite} className="space-y-3">
                  <div>
                    <div className="mb-1 text-[12px] text-label">Location</div>
                    <select
                      name="restaurantId"
                      defaultValue={selectedId}
                      className="h-9 w-full rounded-[9px] border border-0 bg-chip px-3 text-[13px] text-white outline-none transition-colors focus:border-2 focus:border-white/30"
                    >
                      {restaurants.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div className="mb-1 text-[12px] text-label">Email</div>
                    <Input name="email" type="email" required placeholder="employee@restaurant.com" />
                  </div>
                  <div>
                    <div className="mb-1 text-[12px] text-label">Role</div>
                    <select
                      name="role"
                      defaultValue="cashier"
                      className="h-9 w-full rounded-[9px] border border-0 bg-chip px-3 text-[13px] text-white outline-none transition-colors focus:border-2 focus:border-white/30"
                    >
                      {roles.map((r) => (
                        <option key={r.key} value={r.key}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                    <div className="mt-2 rounded-lg border border-0 bg-elevated p-3 text-[12px] leading-[1.6] text-caption">
                      Start with minimal access. Expand permission only when
                      needed.
                    </div>
                  </div>
                  <Button type="submit">Send invite</Button>
                </form>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-bento">
            <CardHeader>
              <div className="text-base font-semibold text-white">Invite activity</div>
              <div className="mt-1 text-[12px] text-caption">
                {selected ? `For ${selected.name}` : 'Select a restaurant'}
              </div>
            </CardHeader>
            <CardContent>
              {invites.length === 0 ? (
                <div className="text-[13px] leading-[1.7] text-caption">
                  No invites yet. Send one to get your team onboard.
                </div>
              ) : (
                <div className="space-y-2">
                  {invites.map((i) => {
                    const role = roles.find((r) => r.key === i.role);
                    return (
                      <div
                        key={i.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-0 bg-elevated p-3"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-[13px] text-[#ddd]">{i.email}</div>
                          <div className="mt-0.5 text-[11px] text-caption">
                            {i.status} · {new Date(i.createdAt).toLocaleString()}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="rounded-full border border-0 bg-chip px-3 py-1 text-[11px] text-[#ccc]">
                            {role?.label || i.role}
                          </div>
                          {i.status !== 'revoked' ? (
                            <form action={revoke}>
                              <input type="hidden" name="inviteId" value={i.id} />
                              <input type="hidden" name="restaurantId" value={i.restaurantId} />
                              <Button variant="ghost" size="sm" type="submit">
                                Revoke
                              </Button>
                            </form>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-5">
          {roles.map((r) => (
            <div
              key={r.key}
              className="rounded-bento border border-0 bg-card p-4"
            >
              <div className="inline-flex rounded-full border border-0 bg-chip px-3 py-1 text-[11px] text-white">
                {r.label}
              </div>
              <div className="mt-2 text-[12px] leading-[1.6] text-caption">
                {r.help}
              </div>
            </div>
          ))}
        </div>
      </Shell>
    </main>
  );
}

