import { Shell } from '../../../../components/app/Shell';
import { Card, CardContent } from '../../../../components/ui/card';

export default function PayrollPage() {
  return (
    <main className="min-h-screen bg-page">
      <Shell title="Payroll & Compensation">
        <Card className="rounded-bento">
          <CardContent className="p-5 text-[13px] leading-[1.7] text-caption">
            Pay runs, rates, and compensation settings will appear here.
          </CardContent>
        </Card>
      </Shell>
    </main>
  );
}
