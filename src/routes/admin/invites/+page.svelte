<script lang="ts">
  import { onMount } from 'svelte';

  type Invite = {
    id: string;
    token: string;
    expires_at: string | null;
    created_at: string;
    used_at: string | null;
    created_by: string;
    used_by: string | null;
  };

  let invites: Invite[] = [];
  let loading = true;
  let generating = false;
  let copiedId = '';
  let expiryDays = 7;

  $: active   = invites.filter(i => !i.used_at && (!i.expires_at || new Date(i.expires_at) > new Date()));
  $: used     = invites.filter(i => !!i.used_at);
  $: expired  = invites.filter(i => !i.used_at && i.expires_at && new Date(i.expires_at) <= new Date());

  onMount(loadInvites);

  async function loadInvites() {
    loading = true;
    const res = await fetch('/api/admin/invites').then(r => r.json());
    if (res.ok) invites = res.data;
    loading = false;
  }

  async function generate() {
    generating = true;
    const res = await fetch('/api/admin/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expires_in_days: expiryDays || null })
    }).then(r => r.json());
    if (res.ok) invites = [res.data, ...invites];
    generating = false;
  }

  async function revoke(id: string) {
    const res = await fetch(`/api/admin/invites/${id}`, { method: 'DELETE' }).then(r => r.json());
    if (res.ok) invites = invites.filter(i => i.id !== id);
  }

  function inviteUrl(token: string) {
    return `${window.location.origin}/register?invite=${token}`;
  }

  async function copy(invite: Invite) {
    await navigator.clipboard.writeText(inviteUrl(invite.token));
    copiedId = invite.id;
    setTimeout(() => { copiedId = ''; }, 2500);
  }

  function fmt(d: string) {
    return new Date(d).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function timeLeft(expires: string) {
    const ms = new Date(expires).getTime() - Date.now();
    if (ms <= 0) return 'Expired';
    const h = Math.floor(ms / 3600000);
    if (h < 24) return `${h}h left`;
    return `${Math.floor(h / 24)}d left`;
  }
</script>

<div class="page">
  <div class="page-header">
    <div>
      <h1>Invite Links</h1>
      <p class="page-sub">Generate single-use links to invite new users when registration is closed.</p>
    </div>
  </div>

  <!-- Generate panel -->
  <div class="generate-card">
    <div class="generate-fields">
      <div class="expiry-field">
        <label for="expiry">Expires after</label>
        <div class="expiry-row">
          <input id="expiry" type="number" min="1" max="90" bind:value={expiryDays} class="expiry-input" />
          <span class="expiry-unit">days</span>
          <button class="btn-clear-expiry" type="button" on:click={() => { expiryDays = 0; }} title="No expiry">∞ No expiry</button>
        </div>
      </div>
    </div>
    <button class="btn-generate" disabled={generating} on:click={generate}>
      {generating ? 'Generating…' : '+ Generate invite link'}
    </button>
  </div>

  {#if loading}
    <p class="muted">Loading…</p>
  {:else}

    <!-- Active invites -->
    <div class="section">
      <div class="section-header">
        <h2>Active <span class="badge">{active.length}</span></h2>
      </div>
      {#if active.length === 0}
        <div class="empty-state">No active invite links. Generate one above.</div>
      {:else}
        <div class="invite-list">
          {#each active as inv}
            <div class="invite-card">
              <div class="invite-main">
                <div class="invite-url">{inviteUrl(inv.token)}</div>
                <div class="invite-meta">
                  Created by <strong>{inv.created_by}</strong> · {fmt(inv.created_at)}
                  {#if inv.expires_at}
                    · <span class="expires-badge">{timeLeft(inv.expires_at)}</span>
                  {:else}
                    · <span class="no-expiry">No expiry</span>
                  {/if}
                </div>
              </div>
              <div class="invite-actions">
                <button class="btn-copy" class:copied={copiedId === inv.id} on:click={() => copy(inv)}>
                  {copiedId === inv.id ? '✓ Copied' : 'Copy link'}
                </button>
                <button class="btn-revoke" on:click={() => revoke(inv.id)}>Revoke</button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Used invites -->
    {#if used.length > 0}
      <div class="section">
        <div class="section-header">
          <h2>Used <span class="badge badge--muted">{used.length}</span></h2>
        </div>
        <div class="invite-list">
          {#each used as inv}
            <div class="invite-card invite-card--used">
              <div class="invite-main">
                <div class="invite-url muted">{inviteUrl(inv.token)}</div>
                <div class="invite-meta">
                  Created by <strong>{inv.created_by}</strong> · {fmt(inv.created_at)}
                  · Used by <strong>{inv.used_by ?? '—'}</strong> on {fmt(inv.used_at!)}
                </div>
              </div>
              <div class="invite-actions">
                <span class="status-pill status-pill--used">Used</span>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Expired invites -->
    {#if expired.length > 0}
      <div class="section">
        <div class="section-header">
          <h2>Expired <span class="badge badge--muted">{expired.length}</span></h2>
          <button class="btn-clear-all" on:click={async () => {
            for (const inv of expired) await revoke(inv.id);
          }}>Clear all</button>
        </div>
        <div class="invite-list">
          {#each expired as inv}
            <div class="invite-card invite-card--expired">
              <div class="invite-main">
                <div class="invite-url muted">{inviteUrl(inv.token)}</div>
                <div class="invite-meta">
                  Created by <strong>{inv.created_by}</strong> · {fmt(inv.created_at)}
                  · Expired {fmt(inv.expires_at!)}
                </div>
              </div>
              <div class="invite-actions">
                <button class="btn-revoke" on:click={() => revoke(inv.id)}>Remove</button>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

  {/if}
</div>

<style>
.page { padding: 1.75rem 2rem; max-width: 780px; }
.page-header { margin-bottom: 1.5rem; }
h1 { font-size: 1.1rem; font-weight: 700; margin: 0 0 .2rem; }
.page-sub { font-size: .83rem; color: var(--fg-muted); margin: 0; }

/* Generate card */
.generate-card {
  display: flex; align-items: flex-end; justify-content: space-between; gap: 1.5rem;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 1.25rem 1.5rem;
  margin-bottom: 1.75rem;
}
.expiry-field { display: flex; flex-direction: column; gap: .35rem; }
.expiry-field label { font-size: .8rem; font-weight: 500; color: var(--fg-muted); }
.expiry-row { display: flex; align-items: center; gap: .5rem; }
.expiry-input {
  width: 64px; padding: .45rem .6rem;
  border: 1px solid var(--border); border-radius: var(--radius-sm);
  background: var(--surface-2); color: var(--fg); font-size: .875rem;
}
.expiry-unit { font-size: .83rem; color: var(--fg-muted); }
.btn-clear-expiry {
  font-size: .78rem; color: var(--fg-muted); background: none;
  border: 1px solid var(--border); border-radius: var(--radius-sm);
  padding: .3rem .6rem; cursor: pointer; white-space: nowrap;
}
.btn-clear-expiry:hover { color: var(--fg); border-color: var(--fg-muted); }
.btn-generate {
  padding: .55rem 1.25rem; background: var(--accent); color: #fff;
  border: none; border-radius: var(--radius-sm); font-size: .875rem;
  font-weight: 600; cursor: pointer; white-space: nowrap; flex-shrink: 0;
}
.btn-generate:hover:not(:disabled) { opacity: .88; }
.btn-generate:disabled { opacity: .5; cursor: not-allowed; }

/* Sections */
.section { margin-bottom: 1.75rem; }
.section-header {
  display: flex; align-items: center; gap: .6rem;
  margin-bottom: .75rem;
}
h2 { font-size: .82rem; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: var(--fg-faint); margin: 0; display: flex; align-items: center; gap: .5rem; }
.badge {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 18px; height: 18px; padding: 0 5px;
  background: var(--accent); color: #fff;
  border-radius: 99px; font-size: .7rem; font-weight: 700; letter-spacing: 0;
  text-transform: none;
}
.badge--muted { background: var(--surface-2); color: var(--fg-muted); }
.btn-clear-all {
  margin-left: auto; font-size: .78rem; color: var(--fg-muted);
  background: none; border: none; cursor: pointer; padding: 0;
}
.btn-clear-all:hover { color: var(--neg, #e24b4a); }

/* Invite cards */
.invite-list { display: flex; flex-direction: column; gap: .5rem; }
.invite-card {
  display: flex; align-items: center; gap: 1rem;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); padding: .9rem 1.1rem;
}
.invite-card--used { opacity: .7; }
.invite-card--expired { opacity: .6; }
.invite-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: .3rem; }
.invite-url {
  font-family: monospace; font-size: .78rem; color: var(--fg);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.invite-meta { font-size: .76rem; color: var(--fg-muted); }
.invite-meta strong { color: var(--fg); font-weight: 600; }
.expires-badge {
  display: inline-block; padding: .1rem .4rem;
  background: color-mix(in srgb, #f59e0b 15%, transparent);
  color: #f59e0b; border-radius: 4px; font-size: .72rem; font-weight: 600;
}
.no-expiry { color: var(--fg-muted); font-size: .76rem; }

.invite-actions { display: flex; gap: .5rem; align-items: center; flex-shrink: 0; }
.btn-copy {
  padding: .38rem .75rem; font-size: .8rem;
  background: var(--surface-2); border: 1px solid var(--border);
  border-radius: var(--radius-sm); cursor: pointer; color: var(--fg);
  transition: all .15s; white-space: nowrap;
}
.btn-copy:hover { border-color: var(--accent); color: var(--accent); }
.btn-copy.copied { background: color-mix(in srgb, #1D9E75 15%, var(--surface-2)); border-color: #1D9E75; color: #1D9E75; }
.btn-revoke {
  padding: .38rem .75rem; font-size: .8rem;
  background: none; border: 1px solid color-mix(in srgb, var(--neg, #e24b4a) 40%, transparent);
  color: var(--neg, #e24b4a); border-radius: var(--radius-sm); cursor: pointer;
  transition: all .15s; white-space: nowrap;
}
.btn-revoke:hover { background: color-mix(in srgb, var(--neg, #e24b4a) 10%, transparent); }

.status-pill {
  padding: .28rem .65rem; border-radius: 99px; font-size: .74rem; font-weight: 600;
}
.status-pill--used { background: var(--surface-2); color: var(--fg-muted); }

.empty-state {
  padding: 1.5rem; text-align: center; font-size: .875rem;
  color: var(--fg-muted); background: var(--surface);
  border: 1px dashed var(--border); border-radius: var(--radius);
}
.muted { color: var(--fg-muted); }
</style>
