import { Shell } from '../../../../components/app/Shell';
import { Card, CardContent } from '../../../../components/ui/card';

export default function LeavePage() {
  return (
    <main className="min-h-screen bg-page">
      <Shell title="Leave">
        <Card className="rounded-bento">
          <CardContent className="p-5 text-[13px] leading-[1.7] text-caption">
            Time-off requests, balances, and approvals will appear here.
          </CardContent>
        </Card>
      </Shell>
    </main>
  );
}
