<script lang="ts">
  import { onMount } from 'svelte';

  type LogEntry = {
    id: string;
    username: string | null;
    action: string;
    entity: string | null;
    entity_id: string | null;
    details: Record<string, unknown> | null;
    ip: string | null;
    created_at: string;
  };

  let logs: LogEntry[] = [];
  let loading = true;
  let page = 0;
  const PAGE_SIZE = 50;
  let hasMore = false;

  onMount(async () => {
    await loadLogs();
  });

  async function loadLogs(reset = true) {
    if (reset) { page = 0; logs = []; }
    loading = true;
    try {
      const res = await fetch(`/api/admin/logs?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`);
      const json = await res.json();
      if (json.ok) {
        logs = reset ? json.data : [...logs, ...json.data];
        hasMore = json.data.length === PAGE_SIZE;
      }
    } finally {
      loading = false;
    }
  }

  async function loadMore() {
    page++;
    await loadLogs(false);
  }

  function formatAction(action: string): string {
    return action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  function actionColor(action: string): string {
    if (action.includes('delete') || action.includes('remove')) return 'neg';
    if (action.includes('create') || action.includes('register')) return 'pos';
    if (action.includes('login') || action.includes('logout')) return 'neutral';
    return 'neutral';
  }

  function isUuid(v: string): boolean {
    return typeof v === 'string' && v.length === 36 && v.split('-').length === 5;
  }

  function renderValue(v: unknown): string {
    if (v === null || v === undefined) return '—';
    const s = String(v);
    if (isUuid(s)) return s.slice(0, 8) + '…';
    return s;
  }

  function titleCase(key: string): string {
    return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  let expandedRows = new Set<string>();

  function toggleRow(id: string) {
    if (expandedRows.has(id)) {
      expandedRows.delete(id);
    } else {
      expandedRows.add(id);
    }
    expandedRows = expandedRows;
  }
</script>

<div class="page">
  <div class="page-header">
    <h1>Activity log</h1>
    <button class="btn-ghost" on:click={() => loadLogs()}>Refresh</button>
  </div>

  {#if loading && logs.length === 0}
    <p class="muted">Loading…</p>
  {:else if logs.length === 0}
    <div class="empty">No activity logged yet.</div>
  {:else}
    <div class="card">
      <table class="log-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>User</th>
            <th>Action</th>
            <th>Entity</th>
            <th>IP</th>
          </tr>
        </thead>
        <tbody>
          {#each logs as entry}
            <tr>
              <td class="time">{new Date(entry.created_at).toLocaleString('en-AU', { hour12: false })}</td>
              <td class="user">{entry.username ?? '—'}</td>
              <td>
                <span class="action-badge action-badge--{actionColor(entry.action)}">
                  {formatAction(entry.action)}
                </span>
              </td>
              <td class="entity">
                <div class="entity-top">
                  {#if entry.entity}
                    <span class="entity-type">{entry.entity}</span>
                  {/if}
                  {#if entry.entity_id}
                    <code class="entity-id-chip">{isUuid(entry.entity_id) ? entry.entity_id.slice(0, 8) + '…' : entry.entity_id}</code>
                  {/if}
                  {#if entry.details}
                    <button class="chevron-btn" on:click={() => toggleRow(entry.id)} title="Toggle details">
                      {expandedRows.has(entry.id) ? '▲' : '▼'}
                    </button>
                  {/if}
                </div>
                {#if entry.details}
                  {@const detailEntries = Object.entries(entry.details)}
                  {@const shown = detailEntries.slice(0, 4)}
                  {@const hidden = detailEntries.slice(4)}
                  <div class="details-kv">
                    {#each shown as [k, v]}
                      <span class="kv-item"><span class="kv-key">{titleCase(k)}</span><span class="kv-val">{renderValue(v)}</span></span>
                    {/each}
                    {#if hidden.length > 0 && !expandedRows.has(entry.id)}
                      <span class="kv-more">+{hidden.length} more</span>
                    {/if}
                  </div>
                  {#if expandedRows.has(entry.id)}
                    <pre class="details-full">{JSON.stringify(entry.details, null, 2)}</pre>
                  {/if}
                {/if}
              </td>
              <td class="ip">{entry.ip ?? '—'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    {#if hasMore}
      <button class="load-more" on:click={loadMore} disabled={loading}>
        {loading ? 'Loading…' : 'Load more'}
      </button>
    {/if}
  {/if}
</div>

<style>
  .page { padding: 1.75rem 2rem; max-width: 1000px; }
  .page-header { display: flex; align-items: center; gap: .75rem; margin-bottom: 1.25rem; }
  h1 { font-size: 1.1rem; font-weight: 600; flex: 1; }
  .muted { color: var(--fg-muted); font-size: .875rem; }

  .empty {
    padding: 3rem 2rem; text-align: center;
    color: var(--fg-faint); font-size: .875rem;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  .card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); box-shadow: var(--shadow-sm); overflow-x: auto;
  }

  .log-table { width: 100%; border-collapse: collapse; font-size: .8rem; }

  .log-table th {
    text-align: left; font-size: .67rem; text-transform: uppercase;
    letter-spacing: .06em; color: var(--fg-faint);
    padding: .6rem .75rem; border-bottom: 1px solid var(--border);
    white-space: nowrap; background: var(--surface-2);
  }

  .log-table td {
    padding: .5rem .75rem; border-bottom: 1px solid var(--border);
    vertical-align: top;
  }

  .log-table tr:last-child td { border-bottom: none; }
  .log-table tr:hover td { background: color-mix(in srgb, var(--accent) 3%, transparent); }

  .time { color: var(--fg-faint); white-space: nowrap; font-variant-numeric: tabular-nums; }
  .user { font-weight: 500; white-space: nowrap; }
  .ip { color: var(--fg-faint); font-family: monospace; font-size: .75rem; }

  .action-badge {
    display: inline-block; padding: 2px 7px; border-radius: 20px;
    font-size: .72rem; font-weight: 500; white-space: nowrap;
  }

  .action-badge--pos {
    background: color-mix(in srgb, var(--pos) 15%, transparent); color: var(--pos);
  }
  .action-badge--neg {
    background: color-mix(in srgb, var(--neg) 15%, transparent); color: var(--neg);
  }
  .action-badge--neutral { background: var(--surface-2); color: var(--fg-muted); }

  .entity { display: flex; flex-direction: column; gap: 4px; }

  .entity-top { display: flex; align-items: center; gap: .4rem; flex-wrap: wrap; }
  .entity-type { font-weight: 500; }

  .entity-id-chip {
    font-family: monospace; font-size: .68rem;
    background: var(--surface-2); border: 1px solid var(--border);
    border-radius: 4px; padding: 1px 5px; color: var(--fg-faint);
  }

  .chevron-btn {
    font-size: .65rem; padding: 1px 4px; border-radius: 4px;
    border: 1px solid var(--border); background: var(--surface-2);
    color: var(--fg-muted); cursor: pointer; line-height: 1;
    transition: background 100ms;
  }
  .chevron-btn:hover { background: var(--surface); color: var(--fg); }

  .details-kv {
    display: flex; flex-wrap: wrap; gap: .3rem .6rem;
  }

  .kv-item {
    display: inline-flex; align-items: center; gap: .25rem;
    font-size: .7rem;
  }

  .kv-key {
    color: var(--fg-faint); font-weight: 500;
  }

  .kv-val {
    color: var(--fg-muted); font-family: monospace;
    max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }

  .kv-more {
    font-size: .68rem; color: var(--fg-faint); font-style: italic;
  }

  .details-full {
    font-size: .72rem; font-family: monospace;
    background: var(--surface-2); border: 1px solid var(--border);
    border-radius: 5px; padding: .5rem .75rem;
    color: var(--fg-muted); white-space: pre-wrap; word-break: break-all;
    margin-top: .2rem; max-width: 400px;
  }

  .btn-ghost {
    padding: .35rem .75rem; font-size: .8rem; border: none;
    border-radius: var(--radius-sm); background: transparent; color: var(--fg-muted);
    cursor: pointer; transition: background 120ms, color 120ms;
  }
  .btn-ghost:hover { background: var(--surface-2); color: var(--fg); }

  .load-more {
    display: block; width: 100%; margin-top: .75rem;
    padding: .65rem; background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); color: var(--fg-muted); font-size: .85rem;
    cursor: pointer; transition: background 120ms;
  }
  .load-more:hover:not(:disabled) { background: var(--surface-2); }
  .load-more:disabled { opacity: .6; cursor: not-allowed; }
</style>
