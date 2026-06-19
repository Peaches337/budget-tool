<script lang="ts">
  import { goto } from '$app/navigation';
  import type { Frequency, TaxTreatment } from '$lib/types.js';

  const FREQUENCIES: Frequency[] = ['weekly', 'fortnightly', 'monthly', 'quarterly', 'annually'];
  const FREQ_LABELS: Record<Frequency, string> = {
    weekly: 'Weekly', fortnightly: 'Fortnightly', monthly: 'Monthly',
    quarterly: 'Quarterly', annually: 'Annually'
  };

  type IncomeRow = { label: string; amount: number; frequency: Frequency; tax_treatment: TaxTreatment };
  type SubPatch  = { budget_item_id: string; amount: number; frequency: string };

  let step = 1;
  let tier: 1 | 2 = 1;
  let saving = false;

  // Step 1 — Household
  let adults = 1;
  let children = 0;

  // Step 2 — Income
  let incomeRows: IncomeRow[] = [
    { label: 'Income', amount: 0, frequency: 'annually', tax_treatment: 'taxable' }
  ];

  function addIncome() {
    incomeRows = [...incomeRows, { label: 'Income', amount: 0, frequency: 'annually', tax_treatment: 'taxable' }];
  }
  function removeIncome(i: number) {
    incomeRows = incomeRows.filter((_, idx) => idx !== i);
  }

  // Step 3 — Subscriptions
  type Tier = { id: string; tier_name: string; amount: number; frequency: string };
  let tierMap: Record<string, Tier[]> = {};
  let subPatches: SubPatch[] = [];
  let subItems: { id: string; label: string; service_key: string }[] = [];
  let subLoaded = false;

  async function loadSubs() {
    if (subLoaded) return;
    subLoaded = true;
    const res = await fetch('/api/subscription-tiers').then(r => r.json());
    if (res.ok) tierMap = res.data;
    // Also get seeded sub items
    const bres = await fetch('/api/budget/categories').then(r => r.json());
    if (bres.ok) {
      for (const cat of bres.data) {
        for (const item of cat.items ?? []) {
          if (item.service_key) subItems = [...subItems, { id: item.id, label: item.label, service_key: item.service_key }];
        }
      }
    }
  }

  function applySubTier(itemId: string, val: string) {
    if (!val) { subPatches = subPatches.filter(p => p.budget_item_id !== itemId); return; }
    const [amtStr, freq] = val.split('::');
    subPatches = [
      ...subPatches.filter(p => p.budget_item_id !== itemId),
      { budget_item_id: itemId, amount: parseFloat(amtStr), frequency: freq }
    ];
  }

  // Tier 2 — disabled categories
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

  async function goNext() {
    if (step === 2 && tier === 1) { step = 3; await loadSubs(); return; }
    if (step === 2 && tier === 2) { step = 3; await loadSubs(); return; }
    if (step < maxStep) step++;
  }

  $: maxStep = tier === 1 ? 4 : 5;

  async function finish() {
    saving = true;
    await fetch('/api/wizard/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        income_items: incomeRows,
        subscription_items: subPatches,
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
      <h1>Set up your budget</h1>
      <div class="step-dots">
        {#each Array(maxStep) as _, i}
          <span class="dot" class:active={i + 1 === step} class:done={i + 1 < step}></span>
        {/each}
      </div>
    </div>

    <!-- Tier select (step 1 preamble) -->
    {#if step === 1 && tier === 1}
      <div class="tier-select">
        <p class="hint">How detailed would you like to get?</p>
        <div class="tier-cards">
          <button class="tier-card" class:selected={tier === 1} on:click={() => { tier = 1; }}>
            <strong>Quick setup</strong>
            <span>5–7 min — income &amp; subscriptions only</span>
          </button>
          <button class="tier-card" on:click={() => { tier = 2; }}>
            <strong>Deep dive</strong>
            <span>15–25 min — all spending categories</span>
          </button>
        </div>
      </div>
    {/if}

    <!-- Step 1: Household -->
    {#if step === 1}
      <h2>Household</h2>
      <label>Adults
        <input type="number" min="1" max="10" bind:value={adults} />
      </label>
      <label>Children
        <input type="number" min="0" max="20" bind:value={children} />
      </label>
    {/if}

    <!-- Step 2: Income -->
    {#if step === 2}
      <h2>Income</h2>
      {#each incomeRows as row, i}
        <div class="income-row">
          <div class="income-header">
            <span class="income-num">Person {i + 1}</span>
            {#if i > 0}
              <button class="btn-remove" on:click={() => { removeIncome(i); }}>Remove</button>
            {/if}
          </div>
          <label>Label
            <input bind:value={row.label} placeholder="e.g. Full-time salary" />
          </label>
          <div class="row-pair">
            <label>Gross amount
              <input type="number" min="0" step="0.01" bind:value={row.amount} />
            </label>
            <label>Frequency
              <select bind:value={row.frequency}>
                {#each FREQUENCIES as f}
                  <option value={f}>{FREQ_LABELS[f]}</option>
                {/each}
              </select>
            </label>
          </div>
          <label>Tax treatment
            <select bind:value={row.tax_treatment}>
              <option value="taxable">Taxable — standard PAYG</option>
              <option value="tax_free">Tax free — e.g. ADF Reserves</option>
              <option value="already_taxed">Already taxed — withholding applied</option>
            </select>
          </label>
        </div>
      {/each}
      <button class="btn-add-income" on:click={() => { addIncome(); }}>+ Add employment</button>
    {/if}

    <!-- Step 3: Subscriptions -->
    {#if step === 3}
      <h2>Subscriptions</h2>
      <p class="hint">Pick a plan for each service, or skip.</p>
      {#if subItems.length === 0}
        <p class="muted">No subscription items in template.</p>
      {:else}
        {#each subItems as item}
          {@const tiers = tierMap[item.service_key] ?? []}
          <div class="sub-row">
            <span class="sub-label">{item.label}</span>
            <select on:change={(e) => { applySubTier(item.id, (e.target as HTMLSelectElement).value); }}>
              <option value="">Skip</option>
              {#each tiers as t}
                <option value="{t.amount}::{t.frequency}">{t.tier_name} — ${t.amount}/{t.frequency}</option>
              {/each}
            </select>
          </div>
        {/each}
      {/if}
    {/if}

    <!-- Step 4 (Tier 2 only): Category toggles -->
    {#if step === 4 && tier === 2}
      <h2>Categories</h2>
      <p class="hint">Toggle off any categories that don't apply to your household.</p>
      {#each TIER2_CATS as key}
        <div class="cat-toggle-row">
          <span>{CAT_LABELS[key]}</span>
          <button class="toggle" class:on={enabledCats.has(key)} on:click={() => { toggleCat(key); }}>
            {enabledCats.has(key) ? 'On' : 'Off'}
          </button>
        </div>
      {/each}
    {/if}

    <!-- Step 4 (Tier 1) or 5 (Tier 2): Summary -->
    {#if (tier === 1 && step === 4) || (tier === 2 && step === 5)}
      <h2>Summary</h2>
      <p class="hint">Your budget will be created with the following:</p>
      <ul>
        <li>{incomeRows.length} income {incomeRows.length === 1 ? 'source' : 'sources'}</li>
        <li>{subPatches.length} subscription {subPatches.length === 1 ? 'plan' : 'plans'} pre-filled</li>
        {#if tier === 2}
          <li>{TIER2_CATS.length - disabledCategories.length} of {TIER2_CATS.length} category groups enabled</li>
        {/if}
      </ul>
      <p class="hint">You can edit everything after setup.</p>
    {/if}

    <!-- Nav -->
    <div class="wiz-nav">
      <button class="btn-skip" on:click={() => { skip(); }}>Skip wizard</button>
      <div class="nav-right">
        {#if step > 1}
          <button class="btn-back" on:click={() => { step--; }}>Back</button>
        {/if}
        {#if (tier === 1 && step < 4) || (tier === 2 && step < 5)}
          <button class="btn-next" on:click={() => { goNext(); }}>Next</button>
        {:else}
          <button class="btn-finish" on:click={() => { finish(); }} disabled={saving}>
            {saving ? 'Saving…' : 'Create budget'}
          </button>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
.wizard-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--bg); padding: 2rem; }
.wizard-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 2rem 2.5rem; width: 100%; max-width: 560px; }

.wiz-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.75rem; }
.wiz-header h1 { font-size: 1.4rem; font-weight: 700; margin: 0; }
.step-dots { display: flex; gap: .4rem; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--border); transition: background .2s; }
.dot.active { background: var(--accent); }
.dot.done { background: #1D9E75; }

.tier-select { margin-bottom: 1.5rem; }
.tier-cards { display: grid; grid-template-columns: 1fr 1fr; gap: .75rem; margin-top: .75rem; }
.tier-card { background: var(--bg); border: 2px solid var(--border); border-radius: 8px; padding: .9rem; text-align: left; cursor: pointer; transition: border-color .15s; }
.tier-card:hover, .tier-card.selected { border-color: var(--accent); }
.tier-card strong { display: block; margin-bottom: .2rem; }
.tier-card span { font-size: .8rem; color: var(--text-muted); }

h2 { font-size: 1.1rem; font-weight: 700; margin: 0 0 1.25rem; }
label { display: block; font-size: .85rem; font-weight: 500; margin-bottom: .9rem; }
input, select { display: block; width: 100%; margin-top: .3rem; padding: .5rem .65rem; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text); font-size: .9rem; box-sizing: border-box; }

.income-row { border: 1px solid var(--border); border-radius: 8px; padding: 1rem; margin-bottom: .75rem; }
.income-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: .75rem; }
.income-num { font-weight: 600; font-size: .85rem; }
.row-pair { display: grid; grid-template-columns: 1fr 1fr; gap: .75rem; }
.btn-remove { font-size: .8rem; color: var(--text-muted); background: none; border: none; cursor: pointer; }
.btn-remove:hover { color: #E24B4A; }
.btn-add-income { padding: .45rem .9rem; background: none; border: 1px dashed var(--border); border-radius: 6px; cursor: pointer; color: var(--text-muted); font-size: .85rem; width: 100%; margin-top: .25rem; }
.btn-add-income:hover { border-color: var(--accent); color: var(--accent); }

.sub-row { display: flex; align-items: center; gap: .75rem; margin-bottom: .6rem; }
.sub-label { flex: 1; font-size: .9rem; }
.sub-row select { flex: 1.5; margin-top: 0; }

.cat-toggle-row { display: flex; justify-content: space-between; align-items: center; padding: .5rem 0; border-bottom: 1px solid var(--border); }
.toggle { padding: .3rem .75rem; border-radius: 99px; border: 1px solid var(--border); background: var(--bg); cursor: pointer; font-size: .8rem; color: var(--text-muted); transition: all .15s; }
.toggle.on { background: #1D9E75; border-color: #1D9E75; color: #fff; }

ul { padding-left: 1.25rem; margin: 0 0 1rem; }
li { margin-bottom: .35rem; font-size: .9rem; }

.wiz-nav { display: flex; justify-content: space-between; align-items: center; margin-top: 2rem; padding-top: 1.25rem; border-top: 1px solid var(--border); }
.nav-right { display: flex; gap: .75rem; }
.btn-skip { background: none; border: none; cursor: pointer; font-size: .85rem; color: var(--text-muted); }
.btn-skip:hover { color: var(--text); }
.btn-back { padding: .5rem 1rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; cursor: pointer; }
.btn-next, .btn-finish { padding: .5rem 1.25rem; background: var(--accent); color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; }
.btn-finish:disabled { opacity: .6; cursor: not-allowed; }
.hint { font-size: .85rem; color: var(--text-muted); margin: 0 0 1rem; }
.muted { color: var(--text-muted); font-size: .9rem; }
</style>
