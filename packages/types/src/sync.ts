export type VectorClock = Record<string, number>;

export interface SyncEnvelope {
  event: 'OPERATION' | 'STATE_REQUEST' | 'STATE_RESPONSE' | 'CONFLICT';
  branchId: string;
  terminalId: string;
  vectorClock: VectorClock;
  payload: unknown;
  timestamp: number;
  idempotencyKey: string;
}

export type CrdtType = 'LWW_REGISTER' | 'PN_COUNTER' | 'OR_SET' | 'LWW_MAP' | 'GROW_ONLY_SET';

export interface OfflineLogEntry {
  id: string;
  branchId: string;
  terminalId: string;
  operation: string;
  payload: string;
  vectorClock: string;
  idempotencyKey: string;
  createdAt: number;
  syncedAt: number | null;
  conflictFlag: boolean;
}
