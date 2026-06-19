<script lang="ts">
  import { onMount } from 'svelte';
  import {
    bankConnection, bankTransactions, bankTransactionMeta, bankSyncing,
    loadBankConnection, loadTransactions, triggerSync, confirmMatch
  } from '$lib/stores/bank.js';
  import { categories, loadBudget } from '$lib/stores/budget.js';
  import type { BankTransaction } from '$lib/types.js';

  // ── Tab state ─────────────────────────────────────────────────────────────
  let activeTab: 'live' | 'imported' = 'live';

  // ── Live tab ──────────────────────────────────────────────────────────────
  let page = 1;
  let filterConfidence = '';
  let filterItemId = '';
  let syncError = '';
  let syncSuccess = '';
  let rematching = false;

  async function rematch() {
    syncError = '';
    syncSuccess = '';
    rematching = true;
    try {
      const res = await fetch('/api/bank/rematch', { method: 'POST' });
      const json = await res.json();
      if (json.ok) {
        syncSuccess = `Re-matched: ${json.data.matched} of ${json.data.total} transactions.`;
        await reload();
      } else {
        syncError = json.error ?? 'Re-match failed';
      }
    } finally {
      rematching = false;
    }
  }

  let editingTxId: string | null = null;
  let editItemId = '';
  let matchLoading = false;
  let matchError = '';

  // 3-dot menu
  let menuOpenId: string | null = null;

  function toggleMenu(id: string, e: MouseEvent) {
    e.stopPropagation();
    menuOpenId = menuOpenId === id ? null : id;
  }

  function closeMenus() { menuOpenId = null; }

  // Add to Tax modal
  let taxModalTx: { id: string; description: string; merchant_raw: string; amount_cents: number; settled_at: string | null } | null = null;
  let taxModuleType = 'work_expense';
  let taxWorkPct = 100;
  let taxNotes = '';
  let taxSubmitting = false;
  let taxSuccess = '';
  let taxError = '';

  function openTaxModal(tx: BankTransaction) {
    taxModalTx = tx;
    taxModuleType = 'work_expense';
    taxWorkPct = 100;
    taxNotes = '';
    taxSuccess = '';
    taxError = '';
    menuOpenId = null;
  }

  async function submitTaxEntry() {
    if (!taxModalTx) return;
    taxSubmitting = true;
    taxError = '';
    const amtCents = Math.abs(taxModalTx.amount_cents);
    const dateStr = taxModalTx.settled_at ? taxModalTx.settled_at.split('T')[0] : new Date().toISOString().split('T')[0];
    const body = {
      module_type: taxModuleType,
      entry_date: dateStr,
      description: taxModalTx.description ?? taxModalTx.merchant_raw,
      amount_cents: amtCents,
      work_pct: taxWorkPct,
      linked_tx_id: taxModalTx.id,
      notes: taxNotes || null,
    };
    const res = await fetch('/api/tax/entries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json();
    if (json.ok) {
      taxSuccess = 'Added to tax entries.';
      setTimeout(() => { taxModalTx = null; }, 1500);
    } else {
      taxError = json.error ?? 'Failed to add';
    }
    taxSubmitting = false;
  }

  onMount(async () => {
    await Promise.all([loadBankConnection(), loadBudget()]);
    await loadTransactions(page);
    await loadImportFiles();
  });

  async function reload() {
    const f: Record<string, string> = {};
    if (filterConfidence) f.confidence = filterConfidence;
    if (filterItemId) f.budget_item_id = filterItemId;
    await loadTransactions(page, f);
  }

  async function syncNow() {
    syncError = '';
    syncSuccess = '';
    try {
      const r = await triggerSync();
      syncSuccess = `${r.inserted} new, ${r.updated} updated.`;
      await reload();
    } catch (e) {
      syncError = e instanceof Error ? e.message : 'Sync failed';
    }
  }

  async function saveMatch(tx: BankTransaction) {
    matchError = '';
    matchLoading = true;
    try {
      await confirmMatch(tx.id, editItemId || null);
      editingTxId = null;
    } catch (e) {
      matchError = e instanceof Error ? e.message : 'Failed to save';
    } finally {
      matchLoading = false;
    }
  }

  function openEdit(tx: BankTransaction) {
    editingTxId = tx.id;
    editItemId = tx.budget_item_id ?? '';
    matchError = '';
  }

  // ── Imported tab ──────────────────────────────────────────────────────────
  type ImportFile = { id: string; filename: string; bank_name: string; row_count: number; imported_at: string };
  type ImportedTx = {
    id: string; settled_at: string; description: string; amount_cents: number;
    budget_item_id: string | null; budget_item_label: string | null;
    match_confidence: string | null; match_confirmed: boolean;
  };

  let importFiles: ImportFile[] = [];
  let selectedFileId: string | null = null;
  let importedTxs: ImportedTx[] = [];
  let importMeta: { page: number; pages: number; total: number } | null = null;
  let importPage = 1;
  let importLoading = false;
  let importError = '';
  let importSuccess = '';
  let uploading = false;
  let fileInput: HTMLInputElement;
  let confirmDeleteId: string | null = null;
  let deleting = false;

  async function loadImportFiles() {
    const res = await fetch('/api/bank/import').then(r => r.json()).catch(() => ({ ok: false }));
    if (res.ok) importFiles = res.data;
  }

  async function loadImportedTxs(fileId: string, pg = 1) {
    importLoading = true;
    importedTxs = [];
    importMeta = null;
    const res = await fetch(`/api/bank/import/${fileId}?page=${pg}`).then(r => r.json()).catch(() => ({ ok: false }));
    if (res.ok) {
      importedTxs = res.data;
      importMeta = res.meta;
    }
    importLoading = false;
  }

  async function selectFile(id: string) {
    selectedFileId = id;
    importPage = 1;
    await loadImportedTxs(id, 1);
  }

  async function uploadFile() {
    const file = fileInput?.files?.[0];
    if (!file) return;
    importError = '';
    importSuccess = '';
    uploading = true;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch('/api/bank/import', { method: 'POST', body: fd });
      const json = await res.json();
      if (json.ok) {
        importSuccess = `Imported ${json.data.imported} transactions from ${json.data.bank} — ${json.data.matched} matched.`;
        fileInput.value = '';
        await loadImportFiles();
        await selectFile(json.data.fileId);
      } else {
        importError = json.error ?? 'Import failed.';
      }
    } finally {
      uploading = false;
    }
  }

  async function deleteImport(id: string) {
    deleting = true;
    const res = await fetch(`/api/bank/import/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.ok) {
      importFiles = importFiles.filter(f => f.id !== id);
      if (selectedFileId === id) { selectedFileId = null; importedTxs = []; importMeta = null; }
      confirmDeleteId = null;
    }
    deleting = false;
  }

  // ── Shared helpers ────────────────────────────────────────────────────────
  $: allItems = ($categories ?? []).flatMap(c => c.items ?? []);

  function formatAmount(cents: number, currency = 'AUD') {
    return (Math.abs(cents) / 100).toLocaleString('en-AU', { style: 'currency', currency });
  }

  function formatDate(iso: string | null) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function isDebit(cents: number) { return cents < 0; }
</script>

<div class="page">
  <div class="page-header">
    <div>
      <h1>Transactions</h1>
      {#if $bankConnection}
        <div class="sub-text">
          Up Bank · {$bankConnection.display_name ?? ''}
          {#if $bankConnection.last_synced_at}
            · Last synced {new Date($bankConnection.last_synced_at).toLocaleString()}
          {/if}
        </div>
      {/if}
    </div>
    <div class="header-actions">
      {#if activeTab === 'live' && $bankConnection}
        <a href="/api/bank/export" download="skint-transactions.csv" class="btn-secondary">Export CSV</a>
        <button class="btn-secondary" disabled={rematching} on:click={rematch}>
          {rematching ? 'Matching…' : 'Re-match all'}
        </button>
        <button class="btn-primary" disabled={$bankSyncing} on:click={syncNow}>
          {$bankSyncing ? 'Syncing…' : 'Sync now'}
        </button>
      {/if}
    </div>
  </div>

  <!-- Tabs -->
  <div class="tabs">
    <button class="tab" class:tab--active={activeTab === 'live'} on:click={() => { activeTab = 'live'; }}>
      Live {#if $bankConnection}<span class="tab-badge">Up Bank</span>{/if}
    </button>
    <button class="tab" class:tab--active={activeTab === 'imported'} on:click={() => { activeTab = 'imported'; }}>
      Imported {#if importFiles.length}<span class="tab-badge">{importFiles.length}</span>{/if}
    </button>
  </div>

  <!-- ── LIVE TAB ─────────────────────────────────────────────────────────── -->
  {#if activeTab === 'live'}
    {#if syncError}<div class="banner banner--err">{syncError}</div>{/if}
    {#if syncSuccess}<div class="banner banner--ok">{syncSuccess}</div>{/if}

    {#if !$bankConnection && $bankConnection !== undefined}
      <div class="empty-state">
        <div class="empty-icon">↕</div>
        <div class="empty-title">No bank connected</div>
        <div class="empty-hint">Go to <a href="/settings">Settings → Connected Accounts</a> to link your Up Bank account.</div>
      </div>
    {:else if $bankConnection}
      <div class="filters">
        <select class="filter-select" bind:value={filterConfidence} on:change={() => { page = 1; reload(); }}>
          <option value="">All matches</option>
          <option value="high">High confidence</option>
          <option value="medium">Medium confidence</option>
          <option value="low">Low confidence</option>
          <option value="unmatched">Unmatched</option>
        </select>
        <select class="filter-select" bind:value={filterItemId} on:change={() => { page = 1; reload(); }}>
          <option value="">All categories</option>
          {#each $categories ?? [] as cat}
            <optgroup label={cat.name}>
              {#each cat.items ?? [] as item}
                <option value={item.id}>{item.label}</option>
              {/each}
            </optgroup>
          {/each}
        </select>
      </div>

      <div class="table-wrap">
        <table class="tx-table">
          <thead>
            <tr>
              <th>Date</th><th>Description</th><th class="th-right">Amount</th>
              <th>Budget item</th><th>Confidence</th><th></th>
            </tr>
          </thead>
          <tbody>
            {#each $bankTransactions as tx (tx.id)}
              <tr class:debit={isDebit(tx.amount_cents)} class:credit={!isDebit(tx.amount_cents)}>
                <td class="td-date">{formatDate(tx.settled_at)}</td>
                <td class="td-desc">
                  <div class="desc-main">{tx.description ?? tx.merchant_raw}</div>
                  {#if tx.description && tx.merchant_raw !== tx.description}
                    <div class="desc-raw">{tx.merchant_raw}</div>
                  {/if}
                </td>
                <td class="td-amount" class:amount-debit={isDebit(tx.amount_cents)} class:amount-credit={!isDebit(tx.amount_cents)}>
                  {isDebit(tx.amount_cents) ? '−' : '+'}{formatAmount(tx.amount_cents, tx.currency)}
                </td>
                <td class="td-match">
                  {#if editingTxId === tx.id}
                    <div class="match-edit">
                      <select class="match-select" bind:value={editItemId}>
                        <option value="">— unmatched —</option>
                        {#each $categories ?? [] as cat}
                          <optgroup label={cat.name}>
                            {#each cat.items ?? [] as item}
                              <option value={item.id}>{item.label}</option>
                            {/each}
                          </optgroup>
                        {/each}
                      </select>
                      {#if matchError}<div class="match-err">{matchError}</div>{/if}
                    </div>
                  {:else if tx.budget_item_label}
                    <span class="match-label">{tx.budget_item_label}</span>
                  {:else}
                    <span class="match-none">—</span>
                  {/if}
                </td>
                <td class="td-conf">
                  {#if tx.match_confidence && tx.match_confidence !== 'unmatched'}
                    <span class="badge badge--{tx.match_confidence}">
                      {tx.match_confirmed ? '✓ ' : ''}{tx.match_confidence}
                    </span>
                  {:else}
                    <span class="badge badge--unmatched">unmatched</span>
                  {/if}
                </td>
                <td class="td-actions">
                  {#if editingTxId === tx.id}
                    <button class="act-btn act-btn--save" disabled={matchLoading} on:click={() => saveMatch(tx)}>Save</button>
                    <button class="act-btn" on:click={() => { editingTxId = null; }}>Cancel</button>
                  {:else}
                    <button class="act-btn" on:click={() => openEdit(tx)}>Edit</button>
                    <div class="menu-wrap">
                      <button class="act-btn act-btn--menu" on:click={(e) => toggleMenu(tx.id, e)} title="More options">⋯</button>
                      {#if menuOpenId === tx.id}
                        <div class="dropdown-menu" role="menu">
                          <button class="dropdown-item" on:click={() => openTaxModal(tx)}>📋 Add to Tax</button>
                        </div>
                      {/if}
                    </div>
                  {/if}
                </td>
              </tr>
            {/each}
            {#if $bankTransactions.length === 0}
              <tr><td colspan="6" class="td-empty">No transactions found.</td></tr>
            {/if}
          </tbody>
        </table>
      </div>

      {#if $bankTransactionMeta && $bankTransactionMeta.pages > 1}
        <div class="pagination">
          <button class="pg-btn" disabled={page <= 1} on:click={() => { page--; reload(); }}>← Prev</button>
          <span class="pg-info">Page {page} of {$bankTransactionMeta.pages} · {$bankTransactionMeta.total} transactions</span>
          <button class="pg-btn" disabled={page >= $bankTransactionMeta.pages} on:click={() => { page++; reload(); }}>Next →</button>
        </div>
      {:else if $bankTransactionMeta}
        <div class="pagination">
          <span class="pg-info">{$bankTransactionMeta.total} transaction{$bankTransactionMeta.total !== 1 ? 's' : ''}</span>
        </div>
      {/if}
    {/if}

  <!-- ── IMPORTED TAB ──────────────────────────────────────────────────────── -->
  {:else}
    {#if importError}<div class="banner banner--err">{importError}</div>{/if}
    {#if importSuccess}<div class="banner banner--ok">{importSuccess}</div>{/if}

    <!-- Upload area -->
    <div class="import-upload">
      <div class="import-upload-label">
        Upload a bank statement CSV
        <span class="import-hint">Supports ANZ, CommBank, Westpac, NAB, ING, St George, Bendigo, Suncorp, Macquarie</span>
      </div>
      <div class="import-upload-row">
        <input
          id="import-file"
          name="import-file"
          type="file"
          accept=".csv,text/csv"
          bind:this={fileInput}
          class="file-input"
          on:change={uploadFile}
          disabled={uploading}
        />
        <label for="import-file" class="btn-secondary file-label" class:disabled={uploading}>
          {uploading ? 'Importing…' : 'Choose CSV file'}
        </label>
      </div>
    </div>

    {#if importFiles.length === 0}
      <div class="empty-state">
        <div class="empty-icon">📂</div>
        <div class="empty-title">No imported statements yet</div>
        <div class="empty-hint">Upload a CSV export from your bank above.</div>
      </div>
    {:else}
      <div class="import-layout">
        <!-- File list sidebar -->
        <div class="import-sidebar">
          {#each importFiles as f}
            <button
              class="import-file-btn"
              class:import-file-btn--active={selectedFileId === f.id}
              on:click={() => selectFile(f.id)}
            >
              <div class="import-file-name">{f.filename}</div>
              <div class="import-file-meta">
                {f.bank_name} · {f.row_count} rows
                · {new Date(f.imported_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
              </div>
            </button>
          {/each}
        </div>

        <!-- Transaction table for selected file -->
        <div class="import-main">
          {#if !selectedFileId}
            <div class="import-select-hint">Select a file to view its transactions</div>
          {:else if importLoading}
            <div class="import-select-hint">Loading…</div>
          {:else}
            {@const selectedFile = importFiles.find(f => f.id === selectedFileId)}
            <div class="import-file-header">
              <div>
                <span class="import-file-title">{selectedFile?.filename}</span>
                <span class="import-file-subtitle">{selectedFile?.bank_name} · {selectedFile?.row_count} rows</span>
              </div>
              {#if confirmDeleteId === selectedFileId}
                <div class="delete-confirm">
                  Delete all {selectedFile?.row_count} transactions?
                  <button class="act-btn act-btn--danger" disabled={deleting} on:click={() => deleteImport(selectedFileId)}>
                    {deleting ? 'Deleting…' : 'Yes, delete'}
                  </button>
                  <button class="act-btn" on:click={() => { confirmDeleteId = null; }}>Cancel</button>
                </div>
              {:else}
                <button class="act-btn act-btn--danger" on:click={() => { confirmDeleteId = selectedFileId; }}>
                  Delete import
                </button>
              {/if}
            </div>

            <div class="table-wrap">
              <table class="tx-table">
                <thead>
                  <tr>
                    <th>Date</th><th>Description</th><th class="th-right">Amount</th>
                    <th>Budget item</th><th>Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {#each importedTxs as tx (tx.id)}
                    <tr class:debit={isDebit(tx.amount_cents)} class:credit={!isDebit(tx.amount_cents)}>
                      <td class="td-date">{formatDate(tx.settled_at)}</td>
                      <td class="td-desc"><div class="desc-main">{tx.description}</div></td>
                      <td class="td-amount" class:amount-debit={isDebit(tx.amount_cents)} class:amount-credit={!isDebit(tx.amount_cents)}>
                        {isDebit(tx.amount_cents) ? '−' : '+'}{formatAmount(tx.amount_cents)}
                      </td>
                      <td class="td-match">
                        {#if tx.budget_item_label}
                          <span class="match-label">{tx.budget_item_label}</span>
                        {:else}
                          <span class="match-none">—</span>
                        {/if}
                      </td>
                      <td class="td-conf">
                        {#if tx.match_confidence && tx.match_confidence !== 'unmatched'}
                          <span class="badge badge--{tx.match_confidence}">{tx.match_confidence}</span>
                        {:else}
                          <span class="badge badge--unmatched">unmatched</span>
                        {/if}
                      </td>
                    </tr>
                  {/each}
                  {#if importedTxs.length === 0}
                    <tr><td colspan="5" class="td-empty">No transactions in this file.</td></tr>
                  {/if}
                </tbody>
              </table>
            </div>

            {#if importMeta && importMeta.pages > 1}
              <div class="pagination">
                <button class="pg-btn" disabled={importPage <= 1} on:click={() => { importPage--; loadImportedTxs(selectedFileId, importPage); }}>← Prev</button>
                <span class="pg-info">Page {importPage} of {importMeta.pages} · {importMeta.total} transactions</span>
                <button class="pg-btn" disabled={importPage >= importMeta.pages} on:click={() => { importPage++; loadImportedTxs(selectedFileId, importPage); }}>Next →</button>
              </div>
            {:else if importMeta}
              <div class="pagination">
                <span class="pg-info">{importMeta.total} transaction{importMeta.total !== 1 ? 's' : ''}</span>
              </div>
            {/if}
          {/if}
        </div>
      </div>
    {/if}
  {/if}
</div>

<!-- Click-outside overlay to close menus -->
{#if menuOpenId}
  <div class="menu-overlay" on:click={closeMenus} role="presentation"></div>
{/if}

<!-- Add to Tax modal -->
{#if taxModalTx}
  <div class="modal-overlay" on:click={() => taxModalTx = null} role="presentation">
    <div class="modal-card" on:click={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Add to Tax">
      <div class="modal-header">
        <h2>Add to Tax</h2>
        <button class="modal-close" on:click={() => taxModalTx = null}>✕</button>
      </div>

      <div class="tax-modal-tx">
        <div class="tmtx-desc">{taxModalTx.description ?? taxModalTx.merchant_raw}</div>
        <div class="tmtx-meta">
          {taxModalTx.settled_at ? new Date(taxModalTx.settled_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
          · {(Math.abs(taxModalTx.amount_cents) / 100).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' })}
        </div>
      </div>

      {#if taxSuccess}
        <div class="banner banner--ok">{taxSuccess}</div>
      {:else}
        {#if taxError}<div class="banner banner--err">{taxError}</div>{/if}

        <div class="modal-field">
          <label for="tax-module">Tax module</label>
          <select id="tax-module" name="tax-module" bind:value={taxModuleType}>
            <option value="work_expense">Work Expenses (D5)</option>
            <option value="client_expense">Client Expenses</option>
            <option value="vehicle_service">Vehicle Servicing</option>
            <option value="fuel">Fuel (D2)</option>
            <option value="professional_dev">Professional Development (D4)</option>
            <option value="interest">Bank Interest (Income)</option>
          </select>
        </div>

        <div class="modal-field">
          <label for="tax-pct">Work-use % <span class="field-hint">(portion that is work-related)</span></label>
          <input id="tax-pct" name="tax-pct" type="number" min="0" max="100" bind:value={taxWorkPct} />
        </div>

        <div class="modal-field">
          <label for="tax-notes">Notes (optional)</label>
          <input id="tax-notes" name="tax-notes" type="text" placeholder="e.g. Required for work presentation" bind:value={taxNotes} />
        </div>

        <div class="modal-actions">
          <button class="btn-secondary" on:click={() => taxModalTx = null}>Cancel</button>
          <button class="btn-primary" disabled={taxSubmitting} on:click={submitTaxEntry}>
            {taxSubmitting ? 'Adding…' : 'Add to Tax'}
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .page { padding: 1.75rem 2rem; }

  .page-header {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: 1rem; margin-bottom: 1rem;
  }
  h1 { margin: 0 0 .25rem; }
  .sub-text { font-size: .8rem; color: var(--fg-muted); }

  /* Tabs */
  .tabs { display: flex; gap: 0; border-bottom: 1px solid var(--border); margin-bottom: 1.25rem; }
  .tab {
    padding: .55rem 1.1rem; font-size: .875rem; font-weight: 500;
    background: none; border: none; border-bottom: 2px solid transparent;
    color: var(--fg-muted); cursor: pointer; margin-bottom: -1px; transition: color 120ms;
    display: flex; align-items: center; gap: .4rem;
  }
  .tab:hover { color: var(--fg); }
  .tab--active { color: var(--fg); border-bottom-color: var(--accent); }
  .tab-badge {
    font-size: .68rem; font-weight: 600; padding: .1rem .4rem;
    background: color-mix(in srgb, var(--accent) 15%, transparent);
    color: var(--accent); border-radius: 99px;
  }

  .banner { font-size: .82rem; padding: .45rem .875rem; border-radius: var(--radius-sm); margin-bottom: .75rem; }
  .banner--ok  { background: color-mix(in srgb, #1D9E75 12%, transparent); color: #1D9E75; border: 1px solid color-mix(in srgb, #1D9E75 30%, transparent); }
  .banner--err { background: color-mix(in srgb, #E24B4A 12%, transparent); color: #E24B4A; border: 1px solid color-mix(in srgb, #E24B4A 30%, transparent); }

  .empty-state { text-align: center; padding: 4rem 2rem; color: var(--fg-muted); }
  .empty-icon  { font-size: 2.5rem; margin-bottom: .75rem; opacity: .4; }
  .empty-title { font-size: 1.05rem; font-weight: 600; color: var(--fg); margin-bottom: .4rem; }
  .empty-hint  { font-size: .875rem; }
  .empty-hint a { color: var(--accent); }

  .filters { display: flex; gap: .65rem; margin-bottom: 1rem; flex-wrap: wrap; }
  .filter-select {
    padding: .35rem .6rem; font-size: .82rem; border: 1px solid var(--border);
    border-radius: var(--radius-sm); background: var(--surface); color: var(--fg); cursor: pointer;
  }

  .table-wrap { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: auto; }
  .tx-table { width: 100%; border-collapse: collapse; font-size: .875rem; }
  .tx-table th {
    padding: .55rem .875rem; text-align: left; font-size: .7rem; text-transform: uppercase;
    letter-spacing: .06em; color: var(--fg-muted); border-bottom: 1px solid var(--border);
    background: var(--surface); white-space: nowrap;
  }
  .th-right { text-align: right; }
  .tx-table td { padding: .6rem .875rem; border-bottom: 1px solid rgba(var(--border-rgb, 255,255,255), .04); vertical-align: middle; }
  .tx-table tr:last-child td { border-bottom: none; }
  .tx-table tr:hover td { background: var(--surface-2); }

  .td-date   { white-space: nowrap; color: var(--fg-muted); font-size: .8rem; }
  .td-desc   { max-width: 280px; }
  .td-amount { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; font-weight: 600; }
  .td-empty  { text-align: center; color: var(--fg-muted); padding: 2rem; }

  .desc-main { font-weight: 500; }
  .desc-raw  { font-size: .75rem; color: var(--fg-muted); margin-top: 1px; }

  .amount-debit  { color: #E24B4A; }
  .amount-credit { color: #1D9E75; }

  .match-label { font-size: .82rem; color: var(--fg); }
  .match-none  { color: var(--fg-muted); }
  .match-edit  { display: flex; flex-direction: column; gap: .25rem; }
  .match-select {
    font-size: .8rem; padding: .25rem .4rem; border: 1px solid var(--accent);
    border-radius: var(--radius-sm); background: var(--surface-2); color: var(--fg);
  }
  .match-err { font-size: .75rem; color: #E24B4A; }

  .badge { display: inline-block; font-size: .7rem; padding: .15rem .45rem; border-radius: 999px; font-weight: 600; white-space: nowrap; }
  .badge--high      { background: color-mix(in srgb, #1D9E75 15%, transparent); color: #1D9E75; }
  .badge--medium    { background: color-mix(in srgb, #F59E0B 15%, transparent); color: #F59E0B; }
  .badge--low       { background: color-mix(in srgb, #6366f1 15%, transparent); color: #8b8cf8; }
  .badge--unmatched { background: color-mix(in srgb, #6b7280 15%, transparent); color: #9ca3af; }

  .td-actions { white-space: nowrap; }
  .act-btn {
    font-size: .78rem; padding: .2rem .5rem; border: 1px solid var(--border);
    border-radius: var(--radius-sm); background: var(--surface); color: var(--fg-muted);
    cursor: pointer; transition: background 120ms, color 120ms; margin-right: .25rem;
  }
  .act-btn:hover:not(:disabled) { background: var(--surface-2); color: var(--fg); }
  .act-btn--save { border-color: var(--accent); color: var(--accent); }
  .act-btn--save:hover:not(:disabled) { background: color-mix(in srgb, var(--accent) 12%, transparent); }
  .act-btn--danger { border-color: #E24B4A; color: #E24B4A; }
  .act-btn--danger:hover:not(:disabled) { background: color-mix(in srgb, #E24B4A 10%, transparent); }
  .act-btn:disabled { opacity: .5; cursor: not-allowed; }

  .pagination { display: flex; align-items: center; justify-content: center; gap: 1rem; padding: 1rem 0; }
  .pg-info { font-size: .82rem; color: var(--fg-muted); }
  .pg-btn {
    font-size: .82rem; padding: .3rem .7rem; border: 1px solid var(--border);
    border-radius: var(--radius-sm); background: var(--surface); color: var(--fg);
    cursor: pointer; transition: background 120ms;
  }
  .pg-btn:hover:not(:disabled) { background: var(--surface-2); }
  .pg-btn:disabled { opacity: .4; cursor: not-allowed; }

  .header-actions { display: flex; gap: .5rem; align-items: center; }
  .btn-secondary {
    padding: .45rem .9rem; font-size: .875rem; border: 1px solid var(--border);
    border-radius: var(--radius-sm); background: var(--surface); color: var(--fg);
    cursor: pointer; transition: background 120ms; white-space: nowrap; text-decoration: none;
    display: inline-flex; align-items: center;
  }
  .btn-secondary:hover:not(:disabled):not(.disabled) { background: var(--surface-2); }
  .btn-secondary:disabled, .btn-secondary.disabled { opacity: .55; cursor: not-allowed; }
  .btn-primary {
    padding: .45rem .9rem; font-size: .875rem; font-weight: 600; background: var(--accent);
    color: #fff; border: none; border-radius: var(--radius-sm); cursor: pointer;
    transition: opacity 120ms; white-space: nowrap;
  }
  .btn-primary:hover:not(:disabled) { opacity: .88; }
  .btn-primary:disabled { opacity: .55; cursor: not-allowed; }

  /* Import tab */
  .import-upload {
    background: var(--surface); border: 1px dashed var(--border); border-radius: var(--radius);
    padding: 1.1rem 1.25rem; margin-bottom: 1.25rem;
    display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;
  }
  .import-upload-label { font-size: .875rem; font-weight: 500; }
  .import-hint { display: block; font-size: .75rem; color: var(--fg-muted); margin-top: .2rem; font-weight: 400; }
  .import-upload-row { display: flex; align-items: center; gap: .75rem; }
  .file-input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
  .file-label { cursor: pointer; }

  .import-layout { display: flex; gap: 1rem; align-items: flex-start; }
  .import-sidebar { width: 220px; flex-shrink: 0; display: flex; flex-direction: column; gap: .4rem; }
  .import-file-btn {
    width: 100%; text-align: left; padding: .6rem .75rem; background: var(--surface);
    border: 1px solid var(--border); border-radius: var(--radius-sm); cursor: pointer;
    transition: background 120ms; color: var(--fg);
  }
  .import-file-btn:hover { background: var(--surface-2); }
  .import-file-btn--active { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 6%, transparent); }
  .import-file-name { font-size: .82rem; font-weight: 500; word-break: break-all; }
  .import-file-meta { font-size: .72rem; color: var(--fg-muted); margin-top: .15rem; }

  .import-main { flex: 1; min-width: 0; }
  .import-select-hint { color: var(--fg-muted); font-size: .875rem; padding: 2rem; text-align: center; }
  .import-file-header {
    display: flex; align-items: center; justify-content: space-between;
    gap: 1rem; margin-bottom: .75rem; flex-wrap: wrap;
  }
  .import-file-title { font-weight: 600; font-size: .9rem; margin-right: .5rem; }
  .import-file-subtitle { font-size: .78rem; color: var(--fg-muted); }
  .delete-confirm { display: flex; align-items: center; gap: .5rem; font-size: .82rem; color: var(--fg-muted); }

  /* 3-dot menu */
  .menu-wrap { position: relative; display: inline-block; }
  .act-btn--menu { font-size: 1rem; letter-spacing: .1em; padding: .25rem .45rem; }
  .menu-overlay { position: fixed; inset: 0; z-index: 90; }
  .dropdown-menu {
    position: absolute; right: 0; top: calc(100% + 4px);
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius-sm); box-shadow: var(--shadow);
    min-width: 150px; z-index: 100; overflow: hidden;
  }
  .dropdown-item {
    display: block; width: 100%; padding: .55rem .85rem;
    background: none; border: none; text-align: left;
    font-size: .85rem; color: var(--fg); cursor: pointer;
    transition: background 100ms;
  }
  .dropdown-item:hover { background: var(--surface-2); }

  /* Tax modal */
  .modal-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,.5);
    display: flex; align-items: center; justify-content: center;
    z-index: 200; padding: 1rem;
  }
  .modal-card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 1.5rem;
    width: 100%; max-width: 440px; box-shadow: var(--shadow);
  }
  .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; }
  .modal-header h2 { font-size: 1.1rem; font-weight: 700; margin: 0; }
  .modal-close { background: none; border: none; font-size: 1rem; cursor: pointer; color: var(--fg-muted); padding: 4px; border-radius: 4px; }
  .modal-close:hover { color: var(--fg); background: var(--surface-2); }

  .tax-modal-tx { background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: .65rem .85rem; margin-bottom: 1rem; }
  .tmtx-desc { font-size: .9rem; font-weight: 500; margin-bottom: .2rem; }
  .tmtx-meta { font-size: .8rem; color: var(--fg-muted); }

  .modal-field { display: flex; flex-direction: column; gap: 5px; margin-bottom: .85rem; }
  .modal-field label { font-size: .8rem; font-weight: 500; color: var(--fg-muted); }
  .field-hint { font-weight: 400; opacity: .7; }
  .modal-field input, .modal-field select {
    padding: .5rem .65rem; border: 1px solid var(--border);
    border-radius: var(--radius-sm); background: var(--surface-2);
    color: var(--fg); font-size: .875rem;
  }
  .modal-field input:focus, .modal-field select:focus { outline: none; border-color: var(--accent); }
  .modal-actions { display: flex; gap: .65rem; justify-content: flex-end; margin-top: 1.25rem; }

  .banner { padding: .55rem .75rem; border-radius: var(--radius-sm); font-size: .84rem; margin-bottom: .85rem; }
  .banner--ok { background: rgba(34,197,94,.1); border: 1px solid rgba(34,197,94,.3); color: #16a34a; }
  .banner--err { background: rgba(226,75,74,.1); border: 1px solid rgba(226,75,74,.3); color: #E24B4A; }
</style>
