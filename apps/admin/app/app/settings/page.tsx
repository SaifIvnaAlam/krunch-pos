import { Shell } from '../../../components/app/Shell';
import { Card, CardContent, CardHeader } from '../../../components/ui/card';

export default function SettingsPage() {
  return (
    <main className="min-h-screen bg-page">
      <Shell title="Platform settings">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card className="rounded-bento">
            <CardHeader>
              <div className="text-base font-semibold text-white">Authentication</div>
            </CardHeader>
            <CardContent>
              <div className="text-[13px] leading-[1.7] text-caption">
                Upgrade demo login to SSO, OTP, or email-password with policy
                controls.
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-bento">
            <CardHeader>
              <div className="text-base font-semibold text-white">Data storage</div>
            </CardHeader>
            <CardContent>
              <div className="text-[13px] leading-[1.7] text-caption">
                Move from file-based demo store to Postgres for production-grade
                reliability.
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-bento">
            <CardHeader>
              <div className="text-base font-semibold text-white">Invite delivery</div>
            </CardHeader>
            <CardContent>
              <div className="text-[13px] leading-[1.7] text-caption">
                Connect email/SMS provider so invites are sent instantly with
                tracking.
              </div>
            </CardContent>
          </Card>
        </div>
      </Shell>
    </main>
  );
}

