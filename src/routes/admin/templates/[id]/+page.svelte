<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import type { TemplateCategory, TemplateItem } from '$lib/types.js';

  $: id = $page.params.id;

  type FullTemplate = {
    id: string;
    name: string;
    description: string | null;
    is_default: boolean;
    visibility: string;
    categories: (TemplateCategory & { items: TemplateItem[] })[];
  };

  let template: FullTemplate | null = null;
  let loading = true;
  let saving = false;
  let error = '';

  // Inline edit state
  let editName = '';
  let editDesc = '';
  let editVisibility = '';

  // New category form
  let newCatName = '';
  let newCatColor = '#6366f1';
  let newCatIsIncome = false;
  let addingCat = false;

  const COLORS = [
    '#6366f1','#0ea5e9','#10b981','#f59e0b','#ef4444',
    '#8b5cf6','#ec4899','#14b8a6','#f97316','#84cc16',
    '#1D9E75','#378ADD','#7F77DD','#D4537E','#BA7517',
    '#E24B4A','#888780','#639922',
  ];

  const FREQUENCIES = ['weekly','fortnightly','monthly','quarterly','annually'];

  onMount(async () => {
    await loadTemplate();
  });

  async function loadTemplate() {
    loading = true;
    const res = await fetch(`/api/admin/templates/${id}`);
    const json = await res.json();
    if (json.ok) {
      template = json.data;
      editName = json.data.name;
      editDesc = json.data.description ?? '';
      editVisibility = json.data.visibility;
    }
    loading = false;
  }

  async function saveHeader() {
    if (!template) return;
    saving = true;
    const res = await fetch(`/api/admin/templates/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName, description: editDesc || null, visibility: editVisibility })
    });
    const json = await res.json();
    if (json.ok) {
      template = { ...template, name: editName, description: editDesc || null, visibility: editVisibility };
    } else {
      error = json.error;
    }
    saving = false;
  }

  async function addCategory() {
    if (!newCatName.trim() || !template) return;
    addingCat = true;
    const res = await fetch(`/api/admin/templates/${id}/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newCatName.trim(),
        color: newCatColor,
        is_income: newCatIsIncome,
        sort_order: template.categories.length
      })
    });
    const json = await res.json();
    if (json.ok) {
      newCatName = '';
      newCatIsIncome = false;
      await loadTemplate();
    }
    addingCat = false;
  }

  async function updateCategory(catId: string, field: string, value: unknown) {
    await fetch(`/api/admin/templates/${id}/categories/${catId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value })
    });
    await loadTemplate();
  }

  async function deleteCategory(catId: string) {
    if (!confirm('Delete this category and all its items?')) return;
    await fetch(`/api/admin/templates/${id}/categories/${catId}`, { method: 'DELETE' });
    await loadTemplate();
  }

  async function addItem(catId: string) {
    await fetch(`/api/admin/templates/${id}/categories/${catId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: 'New item', frequency: 'monthly', taxable: 'taxfree' })
    });
    await loadTemplate();
  }

  async function updateItem(catId: string, itemId: string, field: string, value: string) {
    await fetch(`/api/admin/templates/${id}/categories/${catId}/items/${itemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value })
    });
  }

  async function deleteItem(catId: string, itemId: string) {
    await fetch(`/api/admin/templates/${id}/categories/${catId}/items/${itemId}`, { method: 'DELETE' });
    await loadTemplate();
  }
</script>

{#if loading}
  <div class="page"><p class="muted">Loading…</p></div>
{:else if !template}
  <div class="page"><p class="muted">Template not found.</p></div>
{:else}

<div class="page">
  <div class="back-row">
    <a href="/admin/templates" class="back-link">← Templates</a>
  </div>

  <!-- Template header editor -->
  <div class="card header-card">
    <div class="header-fields">
      <div class="field-wrap">
        <label>Name</label>
        <input type="text" bind:value={editName} class="f-text" />
      </div>
      <div class="field-wrap" style="flex:2">
        <label>Description</label>
        <input type="text" bind:value={editDesc} class="f-text" placeholder="Optional" />
      </div>
      <div class="field-wrap">
        <label>Visibility</label>
        <select bind:value={editVisibility} class="f-select">
          <option value="public">Public</option>
          <option value="household">Household</option>
          <option value="private">Private</option>
        </select>
      </div>
      <button class="btn-primary" on:click={saveHeader} disabled={saving}>
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
    {#if error}<div class="error">{error}</div>{/if}
  </div>

  <!-- Categories -->
  {#each template.categories as cat}
    <div class="cat-card">
      <div class="cat-header">
        <div class="cat-header-left">
          <input
            type="color"
            class="color-swatch"
            value={cat.color}
            on:change={(e) => updateCategory(cat.id, 'color', (e.target as HTMLInputElement).value)}
            title="Category colour"
          />
          <input
            type="text"
            class="cat-name-input"
            value={cat.name}
            on:change={(e) => updateCategory(cat.id, 'name', (e.target as HTMLInputElement).value)}
          />
          <span class="cat-meta">{cat.is_income ? 'Income' : 'Expense'}</span>
          <span class="cat-meta">{cat.items.length} items</span>
          <input
            type="text"
            class="cat-key-input"
            value={cat.canonical_key ?? ''}
            placeholder="canonical_key"
            title="Canonical key for household mapping (e.g. groceries)"
            on:change={(e) => updateCategory(cat.id, 'canonical_key', (e.target as HTMLInputElement).value || null)}
          />
        </div>
        <button class="del-cat-btn" on:click={() => deleteCategory(cat.id)} title="Delete category">
          Delete
        </button>
      </div>

      <!-- Items -->
      <div class="items-table">
        <div class="col-heads" class:has-income={cat.is_income}>
          <span>Label</span>
          <span>Frequency</span>
          {#if cat.is_income}<span>Tax</span>{/if}
          <span>Service key</span>
          <span></span>
        </div>
        {#each cat.items as item (item.id)}
          <div class="item-row" class:has-income={cat.is_income}>
            <input
              type="text"
              class="f-label"
              value={item.label}
              on:change={(e) => updateItem(cat.id, item.id, 'label', (e.target as HTMLInputElement).value)}
            />
            <select
              class="f-select"
              value={item.frequency}
              on:change={(e) => updateItem(cat.id, item.id, 'frequency', (e.target as HTMLSelectElement).value)}
            >
              {#each FREQUENCIES as f}
                <option value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>
              {/each}
            </select>
            {#if cat.is_income}
              <select
                class="f-select"
                value={item.taxable}
                on:change={(e) => updateItem(cat.id, item.id, 'taxable', (e.target as HTMLSelectElement).value)}
              >
                <option value="taxed">Taxable</option>
                <option value="taxfree">Tax-free</option>
              </select>
            {/if}
            <input
              type="text"
              class="f-service"
              value={item.service_key ?? ''}
              placeholder="e.g. Netflix"
              on:change={(e) => updateItem(cat.id, item.id, 'service_key', (e.target as HTMLInputElement).value || '')}
            />
            <button class="del-btn" on:click={() => deleteItem(cat.id, item.id)}>×</button>
          </div>
        {/each}
        <button class="add-item-btn" on:click={() => addItem(cat.id)}>+ add item</button>
      </div>
    </div>
  {/each}

  <!-- Add category -->
  <div class="card add-cat-card">
    <h2>Add category</h2>
    <div class="add-cat-form">
      <input
        type="text"
        class="f-text"
        placeholder="Category name"
        bind:value={newCatName}
      />
      <div class="color-row">
        {#each COLORS as c}
          <button
            type="button"
            class="color-btn"
            class:selected={newCatColor === c}
            style="background:{c}"
            on:click={() => newCatColor = c}
            title={c}
          ></button>
        {/each}
      </div>
      <label class="income-check">
        <input type="checkbox" bind:checked={newCatIsIncome} />
        Income category
      </label>
      <button class="btn-primary" on:click={addCategory} disabled={addingCat || !newCatName.trim()}>
        {addingCat ? 'Adding…' : 'Add category'}
      </button>
    </div>
  </div>
</div>

{/if}

<style>
  .page { padding: 1.75rem 2rem; max-width: 900px; }

  .back-row { margin-bottom: 1rem; }
  .back-link { font-size: .82rem; color: var(--fg-muted); text-decoration: none; }
  .back-link:hover { color: var(--accent); }

  .muted { color: var(--fg-muted); font-size: .875rem; }
  .error { margin-top: .5rem; font-size: .8rem; color: var(--neg); }

  .card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 1.25rem;
    margin-bottom: 1rem; box-shadow: var(--shadow-sm);
  }

  h2 { font-size: .875rem; font-weight: 600; margin-bottom: .75rem; }

  /* Header card */
  .header-fields {
    display: flex; gap: .75rem; align-items: flex-end; flex-wrap: wrap;
  }
  .field-wrap { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 120px; }
  .field-wrap label { font-size: .72rem; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: var(--fg-faint); }

  .f-text {
    padding: .45rem .75rem; border: 1px solid var(--border);
    border-radius: var(--radius-sm); background: var(--surface-2);
    color: var(--fg); font-size: .875rem;
  }
  .f-text:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(99,102,241,.12); }

  .f-select {
    padding: .45rem .65rem; border: 1px solid var(--border);
    border-radius: var(--radius-sm); background: var(--surface-2);
    color: var(--fg); font-size: .875rem; cursor: pointer;
  }
  .f-select:focus { outline: none; border-color: var(--accent); }

  /* Category cards */
  .cat-card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); margin-bottom: .75rem;
    box-shadow: var(--shadow-sm); overflow: hidden;
  }

  .cat-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: .75rem 1rem; border-bottom: 1px solid var(--border);
    background: var(--surface-2);
  }

  .cat-header-left { display: flex; align-items: center; gap: .6rem; }

  .color-swatch {
    width: 28px; height: 28px; border-radius: 6px;
    border: 2px solid var(--border); cursor: pointer; padding: 0;
  }

  .cat-name-input {
    font-size: .9rem; font-weight: 600; border: none;
    background: transparent; color: var(--fg);
    outline: none; padding: 3px 6px; border-radius: 4px;
    min-width: 120px;
  }
  .cat-name-input:focus { background: var(--surface); outline: 1.5px solid var(--accent); }

  .cat-meta { font-size: .72rem; color: var(--fg-faint); }

  .cat-key-input {
    font-size: .72rem; border: 1px solid transparent;
    background: transparent; color: var(--fg-muted);
    outline: none; padding: 2px 5px; border-radius: 4px;
    font-family: monospace; min-width: 140px;
  }
  .cat-key-input:focus { background: var(--surface); border-color: var(--accent); outline: none; }
  .cat-key-input::placeholder { font-style: italic; }

  .del-cat-btn {
    padding: .25rem .65rem; font-size: .75rem;
    border: 1px solid color-mix(in srgb, var(--neg) 40%, transparent);
    border-radius: var(--radius-sm); background: transparent;
    color: var(--neg); cursor: pointer;
  }
  .del-cat-btn:hover { background: color-mix(in srgb, var(--neg) 10%, transparent); }

  /* Items table */
  .items-table { padding: .25rem 0; }

  .col-heads {
    display: grid;
    grid-template-columns: 1fr 130px 80px 18px;
    gap: 8px; padding: .4rem 1rem;
    font-size: .67rem; font-weight: 600; text-transform: uppercase;
    letter-spacing: .07em; color: var(--fg-faint);
  }

  .col-heads.has-income {
    grid-template-columns: 1fr 130px 90px 80px 18px;
  }

  .item-row {
    display: grid;
    grid-template-columns: 1fr 130px 80px 18px;
    gap: 8px; align-items: center;
    padding: .35rem 1rem; border-bottom: 1px solid var(--border);
    transition: background 100ms;
  }

  .item-row:hover { background: color-mix(in srgb, var(--accent) 3%, transparent); }
  .item-row:last-of-type { border-bottom: none; }

  .item-row.has-income {
    grid-template-columns: 1fr 130px 90px 80px 18px;
  }

  .f-label {
    font-size: .875rem; border: none; background: transparent;
    color: var(--fg); width: 100%; outline: none; padding: 3px 4px;
    border-radius: 4px;
  }
  .f-label:focus { background: var(--surface-2); outline: 1.5px solid var(--accent); }

  .f-service {
    font-size: .78rem; border: 1px solid transparent;
    background: transparent; color: var(--fg-muted); width: 100%;
    outline: none; padding: 3px 4px; border-radius: 4px;
    font-family: monospace;
  }
  .f-service:focus { background: var(--surface-2); border-color: var(--accent); outline: none; }
  .f-service::placeholder { font-style: italic; }

  .del-btn {
    background: none; border: none; color: var(--fg-faint);
    cursor: pointer; font-size: 1rem; line-height: 1; padding: 3px 5px;
    border-radius: 4px; transition: color 120ms, background 120ms;
    justify-self: center;
  }
  .del-btn:hover { color: var(--neg); background: rgba(226,75,74,.1); }

  .add-item-btn {
    display: block; width: 100%; padding: .55rem 1rem;
    background: none; border: none; border-top: 1px dashed var(--border);
    color: var(--fg-faint); font-size: .82rem; text-align: left;
    cursor: pointer; transition: background 120ms, color 120ms;
  }
  .add-item-btn:hover { background: var(--surface-2); color: var(--fg); }

  /* Add category form */
  .add-cat-card { border-style: dashed; }

  .add-cat-form { display: flex; flex-direction: column; gap: .75rem; }

  .color-row { display: flex; flex-wrap: wrap; gap: 5px; }

  .color-btn {
    width: 22px; height: 22px; border-radius: 5px;
    border: 2px solid transparent; cursor: pointer; padding: 0;
    transition: transform 120ms;
  }
  .color-btn.selected {
    border-color: var(--fg); transform: scale(1.15);
  }

  .income-check {
    display: flex; align-items: center; gap: .5rem;
    font-size: .875rem; color: var(--fg-muted); cursor: pointer;
  }

  .btn-primary {
    align-self: flex-start; padding: .5rem 1rem; background: var(--accent); color: #fff;
    border: none; border-radius: var(--radius-sm); font-size: .875rem;
    font-weight: 500; cursor: pointer;
  }
  .btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
  .btn-primary:disabled { opacity: .6; cursor: not-allowed; }
</style>
