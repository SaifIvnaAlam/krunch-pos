import { Shell } from '../../../../components/app/Shell';
import { Card, CardContent } from '../../../../components/ui/card';

export default function RosterAttendancePage() {
  return (
    <main className="min-h-screen bg-page">
      <Shell title="Roster & Attendance">
        <Card className="rounded-bento">
          <CardContent className="p-5 text-[13px] leading-[1.7] text-caption">
            Shift schedules, clock-in, and attendance will appear here.
          </CardContent>
        </Card>
      </Shell>
    </main>
  );
}
