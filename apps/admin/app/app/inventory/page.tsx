import { Shell } from '../../../components/app/Shell';
import { InventoryManageClient } from '../../../components/app/InventoryManageClient';

export default function InventoryPage() {
  return (
    <main className="min-h-screen bg-page">
      <Shell title="Inventory & purchasing">
        <InventoryManageClient />
      </Shell>
    </main>
  );
}
