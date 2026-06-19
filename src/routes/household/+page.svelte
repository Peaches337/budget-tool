<script lang="ts">
  import { onMount } from 'svelte';
  import type { Household } from '$lib/types.js';

  let households: (Household & { include_net_worth: boolean })[] = [];
  let loading = true;
  let error = '';

  // Create household
  let newName = '';
  let creating = false;

  // Join via code
  let inviteCode = '';
  let joining = false;
  let joinError = '';
  let joinSuccess = '';

  // Invite modal
  let showInviteModal = false;
  let selectedHouseholdId = '';
  let generatedCode = '';
  let generatingCode = false;

  onMount(async () => {
    await loadHouseholds();
  });

  async function loadHouseholds() {
    loading = true;
    try {
      const res = await fetch('/api/household');
      const json = await res.json();
      if (json.ok) households = json.data;
    } finally {
      loading = false;
    }
  }

  async function createHousehold() {
    if (!newName.trim()) return;
    creating = true;
    try {
      const res = await fetch('/api/household', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() })
      });
      const json = await res.json();
      if (json.ok) {
        newName = '';
        await loadHouseholds();
      } else {
        error = json.error;
      }
    } finally {
      creating = false;
    }
  }

  async function joinHousehold() {
    if (!inviteCode.trim()) return;
    joining = true;
    joinError = '';
    joinSuccess = '';
    try {
      const res = await fetch('/api/household/invite', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: inviteCode.trim() })
      });
      const json = await res.json();
      if (json.ok) {
        inviteCode = '';
        joinSuccess = 'Joined household successfully!';
        await loadHouseholds();
      } else {
        joinError = json.error;
      }
    } finally {
      joining = false;
    }
  }

  async function generateInvite(householdId: string) {
    selectedHouseholdId = householdId;
    generatedCode = '';
    showInviteModal = true;
    generatingCode = true;
    try {
      const res = await fetch('/api/household/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ household_id: householdId, expires_in_days: 7 })
      });
      const json = await res.json();
      if (json.ok) generatedCode = json.data.code;
    } finally {
      generatingCode = false;
    }
  }

  function copyCode() {
    navigator.clipboard.writeText(generatedCode);
  }

  async function toggleNetWorth(hh: Household & { include_net_worth: boolean }) {
    const next = !hh.include_net_worth;
    households = households.map(h => h.id === hh.id ? { ...h, include_net_worth: next } : h);
    await fetch(`/api/household/${hh.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ include_net_worth: next })
    });
  }
</script>

<div class="page">
  <h1>Household</h1>

  {#if loading}
    <p class="muted">Loading…</p>
  {:else if households.length === 0}
    <!-- Empty state -->
    <div class="empty-card">
      <div class="empty-icon">⌂</div>
      <h2>No household yet</h2>
      <p>Create one to share budgets with family members, or join an existing one with an invite code.</p>
    </div>
  {:else}
    {#each households as hh}
      <div class="card">
        <div class="card-header">
          <div class="card-title-row">
            <h2>{hh.name}</h2>
            <a href="/household/{hh.id}" class="view-summary-btn">View summary →</a>
          </div>
          <button class="btn-secondary" on:click={() => generateInvite(hh.id)}>
            + Invite member
          </button>
        </div>

        <div class="members-list">
          {#each (hh.members ?? []) as member}
            <div class="member-row">
              <div class="avatar">{member.username?.[0]?.toUpperCase()}</div>
              <div class="member-info">
                <span class="member-name">{member.username}</span>
                {#if member.role === 'owner'}
                  <span class="badge badge--owner">Owner</span>
                {/if}
              </div>
              <span class="member-since">
                Joined {new Date(member.joined_at).toLocaleDateString('en-AU')}
              </span>
            </div>
          {/each}
        </div>

        {#if (hh.members ?? []).find(m => m.role === 'owner')}
          <div class="hh-settings">
            <div class="setting-row">
              <div>
                <div class="setting-label">Include Household Members Net Worth</div>
                <div class="setting-hint">Shows each member's shared net worth entries in the household summary. Members control what they share from their Net Worth page.</div>
              </div>
              <button
                type="button"
                class="toggle"
                class:on={hh.include_net_worth}
                on:click={() => toggleNetWorth(hh)}
                aria-label="Toggle net worth sharing"
              >
                <span class="toggle-knob"></span>
              </button>
            </div>
          </div>
        {/if}
      </div>
    {/each}
  {/if}

  <!-- Create + Join side by side -->
  <div class="action-grid">
    <div class="card">
      <h2>Create a household</h2>
      <p class="hint">Start a new household and invite your family.</p>
      <form on:submit={(e) => { e.preventDefault(); createHousehold(); }} class="inline-form">
        <input
          type="text"
          placeholder="e.g. The Smiths"
          bind:value={newName}
          required
        />
        <button type="submit" class="btn-primary" disabled={creating}>
          {creating ? 'Creating…' : 'Create'}
        </button>
      </form>
      {#if error}<div class="error">{error}</div>{/if}
    </div>

    <div class="card">
      <h2>Join a household</h2>
      <p class="hint">Enter the invite code you were given.</p>
      <form on:submit={(e) => { e.preventDefault(); joinHousehold(); }} class="inline-form">
        <input
          type="text"
          placeholder="e.g. A3F9C2"
          bind:value={inviteCode}
          style="text-transform:uppercase; letter-spacing:.1em"
          required
        />
        <button type="submit" class="btn-primary" disabled={joining}>
          {joining ? 'Joining…' : 'Join'}
        </button>
      </form>
      {#if joinError}<div class="error">{joinError}</div>{/if}
      {#if joinSuccess}<div class="success">{joinSuccess}</div>{/if}
    </div>
  </div>
</div>

<!-- Invite code modal -->
{#if showInviteModal}
  <div class="modal-overlay" on:click={() => showInviteModal = false} role="button" tabindex="-1" on:keydown={() => {}}>
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h2>Invite code</h2>
        <button class="close-btn" on:click={() => showInviteModal = false}>×</button>
      </div>
      {#if generatingCode}
        <p class="muted">Generating…</p>
      {:else}
        <p class="modal-hint">Share this code. It expires in 7 days and can only be used once.</p>
        <div class="code-display">
          <span class="code">{generatedCode}</span>
          <button class="btn-secondary" on:click={copyCode}>Copy</button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .page { padding: 1.75rem 2rem; max-width: 780px; }
  h1 { margin-bottom: 1.5rem; }

  .muted { color: var(--fg-muted); font-size: .875rem; }
  .hint  { font-size: .85rem; color: var(--fg-muted); margin: .25rem 0 .75rem; }

  /* Empty state */
  .empty-card {
    text-align: center;
    padding: 3rem 2rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    margin-bottom: 1.25rem;
  }

  .empty-icon { font-size: 2.5rem; margin-bottom: .75rem; }
  .empty-card h2 { margin-bottom: .5rem; }
  .empty-card p { color: var(--fg-muted); font-size: .9rem; max-width: 360px; margin: 0 auto; }

  /* Cards */
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1.25rem;
    margin-bottom: 1rem;
    box-shadow: var(--shadow-sm);
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
  }

  .card-title-row {
    display: flex;
    align-items: center;
    gap: .75rem;
  }

  .view-summary-btn {
    font-size: .8rem;
    color: var(--accent);
    text-decoration: none;
    transition: opacity 120ms;
  }
  .view-summary-btn:hover { opacity: .75; }

  .card h2 { font-size: 1rem; font-weight: 600; }

  /* Members */
  .members-list { display: flex; flex-direction: column; gap: .5rem; }

  .member-row {
    display: flex;
    align-items: center;
    gap: .75rem;
    padding: .5rem .25rem;
    border-bottom: 1px solid var(--border);
  }

  .member-row:last-child { border-bottom: none; }

  .avatar {
    width: 32px; height: 32px;
    border-radius: 50%;
    background: var(--accent);
    color: #fff;
    font-size: .8rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .member-info { display: flex; align-items: center; gap: .5rem; flex: 1; }
  .member-name { font-size: .9rem; font-weight: 500; }

  .badge {
    font-size: .65rem;
    font-weight: 600;
    padding: 2px 7px;
    border-radius: 20px;
    text-transform: uppercase;
    letter-spacing: .04em;
  }

  .badge--owner { background: color-mix(in srgb, var(--accent) 15%, transparent); color: var(--accent); }

  .member-since { font-size: .75rem; color: var(--fg-faint); margin-left: auto; }

  /* Action grid */
  .action-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .inline-form { display: flex; gap: .5rem; }

  .inline-form input {
    flex: 1;
    padding: .5rem .75rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--fg);
    font-size: .875rem;
  }

  .inline-form input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(99,102,241,.15);
  }

  .error {
    margin-top: .5rem;
    font-size: .8rem;
    color: var(--neg);
  }

  .success {
    margin-top: .5rem;
    font-size: .8rem;
    color: var(--pos);
  }

  /* Buttons */
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

  .btn-secondary {
    padding: .4rem .9rem;
    font-size: .85rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--fg);
    cursor: pointer;
    transition: background 120ms;
    white-space: nowrap;
  }

  .btn-secondary:hover { background: var(--surface-2); }

  /* Modal */
  .modal-overlay {
    position: fixed; inset: 0;
    background: rgba(0,0,0,.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .modal {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1.5rem;
    width: 100%;
    max-width: 360px;
    box-shadow: var(--shadow);
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
  }

  .modal-hint { font-size: .85rem; color: var(--fg-muted); margin-bottom: 1rem; }

  .code-display {
    display: flex;
    align-items: center;
    gap: .75rem;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: .75rem 1rem;
  }

  .code {
    font-family: monospace;
    font-size: 1.5rem;
    font-weight: 700;
    letter-spacing: .15em;
    color: var(--fg);
    flex: 1;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 1.25rem;
    color: var(--fg-muted);
    cursor: pointer;
    line-height: 1;
    padding: 2px 4px;
    border-radius: 4px;
  }

  .close-btn:hover { color: var(--neg); }

  /* Household settings */
  .hh-settings {
    border-top: 1px solid var(--border);
    margin-top: 1rem;
    padding-top: 1rem;
  }

  .setting-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1.25rem;
  }

  .setting-label { font-size: .875rem; font-weight: 500; color: var(--fg); margin-bottom: 2px; }
  .setting-hint  { font-size: .78rem; color: var(--fg-muted); max-width: 420px; }

  .toggle {
    width: 40px; height: 22px;
    background: var(--border);
    border: none; border-radius: 20px;
    cursor: pointer; padding: 0;
    position: relative;
    transition: background 200ms;
    flex-shrink: 0;
  }

  .toggle.on { background: var(--accent); }

  .toggle-knob {
    position: absolute;
    top: 3px; left: 3px;
    width: 16px; height: 16px;
    background: #fff;
    border-radius: 50%;
    transition: transform 200ms;
    pointer-events: none;
  }

  .toggle.on .toggle-knob { transform: translateX(18px); }

  @media (max-width: 600px) {
    .action-grid { grid-template-columns: 1fr; }
  }
</style>
