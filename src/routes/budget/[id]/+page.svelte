<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { categories, loadBudget, periodMultiplier, periodLabel, updateItem, addItem, deleteItem, updateCategory } from '$lib/stores/budget.js';
  import { fmt } from '$lib/utils.js';
  import { toAnnual } from '$lib/tax.js';
  import type { BudgetItem, Frequency, Visibility, IncomeActual, TaxTreatment } from '$lib/types.js';

  const FREQUENCIES: Frequency[] = ['weekly', 'fortnightly', 'monthly', 'quarterly', 'annually'];

  // Transaction actuals (monthly average per budget item, expenses)
  type ItemActual = { budget_item_id: string; monthly_avg: number; months_of_data: number; tx_count: number };
  let bankActuals: Record<string, ItemActual> = {};
  let bankActualsLoaded = false;
  let appliedActuals: Set<string> = new Set();

  // FY income actuals (per income budget item)
  type IncomeActualFY = { budget_item_id: string; fy_total: number; tx_count: number; fy_label: string };
  let incomeActuals: Record<string, IncomeActualFY> = {};
  let incomeActualsLoaded = false;
  const VISIBILITY_LABELS: Record<Visibility, string> = {
    private:     'Private',
    amount_only: 'Amount only',
    full:        'Full details'
  };

  $: id  = $page.params.id;
  $: cat = $categories.find(c => c.id === id);
  $: items = cat?.items ?? [];
  $: catTotal = items.reduce((s, i) => s + toAnnual(Number(i.amount), i.frequency as Frequency), 0);

  type Tier = { id: string; tier_name: string; amount: number; frequency: string };
  let tierMap: Record<string, Tier[]> = {};

  onMount(async () => {
    if ($categories.length === 0) await loadBudget();
    const [tiersRes, actualsRes, incomeActualsRes] = await Promise.all([
      fetch('/api/subscription-tiers').then(r => r.json()),
      fetch('/api/bank/item-actuals').then(r => r.json()).catch(() => ({ ok: false })),
      fetch('/api/bank/income-actuals').then(r => r.json()).catch(() => ({ ok: false }))
    ]);
    if (tiersRes.ok) tierMap = tiersRes.data;
    if (actualsRes.ok) {
      bankActuals = Object.fromEntries(actualsRes.data.map((a: ItemActual) => [a.budget_item_id, a]));
      bankActualsLoaded = true;
    }
    if (incomeActualsRes.ok) {
      incomeActuals = Object.fromEntries(incomeActualsRes.data.map((a: IncomeActualFY) => [a.budget_item_id, a]));
      incomeActualsLoaded = true;
    }
  });

  function applyActual(item: BudgetItem, monthlyAvg: number) {
    const annualAmt = monthlyAvg * 12;
    const freqDivisors: Record<Frequency, number> = {
      weekly: 52, fortnightly: 26, monthly: 12, quarterly: 4, annually: 1
    };
    const divisor = freqDivisors[item.frequency as Frequency] ?? 12;
    const newAmount = Math.round((annualAmt / divisor) * 100) / 100;
    appliedActuals = new Set([...appliedActuals, item.id]);
    updateItem(item.id, { amount: newAmount });
  }

  function removeActual(item: BudgetItem) {
    appliedActuals = new Set([...appliedActuals].filter(id => id !== item.id));
    updateItem(item.id, { amount: 0 });
  }

  function applyIncomeActual(item: BudgetItem, fyTotal: number) {
    const freqDivisors: Record<Frequency, number> = {
      weekly: 52, fortnightly: 26, monthly: 12, quarterly: 4, annually: 1
    };
    const divisor = freqDivisors[item.frequency as Frequency] ?? 1;
    const newAmount = Math.round((fyTotal / divisor) * 100) / 100;
    appliedActuals = new Set([...appliedActuals, item.id]);
    updateItem(item.id, { amount: newAmount });
  }

  function tiersForItem(item: BudgetItem): Tier[] {
    return item.service_key ? (tierMap[item.service_key] ?? []) : [];
  }

  function applyTier(item: BudgetItem, val: string) {
    if (!val) return;
    const [amtStr, freq] = val.split('::');
    updateItem(item.id, { amount: parseFloat(amtStr), frequency: freq as Frequency });
  }

  function itemAnnual(item: BudgetItem): number {
    return toAnnual(Number(item.amount), item.frequency as Frequency);
  }

  function onLabelChange(item: BudgetItem, e: Event) {
    updateItem(item.id, { label: (e.target as HTMLInputElement).value });
  }

  function onAmountChange(item: BudgetItem, e: Event) {
    updateItem(item.id, { amount: parseFloat((e.target as HTMLInputElement).value) || 0 });
  }

  function onFreqChange(item: BudgetItem, e: Event) {
    updateItem(item.id, { frequency: (e.target as HTMLSelectElement).value as Frequency });
  }

  function onTaxableChange(item: BudgetItem, e: Event) {
    updateItem(item.id, { taxable: (e.target as HTMLSelectElement).value as 'taxed' | 'taxfree' });
  }

  function onTaxTreatmentChange(item: BudgetItem, e: Event) {
    const v = (e.target as HTMLSelectElement).value as TaxTreatment;
    updateItem(item.id, { tax_treatment: v });
  }

  // ── Irregular income ──────────────────────────────────────────────────────
  let expandedActuals: Record<string, boolean> = {};
  let actuals: Record<string, IncomeActual[]> = {};
  let newActual: Record<string, { paid_on: string; amount: number; notes: string }> = {};

  async function toggleActuals(item: BudgetItem) {
    expandedActuals[item.id] = !expandedActuals[item.id];
    expandedActuals = { ...expandedActuals };
    if (expandedActuals[item.id] && !actuals[item.id]) {
      const res = await fetch(`/api/budget/items/${item.id}/actuals`).then(r => r.json());
      if (res.ok) actuals = { ...actuals, [item.id]: res.data };
    }
  }

  async function addActual(item: BudgetItem) {
    const form = newActual[item.id];
    if (!form?.paid_on || !form?.amount) return;
    const res = await fetch(`/api/budget/items/${item.id}/actuals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    }).then(r => r.json());
    if (res.ok) {
      actuals = { ...actuals, [item.id]: [res.data, ...(actuals[item.id] ?? [])] };
      newActual = { ...newActual, [item.id]: { paid_on: '', amount: 0, notes: '' } };
    }
  }

  async function deleteActual(item: BudgetItem, actualId: string) {
    await fetch(`/api/budget/items/${item.id}/actuals/${actualId}`, { method: 'DELETE' });
    actuals = { ...actuals, [item.id]: actuals[item.id].filter(a => a.id !== actualId) };
  }

  function rollingAvg(item: BudgetItem): number | null {
    const list = actuals[item.id];
    if (!list?.length) return null;
    const months = item.rolling_avg_months ?? 3;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    const recent = list.filter(a => new Date(a.paid_on) >= cutoff);
    if (!recent.length) return null;
    const sum = recent.reduce((s, a) => s + Number(a.amount), 0);
    return (sum / months) * 12; // annualise
  }

  function nudgePct(item: BudgetItem): number | null {
    const avg = rollingAvg(item);
    if (avg === null || !item.declared_annual) return null;
    return Math.round(((avg - item.declared_annual) / item.declared_annual) * 100);
  }

  async function dismissNudge(item: BudgetItem) {
    await fetch(`/api/budget/items/${item.id}/dismiss-nudge`, { method: 'POST' });
    updateItem(item.id, { nudge_dismissed_until: new Date(Date.now() + 30 * 864e5).toISOString() });
  }

  function isNudgeDismissed(item: BudgetItem): boolean {
    if (!item.nudge_dismissed_until) return false;
    return new Date(item.nudge_dismissed_until) > new Date();
  }

  function onVisibilityChange(e: Event) {
    if (!cat) return;
    updateCategory(cat.id, { visibility: (e.target as HTMLSelectElement).value as Visibility });
  }
</script>

{#if cat}
  <div class="page">
    <!-- Page header -->
    <div class="page-header">
      <div class="header-left">
        <div class="cat-badge" style="background: color-mix(in srgb, {cat.color} 15%, transparent); border-color: color-mix(in srgb, {cat.color} 30%, transparent)">
          <span class="cat-dot" style="background:{cat.color}"></span>
          <span class="cat-name">{cat.name}</span>
        </div>
        <div class="cat-total-pill">
          {fmt(catTotal, $periodMultiplier)}
          <span class="period-label">/ {$periodLabel.toLowerCase()}</span>
        </div>
      </div>

      <div class="header-right">
        <label class="share-label" for="visibility-{cat.id}">Sharing</label>
        <select
          id="visibility-{cat.id}"
          class="share-select"
          value={cat.visibility}
          on:change={onVisibilityChange}
        >
          {#each Object.entries(VISIBILITY_LABELS) as [val, label]}
            <option value={val}>{label}</option>
          {/each}
        </select>
      </div>
    </div>

    <!-- Items card -->
    <div class="card">
      <!-- Column headers -->
      <div class="col-heads" class:has-taxable={cat.is_income}>
        <span>Item</span>
        <span class="r">Amount</span>
        <span>Frequency</span>
        {#if cat.is_income}<span>Tax</span>{/if}
        <span class="r">{$periodLabel}</span>
        <span></span>
      </div>

      <!-- Rows -->
      {#each items as item (item.id)}
        {@const tiers = tiersForItem(item)}
        <div class="item-row" class:has-taxable={cat.is_income}>
          <div class="label-col">
            <input
              class="f-label"
              type="text"
              value={item.label}
              on:change={e => onLabelChange(item, e)}
            />
            {#if tiers.length > 0}
              <select
                class="f-plan"
                value=""
                on:change={(e) => { applyTier(item, (e.target as HTMLSelectElement).value); (e.target as HTMLSelectElement).value = ''; }}
                title="Pick a plan to pre-fill amount"
              >
                <option value="">Pick plan…</option>
                {#each tiers as t}
                  <option value="{t.amount}::{t.frequency}">{t.tier_name} — ${t.amount}/{t.frequency}</option>
                {/each}
              </select>
            {/if}
          </div>
          <div class="amount-wrap">
            <span class="dollar">$</span>
            <input
              class="f-amount"
              type="number"
              min="0"
              step="0.01"
              placeholder="—"
              value={item.amount || ''}
              on:change={e => onAmountChange(item, e)}
            />
          </div>
          <select class="f-select" value={item.frequency} on:change={e => onFreqChange(item, e)}>
            {#each FREQUENCIES as f}
              <option value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>
            {/each}
          </select>
          {#if cat.is_income}
            <select class="f-select f-select--sm" value={item.tax_treatment ?? (item.taxable === 'taxfree' ? 'tax_free' : 'taxable')} on:change={e => onTaxTreatmentChange(item, e)}>
              <option value="taxable">Taxable</option>
              <option value="tax_free">Tax-free</option>
              <option value="already_taxed">Already taxed</option>
            </select>
          {/if}
          <span class="f-period r">
            {itemAnnual(item) > 0 ? fmt(itemAnnual(item), $periodMultiplier) : '–'}
          </span>
          <button class="del-btn" on:click={() => deleteItem(item.id, cat.id)} aria-label="Delete">
            ×
          </button>
        </div>

        {#if incomeActualsLoaded && incomeActuals[item.id] && cat.is_income}
          {@const a = incomeActuals[item.id]}
          {@const applied = appliedActuals.has(item.id)}
          <div class="actual-hint actual-hint--income" class:actual-hint--applied={applied}>
            <span class="actual-hint-label">
              Actual income <span class="actual-hint-period">({a.fy_label})</span>
            </span>
            <span class="actual-hint-amount">{fmt(a.fy_total)}/yr</span>
            {#if applied}
              <button
                class="actual-hint-apply actual-hint-remove"
                title="Undo applied actual"
                on:click={() => removeActual(item)}
              >✓ Applied — Undo</button>
            {:else}
              <button
                class="actual-hint-apply"
                title="Use this as your budget amount"
                on:click={() => applyIncomeActual(item, a.fy_total)}
              >Use actual</button>
            {/if}
          </div>
        {/if}

        {#if bankActualsLoaded && bankActuals[item.id] && !cat.is_income}
          {@const a = bankActuals[item.id]}
          {@const applied = appliedActuals.has(item.id)}
          <div class="actual-hint" class:actual-hint--applied={applied}>
            <span class="actual-hint-label">
              Avg spend <span class="actual-hint-period">({a.months_of_data} mo)</span>
            </span>
            <span class="actual-hint-amount">{fmt(a.monthly_avg)}/mo</span>
            {#if applied}
              <button
                class="actual-hint-apply actual-hint-remove"
                title="Remove applied average"
                on:click={() => removeActual(item)}
              >✓ Applied — Undo</button>
            {:else}
              <button
                class="actual-hint-apply"
                title="Apply this average as your budget amount"
                on:click={() => applyActual(item, a.monthly_avg)}
              >Apply</button>
            {/if}
          </div>
        {/if}

        {#if cat.is_income}
          <!-- Irregular income section -->
          <div class="irr-row" class:irr-row--active={item.is_irregular}>
            <label class="irr-toggle">
              <span class="irr-toggle-track" class:on={item.is_irregular}>
                <input type="checkbox" checked={item.is_irregular} class="irr-hidden-check"
                  on:change={(e) => { updateItem(item.id, { is_irregular: (e.target as HTMLInputElement).checked }); }} />
                <span class="irr-toggle-thumb"></span>
              </span>
              <span class="irr-toggle-label">Irregular income</span>
            </label>

            {#if item.is_irregular}
              <div class="irr-controls">
                <div class="irr-field">
                  <span class="irr-field-label">Annual estimate</span>
                  <div class="irr-amount-wrap">
                    <span class="dollar">$</span>
                    <input class="f-amount irr-amount" type="number" min="0" step="0.01" placeholder="0"
                      value={item.declared_annual ?? ''}
                      on:change={(e) => { updateItem(item.id, { declared_annual: parseFloat((e.target as HTMLInputElement).value) || null }); }} />
                  </div>
                </div>
                <div class="irr-field">
                  <span class="irr-field-label">Avg window</span>
                  <select class="f-select irr-select" value={item.rolling_avg_months ?? 3}
                    on:change={(e) => { updateItem(item.id, { rolling_avg_months: parseInt((e.target as HTMLSelectElement).value) }); }}>
                    <option value={1}>1 month</option>
                    <option value={3}>3 months</option>
                    <option value={6}>6 months</option>
                    <option value={12}>12 months</option>
                  </select>
                </div>
                <button class="btn-log-payments" on:click={() => { toggleActuals(item); }}>
                  {expandedActuals[item.id] ? '▴ Hide payments' : '▾ Log payments'}
                </button>
              </div>

              <!-- Nudge banner -->
              {#if nudgePct(item) !== null && !isNudgeDismissed(item)}
                {@const pct = nudgePct(item)!}
                <div class="irr-nudge {pct > 0 ? 'irr-nudge--up' : 'irr-nudge--down'}">
                  <span class="irr-nudge-icon">{pct > 0 ? '↑' : '↓'}</span>
                  <span>{item.label} is running <strong>{Math.abs(pct)}% {pct > 0 ? 'above' : 'below'}</strong> your estimate</span>
                  <button class="irr-nudge-dismiss" on:click={() => { dismissNudge(item); }}>Dismiss</button>
                </div>
              {/if}

              <!-- Payments log panel -->
              {#if expandedActuals[item.id]}
                <div class="actuals-panel">
                  <div class="actuals-add">
                    <input type="date" class="f-date"
                      value={newActual[item.id]?.paid_on ?? ''}
                      on:change={(e) => { newActual = { ...newActual, [item.id]: { ...(newActual[item.id] ?? {}), paid_on: (e.target as HTMLInputElement).value, amount: newActual[item.id]?.amount ?? 0, notes: newActual[item.id]?.notes ?? '' } }; }} />
                    <div class="amount-wrap">
                      <span class="dollar">$</span>
                      <input class="f-amount" type="number" min="0" step="0.01" placeholder="Amount"
                        value={newActual[item.id]?.amount ?? ''}
                        on:change={(e) => { newActual = { ...newActual, [item.id]: { ...(newActual[item.id] ?? {}), amount: parseFloat((e.target as HTMLInputElement).value) || 0, paid_on: newActual[item.id]?.paid_on ?? '', notes: newActual[item.id]?.notes ?? '' } }; }} />
                    </div>
                    <input class="f-notes" placeholder="Notes (optional)"
                      value={newActual[item.id]?.notes ?? ''}
                      on:change={(e) => { newActual = { ...newActual, [item.id]: { ...(newActual[item.id] ?? {}), notes: (e.target as HTMLInputElement).value, paid_on: newActual[item.id]?.paid_on ?? '', amount: newActual[item.id]?.amount ?? 0 } }; }} />
                    <button class="btn-add-actual" on:click={() => { addActual(item); }}>Add</button>
                  </div>
                  {#if (actuals[item.id] ?? []).length === 0}
                    <p class="actuals-empty">No payments logged yet.</p>
                  {:else}
                    {#each actuals[item.id] ?? [] as actual}
                      <div class="actual-row">
                        <span class="actual-date">{new Date(actual.paid_on).toLocaleDateString('en-AU')}</span>
                        <span class="actual-amount">{fmt(Number(actual.amount))}</span>
                        {#if actual.notes}<span class="actual-notes">{actual.notes}</span>{/if}
                        <button class="del-btn" on:click={() => { deleteActual(item, actual.id); }}>×</button>
                      </div>
                    {/each}
                  {/if}
                </div>
              {/if}
            {/if}
          </div>
        {/if}
      {/each}

      {#if items.length === 0}
        <div class="empty-rows">No items yet — add one below.</div>
      {/if}

      <button class="add-btn" on:click={() => addItem(cat.id)}>
        + add item
      </button>
    </div>
  </div>
{:else}
  <div class="no-cat">Select a category.</div>
{/if}

<style>
  .page {
    padding: 2rem 2.5rem;
    max-width: 860px;
  }

  /* ── Header ── */
  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: .75rem;
    margin-bottom: 1.25rem;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: .75rem;
    flex-wrap: wrap;
  }

  .cat-badge {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: .35rem .8rem .35rem .6rem;
    border: 1px solid;
    border-radius: 20px;
    font-size: .9rem;
    font-weight: 600;
    color: var(--fg);
  }

  .cat-dot {
    width: 8px;
    height: 8px;
    border-radius: 2px;
    flex-shrink: 0;
  }

  .cat-total-pill {
    font-size: .9rem;
    font-weight: 600;
    color: var(--fg);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: .35rem .85rem;
  }

  .period-label {
    font-weight: 400;
    color: var(--fg-muted);
    font-size: .8rem;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: .5rem;
  }

  .share-label {
    font-size: .78rem;
    color: var(--fg-muted);
    font-weight: 500;
  }

  .share-select {
    font-size: .8rem;
    padding: .35rem .65rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--fg);
    cursor: pointer;
  }

  /* ── Card ── */
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    overflow: hidden;
  }

  /* ── Column heads ── */
  .col-heads {
    display: grid;
    grid-template-columns: 1fr 110px 130px 80px 18px;
    gap: 8px;
    align-items: center;
    padding: .65rem 1.25rem;
    border-bottom: 1px solid var(--border);
    background: var(--surface-2);
    font-size: .65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .08em;
    color: var(--fg-faint);
  }

  .col-heads.has-taxable {
    grid-template-columns: 1fr 110px 140px 100px 80px 18px;
  }

  /* ── Rows ── */
  .item-row {
    display: grid;
    grid-template-columns: 1fr 110px 130px 80px 18px;
    gap: 8px;
    align-items: center;
    padding: .5rem 1.25rem;
    border-bottom: 1px solid var(--border-subtle, var(--border));
    transition: background 100ms;
  }

  .item-row:last-of-type { border-bottom: none; }
  .item-row:hover { background: var(--surface-2); }

  .item-row.has-taxable {
    grid-template-columns: 1fr 110px 140px 100px 80px 18px;
  }

  /* ── Fields ── */
  .label-col {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .f-label {
    font-size: .875rem;
    border: none;
    background: transparent;
    color: var(--fg);
    width: 100%;
    outline: none;
    padding: 3px 4px;
    border-radius: 4px;
    transition: background 120ms;
  }

  .f-label:focus {
    background: var(--surface-2);
    outline: 1.5px solid var(--accent);
  }

  .f-plan {
    font-size: .72rem;
    padding: 2px .4rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, #8b5cf6 8%, var(--surface));
    color: #8b5cf6;
    cursor: pointer;
    width: fit-content;
    max-width: 100%;
  }

  .f-plan:focus { outline: none; border-color: #8b5cf6; }

  .amount-wrap {
    display: flex;
    align-items: center;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    overflow: hidden;
    transition: border-color 120ms;
  }

  .amount-wrap:focus-within {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px rgba(99,102,241,.12);
  }

  .dollar {
    font-size: .8rem;
    color: var(--fg-faint);
    padding: 0 4px 0 7px;
    user-select: none;
  }

  .f-amount {
    flex: 1;
    font-size: .875rem;
    text-align: right;
    border: none;
    background: transparent;
    color: var(--fg);
    padding: 4px 7px 4px 0;
    width: 100%;
    outline: none;
    min-width: 0;
    font-variant-numeric: tabular-nums;
  }

  .f-select {
    font-size: .8rem;
    padding: .3rem .5rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--fg);
    cursor: pointer;
    width: 100%;
    transition: border-color 120ms;
  }

  .f-select:focus { outline: none; border-color: var(--accent); }
  .f-select--sm { font-size: .75rem; }

  .f-period {
    font-size: .8rem;
    color: var(--fg-muted);
    font-variant-numeric: tabular-nums;
  }

  .r { text-align: right; }

  .del-btn {
    background: none;
    border: none;
    color: var(--fg-faint);
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
    padding: 3px 5px;
    border-radius: 4px;
    transition: color 120ms, background 120ms;
    justify-self: center;
  }

  .del-btn:hover {
    color: var(--neg);
    background: rgba(226,75,74,.1);
  }

  /* ── Footer ── */
  .empty-rows {
    padding: 1.25rem 1rem;
    font-size: .85rem;
    color: var(--fg-faint);
    text-align: center;
  }

  .add-btn {
    display: block;
    width: 100%;
    padding: .65rem 1rem;
    background: none;
    border: none;
    border-top: 1px dashed var(--border);
    color: var(--fg-faint);
    font-size: .85rem;
    text-align: left;
    cursor: pointer;
    transition: background 120ms, color 120ms;
  }

  .add-btn:hover {
    background: var(--surface-2);
    color: var(--fg);
  }

  .no-cat {
    padding: 2rem;
    color: var(--fg-muted);
    font-size: .875rem;
  }

  /* ── Irregular income ── */
  .irr-row {
    padding: .3rem 1.25rem .35rem;
    background: var(--surface-2);
    border-bottom: 1px solid var(--border-subtle, var(--border));
    display: flex;
    flex-direction: column;
    gap: .5rem;
  }

  .irr-row--active {
    background: color-mix(in srgb, var(--accent) 4%, var(--surface-2));
    border-left: 2px solid var(--accent);
    padding-left: calc(1.25rem - 2px);
  }

  .irr-toggle {
    display: flex;
    align-items: center;
    gap: .5rem;
    cursor: pointer;
    user-select: none;
    width: fit-content;
  }

  /* Custom toggle switch */
  .irr-toggle-track {
    position: relative;
    width: 28px;
    height: 16px;
    border-radius: 99px;
    background: var(--border);
    transition: background 150ms;
    flex-shrink: 0;
    display: block;
  }

  .irr-toggle-track.on { background: var(--accent); }

  .irr-hidden-check {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }

  .irr-toggle-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #fff;
    transition: left 150ms;
    box-shadow: 0 1px 3px rgba(0,0,0,.2);
  }

  .irr-toggle-track.on .irr-toggle-thumb { left: 14px; }

  .irr-toggle-label {
    font-size: .75rem;
    color: var(--fg-muted);
    font-weight: 500;
  }

  .irr-row--active .irr-toggle-label { color: var(--fg); }

  .irr-controls {
    display: flex;
    align-items: center;
    gap: .75rem;
    flex-wrap: wrap;
  }

  .irr-field {
    display: flex;
    align-items: center;
    gap: .4rem;
  }

  .irr-field-label {
    font-size: .72rem;
    font-weight: 500;
    color: var(--fg-muted);
    white-space: nowrap;
  }

  .irr-amount-wrap {
    display: flex;
    align-items: center;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    width: 110px;
    transition: border-color 120ms;
  }

  .irr-amount-wrap:focus-within { border-color: var(--accent); }

  .irr-amount { width: 80px; font-size: .8rem; }

  .irr-select { font-size: .75rem; padding: .2rem .4rem; width: auto; }

  .btn-log-payments {
    font-size: .72rem;
    padding: .2rem .65rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    cursor: pointer;
    color: var(--fg-muted);
    margin-left: auto;
    transition: all 120ms;
    white-space: nowrap;
  }

  .btn-log-payments:hover {
    border-color: var(--accent);
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 6%, var(--surface));
  }

  /* Nudge banner */
  .irr-nudge {
    display: flex;
    align-items: center;
    gap: .6rem;
    padding: .4rem .7rem;
    border-radius: var(--radius-sm);
    font-size: .78rem;
  }

  .irr-nudge--up {
    background: color-mix(in srgb, #1D9E75 10%, transparent);
    border: 1px solid color-mix(in srgb, #1D9E75 25%, transparent);
    color: #1D9E75;
  }

  .irr-nudge--down {
    background: color-mix(in srgb, #E24B4A 10%, transparent);
    border: 1px solid color-mix(in srgb, #E24B4A 25%, transparent);
    color: #E24B4A;
  }

  .irr-nudge-icon { font-weight: 700; flex-shrink: 0; }
  .irr-nudge strong { font-weight: 600; }

  .irr-nudge-dismiss {
    margin-left: auto;
    background: none;
    border: 1px solid currentColor;
    border-radius: 4px;
    padding: .1rem .45rem;
    font-size: .72rem;
    cursor: pointer;
    color: inherit;
    opacity: .7;
    white-space: nowrap;
    transition: opacity 120ms;
  }

  .irr-nudge-dismiss:hover { opacity: 1; }

  /* Payments log */
  .actuals-panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: .65rem .85rem .75rem;
  }

  .actuals-empty {
    font-size: .8rem;
    color: var(--fg-faint);
    text-align: center;
    padding: .5rem 0;
    margin: 0;
  }

  .actuals-add {
    display: flex;
    gap: .5rem;
    margin-bottom: .6rem;
    align-items: center;
    flex-wrap: wrap;
  }

  .f-date {
    font-size: .8rem;
    padding: .3rem .5rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--fg);
  }

  .f-notes {
    flex: 1;
    min-width: 100px;
    font-size: .8rem;
    padding: .3rem .5rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--fg);
  }

  .btn-add-actual {
    padding: .3rem .75rem;
    background: var(--accent);
    color: #fff;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: .8rem;
  }

  .actual-row {
    display: flex;
    gap: .75rem;
    align-items: center;
    font-size: .8rem;
    padding: .25rem 0;
    border-bottom: 1px solid var(--border);
  }

  .actual-row:last-child { border-bottom: none; }
  .actual-date { color: var(--fg-muted); min-width: 80px; }
  .actual-amount { font-weight: 600; min-width: 80px; }
  .actual-notes { flex: 1; }
  .muted { color: var(--fg-muted); }

  /* Transaction average hint */
  .actual-hint {
    display: flex;
    align-items: center;
    gap: .6rem;
    padding: .3rem .75rem .3rem 1rem;
    background: color-mix(in srgb, var(--accent) 6%, transparent);
    border-left: 2px solid var(--accent);
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
    margin: .15rem 0 .4rem;
    font-size: .78rem;
  }

  .actual-hint-label { color: var(--fg-muted); }
  .actual-hint-period { font-size: .72rem; }
  .actual-hint-amount { font-weight: 600; color: var(--fg); margin-left: auto; }

  .actual-hint-apply {
    padding: .15rem .55rem;
    font-size: .75rem;
    font-weight: 600;
    background: var(--accent);
    color: #fff;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: opacity 120ms;
    white-space: nowrap;
  }
  .actual-hint-apply:hover { opacity: .85; }
  .actual-hint--applied { background: color-mix(in srgb, var(--accent) 6%, transparent); }
  .actual-hint-remove {
    background: transparent;
    color: var(--accent);
    border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
  }
  .actual-hint-remove:hover { background: color-mix(in srgb, var(--accent) 10%, transparent); opacity: 1; }
  .actual-hint--income { border-left: 2px solid color-mix(in srgb, var(--accent) 50%, transparent); }
</style>
