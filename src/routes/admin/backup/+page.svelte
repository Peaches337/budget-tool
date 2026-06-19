<script lang="ts">
  import { onMount } from 'svelte';

  type Backup = { filename: string; size: number; created_at: string };

  let backups: Backup[] = [];
  let backupPath = '';
  let loading = true;
  let creating = false;
  let error = '';
  let success = '';

  // Restore
  let restoreFile: FileList | undefined;
  let restoring = false;
  let restoreConfirm = false;
  let restoreError = '';
  let restoreSuccess = '';

  async function loadBackups() {
    loading = true;
    const res = await fetch('/api/admin/backup').then(r => r.json()).catch(() => ({ ok: false }));
    if (res.ok) {
      backups = res.data;
      backupPath = res.backup_path;
    } else {
      error = res.error ?? 'Failed to load backups';
    }
    loading = false;
  }

  async function createBackup() {
    creating = true;
    error = '';
    success = '';
    const res = await fetch('/api/admin/backup', { method: 'POST' }).then(r => r.json()).catch(() => ({ ok: false }));
    if (res.ok) {
      success = `Backup created: ${res.data.filename} (${fmtSize(res.data.size)})`;
      await loadBackups();
    } else {
      error = res.error ?? 'Backup failed';
    }
    creating = false;
  }

  async function deleteBackup(filename: string) {
    if (!confirm(`Delete ${filename}? This cannot be undone.`)) return;
    error = '';
    const res = await fetch('/api/admin/backup', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename }),
    }).then(r => r.json()).catch(() => ({ ok: false }));
    if (res.ok) {
      backups = backups.filter(b => b.filename !== filename);
    } else {
      error = res.error ?? 'Delete failed';
    }
  }

  async function restoreBackup() {
    const file = restoreFile?.[0];
    if (!file) return;
    restoring = true;
    restoreError = '';
    restoreSuccess = '';
    const form = new FormData();
    form.append('backup', file);
    const res = await fetch('/api/admin/backup', { method: 'PUT', body: form }).then(r => r.json()).catch(() => ({ ok: false }));
    if (res.ok) {
      restoreSuccess = `Restore complete from ${file.name}. The database has been overwritten.`;
      restoreConfirm = false;
      restoreFile = undefined;
    } else {
      restoreError = res.error ?? 'Restore failed';
    }
    restoring = false;
  }

  function fmtSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function fmtDate(iso: string): string {
    return new Date(iso).toLocaleString('en-AU', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  onMount(loadBackups);
</script>

<div class="page">
  <div class="page-header">
    <div>
      <h1>Database Backups</h1>
      <div class="sub-text">pg_dump backups stored on the server · up to 10 retained automatically</div>
    </div>
    <button class="btn-primary" disabled={creating} on:click={createBackup}>
      {creating ? 'Creating…' : '+ Create backup'}
    </button>
  </div>

  {#if error}
    <div class="banner banner--err">
      {error}
      {#if error.includes('not found')}
        <div class="banner-hint">On Linux: <code>apt install postgresql-client</code> · On Windows: set <code>PG_DUMP_PATH</code> in .env to the full path of pg_dump.exe</div>
      {/if}
    </div>
  {/if}
  {#if success}<div class="banner banner--ok">{success}</div>{/if}

  <div class="info-card">
    <div class="info-row">
      <span class="info-label">Storage location</span>
      <code class="info-val">{backupPath || '—'}</code>
    </div>
    <div class="info-row">
      <span class="info-label">Format</span>
      <span class="info-val">Plain SQL, gzip compressed (.sql.gz)</span>
    </div>
    <div class="info-row">
      <span class="info-label">Retention</span>
      <span class="info-val">10 most recent — older ones pruned automatically</span>
    </div>
    <div class="info-row">
      <span class="info-label">Restore (CLI)</span>
      <code class="info-val">gunzip -c backup.sql.gz | psql $DATABASE_URL</code>
    </div>
  </div>

  <!-- ── Existing backups ── -->
  {#if loading}
    <div class="empty-state">Loading…</div>
  {:else if backups.length === 0}
    <div class="empty-state">No backups yet. Click "+ Create backup" to make one.</div>
  {:else}
    <div class="table-wrap">
      <table class="backup-table">
        <thead>
          <tr>
            <th>Filename</th>
            <th class="th-right">Size</th>
            <th>Created</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each backups as b (b.filename)}
            <tr>
              <td class="td-filename">{b.filename}</td>
              <td class="td-right td-muted">{fmtSize(b.size)}</td>
              <td class="td-muted">{fmtDate(b.created_at)}</td>
              <td class="td-actions">
                <a href="/api/admin/backup/{b.filename}" download={b.filename} class="act-btn act-btn--dl">↓ Download</a>
                <button class="act-btn act-btn--del" on:click={() => deleteBackup(b.filename)}>✕</button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  <!-- ── Restore section ── -->
  <div class="restore-section">
    <h2>Restore from backup</h2>
    <p class="restore-sub">Upload a <code>.sql.gz</code> or <code>.sql</code> backup file to restore the database. <strong>This will overwrite all current data.</strong></p>

    {#if restoreError}<div class="banner banner--err">{restoreError}</div>{/if}
    {#if restoreSuccess}<div class="banner banner--ok">{restoreSuccess}</div>{/if}

    <div class="restore-form">
      <label class="file-label">
        <input type="file" accept=".sql.gz,.sql" bind:files={restoreFile} />
        <span class="file-btn">Choose backup file</span>
        <span class="file-name">{restoreFile?.[0]?.name ?? 'No file chosen'}</span>
      </label>

      {#if restoreFile?.[0]}
        {#if !restoreConfirm}
          <div class="restore-warning">
            <span class="warn-icon">⚠</span>
            Restoring will <strong>replace all data</strong> in the database with the contents of <strong>{restoreFile[0].name}</strong>. This cannot be undone.
          </div>
          <button class="btn-danger" on:click={() => restoreConfirm = true}>I understand — proceed with restore</button>
        {:else}
          <div class="restore-confirm-row">
            <button class="btn-danger" disabled={restoring} on:click={restoreBackup}>
              {restoring ? 'Restoring database…' : '⚠ Confirm restore'}
            </button>
            <button class="btn-secondary" on:click={() => restoreConfirm = false}>Cancel</button>
          </div>
        {/if}
      {/if}
    </div>
  </div>
</div>

<style>
  .page { padding: 2rem; max-width: 860px; }
  .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; }
  h1 { font-size: 1.4rem; font-weight: 700; margin: 0 0 .25rem; }
  .sub-text { font-size: .83rem; color: var(--fg-muted); }

  .info-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 1rem 1.25rem; margin-bottom: 1.5rem; display: flex; flex-direction: column; gap: .55rem; }
  .info-row { display: flex; gap: 1rem; align-items: baseline; font-size: .875rem; }
  .info-label { width: 140px; flex-shrink: 0; color: var(--fg-muted); font-size: .8rem; font-weight: 500; }
  .info-val { color: var(--fg); }
  code { font-family: monospace; font-size: .8rem; background: var(--surface-2); padding: .15rem .4rem; border-radius: 4px; }

  .empty-state { padding: 3rem; text-align: center; color: var(--fg-muted); font-size: .9rem; }

  .table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: var(--radius); margin-bottom: 2rem; }
  .backup-table { width: 100%; border-collapse: collapse; font-size: .875rem; }
  .backup-table thead th { padding: .6rem .9rem; text-align: left; font-size: .75rem; font-weight: 600; color: var(--fg-muted); text-transform: uppercase; letter-spacing: .04em; border-bottom: 1px solid var(--border); background: var(--surface); }
  .backup-table tbody tr { border-bottom: 1px solid var(--border); transition: background 100ms; }
  .backup-table tbody tr:last-child { border-bottom: none; }
  .backup-table tbody tr:hover { background: var(--surface-2); }
  .backup-table td { padding: .65rem .9rem; }
  .th-right, .td-right { text-align: right; }
  .td-filename { font-family: monospace; font-size: .82rem; }
  .td-muted { color: var(--fg-muted); font-size: .85rem; }
  .td-actions { text-align: right; white-space: nowrap; display: flex; gap: .4rem; justify-content: flex-end; }

  .act-btn { padding: .3rem .65rem; border: 1px solid var(--border); border-radius: 5px; background: none; color: var(--fg-muted); font-size: .78rem; cursor: pointer; transition: all 120ms; text-decoration: none; display: inline-block; }
  .act-btn:hover { background: var(--surface-2); color: var(--fg); }
  .act-btn--dl:hover { border-color: var(--accent); color: var(--accent); }
  .act-btn--del:hover { border-color: #E24B4A; color: #E24B4A; }

  /* ── Restore ── */
  .restore-section { border-top: 1px solid var(--border); padding-top: 1.75rem; }
  .restore-section h2 { font-size: 1rem; font-weight: 700; margin: 0 0 .4rem; }
  .restore-sub { font-size: .85rem; color: var(--fg-muted); margin-bottom: 1.25rem; }

  .restore-form { display: flex; flex-direction: column; gap: .85rem; }

  .file-label { display: flex; align-items: center; gap: .75rem; cursor: pointer; }
  .file-label input[type="file"] { display: none; }
  .file-btn { padding: .4rem .85rem; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface-2); color: var(--fg); font-size: .84rem; cursor: pointer; white-space: nowrap; transition: background 120ms; }
  .file-btn:hover { background: var(--surface); }
  .file-name { font-size: .84rem; color: var(--fg-muted); font-family: monospace; }

  .restore-warning { display: flex; gap: .6rem; align-items: flex-start; padding: .75rem 1rem; background: rgba(251,191,36,.08); border: 1px solid rgba(251,191,36,.3); border-radius: var(--radius-sm); font-size: .84rem; color: var(--fg); }
  .warn-icon { color: #f59e0b; font-size: 1rem; flex-shrink: 0; margin-top: 1px; }

  .restore-confirm-row { display: flex; gap: .75rem; align-items: center; }

  /* ── Banners ── */
  .banner { padding: .65rem .9rem; border-radius: var(--radius-sm); font-size: .85rem; margin-bottom: 1rem; }
  .banner--err { background: rgba(226,75,74,.1); border: 1px solid rgba(226,75,74,.3); color: #E24B4A; }
  .banner--ok { background: rgba(34,197,94,.1); border: 1px solid rgba(34,197,94,.3); color: #16a34a; }
  .banner-hint { margin-top: .4rem; font-size: .8rem; opacity: .85; }

  /* ── Buttons ── */
  .btn-primary { padding: .5rem 1rem; background: var(--accent); color: #fff; border: none; border-radius: var(--radius-sm); font-size: .875rem; font-weight: 500; cursor: pointer; transition: background 150ms, opacity 150ms; white-space: nowrap; }
  .btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
  .btn-primary:disabled { opacity: .5; cursor: not-allowed; }
  .btn-secondary { padding: .5rem 1rem; background: var(--surface-2); color: var(--fg); border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: .875rem; font-weight: 500; cursor: pointer; }
  .btn-danger { padding: .5rem 1rem; background: #dc2626; color: #fff; border: none; border-radius: var(--radius-sm); font-size: .875rem; font-weight: 500; cursor: pointer; transition: background 150ms, opacity 150ms; white-space: nowrap; }
  .btn-danger:hover:not(:disabled) { background: #b91c1c; }
  .btn-danger:disabled { opacity: .5; cursor: not-allowed; }
</style>
