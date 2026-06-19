<script lang="ts">
  import { page } from '$app/stores';
  import { categories, loadBudget } from '$lib/stores/budget.js';
  import { onMount } from 'svelte';
  import { fmt } from '$lib/utils.js';
  import { toAnnual } from '$lib/tax.js';
  import type { Frequency } from '$lib/types.js';

  onMount(loadBudget);

  $: currentId = $page.params.id;

  function catTotal(cat: typeof $categories[0]): number {
    return cat.items?.reduce((s, i) => s + toAnnual(Number(i.amount), i.frequency as Frequency), 0) ?? 0;
  }
</script>

<div class="budget-shell">
  <aside class="cat-sidebar">
    <div class="cat-sidebar-header">
      <span>Categories</span>
      <a href="/" class="view-summary">Summary ↗</a>
    </div>
    <nav class="cat-list">
      {#each $categories as cat}
        <a
          href="/budget/{cat.id}"
          class="cat-item"
          class:active={currentId === cat.id}
          style="--cat: {cat.color}"
        >
          <span class="cat-pip"></span>
          <span class="cat-name">{cat.name}</span>
          {#if catTotal(cat) > 0}
            <span class="cat-amt">{fmt(catTotal(cat), 1/12)}</span>
          {/if}
        </a>
      {/each}
    </nav>
  </aside>

  <div class="cat-content">
    <slot />
  </div>
</div>

<style>
  .budget-shell {
    display: flex;
    height: 100vh;
    overflow: hidden;
  }

  /* ── Category sidebar ── */
  .cat-sidebar {
    width: 210px;
    flex-shrink: 0;
    border-right: 1px solid var(--border);
    background: var(--surface);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .cat-sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1rem .6rem;
    font-size: .7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .08em;
    color: var(--fg-faint);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .view-summary {
    font-size: .7rem;
    color: var(--fg-faint);
    text-decoration: none;
    letter-spacing: 0;
    text-transform: none;
    font-weight: 400;
    transition: color 120ms;
  }
  .view-summary:hover { color: var(--accent); }

  .cat-list {
    flex: 1;
    overflow-y: auto;
    padding: .4rem .5rem;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .cat-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: .45rem .65rem;
    border-radius: var(--radius-sm);
    text-decoration: none;
    color: var(--fg-muted);
    font-size: .84rem;
    transition: background 120ms, color 120ms;
    cursor: pointer;
  }

  .cat-item:hover {
    background: var(--surface-2);
    color: var(--fg);
  }

  .cat-item.active {
    background: color-mix(in srgb, var(--cat) 12%, var(--surface-2));
    color: var(--fg);
  }

  .cat-pip {
    width: 7px;
    height: 7px;
    border-radius: 2px;
    background: var(--border);
    flex-shrink: 0;
    transition: background 120ms;
  }

  .cat-item.active .cat-pip,
  .cat-item:hover .cat-pip {
    background: var(--cat);
  }

  .cat-name {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .cat-amt {
    font-size: .72rem;
    color: var(--fg-faint);
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }

  .cat-item.active .cat-amt { color: var(--fg-muted); }

  /* ── Content area ── */
  .cat-content {
    flex: 1;
    overflow-y: auto;
    background: var(--bg);
    min-width: 0;
  }
</style>
