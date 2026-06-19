<script lang="ts">
  import { onMount } from 'svelte';
  import type { LayoutData } from '../$types';
  import { goto } from '$app/navigation';

  export let data: LayoutData;

  type AdminUser = {
    id: string;
    username: string;
    email: string;
    is_admin: boolean;
    created_at: string;
    household_count: number;
  };

  type AdminHousehold = {
    id: string;
    name: string;
    member_count: number;
    created_at: string;
    owner_username: string;
  };

  let users: AdminUser[] = [];
  let households: AdminHousehold[] = [];
  let loading = true;
  let tab: 'users' | 'households' = 'users';

  // Assign user to household
  let assignUserId = '';
  let assignHouseholdId = '';
  let assigning = false;

  onMount(async () => {
    if (!data.user?.is_admin) {
      goto('/');
      return;
    }
    await Promise.all([loadUsers(), loadHouseholds()]);
    loading = false;
  });

  async function loadUsers() {
    const res = await fetch('/api/admin/users');
    const json = await res.json();
    if (json.ok) users = json.data;
  }

  async function loadHouseholds() {
    const res = await fetch('/api/admin/households');
    const json = await res.json();
    if (json.ok) households = json.data;
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

  async function toggleAdmin(userId: string, currentValue: boolean) {
    await fetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_admin: !currentValue })
    });
    await loadUsers();
  }
</script>

<div class="page">
  <div class="page-header">
    <h1>Admin</h1>
    <span class="badge-admin">Admin</span>
  </div>

  <div class="tabs">
    <button class="tab" class:active={tab === 'users'} on:click={() => tab = 'users'}>
      Users ({users.length})
    </button>
    <button class="tab" class:active={tab === 'households'} on:click={() => tab = 'households'}>
      Households ({households.length})
    </button>
  </div>

  {#if loading}
    <p class="muted">Loading…</p>
  {:else if tab === 'users'}

    <div class="card">
      <table class="data-table">
        <thead>
          <tr>
            <th>Username</th>
            <th>Email</th>
            <th>Joined</th>
            <th>Households</th>
            <th>Admin</th>
          </tr>
        </thead>
        <tbody>
          {#each users as u}
            <tr>
              <td><strong>{u.username}</strong></td>
              <td class="muted">{u.email}</td>
              <td class="muted">{new Date(u.created_at).toLocaleDateString('en-AU')}</td>
              <td>{u.household_count}</td>
              <td>
                <button
                  class="toggle-btn"
                  class:on={u.is_admin}
                  on:click={() => toggleAdmin(u.id, u.is_admin)}
                  disabled={u.id === data.user?.id}
                  title={u.id === data.user?.id ? "Can't remove your own admin" : ''}
                >
                  {u.is_admin ? 'Yes' : 'No'}
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

  {:else}

    <!-- Assign user to household -->
    <div class="card">
      <h2 style="margin-bottom:.75rem">Assign user to household</h2>
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

  .page-header {
    display: flex;
    align-items: center;
    gap: .75rem;
    margin-bottom: 1.25rem;
  }

  .badge-admin {
    font-size: .65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .08em;
    padding: 3px 8px;
    border-radius: 20px;
    background: color-mix(in srgb, var(--accent) 15%, transparent);
    color: var(--accent);
  }

  .tabs {
    display: flex;
    gap: 0;
    border-bottom: 1px solid var(--border);
    margin-bottom: 1.25rem;
  }

  .tab {
    padding: .6rem 1rem;
    font-size: .875rem;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--fg-muted);
    cursor: pointer;
    margin-bottom: -1px;
    transition: color 120ms;
  }

  .tab:hover { color: var(--fg); }
  .tab.active { color: var(--fg); border-bottom-color: var(--accent); font-weight: 500; }

  .muted { color: var(--fg-muted); font-size: .875rem; }

  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1.25rem;
    margin-bottom: 1rem;
    box-shadow: var(--shadow-sm);
    overflow-x: auto;
  }

  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: .875rem;
  }

  .data-table th {
    text-align: left;
    font-size: .7rem;
    text-transform: uppercase;
    letter-spacing: .06em;
    color: var(--fg-faint);
    padding: .5rem .75rem .5rem 0;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }

  .data-table td {
    padding: .6rem .75rem .6rem 0;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
  }

  .data-table tr:last-child td { border-bottom: none; }

  .toggle-btn {
    padding: .25rem .6rem;
    font-size: .75rem;
    font-weight: 600;
    border-radius: 20px;
    border: 1px solid var(--border);
    background: var(--surface-2);
    color: var(--fg-muted);
    cursor: pointer;
    transition: all 120ms;
  }

  .toggle-btn.on {
    background: color-mix(in srgb, var(--accent) 15%, transparent);
    color: var(--accent);
    border-color: color-mix(in srgb, var(--accent) 30%, transparent);
  }

  .toggle-btn:disabled { opacity: .4; cursor: not-allowed; }

  .assign-row {
    display: flex;
    gap: .5rem;
    flex-wrap: wrap;
  }

  .assign-row select {
    flex: 1;
    min-width: 160px;
    padding: .5rem .75rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--fg);
    font-size: .875rem;
    cursor: pointer;
  }

  .btn-primary {
    padding: .5rem 1rem;
    background: var(--accent);
    color: #fff;
    border: none;
    border-radius: var(--radius-sm);
    font-size: .875rem;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition: background 150ms;
  }

  .btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
  .btn-primary:disabled { opacity: .6; cursor: not-allowed; }
</style>
