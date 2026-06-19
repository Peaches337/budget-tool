<script lang="ts">
  import { onMount } from 'svelte';

  type AdminHousehold = {
    id: string;
    name: string;
    member_count: number;
    created_at: string;
    owner_username: string;
  };

  type AdminUser = { id: string; username: string };

  let households: AdminHousehold[] = [];
  let users: AdminUser[] = [];
  let loading = true;

  let assignUserId = '';
  let assignHouseholdId = '';
  let assigning = false;

  onMount(async () => {
    await Promise.all([loadHouseholds(), loadUsers()]);
    loading = false;
  });

  async function loadHouseholds() {
    const res = await fetch('/api/admin/households');
    const json = await res.json();
    if (json.ok) households = json.data;
  }

  async function loadUsers() {
    const res = await fetch('/api/admin/users');
    const json = await res.json();
    if (json.ok) users = json.data;
  }

  async function assignToHousehold() {
    if (!assignUserId || !assignHouseholdId) return;
    assigning = true;
    try {
      const res = await fetch('/api/admin/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: assignUserId, household_id: assignHouseholdId })
      });
      const json = await res.json();
      if (json.ok) {
        assignUserId = '';
        assignHouseholdId = '';
        await loadHouseholds();
      }
    } finally {
      assigning = false;
    }
  }
</script>

<div class="page">
  <div class="page-header">
    <h1>Households</h1>
    <span class="count-badge">{households.length}</span>
  </div>

  {#if loading}
    <p class="muted">Loading…</p>
  {:else}

    <div class="card">
      <h2>Assign user to household</h2>
      <p class="hint">Manually add a user to a household without an invite code.</p>
      <div class="assign-row">
        <select bind:value={assignUserId}>
          <option value="">Select user…</option>
          {#each users as u}
            <option value={u.id}>{u.username}</option>
          {/each}
        </select>
        <select bind:value={assignHouseholdId}>
          <option value="">Select household…</option>
          {#each households as hh}
            <option value={hh.id}>{hh.name}</option>
          {/each}
        </select>
        <button
          class="btn-primary"
          on:click={assignToHousehold}
          disabled={!assignUserId || !assignHouseholdId || assigning}
        >
          {assigning ? 'Assigning…' : 'Assign'}
        </button>
      </div>
    </div>

    <div class="card">
      <table class="data-table">
        <thead>
          <tr>
            <th>Household</th>
            <th>Owner</th>
            <th>Members</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {#each households as hh}
            <tr>
              <td><strong>{hh.name}</strong></td>
              <td class="muted">{hh.owner_username}</td>
              <td>{hh.member_count}</td>
              <td class="muted">{new Date(hh.created_at).toLocaleDateString('en-AU')}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  .page { padding: 1.75rem 2rem; max-width: 900px; }
  .page-header { display: flex; align-items: center; gap: .75rem; margin-bottom: 1.25rem; }
  h1 { font-size: 1.1rem; font-weight: 600; }
  h2 { font-size: .95rem; font-weight: 600; margin-bottom: .25rem; }

  .count-badge {
    font-size: .7rem; font-weight: 600; padding: 2px 8px;
    border-radius: 20px; background: var(--surface-2);
    color: var(--fg-muted); border: 1px solid var(--border);
  }

  .muted { color: var(--fg-muted); font-size: .875rem; }
  .hint { font-size: .82rem; color: var(--fg-muted); margin-bottom: .75rem; }

  .card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 1.25rem;
    margin-bottom: 1rem; box-shadow: var(--shadow-sm); overflow-x: auto;
  }

  .assign-row { display: flex; gap: .5rem; flex-wrap: wrap; }

  .assign-row select {
    flex: 1; min-width: 160px; padding: .5rem .75rem;
    border: 1px solid var(--border); border-radius: var(--radius-sm);
    background: var(--surface-2); color: var(--fg); font-size: .875rem; cursor: pointer;
  }

  .btn-primary {
    padding: .5rem 1rem; background: var(--accent); color: #fff;
    border: none; border-radius: var(--radius-sm); font-size: .875rem;
    font-weight: 500; cursor: pointer; white-space: nowrap; transition: background 150ms;
  }
  .btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
  .btn-primary:disabled { opacity: .6; cursor: not-allowed; }

  .data-table { width: 100%; border-collapse: collapse; font-size: .875rem; }
  .data-table th {
    text-align: left; font-size: .7rem; text-transform: uppercase;
    letter-spacing: .06em; color: var(--fg-faint);
    padding: .5rem .75rem .5rem 0; border-bottom: 1px solid var(--border); white-space: nowrap;
  }
  .data-table td {
    padding: .6rem .75rem .6rem 0; border-bottom: 1px solid var(--border); vertical-align: middle;
  }
  .data-table tr:last-child td { border-bottom: none; }
</style>
