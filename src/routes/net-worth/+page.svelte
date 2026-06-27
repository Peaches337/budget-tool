<script lang="ts">
  import { onMount } from 'svelte';
  import { fmt } from '$lib/utils.js';
  import type { NetWorthEntry, NetWorthSnapshot, EntryType, NetWorthVisibility, BankAccountBalance, CoinspotBalance } from '$lib/types.js';

  let upBalances: BankAccountBalance[] = [];
  let coinspotBalances: CoinspotBalance[] = [];

  const ASSET_CATEGORIES = [
    'Cash & Savings', 'Superannuation', 'Investments', 'Property', 'Vehicles', 'Other Assets'
  ];
  const LIABILITY_CATEGORIES = [
    'Home Loans', 'Personal Loans', 'Credit Cards', 'HECS/HELP', 'Other Liabilities'
  ];
  const LABEL_PLACEHOLDERS: Record<string, string> = {
    'Cash & Savings':    'e.g. Everyday savings account',
    'Superannuation':    'e.g. AustralianSuper balance',
    'Investments':       'e.g. Vanguard ETF portfolio',
    'Property':          'e.g. Family home — 12 Main St',
    'Vehicles':          'e.g. 2021 Toyota Camry',
    'Other Assets':      'e.g. Business interest',
    'Home Loans':        'e.g. Home mortgage',
    'Personal Loans':    'e.g. Car loan',
    'Credit Cards':      'e.g. Visa credit card balance',
    'HECS/HELP':         'e.g. HECS debt',
    'Other Liabilities': 'e.g. Buy now pay later',
  };
  const INSTITUTIONS = [
    'Commonwealth Bank', 'Westpac', 'ANZ', 'NAB', 'Bendigo Bank', 'ING',
    'Macquarie Bank', 'St George', 'Bank of Queensland', 'Suncorp', 'AMP',
    'Australian Super', 'Hostplus', 'REST Super', 'HESTA', 'Other'
  ];

  let entries: NetWorthEntry[] = [];
  let snapshots: NetWorthSnapshot[] = [];
  let loading = true;
  let showAdd = false;
  let editingId: string | null = null;

  let form = {
    entry_type: 'asset' as EntryType,
    category: ASSET_CATEGORIES[0],
    label: '',
    institution: '',
    amount: 0,
    visibility: 'private' as NetWorthVisibility
  };

  $: assets = entries.filter(e => e.entry_type === 'asset');
  $: liabilities = entries.filter(e => e.entry_type === 'liability');
  $: totalAssets = assets.reduce((s, e) => s + Number(e.amount), 0);
  $: totalLiab = liabilities.reduce((s, e) => s + Number(e.amount), 0);
  $: netWorth = totalAssets - totalLiab;

  $: availableCategories = form.entry_type === 'asset' ? ASSET_CATEGORIES : LIABILITY_CATEGORIES;

  function groupBy<T extends { category: string }>(arr: T[]) {
    const map = new Map<string, T[]>();
    for (const e of arr) {
      if (!map.has(e.category)) map.set(e.category, []);
      map.get(e.category)!.push(e);
    }
    return map;
  }

  $: assetGroups = groupBy(assets);
  $: liabGroups = groupBy(liabilities);

  onMount(async () => {
    await load();
  });

  async function load() {
    loading = true;
    const [eRes, sRes, bRes, csRes] = await Promise.all([
      fetch('/api/net-worth').then(r => r.json()),
      fetch('/api/net-worth/snapshot').then(r => r.json()),
      fetch('/api/bank/balances').then(r => r.json()).catch(() => ({ ok: false })),
      fetch('/api/coinspot/balances').then(r => r.json()).catch(() => ({ ok: false }))
    ]);
    if (eRes.ok) entries = eRes.data;
    if (sRes.ok) snapshots = sRes.data;
    if (bRes.ok) upBalances = bRes.data;
    if (csRes.ok) coinspotBalances = csRes.data;
    loading = false;
  }

  $: upSavings = upBalances.filter(b => b.account_type === 'SAVER');
  $: upTransactional = upBalances.filter(b => b.account_type === 'TRANSACTIONAL');
  $: upTotal = upBalances.reduce((s, b) => s + Number(b.balance_cents), 0) / 100;
  $: coinspotTotal = coinspotBalances.reduce((s, b) => s + Number(b.aud_balance), 0);
  let csExpanded = false;

  async function save() {
    if (!form.label.trim()) return;
    const body = { ...form, institution: form.institution || null };

    if (editingId) {
      const res = await fetch(`/api/net-worth/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const json = await res.json();
      if (json.ok) entries = entries.map(e => e.id === editingId ? { ...e, ...json.data } : e);
    } else {
      const res = await fetch('/api/net-worth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const json = await res.json();
      if (json.ok) entries = [...entries, json.data];
    }
    resetForm();
  }

  async function deleteEntry(id: string) {
    if (!confirm('Remove this entry?')) return;
    await fetch(`/api/net-worth/${id}`, { method: 'DELETE' });
    entries = entries.filter(e => e.id !== id);
  }

  async function takeSnapshot() {
    const res = await fetch('/api/net-worth/snapshot', { method: 'POST' });
    const json = await res.json();
    if (json.ok) snapshots = [json.data, ...snapshots];
  }

  function startEdit(entry: NetWorthEntry) {
    editingId = entry.id;
    form = {
      entry_type: entry.entry_type,
      category: entry.category,
      label: entry.label,
      institution: entry.institution ?? '',
      amount: Number(entry.amount),
      visibility: entry.visibility
    };
    showAdd = true;
  }

  function resetForm() {
    showAdd = false;
    editingId = null;
    form = { entry_type: 'asset', category: ASSET_CATEGORIES[0], label: '', institution: '', amount: 0, visibility: 'private' };
  }

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function fmtDateShort(d: string) {
    return new Date(d).toLocaleDateString('en-AU', { month: 'short', year: '2-digit' });
  }

  // ── Line chart ──────────────────────────────────────────────────────────────
  const CHART_W = 560;
  const CHART_H = 160;
  const PAD = { top: 16, right: 16, bottom: 32, left: 64 };

  type ChartPoint = { x: number; y: number; snap: NetWorthSnapshot };

  $: chartPoints = (() => {
    // Need at least 2 snapshots; show newest 24
    const snaps = [...snapshots].reverse().slice(0, 24);
    if (snaps.length < 2) return [] as ChartPoint[];

    const vals = snaps.map(s => Number(s.net_worth));
    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);
    const range = maxV - minV || 1;

    const innerW = CHART_W - PAD.left - PAD.right;
    const innerH = CHART_H - PAD.top - PAD.bottom;

    return snaps.map((s, i) => ({
      x: PAD.left + (i / (snaps.length - 1)) * innerW,
      y: PAD.top + innerH - ((Number(s.net_worth) - minV) / range) * innerH,
      snap: s,
    }));
  })();

  $: polyline = chartPoints.map(p => `${p.x},${p.y}`).join(' ');

  $: chartFill = (() => {
    if (!chartPoints.length) return '';
    const first = chartPoints[0];
    const last = chartPoints[chartPoints.length - 1];
    const bottom = CHART_H - PAD.bottom;
    return `${chartPoints.map(p => `${p.x},${p.y}`).join(' ')} ${last.x},${bottom} ${first.x},${bottom}`;
  })();

  $: yLabels = (() => {
    if (chartPoints.length < 2) return [] as { y: number; label: string }[];
    const vals = chartPoints.map(p => Number(p.snap.net_worth));
    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);
    const innerH = CHART_H - PAD.top - PAD.bottom;
    const range = maxV - minV || 1;
    const ticks = 4;
    return Array.from({ length: ticks + 1 }, (_, i) => {
      const v = minV + (range * i) / ticks;
      const y = PAD.top + innerH - ((v - minV) / range) * innerH;
      const label = Math.abs(v) >= 1000
        ? `${v < 0 ? '-' : ''}$${Math.round(Math.abs(v) / 1000)}k`
        : `$${Math.round(v)}`;
      return { y, label };
    });
  })();

  let hoveredPoint: ChartPoint | null = null;
  let confirmDeleteSnapId: string | null = null;

  async function deleteSnapshot(id: string) {
    await fetch(`/api/net-worth/snapshot/${id}`, { method: 'DELETE' });
    snapshots = snapshots.filter(s => s.id !== id);
    confirmDeleteSnapId = null;
  }

  function onChartMouseMove(e: MouseEvent) {
    if (!chartPoints.length) return;
    const svg = (e.currentTarget as SVGElement).getBoundingClientRect();
    const mx = e.clientX - svg.left;
    let closest = chartPoints[0];
    let minDist = Math.abs(mx - closest.x);
    for (const p of chartPoints) {
      const d = Math.abs(mx - p.x);
      if (d < minDist) { minDist = d; closest = p; }
    }
    hoveredPoint = closest;
  }
</script>

<div class="nw-page">
  <header class="nw-header">
    <h1>Net Worth</h1>
    <button class="btn-snap" on:click={() => { takeSnapshot(); }}>Snapshot now</button>
  </header>

  {#if loading}
    <p class="muted">Loading…</p>
  {:else}
    <div class="summary-bar">
      <div class="summary-card assets">
        <span class="label">Total Assets</span>
        <span class="amount">{fmt(totalAssets)}</span>
      </div>
      <div class="summary-card liab">
        <span class="label">Total Liabilities</span>
        <span class="amount">{fmt(totalLiab)}</span>
      </div>
      <div class="summary-card net {netWorth >= 0 ? 'pos' : 'neg'}">
        <span class="label">Net Worth</span>
        <span class="amount">{fmt(netWorth)}</span>
      </div>
    </div>

    <!-- Net worth line chart -->
    {#if chartPoints.length >= 2}
      <div class="card chart-card">
        <div class="card-header">
          <span class="card-title">Net worth over time</span>
          <span class="card-badge">{snapshots.length} snapshot{snapshots.length !== 1 ? 's' : ''}</span>
        </div>
        <svg
          viewBox="0 0 {CHART_W} {CHART_H}"
          width="100%"
          class="nw-chart"
          on:mousemove={onChartMouseMove}
          on:mouseleave={() => { hoveredPoint = null; }}
          role="img"
          aria-label="Net worth over time"
        >
          <!-- Y-axis gridlines + labels -->
          {#each yLabels as tick}
            <line x1={PAD.left} y1={tick.y} x2={CHART_W - PAD.right} y2={tick.y}
              stroke="var(--border)" stroke-width="1" stroke-dasharray="3 4" />
            <text x={PAD.left - 6} y={tick.y + 4} text-anchor="end" class="chart-label">{tick.label}</text>
          {/each}

          <!-- Fill area -->
          <polygon points={chartFill} fill="url(#nwGrad)" opacity="0.25" />

          <!-- Line -->
          <polyline points={polyline} fill="none" stroke="var(--accent)" stroke-width="2.5"
            stroke-linejoin="round" stroke-linecap="round" />

          <!-- Gradient def -->
          <defs>
            <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--accent)" />
              <stop offset="100%" stop-color="var(--accent)" stop-opacity="0" />
            </linearGradient>
          </defs>

          <!-- X-axis date labels — first, last, and mid if space -->
          {#each chartPoints.filter((_, i, a) => i === 0 || i === a.length - 1 || i === Math.floor(a.length / 2)) as p}
            <text x={p.x} y={CHART_H - 6} text-anchor="middle" class="chart-label">
              {fmtDateShort(p.snap.snapped_at)}
            </text>
          {/each}

          <!-- Hover dot + tooltip -->
          {#if hoveredPoint}
            <line x1={hoveredPoint.x} y1={PAD.top} x2={hoveredPoint.x} y2={CHART_H - PAD.bottom}
              stroke="var(--accent)" stroke-width="1" stroke-dasharray="3 3" opacity="0.6" />
            <circle cx={hoveredPoint.x} cy={hoveredPoint.y} r="5"
              fill="var(--accent)" stroke="var(--surface)" stroke-width="2" />
            {@const tipX = hoveredPoint.x > CHART_W - 130 ? hoveredPoint.x - 110 : hoveredPoint.x + 10}
            <rect x={tipX} y={hoveredPoint.y - 26} width="100" height="22" rx="5"
              fill="var(--surface-2)" stroke="var(--border)" stroke-width="1" />
            <text x={tipX + 50} y={hoveredPoint.y - 10} text-anchor="middle" class="chart-tip-val">
              {fmt(Number(hoveredPoint.snap.net_worth))}
            </text>
          {/if}
        </svg>
      </div>
    {/if}

    <!-- Assets section (live data first, then manual) -->
    <section class="nw-section">
      <h2>Assets</h2>

      <!-- Up Bank live (Cash & Savings) -->
      {#if upBalances.length}
        <div class="cat-group">
          <h3>Cash &amp; Savings <span class="up-badge">Live</span></h3>
          {#each upBalances as bal}
            <div class="entry-row entry-row--readonly">
              <div class="entry-main">
                <span class="entry-label">{bal.display_name}</span>
                <span class="entry-inst">Up Bank · {bal.account_type === 'SAVER' ? 'Savings' : bal.account_type === 'TRANSACTIONAL' ? 'Everyday' : bal.account_type.toLowerCase()}</span>
                <span class="entry-updated muted">Synced {new Date(bal.synced_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>
              </div>
              <span class="entry-amount">{fmt(Number(bal.balance_cents) / 100)}</span>
              <div class="entry-actions"><span class="entry-readonly-badge">live</span></div>
            </div>
          {/each}
          {#if upBalances.length > 1}
            <div class="entry-row entry-row--total">
              <div class="entry-main"><span class="entry-label">Up Bank total</span></div>
              <span class="entry-amount">{fmt(upTotal)}</span>
              <div class="entry-actions"></div>
            </div>
          {/if}
        </div>
      {/if}

      <!-- CoinSpot live (Investments) -->
      {#if coinspotBalances.length}
        {@const csTop = coinspotBalances.slice(0, 3)}
        {@const csRest = coinspotBalances.slice(3)}
        <div class="cat-group">
          <h3>Investments <span class="cs-badge">Live</span></h3>
          {#each csTop as bal}
            <div class="entry-row entry-row--readonly">
              <div class="entry-main">
                <span class="entry-label">{bal.coin_type}</span>
                <span class="entry-inst">CoinSpot · {Number(bal.balance).toLocaleString('en-AU', { maximumSignificantDigits: 6 })} {bal.coin_type} @ {Number(bal.rate).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' })}</span>
                <span class="entry-updated muted">Synced {new Date(bal.synced_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>
              </div>
              <span class="entry-amount">{Number(bal.aud_balance).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' })}</span>
              <div class="entry-actions"><span class="entry-readonly-badge">live</span></div>
            </div>
          {/each}
          {#if csRest.length}
            {#if csExpanded}
              {#each csRest as bal}
                <div class="entry-row entry-row--readonly">
                  <div class="entry-main">
                    <span class="entry-label">{bal.coin_type}</span>
                    <span class="entry-inst">CoinSpot · {Number(bal.balance).toLocaleString('en-AU', { maximumSignificantDigits: 6 })} {bal.coin_type} @ {Number(bal.rate).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' })}</span>
                  </div>
                  <span class="entry-amount">{Number(bal.aud_balance).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' })}</span>
                  <div class="entry-actions"><span class="entry-readonly-badge">live</span></div>
                </div>
              {/each}
            {/if}
            <button class="cs-expand-btn" on:click={() => { csExpanded = !csExpanded; }}>
              {csExpanded ? '▲ Show less' : `▼ ${csRest.length} more coin${csRest.length !== 1 ? 's' : ''}`}
            </button>
          {/if}
          {#if coinspotBalances.length > 1}
            <div class="entry-row entry-row--total">
              <div class="entry-main"><span class="entry-label">CoinSpot total</span></div>
              <span class="entry-amount">{coinspotTotal.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' })}</span>
              <div class="entry-actions"></div>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Manual asset entries -->
      {#if assetGroups.size === 0 && !upBalances.length && !coinspotBalances.length}
        <p class="muted">No assets added yet.</p>
      {:else}
        {#each [...assetGroups.entries()] as [cat, catEntries]}
          <div class="cat-group">
            <h3>{cat}</h3>
            {#each catEntries as entry}
              <div class="entry-row">
                <div class="entry-main">
                  <span class="entry-label">{entry.label}</span>
                  {#if entry.institution}<span class="entry-inst">{entry.institution}</span>{/if}
                  <span class="entry-updated muted">Updated {fmtDate(entry.last_updated)}</span>
                </div>
                <span class="entry-amount">{fmt(Number(entry.amount))}</span>
                <div class="entry-actions">
                  {#if entry.visibility === 'shared'}
                    <span class="vis-badge vis-badge--shared" title="Shared with household">↗</span>
                  {/if}
                  <button class="btn-icon" on:click={() => { startEdit(entry); }}>✎</button>
                  <button class="btn-icon del" on:click={() => { deleteEntry(entry.id); }}>×</button>
                </div>
              </div>
            {/each}
          </div>
        {/each}
      {/if}
    </section>

    <!-- Liabilities section -->
    <section class="nw-section">
      <h2>Liabilities</h2>
      {#if liabGroups.size === 0}
        <p class="muted">No liabilities added yet.</p>
      {:else}
        {#each [...liabGroups.entries()] as [cat, catEntries]}
          <div class="cat-group">
            <h3>{cat}</h3>
            {#each catEntries as entry}
              <div class="entry-row">
                <div class="entry-main">
                  <span class="entry-label">{entry.label}</span>
                  {#if entry.institution}<span class="entry-inst">{entry.institution}</span>{/if}
                  <span class="entry-updated muted">Updated {fmtDate(entry.last_updated)}</span>
                </div>
                <span class="entry-amount">{fmt(Number(entry.amount))}</span>
                <div class="entry-actions">
                  {#if entry.visibility === 'shared'}
                    <span class="vis-badge vis-badge--shared" title="Shared with household">↗</span>
                  {/if}
                  <button class="btn-icon" on:click={() => { startEdit(entry); }}>✎</button>
                  <button class="btn-icon del" on:click={() => { deleteEntry(entry.id); }}>×</button>
                </div>
              </div>
            {/each}
          </div>
        {/each}
      {/if}
    </section>

    <button class="btn-add" on:click={() => { showAdd = true; }}>+ Add entry</button>

    <!-- Snapshot history -->
    {#if snapshots.length > 0}
      <section class="nw-section">
        <h2>History</h2>
        <table class="snap-table">
          <thead>
            <tr><th>Date</th><th>Assets</th><th>Liabilities</th><th>Net Worth</th><th></th></tr>
          </thead>
          <tbody>
            {#each snapshots as snap}
              <tr>
                <td>{fmtDate(snap.snapped_at)}</td>
                <td>{fmt(Number(snap.total_assets))}</td>
                <td>{fmt(Number(snap.total_liab))}</td>
                <td class={Number(snap.net_worth) >= 0 ? 'pos' : 'neg'}>{fmt(Number(snap.net_worth))}</td>
                <td class="snap-del-cell">
                  {#if confirmDeleteSnapId === snap.id}
                    <span class="snap-confirm">
                      Delete?
                      <button class="snap-confirm-yes" on:click={() => deleteSnapshot(snap.id)}>Yes</button>
                      <button class="snap-confirm-no" on:click={() => { confirmDeleteSnapId = null; }}>No</button>
                    </span>
                  {:else}
                    <button class="btn-icon del snap-del-btn" on:click={() => { confirmDeleteSnapId = snap.id; }}>×</button>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </section>
    {/if}
  {/if}
</div>

<!-- Add / Edit Modal -->
{#if showAdd}
  <div class="modal-backdrop" on:click|self={() => { resetForm(); }}>
    <div class="modal">
      <h2>{editingId ? 'Edit entry' : 'Add entry'}</h2>

      <label>Type
        <select bind:value={form.entry_type} on:change={() => { form.category = availableCategories[0]; }}>
          <option value="asset">Asset</option>
          <option value="liability">Liability</option>
        </select>
      </label>

      <label>Category
        <select bind:value={form.category}>
          {#each availableCategories as cat}
            <option>{cat}</option>
          {/each}
        </select>
      </label>

      <label>Institution (optional)
        <select bind:value={form.institution}>
          <option value="">— none —</option>
          {#each INSTITUTIONS as inst}
            <option>{inst}</option>
          {/each}
        </select>
      </label>

      <label>Label
        <input bind:value={form.label} placeholder={LABEL_PLACEHOLDERS[form.category] ?? 'e.g. Description'} />
      </label>

      <label>Amount
        <input type="number" min="0" step="0.01" bind:value={form.amount} />
      </label>

      <label>Visibility
        <select bind:value={form.visibility}>
          <option value="private">Private</option>
          <option value="shared">Shared with household</option>
        </select>
      </label>

      <div class="modal-actions">
        <button class="btn-cancel" on:click={() => { resetForm(); }}>Cancel</button>
        <button class="btn-save" on:click={() => { save(); }}>Save</button>
      </div>
    </div>
  </div>
{/if}

<style>
.nw-page { max-width: 860px; margin: 0 auto; padding: 2rem 1.5rem; }
.nw-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
.nw-header h1 { font-size: 1.6rem; font-weight: 700; margin: 0; }

.summary-bar { display: grid; grid-template-columns: repeat(3,1fr); gap: 1rem; margin-bottom: 2rem; }
.summary-card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 1rem 1.25rem; }
.summary-card .label { display: block; font-size: .75rem; color: var(--text-muted); margin-bottom: .25rem; text-transform: uppercase; letter-spacing: .04em; }
.summary-card .amount { font-size: 1.4rem; font-weight: 700; }
.summary-card.assets .amount { color: #1D9E75; }
.summary-card.liab .amount { color: #E24B4A; }
.summary-card.net.pos .amount { color: #1D9E75; }
.summary-card.net.neg .amount { color: #E24B4A; }

.nw-section { margin-bottom: 2rem; }
.nw-section h2 { font-size: 1.1rem; font-weight: 700; border-bottom: 2px solid var(--border); padding-bottom: .5rem; margin-bottom: 1rem; }
.cat-group { margin-bottom: 1rem; }
.cat-group h3 { font-size: .8rem; text-transform: uppercase; letter-spacing: .06em; color: var(--text-muted); margin: 0 0 .5rem; }

.entry-row {
  display: grid;
  grid-template-columns: 1fr 120px 72px;
  align-items: center;
  gap: .5rem;
  padding: .45rem .75rem;
  border-radius: 6px;
  transition: background .15s;
}
.entry-row:hover { background: var(--surface-hover); }
.entry-main { display: flex; gap: .4rem; align-items: baseline; flex-wrap: wrap; min-width: 0; }
.entry-label { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.entry-inst { font-size: .8rem; color: var(--text-muted); white-space: nowrap; }
.entry-updated { font-size: .75rem; }
.entry-amount { font-weight: 600; text-align: right; font-variant-numeric: tabular-nums; }
.entry-actions { display: flex; gap: .25rem; justify-content: flex-end; opacity: 0; transition: opacity .15s; }
.entry-row:hover .entry-actions { opacity: 1; }

.btn-icon { background: none; border: none; cursor: pointer; font-size: 1rem; padding: .2rem .35rem; border-radius: 4px; color: var(--text-muted); }
.btn-icon:hover { background: var(--surface-hover); color: var(--text); }
.btn-icon.del:hover { color: #E24B4A; }
.btn-add { margin-top: .5rem; margin-bottom: 2rem; padding: .5rem 1rem; background: var(--accent); color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: .9rem; }
.btn-snap { padding: .4rem .9rem; background: var(--accent); color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: .85rem; font-weight: 600; transition: opacity 150ms; }
.btn-snap:hover { opacity: .85; }

.snap-table { width: 100%; border-collapse: collapse; font-size: .9rem; }
.snap-table th { text-align: left; padding: .5rem .75rem; background: var(--surface); border-bottom: 2px solid var(--border); font-size: .75rem; text-transform: uppercase; letter-spacing: .04em; }
.snap-table td { padding: .5rem .75rem; border-bottom: 1px solid var(--border); }
.snap-del-cell { width: 1px; white-space: nowrap; }
.snap-del-btn { opacity: 0; transition: opacity .15s; }
.snap-table tr:hover .snap-del-btn { opacity: 1; }
.snap-confirm { display: flex; align-items: center; gap: .3rem; font-size: .78rem; color: var(--fg-muted); }
.snap-confirm-yes { padding: .15rem .5rem; font-size: .75rem; font-weight: 600; background: rgba(226,75,74,.12); color: #E24B4A; border: 1px solid rgba(226,75,74,.3); border-radius: 4px; cursor: pointer; }
.snap-confirm-yes:hover { background: rgba(226,75,74,.22); }
.snap-confirm-no { padding: .15rem .5rem; font-size: .75rem; background: var(--surface-2); color: var(--fg-muted); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; }
.pos { color: #1D9E75; font-weight: 600; }
.neg { color: #E24B4A; font-weight: 600; }

.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: var(--bg); border-radius: 10px; padding: 1.75rem; min-width: 380px; max-width: 480px; width: 100%; }
.modal h2 { margin: 0 0 1.25rem; font-size: 1.1rem; }
.modal label { display: block; font-size: .85rem; font-weight: 500; margin-bottom: .9rem; }
.modal input, .modal select { display: block; width: 100%; margin-top: .3rem; padding: .5rem .65rem; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text); font-size: .9rem; box-sizing: border-box; }
.modal-actions { display: flex; gap: .75rem; justify-content: flex-end; margin-top: 1.5rem; }
.btn-cancel { padding: .5rem 1rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 6px; cursor: pointer; color: var(--fg); font-weight: 500; transition: background 120ms; }
.btn-cancel:hover { background: var(--surface-hover, var(--border)); }
.btn-save { padding: .5rem 1.25rem; background: var(--accent); color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; }
.muted { color: var(--text-muted); font-size: .9rem; }

/* ── Line chart ── */
.chart-card { margin-bottom: 2rem; }
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius, 12px);
  padding: 1.25rem 1.5rem;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}
.card-title { font-size: .9rem; font-weight: 600; color: var(--text, var(--fg)); }
.card-badge {
  font-size: .75rem;
  background: var(--surface-2);
  color: var(--text-muted);
  padding: .2rem .55rem;
  border-radius: 99px;
  border: 1px solid var(--border);
}
.nw-chart { display: block; overflow: visible; }
.chart-label { font-size: 10px; fill: var(--text-muted, #9ca3af); font-family: inherit; }
.chart-tip-val { font-size: 11px; font-weight: 700; fill: var(--text, var(--fg)); font-family: inherit; }

.up-badge {
  display: inline-block;
  font-size: .65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .06em;
  background: color-mix(in srgb, #FF7A00 15%, transparent);
  color: #FF7A00;
  border: 1px solid color-mix(in srgb, #FF7A00 35%, transparent);
  padding: .1rem .4rem;
  border-radius: 99px;
  vertical-align: middle;
  margin-left: .4rem;
}
.cs-badge {
  display: inline-block;
  font-size: .65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .06em;
  background: color-mix(in srgb, #F59E0B 15%, transparent);
  color: #F59E0B;
  border: 1px solid color-mix(in srgb, #F59E0B 35%, transparent);
  padding: .1rem .4rem;
  border-radius: 99px;
  vertical-align: middle;
  margin-left: .4rem;
}

.entry-row--readonly { opacity: .9; }
.entry-row--total {
  border-top: 1px solid var(--border);
  margin-top: .25rem;
  padding-top: .5rem;
}
.entry-row--total .entry-label { font-weight: 600; color: var(--fg); }

.entry-readonly-badge {
  font-size: .7rem;
  color: var(--fg-muted);
  border: 1px solid var(--border);
  border-radius: 99px;
  padding: .1rem .45rem;
}
.vis-badge--shared {
  font-size: .75rem;
  color: var(--accent);
  opacity: .8;
}
.cs-expand-btn {
  font-size: .78rem;
  color: var(--accent);
  background: none;
  border: none;
  cursor: pointer;
  padding: .25rem .875rem;
  opacity: .8;
}
.cs-expand-btn:hover { opacity: 1; }
</style>
