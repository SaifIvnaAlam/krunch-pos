import { Shell } from '../../../components/app/Shell';
import { Card, CardContent, CardHeader } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { createRestaurant, listRestaurants } from '../../../lib/demoStore';
import { redirect } from 'next/navigation';

export default async function RestaurantsPage() {
  const restaurants = await listRestaurants();

  async function create(formData: FormData) {
    'use server';
    const name = String(formData.get('name') || '').trim();
    const address = String(formData.get('address') || '').trim();
    const timezone = String(formData.get('timezone') || '').trim();

    if (!name) return;
    await createRestaurant({ name, address: address || undefined, timezone: timezone || undefined });
    redirect('/app/restaurants');
  }

  return (
    <main className="min-h-screen bg-page">
      <Shell title="Locations">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card className="rounded-bento">
            <CardHeader>
              <div className="text-base font-semibold text-white">Add location</div>
            </CardHeader>
            <CardContent>
              <form action={create} className="space-y-3">
                <div>
                  <div className="mb-1 text-[12px] text-label">Location name</div>
                  <Input name="name" required placeholder="Downtown branch" />
                </div>
                <div>
                  <div className="mb-1 text-[12px] text-label">Address</div>
                  <Input name="address" placeholder="Optional" />
                </div>
                <div>
                  <div className="mb-1 text-[12px] text-label">Timezone</div>
                  <Input name="timezone" placeholder="UTC" defaultValue="UTC" />
                </div>
                <Button type="submit">Create location</Button>
              </form>
            </CardContent>
          </Card>

          <Card className="rounded-bento">
            <CardHeader>
              <div className="text-base font-semibold text-white">Your locations</div>
            </CardHeader>
            <CardContent>
              {restaurants.length === 0 ? (
                <div className="text-[13px] leading-[1.7] text-caption">
                  No locations yet. Add your first location to start inviting staff.
                </div>
              ) : (
                <div className="space-y-2">
                  {restaurants.map((r) => (
                    <div
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-0 bg-elevated p-3"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-semibold text-white">{r.name}</div>
                        <div className="mt-0.5 text-[12px] text-caption">
                          {r.timezone || 'UTC'}
                          {r.address ? ` · ${r.address}` : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="secondary" size="sm" asChild>
                          <a href={`/app/team?restaurantId=${encodeURIComponent(r.id)}`}>Manage staff</a>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </Shell>
    </main>
  );
}

