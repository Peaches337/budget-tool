const BASE = 'https://api.up.com.au/api/v1';

export type UpAccount = {
  id: string;
  displayName: string;
  accountType: 'TRANSACTIONAL' | 'SAVER' | 'HOME_LOAN';
  ownershipType: 'INDIVIDUAL' | 'JOINT';
  balance: { currencyCode: string; value: string; valueInBaseUnits: number };
};

export type UpTransaction = {
  id: string;
  status: 'HELD' | 'SETTLED';
  rawText: string | null;
  description: string;
  message: string | null;
  amount: { currencyCode: string; value: string; valueInBaseUnits: number };
  settledAt: string | null;
  createdAt: string;
  relationships: {
    category?: { data: { id: string } | null };
    account: { data: { id: string } };
  };
};

export class UpClient {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${this.token}` }
    });
    if (!res.ok) {
      throw new Error(`Up API ${path} → ${res.status}`);
    }
    return res.json() as Promise<T>;
  }

  async ping(): Promise<boolean> {
    try {
      await this.get('/util/ping');
      return true;
    } catch {
      return false;
    }
  }

  async getAccounts(): Promise<UpAccount[]> {
    const data = await this.get<{ data: { id: string; attributes: Omit<UpAccount, 'id'> }[] }>('/accounts');
    return data.data.map(a => ({ id: a.id, ...a.attributes }));
  }

  async getTransactions(opts: {
    accountId?: string;
    since?: string;
    pageSize?: number;
    pageAfter?: string;
  } = {}): Promise<{ data: UpTransaction[]; nextPage: string | null }> {
    const params = new URLSearchParams();
    if (opts.pageSize) params.set('page[size]', String(opts.pageSize));
    if (opts.since) params.set('filter[since]', opts.since);
    if (opts.pageAfter) params.set('page[after]', opts.pageAfter);

    const path = opts.accountId
      ? `/accounts/${opts.accountId}/transactions?${params}`
      : `/transactions?${params}`;

    const data = await this.get<{
      data: { id: string; attributes: Omit<UpTransaction, 'id'>; relationships: UpTransaction['relationships'] }[];
      links: { next: string | null };
    }>(path);

    const txs: UpTransaction[] = data.data.map(t => ({
      id: t.id,
      ...t.attributes,
      relationships: t.relationships
    }));

    const nextRaw = data.links?.next;
    let nextPage: string | null = null;
    if (nextRaw) {
      nextPage = new URL(nextRaw).searchParams.get('page[after]');
    }

    return { data: txs, nextPage };
  }
}
