'use client';

import * as Tabs from '@radix-ui/react-tabs';
import { Card, CardContent } from '../ui/card';

export function InventoryManageClient() {
  return (
    <Tabs.Root defaultValue="page-1" className="space-y-4">
      <Tabs.List className="flex flex-wrap gap-2 border-b border-0 pb-2">
        <Tabs.Trigger
          value="page-1"
          className="rounded-lg px-3 py-2 text-[13px] text-body data-[state=active]:bg-elevated data-[state=active]:text-white"
        >
          Page 1
        </Tabs.Trigger>
        <Tabs.Trigger
          value="page-2"
          className="rounded-lg px-3 py-2 text-[13px] text-body data-[state=active]:bg-elevated data-[state=active]:text-white"
        >
          Page 2
        </Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content value="page-1" className="mt-4 outline-none">
        <Card className="rounded-bento">
          <CardContent className="py-12 text-center text-[13px] text-caption">Page 1</CardContent>
        </Card>
      </Tabs.Content>

      <Tabs.Content value="page-2" className="mt-4 outline-none">
        <Card className="rounded-bento">
          <CardContent className="py-12 text-center text-[13px] text-caption">Page 2</CardContent>
        </Card>
      </Tabs.Content>
    </Tabs.Root>
  );
}
