import { writable, derived } from 'svelte/store';
import type { BankConnection, BankTransaction, BankActual } from '$lib/types.js';

export const bankConnection = writable<BankConnection | null | undefined>(undefined);
export const bankTransactions = writable<BankTransaction[]>([]);
export const bankTransactionMeta = writable<{ page: number; pages: number; total: number } | null>(null);
export const bankActuals = writable<BankActual[]>([]);
export const bankSyncing = writable(false);

export const bankConnected = derived(bankConnection, c => c?.status === 'active');

export async function loadBankConnection(): Promise<void> {
  const res = await fetch('/api/bank/connection');
  const json = await res.json();
  if (json.ok) bankConnection.set(json.data);
}

export async function loadTransactions(page = 1, filters: Record<string, string> = {}): Promise<void> {
  const params = new URLSearchParams({ page: String(page), ...filters });
  const res = await fetch(`/api/bank/transactions?${params}`);
  const json = await res.json();
  if (json.ok) {
    bankTransactions.set(json.data);
    bankTransactionMeta.set(json.meta);
  }
}

export async function loadActuals(from?: string, to?: string): Promise<void> {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const res = await fetch(`/api/bank/actuals?${params}`);
  const json = await res.json();
  if (json.ok) bankActuals.set(json.data);
}

export async function triggerSync(): Promise<{ inserted: number; updated: number }> {
  bankSyncing.set(true);
  try {
    const res = await fetch('/api/bank/sync', { method: 'POST' });
    const json = await res.json();
    if (json.ok) {
      await loadBankConnection();
      return json.data;
    }
    throw new Error(json.error ?? 'Sync failed');
  } finally {
    bankSyncing.set(false);
  }
}

export async function confirmMatch(txId: string, budgetItemId: string | null): Promise<void> {
  const res = await fetch(`/api/bank/transactions/${txId}/match`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ budget_item_id: budgetItemId })
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error ?? 'Match update failed');

  // Update in store
  bankTransactions.update(txs =>
    txs.map(t =>
      t.id === txId
        ? { ...t, budget_item_id: budgetItemId, match_confidence: budgetItemId ? 'high' : 'unmatched', match_confirmed: !!budgetItemId }
        : t
    )
  );
}
