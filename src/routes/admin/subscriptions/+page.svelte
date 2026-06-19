<script lang="ts">
  import { onMount } from 'svelte';
  import type { SubscriptionTier } from '$lib/types.js';

  type GroupedTiers = Record<string, SubscriptionTier[]>;

  let tiers: SubscriptionTier[] = [];
  let grouped: GroupedTiers = {};
  let loading = true;
  let error = '';

  // Add new service
  let newService = '';
  let newTierName = '';
  let newAmount = '';
  let newFrequency = 'monthly';
  let addingService = '';
  let newSvcTierName = '';
  let newSvcAmount = '';
  let newSvcFrequency = 'monthly';

  const FREQUENCIES = ['weekly','fortnightly','monthly','quarterly','annually'];

  onMount(async () => {
    await loadTiers();
  });

  async function loadTiers() {
    loading = true;
    const res = await fetch('/api/admin/subscription-tiers');
    const json = await res.json();
    if (json.ok) {
      tiers = json.data;
      grouped = tiers.reduce((g: GroupedTiers, t) => {
        if (!g[t.service]) g[t.service] = [];
        g[t.service].push(t);
        return g;
      }, {});
    }
    loading = false;
  }

  async function addTier(service: string) {
    if (!newSvcTierName.trim() || !newSvcAmount) return;
    const res = await fetch('/api/admin/subscription-tiers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service,
        tier_name: newSvcTierName.trim(),
        amount: parseFloat(newSvcAmount),
        frequency: newSvcFrequency,
        sort_order: (grouped[service]?.length ?? 0)
      })
    });
    const json = await res.json();
    if (json.ok) {
      newSvcTierName = '';
      newSvcAmount = '';
      newSvcFrequency = 'monthly';
      addingService = '';
      await loadTiers();
    }
  }

  async function addNewService() {
    if (!newService.trim() || !newTierName.trim() || !newAmount) return;
    const res = await fetch('/api/admin/subscription-tiers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service: newService.trim(),
        tier_name: newTierName.trim(),
        amount: parseFloat(newAmount),
        frequency: newFrequency,
        sort_order: 0
      })
    });
    const json = await res.json();
    if (json.ok) {
      newService = '';
      newTierName = '';
      newAmount = '';
      await loadTiers();
    } else {
      error = json.error;
    }
  }

  async function updateTier(id: string, field: string, value: string | number | boolean) {
    await fetch(`/api/admin/subscription-tiers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value })
    });
    await loadTiers();
  }

  async function deleteTier(id: string) {
    if (!confirm('Delete this pricing tier?')) return;
    await fetch(`/api/admin/subscription-tiers/${id}`, { method: 'DELETE' });
    await loadTiers();
  }
</script>

<div class="page">
  <div class="page-header">
    <h1>Subscription pricing</h1>
  </div>
  <p class="page-hint">
    Manage pricing tiers shown to users when they set up subscription items in their budget.
    These are pre-fills only — users can always override the amount.
  </p>

  {#if loading}
    <p class="muted">Loading…</p>
  {:else}

    {#each Object.entries(grouped) as [service, serviceTiers]}
      <div class="service-card">
        <div class="service-header">
          <h2>{service}</h2>
          <button
            class="btn-ghost"
            on:click={() => addingService = addingService === service ? '' : service}
          >
            + Add tier
          </button>
        </div>

        <div class="tiers-table">
          <div class="col-heads">
            <span>Plan name</span>
            <span>Amount</span>
            <span>Frequency</span>
            <span>Active</span>
            <span></span>
          </div>
          {#each serviceTiers as t}
            <div class="tier-row">
              <input
                type="text"
                class="f-label"
                value={t.tier_name}
                on:change={(e) => updateTier(t.id, 'tier_name', (e.target as HTMLInputElement).value)}
              />
              <div class="amount-wrap">
                <span class="dollar">$</span>
                <input
                  type="number"
                  class="f-amount"
                  min="0" step="0.01"
                  value={t.amount}
                  on:change={(e) => updateTier(t.id, 'amount', parseFloat((e.target as HTMLInputElement).value))}
                />
              </div>
              <select
                class="f-select"
                value={t.frequency}
                on:change={(e) => updateTier(t.id, 'frequency', (e.target as HTMLSelectElement).value)}
              >
                {#each FREQUENCIES as f}
                  <option value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>
                {/each}
              </select>
              <button
                class="toggle-btn"
                class:on={t.active}
                on:click={() => updateTier(t.id, 'active', !t.active)}
              >
                {t.active ? 'Yes' : 'No'}
              </button>
              <button class="del-btn" on:click={() => deleteTier(t.id)}>×</button>
            </div>
          {/each}

          {#if addingService === service}
            <div class="add-tier-row">
              <input type="text" class="f-label" placeholder="Plan name" bind:value={newSvcTierName} />
              <div class="amount-wrap">
                <span class="dollar">$</span>
                <input type="number" class="f-amount" min="0" step="0.01" placeholder="0.00" bind:value={newSvcAmount} />
              </div>
              <select class="f-select" bind:value={newSvcFrequency}>
                {#each FREQUENCIES as f}
                  <option value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>
                {/each}
              </select>
              <button
                class="btn-primary-sm"
                on:click={() => addTier(service)}
                disabled={!newSvcTierName.trim() || !newSvcAmount}
              >Add</button>
              <button class="del-btn" on:click={() => addingService = ''}>×</button>
            </div>
          {/if}
        </div>
      </div>
    {/each}

    <!-- Add new service -->
    <div class="card new-service-card">
      <h2>Add new service</h2>
      <div class="new-service-form">
        <input type="text" class="f-text" placeholder="Service name (e.g. Foxtel)" bind:value={newService} />
        <input type="text" class="f-text" placeholder="First tier name" bind:value={newTierName} />
        <div class="amount-wrap">
          <span class="dollar">$</span>
          <input type="number" class="f-amount-lg" min="0" step="0.01" placeholder="0.00" bind:value={newAmount} />
        </div>
        <select class="f-select" bind:value={newFrequency}>
          {#each FREQUENCIES as f}
            <option value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>
          {/each}
        </select>
        <button
          class="btn-primary"
          on:click={addNewService}
          disabled={!newService.trim() || !newTierName.trim() || !newAmount}
        >
          Add service
        </button>
      </div>
      {#if error}<div class="error">{error}</div>{/if}
    </div>

  {/if}
</div>

<style>
  .page { padding: 1.75rem 2rem; max-width: 860px; }
  .page-header { display: flex; align-items: center; gap: .75rem; margin-bottom: .4rem; }
  h1 { font-size: 1.1rem; font-weight: 600; }
  h2 { font-size: .9rem; font-weight: 600; }
  .page-hint { font-size: .82rem; color: var(--fg-muted); margin-bottom: 1.5rem; }
  .muted { color: var(--fg-muted); }
  .error { margin-top: .5rem; font-size: .8rem; color: var(--neg); }

  .card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 1.25rem;
    margin-bottom: .75rem; box-shadow: var(--shadow-sm);
  }

  .service-card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); margin-bottom: .75rem;
    box-shadow: var(--shadow-sm); overflow: hidden;
  }

  .service-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: .75rem 1rem; border-bottom: 1px solid var(--border);
    background: var(--surface-2);
  }

  .tiers-table { padding: .25rem 0; }

  .col-heads {
    display: grid;
    grid-template-columns: 1fr 120px 130px 60px 22px;
    gap: 8px; padding: .4rem 1rem;
    font-size: .67rem; font-weight: 600; text-transform: uppercase;
    letter-spacing: .07em; color: var(--fg-faint);
  }

  .tier-row, .add-tier-row {
    display: grid;
    grid-template-columns: 1fr 120px 130px 60px 22px;
    gap: 8px; align-items: center;
    padding: .35rem 1rem; border-bottom: 1px solid var(--border);
    transition: background 100ms;
  }
  .tier-row:hover { background: color-mix(in srgb, var(--accent) 3%, transparent); }
  .tier-row:last-of-type { border-bottom: none; }
  .add-tier-row { background: color-mix(in srgb, var(--accent) 5%, transparent); }

  .f-label {
    font-size: .875rem; border: none; background: transparent;
    color: var(--fg); width: 100%; outline: none; padding: 3px 4px; border-radius: 4px;
  }
  .f-label:focus { background: var(--surface-2); outline: 1.5px solid var(--accent); }

  .amount-wrap {
    display: flex; align-items: center;
    border: 1px solid transparent; border-radius: var(--radius-sm);
    background: var(--surface-2); overflow: hidden; transition: border-color 120ms;
  }
  .amount-wrap:focus-within { border-color: var(--accent); }

  .dollar { font-size: .78rem; color: var(--fg-faint); padding: 0 3px 0 6px; user-select: none; }

  .f-amount {
    flex: 1; font-size: .875rem; text-align: right;
    border: none; background: transparent; color: var(--fg);
    padding: 4px 6px 4px 0; outline: none; min-width: 0; width: 100%;
  }

  .f-select {
    font-size: .8rem; padding: .3rem .5rem;
    border: 1px solid var(--border); border-radius: var(--radius-sm);
    background: var(--surface); color: var(--fg); cursor: pointer; width: 100%;
  }

  .toggle-btn {
    padding: .2rem .5rem; font-size: .72rem; font-weight: 600;
    border-radius: 20px; border: 1px solid var(--border);
    background: var(--surface-2); color: var(--fg-muted); cursor: pointer;
  }
  .toggle-btn.on {
    background: color-mix(in srgb, var(--pos) 15%, transparent);
    color: var(--pos); border-color: color-mix(in srgb, var(--pos) 30%, transparent);
  }

  .del-btn {
    background: none; border: none; color: var(--fg-faint);
    cursor: pointer; font-size: 1rem; line-height: 1; padding: 3px 5px;
    border-radius: 4px; justify-self: center;
  }
  .del-btn:hover { color: var(--neg); background: rgba(226,75,74,.1); }

  .btn-ghost {
    padding: .3rem .7rem; font-size: .8rem; border: none;
    border-radius: var(--radius-sm); background: transparent; color: var(--fg-muted);
    cursor: pointer; transition: background 120ms, color 120ms;
  }
  .btn-ghost:hover { background: var(--border); color: var(--fg); }

  .btn-primary-sm {
    padding: .3rem .65rem; font-size: .78rem; background: var(--accent); color: #fff;
    border: none; border-radius: var(--radius-sm); cursor: pointer; white-space: nowrap;
  }
  .btn-primary-sm:disabled { opacity: .6; cursor: not-allowed; }

  /* New service form */
  .new-service-card { border-style: dashed; }
  .new-service-form { display: flex; gap: .5rem; flex-wrap: wrap; align-items: center; }

  .f-text {
    padding: .45rem .75rem; border: 1px solid var(--border);
    border-radius: var(--radius-sm); background: var(--surface-2);
    color: var(--fg); font-size: .875rem; flex: 1; min-width: 130px;
  }
  .f-text:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(99,102,241,.12); }

  .f-amount-lg {
    flex: 1; font-size: .875rem; text-align: right; border: none;
    background: transparent; color: var(--fg); padding: 4px 6px 4px 0; outline: none; min-width: 60px;
  }

  .btn-primary {
    padding: .5rem 1rem; background: var(--accent); color: #fff;
    border: none; border-radius: var(--radius-sm); font-size: .875rem;
    font-weight: 500; cursor: pointer; white-space: nowrap;
  }
  .btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
  .btn-primary:disabled { opacity: .6; cursor: not-allowed; }
</style>
