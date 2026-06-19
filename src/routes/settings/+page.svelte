<script lang="ts">
  import { onMount } from 'svelte';
  import type { LayoutData } from '../$types';
  import { loadBankConnection, bankConnection, triggerSync, bankSyncing } from '$lib/stores/bank.js';
  import type { BankConnection, CoinspotConnection } from '$lib/types.js';

  // ── CoinSpot ─────────────────────────────────────────────────────────────
  let coinspotConn: CoinspotConnection | null | undefined = undefined;
  let csApiKey = '';
  let csApiSecret = '';
  let csError = '';
  let csSuccess = '';
  let csLoading = false;
  let csSyncing = false;
  let showCsDisconnect = false;

  async function loadCoinspot() {
    const res = await fetch('/api/coinspot/connection').then(r => r.json()).catch(() => ({ ok: false }));
    coinspotConn = res.ok ? (res.data ?? null) : null;
  }

  async function connectCoinspot() {
    csError = '';
    csSuccess = '';
    if (!csApiKey.trim() || !csApiSecret.trim()) {
      csError = 'Both API key and secret are required.';
      return;
    }
    csLoading = true;
    try {
      const res = await fetch('/api/coinspot/connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: csApiKey.trim(), api_secret: csApiSecret.trim() })
      });
      const json = await res.json();
      if (json.ok) {
        csSuccess = 'Connected! Syncing balances…';
        csApiKey = '';
        csApiSecret = '';
        await syncCoinspot();
        await loadCoinspot();
      } else {
        csError = json.error ?? 'Connection failed.';
      }
    } finally {
      csLoading = false;
    }
  }

  async function syncCoinspot() {
    csError = '';
    csSuccess = '';
    csSyncing = true;
    try {
      const res = await fetch('/api/coinspot/sync', { method: 'POST' });
      const json = await res.json();
      if (json.ok) {
        csSuccess = `Synced — ${json.data.count} coin${json.data.count !== 1 ? 's' : ''} updated.`;
        await loadCoinspot();
      } else {
        csError = json.error ?? 'Sync failed.';
      }
    } finally {
      csSyncing = false;
    }
  }

  async function disconnectCoinspot() {
    csError = '';
    csLoading = true;
    try {
      const res = await fetch('/api/coinspot/connection', { method: 'DELETE' });
      const json = await res.json();
      if (json.ok) {
        coinspotConn = null;
        showCsDisconnect = false;
        csSuccess = 'CoinSpot disconnected.';
      } else {
        csError = json.error ?? 'Disconnect failed.';
      }
    } finally {
      csLoading = false;
    }
  }
  export let data: LayoutData;

  let theme = 'system';

  // ── Connected Accounts ───────────────────────────────────────────────────
  let tokenInput = '';
  let bankError = '';
  let bankSuccess = '';
  let bankLoading = false;
  let showDeleteConfirm = false;
  let deleteAll = false;

  onMount(() => { loadBankConnection(); loadCoinspot(); });

  async function connectBank() {
    bankError = '';
    bankSuccess = '';
    if (!tokenInput.trim()) { bankError = 'Please enter your Up personal access token.'; return; }
    bankLoading = true;
    try {
      const res = await fetch('/api/bank/connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenInput.trim() })
      });
      const json = await res.json();
      if (json.ok) {
        bankSuccess = 'Connected! Starting initial sync…';
        tokenInput = '';
        await loadBankConnection();
        try {
          const r = await triggerSync();
          bankSuccess = `Sync complete — ${r.inserted} transactions imported.`;
        } catch { bankSuccess = 'Connected. Sync will run shortly.'; }
      } else {
        bankError = json.error ?? 'Connection failed.';
      }
    } finally {
      bankLoading = false;
    }
  }

  async function disconnectBank() {
    bankLoading = true;
    bankError = '';
    try {
      const res = await fetch(`/api/bank/connection?deleteAll=${deleteAll}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.ok) {
        bankConnection.set(null);
        showDeleteConfirm = false;
        bankSuccess = deleteAll ? 'Disconnected and all transaction data deleted.' : 'Disconnected. Transaction history retained.';
      } else {
        bankError = json.error ?? 'Disconnect failed.';
      }
    } finally {
      bankLoading = false;
    }
  }

  async function syncNow() {
    bankError = '';
    bankSuccess = '';
    try {
      const r = await triggerSync();
      bankSuccess = `Sync complete — ${r.inserted} new, ${r.updated} updated.`;
    } catch (e) {
      bankError = e instanceof Error ? e.message : 'Sync failed.';
    }
  }

  // ── Change username ──────────────────────────────────────────────────────
  let showUsernameModal = false;
  let newUsername = '';
  let usernameError = '';
  let usernameLoading = false;

  function openUsernameModal() {
    newUsername = data.user?.username ?? '';
    usernameError = '';
    showUsernameModal = true;
  }

  async function saveUsername() {
    usernameError = '';
    if (!newUsername.trim()) { usernameError = 'Username is required.'; return; }
    usernameLoading = true;
    try {
      const res = await fetch('/api/auth/change-username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newUsername.trim() })
      });
      const json = await res.json();
      if (json.ok) {
        // Update the displayed username without a full page reload
        if (data.user) data.user = { ...data.user, username: json.data.username };
        showUsernameModal = false;
      } else {
        usernameError = json.error ?? 'Failed to update username.';
      }
    } finally {
      usernameLoading = false;
    }
  }

  // ── Change password ──────────────────────────────────────────────────────
  let pwForm = { current: '', next: '', confirm: '' };
  let pwError = '';
  let pwSuccess = false;
  let pwLoading = false;

  async function changePassword() {
    pwError = '';
    pwSuccess = false;
    if (!pwForm.current || !pwForm.next) { pwError = 'All fields are required.'; return; }
    if (pwForm.next !== pwForm.confirm)  { pwError = 'New passwords do not match.'; return; }
    if (pwForm.next.length < 8)          { pwError = 'New password must be at least 8 characters.'; return; }

    pwLoading = true;
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: pwForm.current, new_password: pwForm.next })
      });
      const json = await res.json();
      if (json.ok) {
        pwSuccess = true;
        pwForm = { current: '', next: '', confirm: '' };
      } else {
        pwError = json.error ?? 'Failed to change password.';
      }
    } finally {
      pwLoading = false;
    }
  }

  function setTheme(t: string) {
    theme = t;
    if (t === 'system') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', t);
    }
    localStorage.setItem('theme', t);
  }

  // Restore on mount
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('theme') ?? 'system';
    theme = saved;
    if (saved !== 'system') document.documentElement.setAttribute('data-theme', saved);
  }
</script>

<div class="page">
  <h1>Settings</h1>

  <div class="section">
    <h2>Appearance</h2>
    <div class="setting-row">
      <div>
        <div class="setting-label">Theme</div>
        <div class="setting-hint">Choose how Skint looks</div>
      </div>
      <div class="theme-btns">
        {#each ['light','system','dark'] as t}
          <button
            class="theme-btn"
            class:active={theme === t}
            on:click={() => setTheme(t)}
          >{t.charAt(0).toUpperCase() + t.slice(1)}</button>
        {/each}
      </div>
    </div>
  </div>

  <div class="section">
    <h2>Account</h2>
    <div class="setting-row">
      <div>
        <div class="setting-label">Username</div>
        <div class="setting-hint">{data.user?.username}</div>
      </div>
      <button class="btn-secondary" on:click={openUsernameModal}>Change</button>
    </div>
    <div class="setting-row">
      <div>
        <div class="setting-label">Email</div>
        <div class="setting-hint">{data.user?.email}</div>
      </div>
    </div>
  </div>

  <div class="section">
    <h2>Security</h2>
    <div class="setting-row setting-row--col">
      <div class="setting-label">Change password</div>
      <div class="setting-hint">Enter your current password to set a new one</div>

      {#if pwSuccess}
        <div class="pw-banner pw-banner--ok">Password changed successfully.</div>
      {/if}
      {#if pwError}
        <div class="pw-banner pw-banner--err">{pwError}</div>
      {/if}

      <div class="pw-form">
        <input
          class="pw-input"
          type="password"
          placeholder="Current password"
          bind:value={pwForm.current}
          autocomplete="current-password"
        />
        <input
          class="pw-input"
          type="password"
          placeholder="New password (min 8 chars)"
          bind:value={pwForm.next}
          autocomplete="new-password"
        />
        <input
          class="pw-input"
          type="password"
          placeholder="Confirm new password"
          bind:value={pwForm.confirm}
          autocomplete="new-password"
        />
        <button class="btn-primary" disabled={pwLoading} on:click={() => { changePassword(); }}>
          {pwLoading ? 'Saving…' : 'Update password'}
        </button>
      </div>
    </div>
  </div>

  <div class="section">
    <h2>Connected Accounts</h2>

    {#if bankError}
      <div class="bank-banner bank-banner--err">{bankError}</div>
    {/if}
    {#if bankSuccess}
      <div class="bank-banner bank-banner--ok">{bankSuccess}</div>
    {/if}

    {#if $bankConnection === undefined}
      <div class="setting-row"><span class="setting-hint">Loading…</span></div>
    {:else if $bankConnection}
      <!-- Connected -->
      <div class="setting-row">
        <div>
          <div class="setting-label">Up Bank</div>
          <div class="setting-hint">
            {$bankConnection.display_name ?? 'Connected'}
            {#if $bankConnection.last_synced_at}
              · Last synced {new Date($bankConnection.last_synced_at).toLocaleString()}
            {/if}
          </div>
        </div>
        <div class="bank-actions">
          <button class="btn-secondary" disabled={$bankSyncing} on:click={syncNow}>
            {$bankSyncing ? 'Syncing…' : 'Sync now'}
          </button>
          <button class="btn-danger" on:click={() => { showDeleteConfirm = true; }}>Disconnect</button>
        </div>
      </div>

      {#if $bankConnection.balances?.length}
        <div class="balances-grid">
          {#each $bankConnection.balances as bal}
            <div class="balance-card">
              <div class="balance-name">{bal.display_name}</div>
              <div class="balance-type">{bal.account_type.toLowerCase()}</div>
              <div class="balance-amount">
                {(bal.balance_cents / 100).toLocaleString('en-AU', { style: 'currency', currency: bal.currency || 'AUD' })}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    {:else}
      <!-- Not connected -->
      <div class="setting-row setting-row--col">
        <div class="setting-label">Up Bank</div>
        <div class="setting-hint">
          Enter your personal access token from the Up app (<strong>Up → Settings → API</strong>).
          Your token is encrypted at rest and never shared.
        </div>
        <div class="bank-token-form">
          <input
            class="pw-input"
            type="password"
            placeholder="up:yeah:..."
            bind:value={tokenInput}
            autocomplete="off"
            on:keydown={(e) => { if (e.key === 'Enter') connectBank(); }}
          />
          <button class="btn-primary" disabled={bankLoading} on:click={connectBank}>
            {bankLoading ? 'Connecting…' : 'Connect'}
          </button>
        </div>
      </div>
    {/if}

    <!-- CoinSpot divider -->
    <div class="provider-divider"></div>

    {#if csError}
      <div class="bank-banner bank-banner--err">{csError}</div>
    {/if}
    {#if csSuccess}
      <div class="bank-banner bank-banner--ok">{csSuccess}</div>
    {/if}

    {#if coinspotConn === undefined}
      <div class="setting-row"><span class="setting-hint">Loading…</span></div>
    {:else if coinspotConn}
      <!-- Connected -->
      <div class="setting-row">
        <div>
          <div class="setting-label">CoinSpot</div>
          <div class="setting-hint">
            Connected
            {#if coinspotConn.last_synced_at}
              · Last synced {new Date(coinspotConn.last_synced_at).toLocaleString()}
            {/if}
          </div>
        </div>
        <div class="bank-actions">
          <button class="btn-secondary" disabled={csSyncing} on:click={syncCoinspot}>
            {csSyncing ? 'Syncing…' : 'Sync now'}
          </button>
          <button class="btn-danger" on:click={() => { showCsDisconnect = true; }}>Disconnect</button>
        </div>
      </div>

      {#if coinspotConn.balances?.length}
        <div class="balances-grid">
          {#each coinspotConn.balances as bal}
            <div class="balance-card">
              <div class="balance-name">{bal.coin_type}</div>
              <div class="balance-type">{Number(bal.balance).toLocaleString('en-AU', { maximumSignificantDigits: 6 })} {bal.coin_type}</div>
              <div class="balance-amount">
                {Number(bal.aud_balance).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' })}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    {:else}
      <!-- Not connected -->
      <div class="setting-row setting-row--col">
        <div class="setting-label">CoinSpot</div>
        <div class="setting-hint">
          Enter your read-only API key and secret from CoinSpot
          (<strong>Account → API Keys → Read Only</strong>).
          Your credentials are encrypted at rest and never shared.
        </div>
        <div class="bank-token-form bank-token-form--two">
          <input
            id="cs-api-key"
            name="cs-api-key"
            class="pw-input"
            type="password"
            placeholder="API key"
            bind:value={csApiKey}
            autocomplete="off"
          />
          <input
            id="cs-api-secret"
            name="cs-api-secret"
            class="pw-input"
            type="password"
            placeholder="API secret"
            bind:value={csApiSecret}
            autocomplete="off"
            on:keydown={(e) => { if (e.key === 'Enter') connectCoinspot(); }}
          />
          <button class="btn-primary" disabled={csLoading} on:click={connectCoinspot}>
            {csLoading ? 'Connecting…' : 'Connect'}
          </button>
        </div>
      </div>
    {/if}
  </div>

  <div class="section">
    <h2>Data</h2>
    <div class="setting-row">
      <div>
        <div class="setting-label">Export budget</div>
        <div class="setting-hint">Download your full budget as JSON</div>
      </div>
      <a href="/api/budget/export" download class="btn-secondary">Export</a>
    </div>
  </div>
</div>

<!-- Disconnect confirm modal -->
{#if showDeleteConfirm}
  <div class="modal-backdrop" on:click|self={() => { showDeleteConfirm = false; }} role="dialog" aria-modal="true">
    <div class="modal">
      <h2>Disconnect Up Bank</h2>
      <p class="modal-hint">Choose what happens to your transaction history.</p>
      <label class="delete-opt">
        <input type="radio" bind:group={deleteAll} value={false} />
        <span>Keep transaction history (mark as disconnected)</span>
      </label>
      <label class="delete-opt">
        <input type="radio" bind:group={deleteAll} value={true} />
        <span>Delete all transaction data permanently</span>
      </label>
      <div class="modal-actions">
        <button class="btn-secondary" on:click={() => { showDeleteConfirm = false; }}>Cancel</button>
        <button class="btn-danger" disabled={bankLoading} on:click={disconnectBank}>
          {bankLoading ? 'Disconnecting…' : 'Disconnect'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- CoinSpot disconnect modal -->
{#if showCsDisconnect}
  <div class="modal-backdrop" on:click|self={() => { showCsDisconnect = false; }} role="dialog" aria-modal="true">
    <div class="modal">
      <h2>Disconnect CoinSpot</h2>
      <p class="modal-hint">Your API credentials and cached balances will be deleted.</p>
      <div class="modal-actions">
        <button class="btn-secondary" on:click={() => { showCsDisconnect = false; }}>Cancel</button>
        <button class="btn-danger" disabled={csLoading} on:click={disconnectCoinspot}>
          {csLoading ? 'Disconnecting…' : 'Disconnect'}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Username modal -->
{#if showUsernameModal}
  <div class="modal-backdrop" on:click|self={() => { showUsernameModal = false; }} role="dialog" aria-modal="true">
    <div class="modal">
      <h2>Change username</h2>
      <p class="modal-hint">This is how you appear across Skint.</p>

      {#if usernameError}
        <div class="modal-error">{usernameError}</div>
      {/if}

      <label class="modal-label" for="new-username">New username</label>
      <input
        id="new-username"
        class="pw-input"
        type="text"
        bind:value={newUsername}
        autocomplete="username"
        maxlength="32"
        on:keydown={(e) => { if (e.key === 'Enter') saveUsername(); }}
      />

      <div class="modal-actions">
        <button class="btn-secondary" on:click={() => { showUsernameModal = false; }}>Cancel</button>
        <button class="btn-primary" disabled={usernameLoading} on:click={saveUsername}>
          {usernameLoading ? 'Saving…' : 'Confirm'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .page { padding: 1.75rem 2rem; max-width: 640px; }

  h1 { margin-bottom: 1.5rem; }

  .section {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    margin-bottom: 1.25rem;
    overflow: hidden;
  }

  h2 {
    font-size: .7rem;
    text-transform: uppercase;
    letter-spacing: .08em;
    color: var(--fg-muted);
    padding: .75rem 1rem .5rem;
    border-bottom: 1px solid var(--border);
  }

  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: .875rem 1rem;
    border-bottom: 1px solid var(--border);
    gap: 1rem;
  }

  .setting-row:last-child { border-bottom: none; }

  .setting-label { font-size: .9rem; font-weight: 500; color: var(--fg); }
  .setting-hint  { font-size: .8rem; color: var(--fg-muted); margin-top: 2px; }

  .theme-btns {
    display: flex;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .theme-btn {
    padding: .35rem .75rem;
    font-size: .8rem;
    background: var(--surface);
    border: none;
    border-right: 1px solid var(--border);
    color: var(--fg-muted);
    cursor: pointer;
    transition: background 120ms, color 120ms;
  }

  .theme-btn:last-child { border-right: none; }
  .theme-btn:hover { background: var(--surface-2); color: var(--fg); }
  .theme-btn.active { background: var(--accent); color: #fff; }

  .btn-secondary {
    padding: .4rem .9rem;
    font-size: .85rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--fg);
    text-decoration: none;
    transition: background 120ms;
    white-space: nowrap;
  }

  .btn-secondary:hover { background: var(--surface-2); }

  .setting-row--col {
    flex-direction: column;
    align-items: flex-start;
    gap: .6rem;
  }

  .pw-form {
    display: flex;
    flex-direction: column;
    gap: .5rem;
    width: 100%;
    max-width: 320px;
  }

  .pw-input {
    width: 100%;
    padding: .45rem .7rem;
    font-size: .875rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--fg);
    box-sizing: border-box;
    transition: border-color 120ms;
  }

  .pw-input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 2px rgba(99,102,241,.12); }

  .btn-primary {
    padding: .45rem .9rem;
    font-size: .875rem;
    font-weight: 600;
    background: var(--accent);
    color: #fff;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: opacity 120ms;
    width: fit-content;
  }

  .btn-primary:hover:not(:disabled) { opacity: .88; }
  .btn-primary:disabled { opacity: .55; cursor: not-allowed; }

  .pw-banner {
    font-size: .8rem;
    padding: .4rem .7rem;
    border-radius: var(--radius-sm);
    width: 100%;
    max-width: 320px;
    box-sizing: border-box;
  }

  .pw-banner--ok  { background: color-mix(in srgb, #1D9E75 12%, transparent); color: #1D9E75; border: 1px solid color-mix(in srgb, #1D9E75 30%, transparent); }
  .pw-banner--err { background: color-mix(in srgb, #E24B4A 12%, transparent); color: #E24B4A; border: 1px solid color-mix(in srgb, #E24B4A 30%, transparent); }

  /* ── Modal ── */
  .modal-backdrop {
    position: fixed; inset: 0;
    background: rgba(0,0,0,.5);
    display: flex; align-items: center; justify-content: center;
    z-index: 200;
  }

  .modal {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1.75rem;
    width: 100%; max-width: 380px;
    box-shadow: var(--shadow-md);
  }

  .modal h2 { font-size: 1.1rem; font-weight: 700; margin: 0 0 .3rem; }
  .modal-hint { font-size: .82rem; color: var(--fg-muted); margin: 0 0 1.1rem; }
  .modal-label { display: block; font-size: .82rem; font-weight: 500; margin-bottom: .35rem; }

  .modal-error {
    font-size: .8rem;
    padding: .4rem .65rem;
    border-radius: var(--radius-sm);
    margin-bottom: .75rem;
    background: color-mix(in srgb, #E24B4A 12%, transparent);
    color: #E24B4A;
    border: 1px solid color-mix(in srgb, #E24B4A 30%, transparent);
  }

  .modal-actions {
    display: flex; gap: .65rem; justify-content: flex-end; margin-top: 1.25rem;
  }

  /* ── Bank / Connected Accounts ── */
  .bank-banner {
    font-size: .82rem;
    padding: .45rem .875rem;
    margin: .5rem 1rem 0;
    border-radius: var(--radius-sm);
  }
  .bank-banner--ok  { background: color-mix(in srgb, #1D9E75 12%, transparent); color: #1D9E75; border: 1px solid color-mix(in srgb, #1D9E75 30%, transparent); }
  .bank-banner--err { background: color-mix(in srgb, #E24B4A 12%, transparent); color: #E24B4A; border: 1px solid color-mix(in srgb, #E24B4A 30%, transparent); }

  .bank-actions { display: flex; gap: .5rem; }

  .btn-danger {
    padding: .4rem .9rem;
    font-size: .85rem;
    font-weight: 600;
    background: color-mix(in srgb, #E24B4A 15%, transparent);
    color: #E24B4A;
    border: 1px solid color-mix(in srgb, #E24B4A 40%, transparent);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background 120ms;
    white-space: nowrap;
  }
  .btn-danger:hover:not(:disabled) { background: color-mix(in srgb, #E24B4A 25%, transparent); }
  .btn-danger:disabled { opacity: .55; cursor: not-allowed; }

  .balances-grid {
    display: flex;
    gap: .75rem;
    padding: .75rem 1rem 1rem;
    flex-wrap: wrap;
  }

  .balance-card {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: .6rem .85rem;
    min-width: 160px;
  }

  .balance-name  { font-size: .85rem; font-weight: 600; color: var(--fg); }
  .balance-type  { font-size: .72rem; color: var(--fg-muted); text-transform: capitalize; margin-top: 1px; }
  .balance-amount { font-size: 1rem; font-weight: 700; color: var(--fg); margin-top: .35rem; }

  .bank-token-form { display: flex; gap: .5rem; width: 100%; max-width: 420px; }
  .bank-token-form .pw-input { flex: 1; }
  .bank-token-form--two { flex-wrap: wrap; max-width: 560px; }
  .bank-token-form--two .pw-input { flex: 1; min-width: 160px; }
  .provider-divider { height: 1px; background: var(--border); margin: 1.25rem 0; opacity: .5; }

  .delete-opt {
    display: flex;
    align-items: flex-start;
    gap: .5rem;
    font-size: .85rem;
    color: var(--fg);
    margin-bottom: .5rem;
    cursor: pointer;
  }
</style>
