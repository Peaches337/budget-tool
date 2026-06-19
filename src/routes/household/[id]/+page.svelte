<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { fmt } from '$lib/utils.js';
  import { toAnnual, calcAustralianTax } from '$lib/tax.js';
  import type { Frequency } from '$lib/types.js';

  type MemberBudget = {
    user_id: string;
    username: string;
    role: string;
    is_self: boolean;
    categories: Array<{
      id: string; name: string; color: string;
      is_income: boolean; visibility: string;
      items: Array<{ label: string; amount: number; frequency: string; taxable: string }>;
    }>;
  };

  $: householdId = $page.params.id;

  type NwMember = { user_id: string; username: string; total_assets: string; total_liab: string; net_worth: string };

  let members: MemberBudget[] = [];
  let householdName = '';
  let loading = true;
  let viewPeriod = 'annually';
  let nwData: NwMember[] | null = null;

  const periods = [
    { value: 'weekly',      label: 'Weekly',      mult: 1/52 },
    { value: 'fortnightly', label: 'Fortnightly',  mult: 1/26 },
    { value: 'monthly',     label: 'Monthly',      mult: 1/12 },
    { value: 'annually',    label: 'Annual',       mult: 1    },
  ];

  $: mult = periods.find(p => p.value === viewPeriod)?.mult ?? 1;
  $: periodLabel = periods.find(p => p.value === viewPeriod)?.label ?? 'Annual';

  onMount(async () => {
    // Get household name
    const hhRes = await fetch('/api/household');
    const hhJson = await hhRes.json();
    if (hhJson.ok) {
      const hh = hhJson.data.find((h: { id: string; name: string }) => h.id === householdId);
      if (hh) householdName = hh.name;
    }

    // Get member budgets + net worth (parallel)
    const [sumRes, nwRes] = await Promise.all([
      fetch(`/api/household/${householdId}/summary`).then(r => r.json()),
      fetch(`/api/household/${householdId}/net-worth`).then(r => r.json()),
    ]);
    if (sumRes.ok) members = sumRes.data;
    if (nwRes.ok && nwRes.data) nwData = nwRes.data;
    loading = false;
  });

  function memberNetIncome(member: MemberBudget): number {
    const incomeCat = member.categories.find(c => c.is_income);
    if (!incomeCat) return 0;
    const taxedGross = incomeCat.items
      .filter(i => i.taxable === 'taxed')
      .reduce((s, i) => s + toAnnual(Number(i.amount), i.frequency as Frequency), 0);
    const taxFree = incomeCat.items
      .filter(i => i.taxable === 'taxfree')
      .reduce((s, i) => s + toAnnual(Number(i.amount), i.frequency as Frequency), 0);
    return calcAustralianTax(taxedGross).netIncome + taxFree;
  }

  function memberExpenses(member: MemberBudget): number {
    return member.categories
      .filter(c => !c.is_income)
      .reduce((s, c) => s + c.items.reduce((cs, i) =>
        cs + toAnnual(Number(i.amount), i.frequency as Frequency), 0), 0);
  }

  function catAnnual(cat: MemberBudget['categories'][0]): number {
    return cat.items.reduce((s, i) => s + toAnnual(Number(i.amount), i.frequency as Frequency), 0);
  }

  $: totalNet      = members.reduce((s, m) => s + memberNetIncome(m), 0);
  $: totalExpenses = members.reduce((s, m) => s + memberExpenses(m), 0);
  $: totalSurplus  = totalNet - totalExpenses;
</script>

