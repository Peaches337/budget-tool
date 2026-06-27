<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import type { Frequency, TaxTreatment } from '$lib/types.js';

  const FREQUENCIES: Frequency[] = ['weekly', 'fortnightly', 'monthly', 'quarterly', 'annually'];
  const FREQ_LABELS: Record<Frequency, string> = {
    weekly: 'Weekly', fortnightly: 'Fortnightly', monthly: 'Monthly',
    quarterly: 'Quarterly', annually: 'Annually'
  };

  type IncomeRow = { label: string; amount: number; frequency: Frequency; tax_treatment: TaxTreatment };
  type SubPatch  = { budget_item_id: string; amount: number; frequency: string; tier_name: string };

  let step = 1;
  let tier: 1 | 2 = 1;
  let saving = false;
  let seeded = false;

  // Step 1 — Income
  let incomeRows: IncomeRow[] = [
    { label: 'Salary', amount: 0, frequency: 'annually', tax_treatment: 'taxable' }
  ];

  function addIncome() {
    incomeRows = [...incomeRows, { label: 'Income', amount: 0, frequency: 'annually', tax_treatment: 'taxable' }];
  }
  function removeIncome(i: number) {
    incomeRows = incomeRows.filter((_, idx) => idx !== i);
  }

  // Step 2 — Subscriptions
  type Tier = { id: string; tier_name: string; amount: number; frequency: string };
  let tierMap: Record<string, Tier[]> = {};
  let subPatches: SubPatch[] = [];
  let subItems: { id: string; label: string; service_key: string }[] = [];
  let subLoaded = false;
  let subLoading = false;

  // Seed the budget on mount so sub items are available when user reaches step 2
  onMount(async () => {
    const res = await fetch('/api/budget/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template_id: '00000000-0000-0000-0000-000000000001' })
    });
    seeded = res.ok || res.status === 409;
  });

  async function loadSubs() {
    if (subLoaded) return;
    subLoaded = true;
    subLoading = true;
    const [tiersRes, catsRes] = await Promise.all([
      fetch('/api/subscription-tiers').then(r => r.json()),
      fetch('/api/budget/categories').then(r => r.json())
    ]);
    if (tiersRes.ok) tierMap = tiersRes.data;
    if (catsRes.ok) {
      for (const cat of catsRes.data) {
        for (const item of cat.items ?? []) {
          if (item.service_key) subItems = [...subItems, { id: item.id, label: item.label, service_key: item.service_key }];
        }
      }
    }
    subLoading = false;
  }

  function applySubTier(itemId: string, val: string, tierName: string) {
    if (!val) { subPatches = subPatches.filter(p => p.budget_item_id !== itemId); return; }
    const [amtStr, freq] = val.split('::');
    subPatches = [
      ...subPatches.filter(p => p.budget_item_id !== itemId),
      { budget_item_id: itemId, amount: parseFloat(amtStr), frequency: freq, tier_name: tierName }
    ];
  }

  function getSelectedTier(itemId: string): string {
    const p = subPatches.find(p => p.budget_item_id === itemId);
    return p ? `${p.amount}::${p.frequency}` : '';
  }

  // Tier 2 — category toggles + spending amounts
  const TIER2_CATS = ['housing', 'utilities', 'transport', 'groceries', 'health', 'debt', 'children', 'savings'];
  const CAT_LABELS: Record<string, string> = {
    housing: 'Housing', utilities: 'Utilities', transport: 'Transport',
    groceries: 'Groceries & Dining', health: 'Health & Medical',
    debt: 'Debt Repayments', children: 'Children', savings: 'Savings Goals'
  };
  let enabledCats = new Set(TIER2_CATS);

  function toggleCat(key: string) {
    const s = new Set(enabledCats);
    if (s.has(key)) s.delete(key); else s.add(key);
    enabledCats = s;
  }

  $: disabledCategories = TIER2_CATS.filter(k => !enabledCats.has(k));

  // Tier 2 spending — full category/item amounts
  type SpendingCat = { id: string; name: string; canonical_key: string | null; items: SpendingItem[] };
  type SpendingItem = { id: string; label: string; amount: number; frequency: string; service_key: string | null };
  let spendingCats: SpendingCat[] = [];
  let spendingLoaded = false;
  let spendingLoading = false;
  let spendingCatIndex = 0; // which category we're entering amounts for

  async function loadSpending() {
    if (spendingLoaded) return;
    spendingLoaded = true;
    spendingLoading = true;
    const res = await fetch('/api/budget/categories').then(r => r.json());
    if (res.ok) {
      spendingCats = res.data
        .filter((c: any) => !c.is_income)
        .map((c: any) => ({
          id: c.id,
          name: c.name,
          canonical_key: c.canonical_key ?? null,
          items: (c.items ?? []).map((i: any) => ({
            id: i.id,
            label: i.label,
            amount: i.amount ?? 0,
            frequency: i.frequency ?? 'monthly',
            service_key: i.service_key ?? null
          }))
        }));
    }
    spendingLoading = false;
  }

  $: activeCat = spendingCats[spendingCatIndex] ?? null;
  $: enabledSpendingCats = spendingCats.filter(c => !c.canonical_key || enabledCats.has(c.canonical_key));
  $: activeEnabledCat = enabledSpendingCats[spendingCatIndex] ?? null;

  function spendingNext() {
    if (spendingCatIndex < enabledSpendingCats.length - 1) { spendingCatIndex++; }
    else { step++; }
  }
  function spendingBack() {
    if (spendingCatIndex > 0) { spendingCatIndex--; }
    else { step--; }
  }

  // tier 2: 5 steps — income, subs, spending, summary
  $: maxStep = tier === 1 ? 3 : 4;

  async function goNext() {
    if (step === 1) { step = 2; await loadSubs(); return; }
    if (step === 2 && tier === 2) { step = 3; await loadSpending(); spendingCatIndex = 0; return; }
    if (step < maxStep) step++;
  }

  async function finish() {
    saving = true;
    // Collect non-zero spending patches from tier 2 category step
    const spendingPatches = spendingCats.flatMap(c =>
      c.items.filter(i => i.amount > 0).map(i => ({
        budget_item_id: i.id, amount: i.amount, frequency: i.frequency
      }))
    );
    await fetch('/api/wizard/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        income_items: incomeRows,
        subscription_items: [...subPatches.map(({ tier_name: _, ...p }) => p), ...spendingPatches],
        disabled_categories: disabledCategories
      })
    });
    saving = false;
    goto('/budget');
  }

  async function skip() {
    await fetch('/api/wizard/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ income_items: [], subscription_items: [], disabled_categories: [] })
    });
    goto('/budget');
  }
