<script lang="ts">
  import { categories, loadBudget } from '$lib/stores/budget.js';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  onMount(async () => {
    await loadBudget();
    // Redirect to first category
    const first = $categories[0];
    if (first) goto(`/budget/${first.id}`, { replaceState: true });
  });
</script>

<div style="padding:2rem; color:var(--fg-muted); font-size:.875rem">Loading…</div>
