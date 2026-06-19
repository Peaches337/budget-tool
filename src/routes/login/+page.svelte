<script lang="ts">
  import { goto } from '$app/navigation';

  let username = '';
  let password = '';
  let error = '';
  let loading = false;

  async function submit() {
    error = '';
    loading = true;
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const json = await res.json();
      if (json.ok) {
        goto('/');
      } else {
        error = json.error;
      }
    } finally {
      loading = false;
    }
  }
</script>

<div class="auth-shell">
  <div class="auth-card">
    <div class="auth-logo">
      <span class="logo-mark">$</span>
      <span class="logo-text">Skint</span>
    </div>
    <h1>Welcome back</h1>
    <p class="subtitle">Sign in to your account</p>

    <form on:submit={(e) => { e.preventDefault(); submit(); }}>
      <div class="field">
        <label for="username">Username</label>
        <input id="username" type="text" bind:value={username} autocomplete="username" required />
      </div>
      <div class="field">
        <label for="password">Password</label>
        <input id="password" type="password" bind:value={password} autocomplete="current-password" required />
      </div>

      {#if error}
        <div class="error">{error}</div>
      {/if}

      <button type="submit" class="btn-primary" disabled={loading}>
        {loading ? 'Signing in…' : 'Sign in'}
      </button>
    </form>

    <p class="auth-link">No account? <a href="/register">Create one</a></p>
  </div>
</div>

<style>
  .auth-shell {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg);
    padding: 1rem;
  }

  .auth-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 2rem;
    width: 100%;
    max-width: 380px;
    box-shadow: var(--shadow);
  }

  .auth-logo {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 1.5rem;
  }

  .logo-mark {
    width: 36px;
    height: 36px;
    background: var(--accent);
    color: #fff;
    border-radius: 9px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 1.1rem;
  }

  .logo-text {
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--fg);
  }

  h1 {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--fg);
    margin-bottom: .25rem;
  }

  .subtitle {
    font-size: .875rem;
    color: var(--fg-muted);
    margin-bottom: 1.5rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 5px;
    margin-bottom: 1rem;
  }

  label {
    font-size: .8rem;
    font-weight: 500;
    color: var(--fg-muted);
  }

  input {
    padding: .6rem .75rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--fg);
    font-size: .9rem;
    transition: border-color 150ms;
  }

  input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(99,102,241,.15);
  }

  .error {
    background: rgba(226,75,74,.1);
    border: 1px solid rgba(226,75,74,.3);
    color: var(--neg);
    border-radius: var(--radius-sm);
    padding: .5rem .75rem;
    font-size: .85rem;
    margin-bottom: .75rem;
  }

  .btn-primary {
    width: 100%;
    padding: .65rem;
    background: var(--accent);
    color: #fff;
    border: none;
    border-radius: var(--radius-sm);
    font-size: .9rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 150ms;
    margin-top: .25rem;
  }

  .btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
  .btn-primary:disabled { opacity: .6; cursor: not-allowed; }

  .auth-link {
    margin-top: 1.25rem;
    text-align: center;
    font-size: .85rem;
    color: var(--fg-muted);
  }

  .auth-link a { color: var(--accent); text-decoration: none; }
  .auth-link a:hover { text-decoration: underline; }
</style>
