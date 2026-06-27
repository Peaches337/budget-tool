<script lang="ts">
  import { page as pageStore } from '$app/stores';

  let username = '';
  let email = '';
  let password = '';
  let confirmPassword = '';
  let error = '';
  let loading = false;

  $: inviteToken = $pageStore.url.searchParams.get('invite') ?? '';

  $: passwordMismatch = confirmPassword.length > 0 && password !== confirmPassword;
  $: canSubmit = !loading && username && email && password.length >= 8 && password === confirmPassword;

  async function submit() {
    error = '';
    if (!username.trim()) { error = 'Username is required.'; return; }
    if (!email.trim())    { error = 'Email is required.'; return; }
    if (password.length < 8) { error = 'Password must be at least 8 characters.'; return; }
    if (password !== confirmPassword) { error = 'Passwords do not match.'; return; }

    loading = true;
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), email: email.trim(), password, invite_token: inviteToken || undefined })
      });
      const json = await res.json();
      if (json.ok) {
        window.location.href = '/wizard';
      } else {
        error = json.error ?? 'Registration failed. Please try again.';
      }
    } catch {
      error = 'Unable to reach the server. Please check your connection and try again.';
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
    <h1>Create account</h1>
    <p class="subtitle">Get your budget sorted</p>

    <form on:submit={(e) => { e.preventDefault(); submit(); }}>
      <div class="field">
        <label for="username">Username</label>
        <input id="username" name="username" type="text" bind:value={username} autocomplete="username" required />
      </div>
      <div class="field">
        <label for="email">Email</label>
        <input id="email" name="email" type="email" bind:value={email} autocomplete="email" required />
      </div>
      <div class="field">
        <label for="password">Password</label>
        <input id="password" name="password" type="password" bind:value={password} autocomplete="new-password" minlength="8" required />
        <span class="hint">Minimum 8 characters</span>
      </div>
      <div class="field">
        <label for="confirm-password">Confirm password</label>
        <input
          id="confirm-password"
          name="confirm-password"
          type="password"
          bind:value={confirmPassword}
          autocomplete="new-password"
          class:input-error={passwordMismatch}
          required
        />
        {#if passwordMismatch}
          <span class="hint hint--err">Passwords do not match</span>
        {/if}
      </div>

      {#if error}
        <div class="error-banner">{error}</div>
      {/if}

      <button type="submit" class="btn-primary" disabled={!canSubmit}>
        {loading ? 'Creating account…' : 'Create account'}
      </button>
    </form>

    <p class="auth-link">Already have an account? <a href="/login">Sign in</a></p>
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

  .auth-logo { display: flex; align-items: center; gap: 10px; margin-bottom: 1.5rem; }
  .logo-mark {
    width: 36px; height: 36px; background: var(--accent); color: #fff;
    border-radius: 9px; display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: 1.1rem;
  }
  .logo-text { font-size: 1.1rem; font-weight: 700; color: var(--fg); }

  h1 { font-size: 1.25rem; font-weight: 600; margin-bottom: .25rem; }
  .subtitle { font-size: .875rem; color: var(--fg-muted); margin-bottom: 1.5rem; }

  .field { display: flex; flex-direction: column; gap: 5px; margin-bottom: 1rem; }
  label { font-size: .8rem; font-weight: 500; color: var(--fg-muted); }

  .hint { font-size: .75rem; color: var(--fg-faint); }
  .hint--err { color: #E24B4A; }

  input {
    padding: .6rem .75rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--fg);
    font-size: .9rem;
    transition: border-color 150ms;
  }
  input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(99,102,241,.15); }
  .input-error { border-color: #E24B4A; }
  .input-error:focus { box-shadow: 0 0 0 3px rgba(226,75,74,.15); }

  .error-banner {
    background: rgba(226,75,74,.1);
    border: 1px solid rgba(226,75,74,.3);
    color: #E24B4A;
    border-radius: var(--radius-sm);
    padding: .5rem .75rem;
    font-size: .85rem;
    margin-bottom: .75rem;
  }

  .btn-primary {
    width: 100%; padding: .65rem; background: var(--accent); color: #fff;
    border: none; border-radius: var(--radius-sm); font-size: .9rem; font-weight: 500;
    cursor: pointer; transition: background 150ms, opacity 150ms; margin-top: .25rem;
  }
  .btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
  .btn-primary:disabled { opacity: .5; cursor: not-allowed; }

  .auth-link { margin-top: 1.25rem; text-align: center; font-size: .85rem; color: var(--fg-muted); }
  .auth-link a { color: var(--accent); text-decoration: none; }
  .auth-link a:hover { text-decoration: underline; }
</style>
