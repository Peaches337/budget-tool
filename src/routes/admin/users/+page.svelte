<script lang="ts">
  import { onMount } from 'svelte';
  import type { LayoutData } from '../../$types';

  export let data: LayoutData;

  type AdminUser = {
    id: string;
    username: string;
    email: string;
    is_admin: boolean;
    created_at: string;
    household_count: number;
  };

  type Invite = {
    id: string;
    token: string;
    expires_at: string | null;
    created_at: string;
    created_by: string;
  };

  let users: AdminUser[] = [];
  let invites: Invite[] = [];
  let loading = true;
  let resetResult: { username: string; password: string } | null = null;
  let generatingInvite = false;
  let copiedInviteId = '';
  let confirmDeleteId: string | null = null;
  let deleting = false;

  onMount(async () => {
    await Promise.all([loadUsers(), loadInvites()]);
    loading = false;
  });

  async function loadUsers() {
    const res = await fetch('/api/admin/users');
    const json = await res.json();
    if (json.ok) users = json.data;
  }

  async function loadInvites() {
    const res = await fetch('/api/admin/invites');
    const json = await res.json();
    if (json.ok) invites = json.data;
  }

  async function toggleAdmin(userId: string, current: boolean) {
    await fetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_admin: !current })
    });
    await loadUsers();
  }

  async function resetPassword(userId: string) {
    const res = await fetch(`/api/admin/users/${userId}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const json = await res.json();
    if (json.ok) resetResult = json.data;
  }

  async function copyPassword() {
    if (resetResult) await navigator.clipboard.writeText(resetResult.password);
  }

  async function generateInvite() {
    generatingInvite = true;
    try {
      const res = await fetch('/api/admin/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expires_in_days: 7 })
      });
      const json = await res.json();
      if (json.ok) {
        invites = [json.data, ...invites];
        await copyInviteLink(json.data.token);
        copiedInviteId = json.data.id;
        setTimeout(() => { copiedInviteId = ''; }, 3000);
      }
    } finally {
      generatingInvite = false;
    }
  }

  async function copyInviteLink(token: string) {
    const url = `${window.location.origin}/register?invite=${token}`;
    await navigator.clipboard.writeText(url);
  }

  async function revokeInvite(id: string) {
    await fetch(`/api/admin/invites/${id}`, { method: 'DELETE' });
    invites = invites.filter(i => i.id !== id);
  }

  async function deleteUser(userId: string) {
    deleting = true;
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.ok) {
        users = users.filter(u => u.id !== userId);
        confirmDeleteId = null;
      }
    } finally {
      deleting = false;
    }
  }

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  $: deleteTargetUser = users.find(u => u.id === confirmDeleteId) ?? null;
</script>

<div class="page">
  <div class="page-header">
    <h1>Users</h1>
    <span class="count-badge">{users.length}</span>
  </div>

  {#if resetResult}
    <div class="reset-banner">
      <div class="reset-banner-body">
        <span class="reset-banner-label">Password reset for <strong>{resetResult.username}</strong>:</span>
        <code class="reset-password-code">{resetResult.password}</code>
      </div>
      <div class="reset-banner-actions">
        <button class="btn-copy" on:click={copyPassword}>Copy</button>
        <button class="btn-dismiss" on:click={() => { resetResult = null; }}>Dismiss</button>
      </div>
    </div>
  {/if}

  {#if loading}
    <p class="muted">Loading…</p>
  {:else}
    <div class="users-header">
      <h2>Users</h2>
    </div>

    <div class="card">
      <table class="data-table">
        <thead>
          <tr>
            <th>Username</th>
            <th>Email</th>
            <th>Joined</th>
            <th>Households</th>
            <th>Admin</th>
            <th>Actions</th>
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
              <td>
                <button
                  class="action-btn action-btn--amber"
                  on:click={() => resetPassword(u.id)}
                >
                  Reset password
                </button>
                {#if u.id !== data.user?.id}
                  <button class="action-btn action-btn--danger" on:click={() => { confirmDeleteId = u.id; }}>
                    Delete
                  </button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

{#if confirmDeleteId && deleteTargetUser}
  <div class="modal-backdrop" on:click={() => { confirmDeleteId = null; }}>
    <div class="modal-box" on:click={(e) => { e.stopPropagation(); }}>
      <h3>Delete user</h3>
      <p>Are you sure you want to delete <strong>{deleteTargetUser.username}</strong>? This cannot be undone — all their budget data will be permanently removed.</p>
      <div class="modal-actions">
        <button class="btn-cancel" on:click={() => { confirmDeleteId = null; }}>Cancel</button>
        <button class="btn-confirm-delete" disabled={deleting} on:click={() => deleteUser(confirmDeleteId)}>
          {deleting ? 'Deleting…' : 'Yes, delete user'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 1.5rem 0 .4rem;
  }

  .section-header h2 {
    font-size: .85rem;
    font-weight: 600;
    color: var(--fg);
    margin: 0;
    text-transform: none;
    letter-spacing: 0;
  }

  .section-hint {
    font-size: .78rem;
    color: var(--fg-muted);
    margin: 0 0 .85rem;
  }

  .invite-empty { margin-bottom: 1rem; }

  .invite-list {
    margin-bottom: 1.75rem;
    padding: 0;
  }

  .invite-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: .7rem 1.25rem;
    border-bottom: 1px solid var(--border);
    flex-wrap: wrap;
  }

  .invite-row:last-child { border-bottom: none; }

  .invite-info {
    display: flex;
    flex-direction: column;
    gap: .25rem;
    min-width: 0;
    flex: 1;
  }

  .invite-token {
    font-family: monospace;
    font-size: .78rem;
    color: var(--fg);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    user-select: all;
  }

  .invite-meta { font-size: .75rem; }

  .invite-actions {
    display: flex;
    gap: .4rem;
    flex-shrink: 0;
  }

  .users-header {
    margin: 1.5rem 0 .6rem;
  }

  .users-header h2 {
    font-size: .85rem;
    font-weight: 600;
    color: var(--fg);
  }

  .action-btn--accent {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    color: var(--accent);
    border-color: color-mix(in srgb, var(--accent) 30%, transparent);
  }

  .action-btn--accent:hover:not(:disabled) {
    background: color-mix(in srgb, var(--accent) 20%, transparent);
  }

  .action-btn--ok {
    background: rgba(29,158,117,.12);
    color: #1D9E75;
    border-color: rgba(29,158,117,.3);
  }

  .action-btn--danger {
    background: rgba(226,75,74,.08);
    color: #E24B4A;
    border-color: rgba(226,75,74,.25);
  }

  .action-btn--danger:hover {
    background: rgba(226,75,74,.16);
  }

  .page { padding: 1.75rem 2rem; max-width: 900px; }

  .page-header {
    display: flex;
    align-items: center;
    gap: .75rem;
    margin-bottom: 1.25rem;
  }

  h1 { font-size: 1.1rem; font-weight: 600; }

  .count-badge {
    font-size: .7rem;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 20px;
    background: var(--surface-2);
    color: var(--fg-muted);
    border: 1px solid var(--border);
  }

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

  .action-btn {
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

  .action-btn--amber {
    background: rgba(245,158,11,.1);
    color: #f59e0b;
    border-color: rgba(245,158,11,.3);
  }

  .action-btn--amber:hover {
    background: rgba(245,158,11,.18);
  }

  /* Reset password result banner */
  .reset-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
    background: rgba(245,158,11,.08);
    border: 1px solid rgba(245,158,11,.35);
    border-radius: var(--radius);
    padding: .9rem 1.25rem;
    margin-bottom: 1rem;
  }

  .reset-banner-body {
    display: flex;
    align-items: center;
    gap: .75rem;
    flex-wrap: wrap;
  }

  .reset-banner-label {
    font-size: .875rem;
    color: var(--fg);
  }

  .reset-password-code {
    font-family: monospace;
    font-size: .95rem;
    font-weight: 600;
    color: #f59e0b;
    background: rgba(245,158,11,.12);
    border: 1px solid rgba(245,158,11,.25);
    border-radius: 5px;
    padding: .2rem .55rem;
    letter-spacing: .02em;
    user-select: all;
  }

  .reset-banner-actions {
    display: flex;
    gap: .5rem;
  }

  .btn-copy {
    padding: .3rem .75rem;
    font-size: .78rem;
    font-weight: 600;
    border-radius: 20px;
    border: 1px solid rgba(245,158,11,.4);
    background: rgba(245,158,11,.15);
    color: #f59e0b;
    cursor: pointer;
    transition: background 120ms;
  }

  .btn-copy:hover { background: rgba(245,158,11,.25); }

  .btn-dismiss {
    padding: .3rem .75rem;
    font-size: .78rem;
    font-weight: 500;
    border-radius: 20px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--fg-muted);
    cursor: pointer;
    transition: background 120ms;
  }

  .btn-dismiss:hover { background: var(--surface-2); }

  .modal-backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,.5);
    display: flex; align-items: center; justify-content: center;
    z-index: 1000; padding: 1rem;
  }
  .modal-box {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 12px; padding: 1.75rem; max-width: 420px; width: 100%;
    box-shadow: 0 8px 40px rgba(0,0,0,.3);
  }
  .modal-box h3 { font-size: 1rem; font-weight: 700; margin: 0 0 .75rem; }
  .modal-box p { font-size: .9rem; color: var(--fg-muted); margin: 0 0 1.5rem; line-height: 1.5; }
  .modal-box p strong { color: var(--fg); }
  .modal-actions { display: flex; justify-content: flex-end; gap: .6rem; }
  .btn-cancel {
    padding: .5rem 1rem; background: var(--surface-2); border: 1px solid var(--border);
    border-radius: 7px; cursor: pointer; font-size: .875rem; color: var(--fg);
  }
  .btn-confirm-delete {
    padding: .5rem 1.1rem; background: var(--neg, #e24b4a); color: #fff;
    border: none; border-radius: 7px; cursor: pointer; font-size: .875rem; font-weight: 600;
  }
  .btn-confirm-delete:disabled { opacity: .5; cursor: not-allowed; }
</style>
