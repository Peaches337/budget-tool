<script lang="ts">
  import { onMount } from 'svelte';
  import { categories, summary, viewPeriod, periodMultiplier, periodLabel, loadBudget } from '$lib/stores/budget.js';
  import { activeProfile } from '$lib/stores/profile.js';
  import { fmt } from '$lib/utils.js';
  import { toAnnual, calcAustralianTax, currentTaxYear, TAX_YEARS } from '$lib/tax.js';
  import type { Frequency } from '$lib/types.js';
  import type { TaxYear } from '$lib/tax.js';

  let selectedFY: TaxYear = currentTaxYear();

  // Recompute tax when FY changes
  $: fyTax = calcAustralianTax($summary.taxedGross, selectedFY);

  onMount(loadBudget);
  $: $activeProfile, loadBudget();

  const periods = [
    { value: 'weekly',      label: 'Weekly' },
    { value: 'fortnightly', label: 'Fortnightly' },
    { value: 'monthly',     label: 'Monthly' },
    { value: 'annually',    label: 'Annual' },
  ];

  $: surplusRate = $summary.netIncome > 0
    ? Math.round(($summary.surplus / $summary.netIncome) * 100)
    : 0;

  $: expenseRate = $summary.netIncome > 0
    ? Math.round(($summary.totalExpenses / $summary.netIncome) * 100)
    : 0;

  // ── Donut chart ──────────────────────────────────────────────────────────
  const RADIUS = 64;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const GAP = 2; // px gap between segments

  type DonutSegment = { color: string; name: string; pct: number; dash: number; offset: number };

  $: donutSegments = (() => {
    const cats = $summary.expensesByCat.filter(c => c.annual > 0);
    const total = cats.reduce((s, c) => s + c.annual, 0);
    if (!total) return [] as DonutSegment[];

    let offsetAcc = 0;
    return cats.map(cat => {
      const pct = cat.annual / total;
      const dash = Math.max(0, pct * CIRCUMFERENCE - GAP);
      const seg: DonutSegment = { color: cat.color, name: cat.name, pct: Math.round(pct * 100), dash, offset: -offsetAcc };
      offsetAcc += pct * CIRCUMFERENCE;
      return seg;
    });
  })();

  let hoveredSeg: string | null = null;
</script>

