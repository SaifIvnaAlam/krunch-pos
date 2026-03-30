import { listRestaurants } from '../../lib/demoStore';
import { Shell } from '../../components/app/Shell';
import { Card, CardContent, CardHeader } from '../../components/ui/card';
import { Button } from '../../components/ui/button';

export default async function AppHome() {
  const restaurants = await listRestaurants();
  const hasRestaurant = restaurants.length > 0;

  return (
    <main className="min-h-screen bg-page">
      <Shell title="Command center">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: 'Locations', value: String(restaurants.length) },
            {
              label: 'Invites',
              value: hasRestaurant ? 'Active' : '0',
            },
            { label: 'Access model', value: 'Role-based' },
            {
              label: 'Setup stage',
              value: hasRestaurant ? 'Team' : 'Location',
            },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-bento border border-0 bg-card p-4 transition-[border-color] duration-200 hover:border-1"
            >
              <div className="font-mono text-lg font-bold text-white">
                {s.value}
              </div>
              <div className="mt-1 text-[12px] text-label">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card className="rounded-bento">
            <CardHeader>
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-label">
                Now
              </p>
              <h2 className="mt-2 text-base font-semibold text-white">
                What to do next
              </h2>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-2 pl-5 text-[13px] leading-[1.6] text-caption">
                <li className={hasRestaurant ? 'text-[#ccc]' : undefined}>
                  Add your first location
                </li>
                <li>Invite your core team</li>
                <li>Assign permissions by role</li>
              </ul>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button asChild>
                  <a href="/app/restaurants">
                    {hasRestaurant ? 'Manage locations' : 'Create location'}
                  </a>
                </Button>
                <Button variant="secondary" asChild>
                  <a href="/app/team">Invite staff</a>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-bento">
            <CardHeader>
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-label">
                Outcome
              </p>
              <h2 className="mt-2 text-base font-semibold text-white">
                Fewer errors during service
              </h2>
            </CardHeader>
            <CardContent>
              <p className="text-[13px] leading-[1.7] text-caption">
                Keep sensitive actions in manager and owner roles. Give staff
                only what they need to cut confusion and training time.
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-bento">
            <CardHeader>
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-label">
                Launch
              </p>
              <h2 className="mt-2 text-base font-semibold text-white">
                Move to live ops
              </h2>
            </CardHeader>
            <CardContent>
              <p className="text-[13px] leading-[1.7] text-caption">
                When locations and roles are ready, connect terminals and run
                daily service with a controlled access model.
              </p>
              <div className="mt-4">
                <Button variant="ghost" asChild>
                  <a href="/dashboard">Open analytics dashboard</a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {!hasRestaurant ? (
          <div className="mt-6 rounded-bento border border-0 bg-card p-5 text-[13px] leading-[1.7] text-caption">
            Tip: start with one location and a manager role, then repeat the
            same access model for new branches.
          </div>
        ) : null}
      </Shell>
    </main>
  );
}