</script>

<div class="wizard-wrap">
  <div class="wizard-card">
    <!-- Header -->
    <div class="wiz-header">
      <div class="wiz-logo"><span class="logo-mark">$</span><span class="logo-text">Skint</span></div>
      <div class="step-track">
        {#each Array(maxStep) as _, i}
          <div class="step-pip" class:active={i + 1 === step} class:done={i + 1 < step}>
            {#if i + 1 < step}✓{:else}{i + 1}{/if}
          </div>
          {#if i < maxStep - 1}<div class="step-line" class:done={i + 1 < step}></div>{/if}
        {/each}
      </div>
    </div>

    <!-- Step 1: Setup type + Income -->
    {#if step === 1}
      <div class="section-block">
        <h2>How detailed would you like to get?</h2>
        <div class="tier-cards">
          <button class="tier-card" class:selected={tier === 1} on:click={() => { tier = 1; }}>
            <strong>Quick setup</strong>
            <span>Income &amp; subscriptions only — 5 min</span>
          </button>
          <button class="tier-card" class:selected={tier === 2} on:click={() => { tier = 2; }}>
            <strong>Full budget</strong>
            <span>All spending categories — 15 min</span>
          </button>
        </div>
      </div>

      <div class="section-block">
        <h2>Your income</h2>
        <p class="hint">Enter your gross income. Tax is calculated automatically.</p>
        {#each incomeRows as row, i}
          <div class="income-row">
            <div class="income-header">
              <span class="income-num">{i === 0 ? 'Primary income' : `Income source ${i + 1}`}</span>
              {#if i > 0}
                <button class="btn-remove" on:click={() => { removeIncome(i); }}>Remove</button>
              {/if}
            </div>
            <label class="field-label">Description
              <input class="field-input" bind:value={row.label} placeholder="e.g. Full-time salary" />
            </label>
            <div class="row-pair">
              <label class="field-label">Gross amount
                <div class="input-prefix"><span>$</span><input class="field-input prefix" type="number" min="0" step="1" bind:value={row.amount} /></div>
              </label>
              <label class="field-label">Frequency
                <select class="field-input" bind:value={row.frequency}>
                  {#each FREQUENCIES as f}
                    <option value={f}>{FREQ_LABELS[f]}</option>
                  {/each}
                </select>
              </label>
            </div>
            <label class="field-label">Tax treatment
              <select class="field-input" bind:value={row.tax_treatment}>
                <option value="taxable">Taxable — standard PAYG</option>
                <option value="tax_free">Tax free — e.g. ADF Reserves</option>
                <option value="already_taxed">Already taxed — withholding applied</option>
              </select>
            </label>
          </div>
        {/each}
        <button class="btn-add-income" on:click={() => { addIncome(); }}>+ Add another income source</button>
      </div>
    {/if}

    <!-- Step 2: Subscriptions -->
    {#if step === 2}
      <div class="section-block">
        <h2>Subscriptions</h2>
        <p class="hint">Select the plan you're on for each service. You can change these later.</p>
        {#if subLoading}
          <p class="loading-msg">Loading…</p>
        {:else if subItems.length === 0}
          <p class="hint">No subscription services in your template.</p>
        {:else}
          <div class="sub-list">
            {#each subItems as item}
              {@const tiers = tierMap[item.service_key] ?? []}
              {@const selected = getSelectedTier(item.id)}
              <div class="sub-row" class:has-plan={!!selected}>
                <div class="sub-info">
                  <span class="sub-name">{item.label}</span>
                  {#if selected}
                    {@const patch = subPatches.find(p => p.budget_item_id === item.id)}
                    <span class="sub-selected-plan">{patch?.tier_name}</span>
                  {/if}
                </div>
                <select class="sub-select" value={selected}
                  on:change={(e) => {
                    const val = (e.target as HTMLSelectElement).value;
                    const t = tiers.find(t => `${t.amount}::${t.frequency}` === val);
                    applySubTier(item.id, val, t?.tier_name ?? '');
                  }}>
                  <option value="">Not subscribed</option>
                  {#each tiers as t}
                    <option value="{t.amount}::{t.frequency}">{t.tier_name} — ${t.amount}/{t.frequency}</option>
                  {/each}
                </select>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Step 3 (Tier 2 only): Spending amounts per category -->
    {#if step === 3 && tier === 2}
      <div class="section-block">
        {#if spendingLoading}
          <p class="hint">Loading categories…</p>
        {:else if activeEnabledCat}
          <div class="spending-header">
            <h2>{activeEnabledCat.name}</h2>
            <span class="spending-progress">{spendingCatIndex + 1} of {enabledSpendingCats.length}</span>
          </div>
          <p class="hint">Enter your expected spending for each item. Leave at 0 to skip.</p>
          {#each activeEnabledCat.items.filter(i => !i.service_key) as item}
            <div class="spending-item">
              <span class="spending-item-label">{item.label}</span>
              <div class="spending-item-inputs">
                <div class="input-prefix sm">
                  <span>$</span>
                  <input class="field-input prefix" type="number" min="0" step="1"
                    bind:value={item.amount} placeholder="0" />
                </div>
                <select class="field-input sm" bind:value={item.frequency}>
                  {#each FREQUENCIES as f}
                    <option value={f}>{FREQ_LABELS[f]}</option>
                  {/each}
                </select>
              </div>
            </div>
          {/each}
          {#if activeEnabledCat.items.filter(i => !i.service_key).length === 0}
            <p class="hint">No manual items in this category — subscriptions are handled separately.</p>
          {/if}
        {/if}
      </div>
    {/if}

    <!-- Summary step -->
    {#if (tier === 1 && step === 3) || (tier === 2 && step === 4)}
      <div class="section-block">
        <h2>Ready to go</h2>
        <p class="hint">Your budget will be set up with:</p>
        <div class="summary-list">
          <div class="summary-row">
            <span class="summary-label">Income sources</span>
            <span class="summary-val">{incomeRows.filter(r => r.amount > 0).length}</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">Subscriptions pre-filled</span>
            <span class="summary-val">{subPatches.length}</span>
          </div>
          {#if tier === 2}
            {@const filledSpending = spendingCats.flatMap(c => c.items).filter(i => i.amount > 0).length}
            <div class="summary-row">
              <span class="summary-label">Spending items filled</span>
              <span class="summary-val">{filledSpending}</span>
            </div>
          {/if}
        </div>
        <p class="hint" style="margin-top:.75rem">Everything can be adjusted after setup.</p>
      </div>
    {/if}

    <!-- Nav -->
    <div class="wiz-nav">
      <button class="btn-skip" on:click={() => { skip(); }}>Skip setup</button>
      <div class="nav-right">
        {#if step === 3 && tier === 2}
          <button class="btn-back" on:click={() => { spendingBack(); }}>Back</button>
          {#if spendingCatIndex < enabledSpendingCats.length - 1}
            <button class="btn-next" on:click={() => { spendingNext(); }}>Next</button>
          {:else}
            <button class="btn-next" on:click={() => { spendingNext(); }}>Continue</button>
          {/if}
        {:else}
          {#if step > 1}
            <button class="btn-back" on:click={() => { step--; }}>Back</button>
          {/if}
          {#if (tier === 1 && step < 3) || (tier === 2 && step < 4)}
            <button class="btn-next" on:click={() => { goNext(); }}>Next</button>
          {:else}
            <button class="btn-finish" on:click={() => { finish(); }} disabled={saving}>
              {saving ? 'Setting up…' : 'Create my budget'}
            </button>
          {/if}
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
.wizard-wrap {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg);
  padding: 2rem 1rem;
}
.wizard-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 2rem 2.5rem 1.75rem;
  width: 100%;
  max-width: 580px;
  box-shadow: 0 4px 24px rgba(0,0,0,.15);
}

/* Header */
.wiz-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  padding-bottom: 1.25rem;
  border-bottom: 1px solid var(--border);
}
.wiz-logo { display: flex; align-items: center; gap: .5rem; }
.logo-mark {
  width: 30px; height: 30px; background: var(--accent); color: #fff;
  border-radius: 7px; display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 1rem;
}
.logo-text { font-weight: 700; font-size: .95rem; color: var(--fg); }

/* Step tracker */
.step-track { display: flex; align-items: center; gap: 0; }
.step-pip {
  width: 26px; height: 26px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: .72rem; font-weight: 600;
  background: var(--surface-2); color: var(--fg-muted);
  border: 2px solid var(--border);
  transition: all .2s;
}
.step-pip.active { background: var(--accent); color: #fff; border-color: var(--accent); }
.step-pip.done { background: #1D9E75; color: #fff; border-color: #1D9E75; font-size: .65rem; }
.step-line { width: 28px; height: 2px; background: var(--border); }
.step-line.done { background: #1D9E75; }

/* Sections */
.section-block { margin-bottom: 1.75rem; }
.section-block:last-of-type { margin-bottom: 0; }
h2 { font-size: 1.05rem; font-weight: 700; color: var(--fg); margin: 0 0 .6rem; }

/* Tier cards */
.tier-cards { display: grid; grid-template-columns: 1fr 1fr; gap: .75rem; margin-top: .75rem; }
.tier-card {
  background: var(--surface-2);
  border: 2px solid var(--border);
  border-radius: 10px;
  padding: 1rem;
  text-align: left;
  cursor: pointer;
  transition: border-color .15s, background .15s;
  color: var(--fg);
}
.tier-card:hover { border-color: color-mix(in srgb, var(--accent) 50%, transparent); }
.tier-card.selected { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, var(--surface-2)); }
.tier-card strong { display: block; margin-bottom: .3rem; font-size: .9rem; }
.tier-card span { font-size: .78rem; color: var(--fg-muted); }

/* Income */
.income-row {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 1.1rem 1.25rem;
  margin-bottom: .75rem;
}
.income-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 1rem;
}
.income-num { font-weight: 600; font-size: .85rem; color: var(--fg); }
.btn-remove { font-size: .8rem; color: var(--fg-muted); background: none; border: none; cursor: pointer; padding: 0; }
.btn-remove:hover { color: #E24B4A; }

.field-label { display: block; font-size: .8rem; font-weight: 500; color: var(--fg-muted); margin-bottom: .8rem; }
.field-input {
  display: block; width: 100%; margin-top: .3rem;
  padding: .55rem .75rem;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--bg);
  color: var(--fg);
  font-size: .88rem;
  box-sizing: border-box;
  transition: border-color .15s;
}
.field-input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 15%, transparent); }

.input-prefix { display: flex; align-items: center; margin-top: .3rem; border: 1px solid var(--border); border-radius: 7px; background: var(--bg); overflow: hidden; transition: border-color .15s; }
.input-prefix:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 15%, transparent); }
.input-prefix span { padding: .55rem .65rem; font-size: .85rem; color: var(--fg-muted); background: var(--surface-2); border-right: 1px solid var(--border); }
.input-prefix .field-input.prefix { border: none; border-radius: 0; margin-top: 0; box-shadow: none; flex: 1; }
.input-prefix .field-input.prefix:focus { box-shadow: none; }

.row-pair { display: grid; grid-template-columns: 1fr 1fr; gap: .75rem; }
.btn-add-income {
  width: 100%; padding: .6rem;
  background: none; border: 1.5px dashed var(--border);
  border-radius: 8px; cursor: pointer;
  color: var(--fg-muted); font-size: .85rem;
  transition: all .15s;
}
.btn-add-income:hover { border-color: var(--accent); color: var(--accent); }

/* Subscriptions */
.sub-list { display: flex; flex-direction: column; gap: .5rem; }
.sub-row {
  display: flex; align-items: center; justify-content: space-between; gap: 1rem;
  padding: .75rem 1rem;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  transition: border-color .15s;
}
.sub-row.has-plan { border-color: color-mix(in srgb, var(--accent) 40%, transparent); }
.sub-info { display: flex; flex-direction: column; gap: .15rem; min-width: 0; }
.sub-name { font-size: .9rem; font-weight: 500; color: var(--fg); }
.sub-selected-plan { font-size: .75rem; color: var(--accent); }
.sub-select {
  flex-shrink: 0; min-width: 180px;
  padding: .45rem .65rem;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--bg);
  color: var(--fg);
  font-size: .83rem;
  cursor: pointer;
}
.sub-select:focus { outline: none; border-color: var(--accent); }
.loading-msg { color: var(--fg-muted); font-size: .9rem; padding: 1rem 0; }

/* Category toggles */
.cat-toggle-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: .65rem 0;
  border-bottom: 1px solid var(--border);
}
.cat-toggle-row:last-child { border-bottom: none; }
.cat-label { font-size: .9rem; color: var(--fg); }
.toggle {
  padding: .3rem .85rem; border-radius: 99px;
  border: 1px solid var(--border);
  background: var(--surface-2); cursor: pointer;
  font-size: .78rem; color: var(--fg-muted);
  transition: all .15s;
}
.toggle.on { background: #1D9E75; border-color: #1D9E75; color: #fff; }

/* Summary */
.summary-list { border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.summary-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: .7rem 1rem;
  border-bottom: 1px solid var(--border);
  font-size: .9rem;
}
.summary-row:last-child { border-bottom: none; }
.summary-label { color: var(--fg-muted); }
.summary-val { font-weight: 600; color: var(--fg); }

/* Nav */
.wiz-nav {
  display: flex; justify-content: space-between; align-items: center;
  margin-top: 1.75rem; padding-top: 1.25rem;
  border-top: 1px solid var(--border);
}
.nav-right { display: flex; gap: .6rem; }
.btn-skip {
  background: none; border: none; cursor: pointer;
  font-size: .83rem; color: var(--fg-muted); padding: 0;
}
.btn-skip:hover { color: var(--fg); }
.btn-back {
  padding: .5rem 1rem;
  background: var(--surface-2); border: 1px solid var(--border);
  border-radius: 7px; cursor: pointer; font-size: .88rem; color: var(--fg);
}
.btn-back:hover { border-color: var(--fg-muted); }
.btn-next, .btn-finish {
  padding: .5rem 1.4rem;
  background: var(--accent); color: #fff;
  border: none; border-radius: 7px;
  cursor: pointer; font-weight: 600; font-size: .88rem;
  transition: opacity .15s;
}
.btn-next:hover, .btn-finish:hover { opacity: .88; }
.btn-finish:disabled { opacity: .5; cursor: not-allowed; }

.hint { font-size: .82rem; color: var(--fg-muted); margin: 0 0 1rem; }

/* Spending step */
.spending-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: .6rem; }
.spending-progress { font-size: .78rem; color: var(--fg-muted); }
.spending-item {
  display: flex; align-items: center; justify-content: space-between; gap: 1rem;
  padding: .6rem 0; border-bottom: 1px solid var(--border);
}
.spending-item:last-child { border-bottom: none; }
.spending-item-label { font-size: .88rem; color: var(--fg); flex: 1; }
.spending-item-inputs { display: flex; gap: .5rem; align-items: center; flex-shrink: 0; }
.input-prefix.sm { margin-top: 0; }
.field-input.sm { padding: .4rem .55rem; font-size: .83rem; width: 90px; }
select.field-input.sm { width: 110px; }
</style>
