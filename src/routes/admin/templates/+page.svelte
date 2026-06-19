<script lang="ts">
  import { onMount } from 'svelte';
  import type { Template } from '$lib/types.js';

  let templates: Template[] = [];
  let loading = true;
  let creating = false;
  let newName = '';
  let newDesc = '';
  let error = '';

  onMount(async () => {
    await loadTemplates();
    loading = false;
  });

  async function loadTemplates() {
    const res = await fetch('/api/admin/templates');
    const json = await res.json();
    if (json.ok) templates = json.data;
  }

  async function createTemplate() {
    if (!newName.trim()) return;
    creating = true;
    error = '';
    try {
      const res = await fetch('/api/admin/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() || null })
      });
      const json = await res.json();
      if (json.ok) {
        newName = '';
        newDesc = '';
        await loadTemplates();
      } else {
        error = json.error;
      }
    } finally {
      creating = false;
    }
  }

  async function duplicateTemplate(id: string) {
    const res = await fetch(`/api/admin/templates/${id}/duplicate`, { method: 'POST' });
    const json = await res.json();
    if (json.ok) await loadTemplates();
  }

  async function deleteTemplate(id: string, name: string) {
    if (!confirm(`Delete template "${name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/admin/templates/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.ok) await loadTemplates();
  }

  async function setDefault(id: string) {
    await fetch(`/api/admin/templates/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_default: true })
    });
    await loadTemplates();
  }

  const VISIBILITY_LABELS: Record<string, string> = {
    public: 'Public',
    household: 'Household',
    private: 'Private',
  };
</script>

<div class="page">
  <div class="page-header">
    <h1>Templates</h1>
    <span class="count-badge">{templates.length}</span>
  </div>

  {#if loading}
    <p class="muted">Loading…</p>
  {:else}

    <!-- Create new template -->
    <div class="card create-card">
      <h2>New template</h2>
      <form on:submit={(e) => { e.preventDefault(); createTemplate(); }} class="create-form">
        <input type="text" placeholder="Template name" bind:value={newName} required />
        <input type="text" placeholder="Description (optional)" bind:value={newDesc} />
        <button type="submit" class="btn-primary" disabled={creating}>
          {creating ? 'Creating…' : '+ Create'}
        </button>
      </form>
      {#if error}<div class="error">{error}</div>{/if}
    </div>

    <!-- Template list -->
    {#each templates as t}
      <div class="template-card" class:is-default={t.is_default}>
        <div class="template-header">
          <div class="template-meta">
            <div class="template-name">
              {t.name}
              {#if t.is_default}
                <span class="badge badge--default">Default</span>
              {/if}
              <span class="badge badge--{t.visibility}">{VISIBILITY_LABELS[t.visibility]}</span>
            </div>
            {#if t.description}
              <div class="template-desc">{t.description}</div>
            {/if}
          </div>
          <div class="template-actions">
            {#if !t.is_default}
              <button class="btn-ghost" on:click={() => setDefault(t.id)}>Set default</button>
            {/if}
            <button class="btn-ghost" on:click={() => duplicateTemplate(t.id)}>Duplicate</button>
            <a href="/admin/templates/{t.id}" class="btn-secondary">Edit</a>
            {#if !t.is_default}
              <button class="btn-danger" on:click={() => deleteTemplate(t.id, t.name)}>Delete</button>
            {/if}
          </div>
        </div>
        <div class="template-stats">
          {t.categories?.length ?? 0} categories
        </div>
      </div>
    {/each}

  {/if}
</div>

<style>
  .page { padding: 1.75rem 2rem; max-width: 860px; }
  .page-header { display: flex; align-items: center; gap: .75rem; margin-bottom: 1.25rem; }
  h1 { font-size: 1.1rem; font-weight: 600; }
  h2 { font-size: .9rem; font-weight: 600; margin-bottom: .65rem; }

  .count-badge {
    font-size: .7rem; font-weight: 600; padding: 2px 8px;
    border-radius: 20px; background: var(--surface-2);
    color: var(--fg-muted); border: 1px solid var(--border);
  }

  .muted { color: var(--fg-muted); font-size: .875rem; }
  .error { margin-top: .5rem; font-size: .8rem; color: var(--neg); }

  .card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 1.25rem;
    margin-bottom: 1rem; box-shadow: var(--shadow-sm);
  }

  .create-form { display: flex; gap: .5rem; flex-wrap: wrap; }
  .create-form input {
    flex: 1; min-width: 160px; padding: .5rem .75rem;
    border: 1px solid var(--border); border-radius: var(--radius-sm);
    background: var(--surface-2); color: var(--fg); font-size: .875rem;
  }
  .create-form input:focus {
    outline: none; border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(99,102,241,.15);
  }

  .template-card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 1rem 1.25rem;
    margin-bottom: .75rem; box-shadow: var(--shadow-sm);
  }

  .template-card.is-default { border-color: color-mix(in srgb, var(--accent) 40%, transparent); }

  .template-header {
    display: flex; align-items: flex-start;
    justify-content: space-between; gap: 1rem; flex-wrap: wrap;
  }

  .template-name {
    font-weight: 600; font-size: .95rem;
    display: flex; align-items: center; gap: .5rem; flex-wrap: wrap;
  }

  .template-desc { font-size: .82rem; color: var(--fg-muted); margin-top: .25rem; }

  .template-stats { font-size: .78rem; color: var(--fg-faint); margin-top: .5rem; }

  .template-actions {
    display: flex; gap: .4rem; align-items: center; flex-shrink: 0;
  }

  .badge {
    font-size: .62rem; font-weight: 600; padding: 2px 7px;
    border-radius: 20px; text-transform: uppercase; letter-spacing: .04em;
  }

  .badge--default {
    background: color-mix(in srgb, var(--accent) 15%, transparent);
    color: var(--accent);
  }

  .badge--public  { background: color-mix(in srgb, var(--pos) 15%, transparent); color: var(--pos); }
  .badge--household { background: color-mix(in srgb, #0ea5e9 15%, transparent); color: #0ea5e9; }
  .badge--private { background: var(--surface-2); color: var(--fg-muted); }

  .btn-primary {
    padding: .45rem .9rem; background: var(--accent); color: #fff;
    border: none; border-radius: var(--radius-sm); font-size: .82rem;
    font-weight: 500; cursor: pointer; white-space: nowrap;
  }
  .btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
  .btn-primary:disabled { opacity: .6; cursor: not-allowed; }

  .btn-secondary {
    padding: .35rem .75rem; font-size: .8rem;
    border: 1px solid var(--border); border-radius: var(--radius-sm);
    background: var(--surface); color: var(--fg);
    cursor: pointer; text-decoration: none;
    transition: background 120ms; white-space: nowrap;
  }
  .btn-secondary:hover { background: var(--surface-2); }

  .btn-ghost {
    padding: .35rem .75rem; font-size: .8rem;
    border: none; border-radius: var(--radius-sm);
    background: transparent; color: var(--fg-muted);
    cursor: pointer; transition: background 120ms, color 120ms; white-space: nowrap;
  }
  .btn-ghost:hover { background: var(--surface-2); color: var(--fg); }

  .btn-danger {
    padding: .35rem .75rem; font-size: .8rem;
    border: 1px solid color-mix(in srgb, var(--neg) 40%, transparent);
    border-radius: var(--radius-sm); background: transparent;
    color: var(--neg); cursor: pointer; transition: background 120ms; white-space: nowrap;
  }
  .btn-danger:hover { background: color-mix(in srgb, var(--neg) 10%, transparent); }
</style>