<div class="page">
  <div class="page-header">
    <div>
      <h1>{householdName || 'Household'}</h1>
      <p class="subtitle">Combined budget summary</p>
    </div>
    <div class="period-wrap">
      <select bind:value={viewPeriod}>
        {#each periods as p}
          <option value={p.value}>{p.label}</option>
        {/each}
      </select>
    </div>
  </div>

  {#if loading}
    <p class="muted">Loading…</p>
  {:else}

    <!-- Household metrics -->
    <div class="metrics">
      <div class="metric">
        <div class="metric-label">Combined net income</div>
        <div class="metric-value">{fmt(totalNet, mult)}</div>
      </div>
      <div class="metric">
        <div class="metric-label">Combined expenses</div>
        <div class="metric-value neg">{fmt(totalExpenses, mult)}</div>
      </div>
      <div class="metric highlight" class:pos={totalSurplus >= 0} class:neg={totalSurplus < 0}>
        <div class="metric-label">{totalSurplus >= 0 ? 'Surplus' : 'Deficit'}</div>
        <div class="metric-value">{fmt(Math.abs(totalSurplus), mult)}</div>
      </div>
    </div>

    <!-- Per-member cards -->
    {#each members as member}
      {@const net = memberNetIncome(member)}
      {@const exp = memberExpenses(member)}
      {@const sur = net - exp}

      <div class="member-card">
        <div class="member-header">
          <div class="member-title">
            <div class="avatar">{member.username[0].toUpperCase()}</div>
            <div>
              <div class="member-name">
                {member.username}
                {#if member.is_self}<span class="you-badge">you</span>{/if}
              </div>
              <div class="member-role">{member.role}</div>
            </div>
          </div>
          <div class="member-metrics">
            <div class="mini-metric">
              <span class="mini-label">Net income</span>
              <span class="mini-val">{net > 0 ? fmt(net, mult) : '–'}</span>
            </div>
            <div class="mini-metric">
              <span class="mini-label">Expenses</span>
              <span class="mini-val neg">{exp > 0 ? fmt(exp, mult) : '–'}</span>
            </div>
            <div class="mini-metric">
              <span class="mini-label">{sur >= 0 ? 'Surplus' : 'Deficit'}</span>
              <span class="mini-val" class:pos={sur >= 0} class:neg={sur < 0}>
                {net > 0 || exp > 0 ? fmt(Math.abs(sur), mult) : '–'}
              </span>
            </div>
          </div>
        </div>

        <!-- Shared categories -->
        {#if member.categories.filter(c => !c.is_income && c.visibility !== 'private' && catAnnual(c) > 0).length > 0}
          <div class="shared-cats">
            {#each member.categories.filter(c => !c.is_income && c.visibility !== 'private') as cat}
              {@const total = catAnnual(cat)}
              {#if total > 0}
                <div class="shared-cat">
                  <div class="shared-cat-header">
                    <span class="shared-cat-dot" style="background:{cat.color}"></span>
                    <span class="shared-cat-name">{cat.name}</span>
                    <span class="shared-cat-total">{fmt(total, mult)}</span>
                    {#if cat.visibility === 'amount_only'}
                      <span class="privacy-badge">amount only</span>
                    {/if}
                  </div>
                  {#if cat.visibility === 'full' && cat.items.length > 0}
                    <div class="shared-items">
                      {#each cat.items.filter(i => Number(i.amount) > 0) as item}
                        <div class="shared-item">
                          <span>{item.label}</span>
                          <span>{fmt(toAnnual(Number(item.amount), item.frequency as Frequency), mult)}</span>
                        </div>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/if}
            {/each}
          </div>
        {:else if !member.is_self}
          <div class="no-shared">
            {member.username} hasn't shared any budget categories yet.
          </div>
        {/if}
      </div>
    {/each}

    <!-- Household net worth -->
    {#if nwData}
      <section class="nw-section">
        <h2 class="section-title">Net Worth</h2>
        <p class="section-hint">Members who have shared net worth entries. Members control what's visible from their Net Worth page.</p>
        <div class="nw-table-wrap">
          <table class="nw-table">
            <thead>
              <tr>
                <th>Member</th>
                <th class="num">Assets</th>
                <th class="num">Liabilities</th>
                <th class="num">Net Worth</th>
              </tr>
            </thead>
            <tbody>
              {#each nwData as row}
                <tr>
                  <td>{row.username}</td>
                  <td class="num">{fmt(Number(row.total_assets))}</td>
                  <td class="num">{fmt(Number(row.total_liab))}</td>
                  <td class="num {Number(row.net_worth) >= 0 ? 'pos' : 'neg'}">{fmt(Number(row.net_worth))}</td>
                </tr>
              {/each}
              {#if nwData.length > 1}
                {@const totAssets = nwData.reduce((s, r) => s + Number(r.total_assets), 0)}
                {@const totLiab   = nwData.reduce((s, r) => s + Number(r.total_liab), 0)}
                {@const totNw     = totAssets - totLiab}
                <tr class="total-row">
                  <td><strong>Combined</strong></td>
                  <td class="num"><strong>{fmt(totAssets)}</strong></td>
                  <td class="num"><strong>{fmt(totLiab)}</strong></td>
                  <td class="num {totNw >= 0 ? 'pos' : 'neg'}"><strong>{fmt(totNw)}</strong></td>
                </tr>
              {/if}
            </tbody>
          </table>
        </div>
      </section>
    {/if}

  {/if}
</div>

<style>
  .page { padding: 1.75rem 2rem; max-width: 860px; }

  .page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 1.5rem;
    gap: 1rem;
  }

  h1 { font-size: 1.25rem; font-weight: 600; }
  .subtitle { font-size: .85rem; color: var(--fg-muted); margin-top: 2px; }
  .muted { color: var(--fg-muted); font-size: .875rem; }

  .period-wrap select {
    padding: .4rem .75rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--fg);
    font-size: .85rem;
    cursor: pointer;
  }

  /* ── Household metrics ── */
  .metrics {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: .75rem;
    margin-bottom: 1.5rem;
  }

  .metric {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1rem 1.1rem;
    box-shadow: var(--shadow-sm);
  }

  .metric.highlight { border-width: 2px; }
  .metric.highlight.pos { border-color: var(--pos); }
  .metric.highlight.neg { border-color: var(--neg); }

  .metric-label {
    font-size: .7rem;
    text-transform: uppercase;
    letter-spacing: .06em;
    color: var(--fg-muted);
    margin-bottom: .35rem;
  }

  .metric-value { font-size: 1.2rem; font-weight: 600; }
  .pos { color: var(--pos); }
  .neg { color: var(--neg); }

  /* ── Member cards ── */
  .member-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    margin-bottom: 1rem;
    box-shadow: var(--shadow-sm);
    overflow: hidden;
  }

  .member-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--border);
    flex-wrap: wrap;
    gap: 1rem;
  }

  .member-title {
    display: flex;
    align-items: center;
    gap: .75rem;
  }

  .avatar {
    width: 36px; height: 36px;
    border-radius: 50%;
    background: var(--accent);
    color: #fff;
    font-size: .875rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .member-name {
    font-weight: 600;
    font-size: .95rem;
    display: flex;
    align-items: center;
    gap: .5rem;
  }

  .member-role { font-size: .75rem; color: var(--fg-muted); text-transform: capitalize; }

  .you-badge {
    font-size: .65rem;
    font-weight: 600;
    padding: 2px 7px;
    border-radius: 20px;
    background: color-mix(in srgb, var(--accent) 15%, transparent);
    color: var(--accent);
    text-transform: uppercase;
    letter-spacing: .04em;
  }

  .member-metrics {
    display: flex;
    gap: 1.5rem;
  }

  .mini-metric { display: flex; flex-direction: column; align-items: flex-end; }
  .mini-label { font-size: .7rem; color: var(--fg-muted); text-transform: uppercase; letter-spacing: .05em; }
  .mini-val { font-size: .95rem; font-weight: 600; font-variant-numeric: tabular-nums; }

  /* ── Shared categories ── */
  .shared-cats { padding: .75rem 1.25rem 1rem; display: flex; flex-direction: column; gap: .75rem; }

  .shared-cat {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .shared-cat-header {
    display: flex;
    align-items: center;
    gap: .6rem;
    padding: .5rem .85rem;
    font-size: .875rem;
  }

  .shared-cat-dot {
    width: 8px; height: 8px;
    border-radius: 2px;
    flex-shrink: 0;
  }

  .shared-cat-name { flex: 1; font-weight: 500; }
  .shared-cat-total { font-weight: 600; font-variant-numeric: tabular-nums; }

  .privacy-badge {
    font-size: .65rem;
    color: var(--fg-faint);
    background: var(--border);
    padding: 2px 6px;
    border-radius: 20px;
  }

  .shared-items {
    border-top: 1px solid var(--border);
    padding: .35rem .85rem .5rem;
  }

  .shared-item {
    display: flex;
    justify-content: space-between;
    font-size: .8rem;
    color: var(--fg-muted);
    padding: .2rem 0;
  }

  .no-shared {
    padding: .75rem 1.25rem 1rem;
    font-size: .85rem;
    color: var(--fg-faint);
    font-style: italic;
  }

  /* Net worth section */
  .nw-section { margin-top: 2rem; }
  .section-title { font-size: 1rem; font-weight: 600; margin-bottom: .3rem; }
  .section-hint { font-size: .78rem; color: var(--fg-muted); margin-bottom: 1rem; }

  .nw-table-wrap {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }

  .nw-table { width: 100%; border-collapse: collapse; font-size: .875rem; }
  .nw-table th {
    text-align: left; padding: .5rem .75rem;
    background: var(--surface-2);
    border-bottom: 1px solid var(--border);
    font-size: .7rem; text-transform: uppercase; letter-spacing: .06em; color: var(--fg-muted);
  }
  .nw-table td { padding: .6rem .75rem; border-bottom: 1px solid var(--border); }
  .nw-table tr:last-child td { border-bottom: none; }
  .nw-table .num { text-align: right; font-variant-numeric: tabular-nums; }
  .nw-table .total-row td { background: var(--surface-2); }
  .pos { color: #1D9E75; }
  .neg { color: #E24B4A; }
</style>
