import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

export type RoleKey = 'owner' | 'manager' | 'cashier' | 'kitchen' | 'viewer';

export type Restaurant = {
  id: string;
  name: string;
  address?: string;
  timezone?: string;
  createdAt: string;
};

export type Invite = {
  id: string;
  restaurantId: string;
  email: string;
  role: RoleKey;
  status: 'pending' | 'sent' | 'revoked' | 'accepted';
  createdAt: string;
  lastSentAt?: string;
};

export type TeamMember = {
  id: string;
  restaurantId: string;
  name: string;
  email: string;
  role: RoleKey;
  isActive: boolean;
  createdAt: string;
};

type Store = {
  restaurants: Restaurant[];
  invites: Invite[];
  team: TeamMember[];
};

const dataDir = path.join(process.cwd(), '.data');
const dataFile = path.join(dataDir, 'demo-store.json');

async function ensureStore(): Promise<void> {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(dataFile);
  } catch {
    const initial: Store = {
      restaurants: [],
      invites: [],
      team: [],
    };
    await fs.writeFile(dataFile, JSON.stringify(initial, null, 2), 'utf8');
  }
}

async function readStore(): Promise<Store> {
  await ensureStore();
  const raw = await fs.readFile(dataFile, 'utf8');
  return JSON.parse(raw) as Store;
}

async function writeStore(store: Store): Promise<void> {
  await ensureStore();
  await fs.writeFile(dataFile, JSON.stringify(store, null, 2), 'utf8');
}

export async function listRestaurants(): Promise<Restaurant[]> {
  const store = await readStore();
  return store.restaurants.slice().reverse();
}

export async function createRestaurant(input: {
  name: string;
  address?: string;
  timezone?: string;
}): Promise<Restaurant> {
  const store = await readStore();
  const restaurant: Restaurant = {
    id: randomUUID(),
    name: input.name.trim(),
    address: input.address?.trim() || undefined,
    timezone: input.timezone?.trim() || 'UTC',
    createdAt: new Date().toISOString(),
  };
  store.restaurants.push(restaurant);
  await writeStore(store);
  return restaurant;
}

export async function listTeam(restaurantId: string): Promise<TeamMember[]> {
  const store = await readStore();
  return store.team.filter((m) => m.restaurantId === restaurantId).slice().reverse();
}

export async function listInvites(restaurantId: string): Promise<Invite[]> {
  const store = await readStore();
  return store.invites
    .filter((i) => i.restaurantId === restaurantId)
    .slice()
    .reverse();
}

export async function createInvite(input: {
  restaurantId: string;
  email: string;
  role: RoleKey;
}): Promise<Invite> {
  const store = await readStore();
  const invite: Invite = {
    id: randomUUID(),
    restaurantId: input.restaurantId,
    email: input.email.trim().toLowerCase(),
    role: input.role,
    status: 'sent',
    createdAt: new Date().toISOString(),
    lastSentAt: new Date().toISOString(),
  };
  store.invites.push(invite);
  await writeStore(store);
  return invite;
}

export async function revokeInvite(inviteId: string): Promise<void> {
  const store = await readStore();
  const invite = store.invites.find((i) => i.id === inviteId);
  if (!invite) return;
  invite.status = 'revoked';
  await writeStore(store);
}