<div class="page">
  <!-- ── Header ── -->
  <div class="page-header">
    <div>
      <h1>Summary</h1>
      <p class="subtitle">Your budget at a glance</p>
    </div>
    <div class="period-tabs">
      {#each periods as p}
        <button
          class="period-tab"
          class:active={$viewPeriod === p.value}
          on:click={() => { $viewPeriod = p.value; }}
        >{p.label}</button>
      {/each}
    </div>
  </div>

  <!-- ── Top metric strip ── -->
  <div class="metrics">
    <div class="metric">
      <span class="metric-icon" style="background:rgba(99,102,241,.1);color:#6366f1">↑</span>
      <div>
        <div class="metric-label">Gross income</div>
        <div class="metric-value">{fmt($summary.grossIncome, $periodMultiplier)}</div>
      </div>
    </div>

    <div class="metric">
      <span class="metric-icon" style="background:rgba(220,38,38,.08);color:var(--neg)">⊖</span>
      <div>
        <div class="metric-label">Tax + Medicare</div>
        <div class="metric-value neg">{fmt($summary.tax.totalTax, $periodMultiplier)}</div>
      </div>
    </div>

    <div class="metric">
      <span class="metric-icon" style="background:rgba(5,150,105,.1);color:var(--pos)">✓</span>
      <div>
        <div class="metric-label">Net income</div>
        <div class="metric-value">{fmt($summary.netIncome, $periodMultiplier)}</div>
      </div>
    </div>

    <div class="metric">
      <span class="metric-icon" style="background:rgba(220,38,38,.08);color:var(--neg)">↓</span>
      <div>
        <div class="metric-label">Total expenses</div>
        <div class="metric-value neg">{fmt($summary.totalExpenses, $periodMultiplier)}</div>
      </div>
    </div>

    <div class="metric metric--highlight" class:metric--pos={$summary.surplus >= 0} class:metric--neg={$summary.surplus < 0}>
      <span class="metric-icon" style="background:{$summary.surplus >= 0 ? 'rgba(5,150,105,.12)' : 'rgba(220,38,38,.1)'};color:{$summary.surplus >= 0 ? 'var(--pos)' : 'var(--neg)'}">
        {$summary.surplus >= 0 ? '◆' : '▽'}
      </span>
      <div>
        <div class="metric-label">{$summary.surplus >= 0 ? 'Surplus' : 'Deficit'}</div>
        <div class="metric-value" class:pos={$summary.surplus >= 0} class:neg={$summary.surplus < 0}>
          {fmt(Math.abs($summary.surplus), $periodMultiplier)}
        </div>
        {#if $summary.netIncome > 0}
          <div class="metric-sub" class:pos={$summary.surplus >= 0} class:neg={$summary.surplus < 0}>
            {surplusRate}% of net income
          </div>
        {/if}
      </div>
    </div>
  </div>

  <!-- ── Two-column layout ── -->
  <div class="two-col">
    <div class="col-main">

      <!-- Spending breakdown (always shown) -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">Spending breakdown</span>
          {#if $summary.totalExpenses > 0 && $summary.netIncome > 0}
            <span class="card-badge">{expenseRate}% of net income</span>
          {/if}
        </div>

        {#if $summary.totalExpenses > 0}
          <div class="chart-layout">
            <!-- Donut -->
            <div class="donut-wrap">
              <svg viewBox="0 0 160 160" width="160" height="160" class="donut-svg">
                <circle cx="80" cy="80" r={RADIUS} fill="none"
                  stroke="var(--surface-2)" stroke-width="18" />
                {#each donutSegments as seg}
                  <circle
                    cx="80" cy="80" r={RADIUS}
                    fill="none"
                    stroke={seg.color}
                    stroke-width={hoveredSeg === seg.name ? 22 : 18}
                    stroke-dasharray="{seg.dash} {CIRCUMFERENCE}"
                    stroke-dashoffset={seg.offset}
                    stroke-linecap="round"
                    transform="rotate(-90 80 80)"
                    style="transition: stroke-width 150ms, opacity 150ms; opacity:{hoveredSeg && hoveredSeg !== seg.name ? 0.3 : 1}; cursor:pointer"
                    on:mouseenter={() => { hoveredSeg = seg.name; }}
                    on:mouseleave={() => { hoveredSeg = null; }}
                  />
                {/each}
                {#if hoveredSeg}
                  {@const seg = donutSegments.find(s => s.name === hoveredSeg)}
                  {#if seg}
                    <text x="80" y="75" text-anchor="middle" class="donut-pct">{seg.pct}%</text>
                    <text x="80" y="93" text-anchor="middle" class="donut-name">{seg.name}</text>
                  {/if}
                {:else}
                  <text x="80" y="75" text-anchor="middle" class="donut-pct">{expenseRate}%</text>
                  <text x="80" y="93" text-anchor="middle" class="donut-name">of income</text>
                {/if}
              </svg>
            </div>

            <div class="category-list">
              {#each $summary.expensesByCat.filter(c => c.annual > 0) as cat}
                {@const pct = $summary.totalExpenses > 0 ? Math.round((cat.annual / $summary.totalExpenses) * 100) : 0}
                <a href="/budget/{cat.id}" class="cat-row"
                  on:mouseenter={() => { hoveredSeg = cat.name; }}
                  on:mouseleave={() => { hoveredSeg = null; }}
                  class:cat-row--active={hoveredSeg === cat.name}
                >
                  <span class="cat-dot" style="background:{cat.color}"></span>
                  <span class="cat-name">{cat.name}</span>
                  <div class="cat-bar-wrap">
                    <div class="cat-bar" style="width:{pct}%;background:{cat.color}"></div>
                  </div>
                  <span class="cat-pct">{pct}%</span>
                  <span class="cat-amount">{fmt(cat.annual, $periodMultiplier)}</span>
                </a>
              {/each}
            </div>
          </div>
        {:else}
          <div class="empty-breakdown">
            <div class="empty-donut">
              <svg viewBox="0 0 160 160" width="120" height="120">
                <circle cx="80" cy="80" r={RADIUS} fill="none" stroke="var(--surface-2)" stroke-width="18" stroke-dasharray="12 6" />
                <text x="80" y="76" text-anchor="middle" class="donut-pct" style="font-size:.85rem;fill:var(--fg-faint)">No</text>
                <text x="80" y="94" text-anchor="middle" class="donut-name">spending yet</text>
              </svg>
            </div>
            <div class="empty-breakdown-msg">
              <p>Add expenses to your budget to see a breakdown here.</p>
              <a href="/budget" class="empty-breakdown-link">Go to Budget →</a>
            </div>
          </div>
        {/if}
      </div>

    </div>

    <div class="col-side">

      <!-- Tax estimate -->
      {#if $summary.taxedGross > 0}
        <div class="card">
          <div class="card-header">
            <span class="card-title">Tax estimate</span>
            <select class="fy-select" bind:value={selectedFY}>
              {#each TAX_YEARS as fy}
                <option value={fy}>{fy}</option>
              {/each}
            </select>
          </div>
          <div class="tax-rows">
            <div class="tax-row">
              <span>Taxable gross</span>
              <span>{fmt($summary.taxedGross, $periodMultiplier)}</span>
            </div>
            <div class="tax-row neg">
              <span>Income tax</span>
              <span>–{fmt(fyTax.incomeTax, $periodMultiplier)}</span>
            </div>
            <div class="tax-row neg">
              <span>Medicare Levy</span>
              <span>–{fmt(fyTax.medicareLevy, $periodMultiplier)}</span>
            </div>
            {#if fyTax.lito > 0}
              <div class="tax-row pos">
                <span>LITO offset</span>
                <span>+{fmt(fyTax.lito, $periodMultiplier)}</span>
              </div>
            {/if}
            {#if $summary.taxFreeGross > 0}
              <div class="tax-row pos">
                <span>Tax-free income</span>
                <span>+{fmt($summary.taxFreeGross, $periodMultiplier)}</span>
              </div>
            {/if}
            <div class="tax-row tax-row--total">
              <span>Net take-home</span>
              <span class="pos">{fmt(fyTax.netIncome + $summary.taxFreeGross, $periodMultiplier)}</span>
            </div>
          </div>
        </div>
      {/if}

      <!-- Income sources -->
      {#if $categories.find(c => c.is_income)?.items?.length}
        <div class="card">
          <div class="card-header">
            <span class="card-title">Income sources</span>
          </div>
          <div class="income-list">
            {#each $categories.find(c => c.is_income)?.items?.filter(i => Number(i.amount) > 0) ?? [] as item}
              <div class="income-row">
                <span class="income-label">{item.label}</span>
                <span class="income-amount">{fmt(toAnnual(Number(item.amount), item.frequency as Frequency), $periodMultiplier)}</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}

    </div>
  </div>
</div>

<style>
  .page {
    padding: 2rem 2.5rem;
    width: 100%;
    box-sizing: border-box;
  }

  /* ── Header ── */
  .page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 1.75rem;
    gap: 1rem;
    flex-wrap: wrap;
  }

  h1 { font-size: 1.5rem; font-weight: 700; letter-spacing: -.025em; }
  .subtitle { font-size: .85rem; color: var(--fg-muted); margin-top: .2rem; }

  .period-tabs {
    display: flex;
    flex-wrap: wrap;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 3px;
    gap: 2px;
  }

  .period-tab {
    padding: .35rem .85rem;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--fg-muted);
    font-size: .8rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 120ms, color 120ms;
    font-family: inherit;
  }

  .period-tab:hover { color: var(--fg); }
  .period-tab.active {
    background: var(--surface);
    color: var(--fg);
    box-shadow: var(--shadow-xs);
    font-weight: 600;
  }

  /* ── Metrics strip ── */
  .metrics {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: .875rem;
    margin-bottom: 1.5rem;
  }

  @media (max-width: 780px) {
    .metrics { grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }
  }

  .metric {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1.1rem 1.25rem;
    box-shadow: var(--shadow-sm);
    display: flex;
    align-items: flex-start;
    gap: .875rem;
    transition: box-shadow 150ms;
  }

  .metric:hover { box-shadow: var(--shadow); }

  .metric--highlight { border-width: 1.5px; }
  .metric--pos { border-color: rgba(5,150,105,.35); }
  .metric--neg { border-color: rgba(220,38,38,.35); }

  .metric-icon {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: .85rem;
    flex-shrink: 0;
    margin-top: .05rem;
  }

  .metric-label {
    font-size: .7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .07em;
    color: var(--fg-muted);
    margin-bottom: .3rem;
  }

  .metric-value {
    font-size: 1.3rem;
    font-weight: 700;
    color: var(--fg);
    letter-spacing: -.02em;
    font-variant-numeric: tabular-nums;
  }

  .metric-sub {
    font-size: .72rem;
    font-weight: 500;
    margin-top: .2rem;
    opacity: .8;
  }

  /* ── Layout ── */
  .two-col {
    display: grid;
    grid-template-columns: 1fr 320px;
    gap: 1.25rem;
    align-items: start;
  }

  @media (max-width: 900px) {
    .two-col { grid-template-columns: 1fr; }
  }

  /* ── Cards ── */
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1.25rem 1.5rem;
    margin-bottom: 1.25rem;
    box-shadow: var(--shadow-sm);
  }

  .col-side .card { margin-bottom: 1.25rem; }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
  }

  .card-title {
    font-size: .75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .07em;
    color: var(--fg-muted);
  }

  .card-badge {
    font-size: .7rem;
    font-weight: 600;
    padding: .2rem .55rem;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 99px;
    color: var(--fg-muted);
  }

  /* ── FY select ── */
  .fy-select {
    font-size: .75rem;
    font-weight: 500;
    padding: .2rem .5rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--fg);
    cursor: pointer;
    font-family: inherit;
  }

  .fy-select:focus { outline: none; border-color: var(--accent); }

  /* ── Empty breakdown ── */
  .empty-breakdown {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    padding: .5rem 0 .25rem;
  }

  .empty-donut { flex-shrink: 0; opacity: .5; }

  .empty-breakdown-msg p {
    font-size: .875rem;
    color: var(--fg-muted);
    margin: 0 0 .6rem;
  }

  .empty-breakdown-link {
    font-size: .82rem;
    font-weight: 600;
    color: var(--accent);
    text-decoration: none;
  }

  .empty-breakdown-link:hover { text-decoration: underline; }

  /* ── Donut chart ── */
  .chart-layout {
    display: flex;
    gap: 1.5rem;
    align-items: flex-start;
  }

  .donut-wrap {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .donut-svg { overflow: visible; }

  .donut-pct {
    font-size: 1.1rem;
    font-weight: 700;
    fill: var(--fg);
    font-family: inherit;
  }

  .donut-name {
    font-size: .65rem;
    fill: var(--fg-muted);
    font-family: inherit;
  }

  /* ── Category list ── */
  .category-list { flex: 1; display: flex; flex-direction: column; gap: .1rem; }

  .cat-row {
    display: grid;
    grid-template-columns: 10px 1fr 80px 34px 90px;
    align-items: center;
    gap: .65rem;
    padding: .5rem .25rem;
    border-radius: 6px;
    text-decoration: none;
    transition: background 100ms;
  }

  .cat-row:hover, .cat-row--active { background: var(--surface-2); }

  .cat-dot {
    width: 10px;
    height: 10px;
    border-radius: 3px;
    flex-shrink: 0;
  }

  .cat-name {
    font-size: .875rem;
    color: var(--fg);
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .cat-bar-wrap {
    height: 5px;
    background: var(--surface-2);
    border-radius: 99px;
    overflow: hidden;
  }

  .cat-bar {
    height: 100%;
    border-radius: 99px;
    opacity: .7;
    transition: width 300ms var(--ease);
  }

  .cat-pct {
    font-size: .75rem;
    color: var(--fg-muted);
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .cat-amount {
    font-size: .875rem;
    font-weight: 600;
    color: var(--fg);
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  /* ── Tax ── */
  .tax-rows { display: flex; flex-direction: column; gap: .1rem; }

  .tax-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: .45rem 0;
    font-size: .875rem;
    color: var(--fg-muted);
    border-bottom: 1px solid var(--border-subtle, var(--surface-2));
  }

  .tax-row:last-child { border-bottom: none; }
  .tax-row.neg { color: var(--neg); }
  .tax-row.pos { color: var(--pos); }

  .tax-row--total {
    font-weight: 700;
    color: var(--fg);
    padding-top: .6rem;
    margin-top: .1rem;
    border-top: 2px solid var(--border) !important;
    border-bottom: none !important;
  }

  /* ── Income sources ── */
  .income-list { display: flex; flex-direction: column; gap: .1rem; }

  .income-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: .45rem 0;
    font-size: .875rem;
    border-bottom: 1px solid var(--border-subtle, var(--surface-2));
  }

  .income-row:last-child { border-bottom: none; }

  .income-label { color: var(--fg-muted); }
  .income-amount { font-weight: 600; color: var(--fg); font-variant-numeric: tabular-nums; }

  /* ── Colour classes ── */
  .pos { color: var(--pos); }
  .neg { color: var(--neg); }
</style>
