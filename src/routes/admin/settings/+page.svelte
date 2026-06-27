<script lang="ts">
  import { onMount } from 'svelte';
  import type { Template } from '$lib/types.js';

  type Config = {
    instance_name: string;
    registration_open: string;
    default_template: string;
    session_timeout_days: string;
    instance_logo: string;
  };

  let config: Config = {
    instance_name: '',
    registration_open: 'true',
    default_template: '',
    session_timeout_days: '30',
    instance_logo: '',
  };

  let templates: Template[] = [];
  let loading = true;
  let saving = false;
  let saved = false;
  let error = '';

  onMount(async () => {
    const [cfgRes, tplRes] = await Promise.all([
      fetch('/api/admin/config'),
      fetch('/api/admin/templates'),
    ]);
    const cfgJson = await cfgRes.json();
    const tplJson = await tplRes.json();
    if (cfgJson.ok) config = cfgJson.data;
    if (tplJson.ok) templates = tplJson.data;
    loading = false;
  });

  async function save() {
    saving = true;
    saved = false;
    error = '';
    try {
      const res = await fetch('/api/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const json = await res.json();
      if (json.ok) {
        saved = true;
        setTimeout(() => saved = false, 2500);
      } else {
        error = json.error;
      }
    } finally {
      saving = false;
    }
  }
</script>

<div class="page">
  <div class="page-header">
    <h1>Settings</h1>
  </div>

  {#if loading}
    <p class="muted">Loading…</p>
  {:else}
    <form on:submit={(e) => { e.preventDefault(); save(); }}>

      <div class="card">
        <h2>Instance</h2>

        <div class="field">
          <label for="instance-name">Instance name</label>
          <p class="field-hint">Shown in the app header and emails.</p>
          <input
            id="instance-name"
            type="text"
            bind:value={config.instance_name}
            placeholder="Skint"
            required
          />
        </div>

        <div class="field">
          <label>Instance logo</label>
          <p class="field-hint">Upload a logo (PNG/SVG, max 200 KB). Shown in the app header.</p>
          {#if config.instance_logo}
            <div class="logo-preview">
              <img src={config.instance_logo} alt="Current logo" class="logo-preview-img" />
              <button type="button" class="btn-remove-logo" on:click={() => { config.instance_logo = ''; }}>Remove</button>
            </div>
          {/if}
          <label class="logo-upload-btn">
            {config.instance_logo ? 'Replace logo' : 'Upload logo'}
            <input type="file" accept="image/png,image/svg+xml,image/jpeg" style="display:none"
              on:change={async (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (!file) return;
                if (file.size > 200 * 1024) { error = 'Logo must be under 200 KB.'; return; }
                const reader = new FileReader();
                reader.onload = () => { config.instance_logo = reader.result as string; };
                reader.readAsDataURL(file);
              }}
            />
          </label>
        </div>

        <div class="field">
          <label for="reg-open">Registration</label>
          <p class="field-hint">Allow new users to create accounts.</p>
          <div class="toggle-row">
            <button
              type="button"
              class="toggle"
              class:on={config.registration_open === 'true'}
              on:click={() => config.registration_open = config.registration_open === 'true' ? 'false' : 'true'}
            >
              <span class="toggle-knob"></span>
            </button>
            <span class="toggle-label">
              {config.registration_open === 'true' ? 'Open — anyone can register' : 'Closed — invite only'}
            </span>
          </div>
        </div>

        <div class="field">
          <label for="default-tpl">Default template</label>
          <p class="field-hint">Applied to new users when they first set up their budget.</p>
          <select id="default-tpl" bind:value={config.default_template}>
            {#each templates as t}
              <option value={t.id}>{t.name}</option>
            {/each}
          </select>
        </div>

        <div class="field">
          <label for="session-timeout">Session timeout (days)</label>
          <p class="field-hint">How long before users are automatically signed out.</p>
          <input
            id="session-timeout"
            type="number"
            min="1"
            max="365"
            bind:value={config.session_timeout_days}
          />
        </div>
      </div>

      <div class="save-row">
        <button type="submit" class="btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save settings'}
        </button>
        {#if saved}<span class="saved-msg">Saved ✓</span>{/if}
        {#if error}<span class="error">{error}</span>{/if}
      </div>

    </form>
  {/if}
</div>

<style>
  .page { padding: 1.75rem 2rem; max-width: 600px; }
  .page-header { margin-bottom: 1.25rem; }
  h1 { font-size: 1.1rem; font-weight: 600; }
  h2 { font-size: .85rem; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: var(--fg-faint); margin-bottom: 1rem; }

  .muted { color: var(--fg-muted); font-size: .875rem; }

  .card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 1.5rem;
    margin-bottom: 1rem; box-shadow: var(--shadow-sm);
  }

  .field { margin-bottom: 1.25rem; }
  .field:last-child { margin-bottom: 0; }

  .field label {
    display: block; font-size: .875rem; font-weight: 500; margin-bottom: 2px;
  }

  .field-hint { font-size: .8rem; color: var(--fg-muted); margin-bottom: .5rem; }

  .field input[type="text"],
  .field input[type="number"],
  .field select {
    width: 100%; padding: .5rem .75rem;
    border: 1px solid var(--border); border-radius: var(--radius-sm);
    background: var(--surface-2); color: var(--fg); font-size: .875rem;
  }

  .field input:focus,
  .field select:focus {
    outline: none; border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(99,102,241,.15);
  }

  .field input[type="number"] { max-width: 120px; }

  /* Toggle */
  .toggle-row { display: flex; align-items: center; gap: .75rem; }

  .toggle {
    width: 40px; height: 22px;
    background: var(--border);
    border: none; border-radius: 20px;
    cursor: pointer; padding: 0;
    position: relative;
    transition: background 200ms;
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

  .toggle-label { font-size: .875rem; color: var(--fg-muted); }

  .save-row { display: flex; align-items: center; gap: .75rem; }

  .btn-primary {
    padding: .55rem 1.25rem; background: var(--accent); color: #fff;
    border: none; border-radius: var(--radius-sm); font-size: .875rem;
    font-weight: 500; cursor: pointer;
  }
  .btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
  .btn-primary:disabled { opacity: .6; cursor: not-allowed; }

  .saved-msg { font-size: .875rem; color: var(--pos); }
  .error { font-size: .875rem; color: var(--neg); }

  .logo-preview { display: flex; align-items: center; gap: .75rem; margin-bottom: .5rem; }
  .logo-preview-img { height: 36px; max-width: 120px; object-fit: contain; border-radius: 4px; background: var(--surface-2); padding: 4px; }
  .btn-remove-logo { font-size: .8rem; color: var(--neg, #e24b4a); background: none; border: none; cursor: pointer; }
  .logo-upload-btn {
  display: inline-block; padding: .45rem .9rem;
  background: var(--surface-2); border: 1px solid var(--border);
  border-radius: var(--radius-sm); font-size: .83rem; color: var(--fg);
  cursor: pointer; transition: border-color .15s;
}
.logo-upload-btn:hover { border-color: var(--accent); color: var(--accent); }
</style>
