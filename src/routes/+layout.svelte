<script lang="ts">
  import '../app.css';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import type { LayoutData } from './$types';
  import { activeProfile } from '$lib/stores/profile.js';
  import { loadBudget } from '$lib/stores/budget.js';

  export let data: LayoutData;

  $: user = data.user;
  $: isAuth = $page.url.pathname === '/login' || $page.url.pathname === '/register';

  const navItems = [
    { href: '/',              label: 'Summary',      icon: '▦' },
    { href: '/budget',        label: 'Budget',       icon: '◈' },
    { href: '/transactions',  label: 'Transactions', icon: '↕' },
    { href: '/net-worth',     label: 'Net Worth',    icon: '◎' },
    { href: '/household',     label: 'Household',    icon: '⌂' },
    { href: '/tax',           label: 'Tax',          icon: '▤' },
    { href: '/settings',      label: 'Settings',     icon: '⚙' },
  ];

  function switchProfile(p: 'personal' | 'business') {
    activeProfile.set(p);
    loadBudget();
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    goto('/login');
  }
</script>

{#if isAuth || !user}
  <slot />
{:else}
  <div class="shell">
    <!-- ── Sidebar ── -->
    <aside class="sidebar">
      <div class="sidebar-logo">
        <span class="logo-mark">$</span>
        <span class="logo-text">Skint</span>
      </div>

      <!-- Profile switcher -->
      <div class="profile-switcher">
        <button
          class="profile-btn"
          class:profile-btn--active={$activeProfile === 'personal'}
          on:click={() => switchProfile('personal')}
        >Personal</button>
        <button
          class="profile-btn"
          class:profile-btn--active={$activeProfile === 'business'}
          on:click={() => switchProfile('business')}
        >Business</button>
      </div>

      <nav class="sidebar-nav">
        {#each navItems as item}
          <a
            href={item.href}
            class="nav-item"
            class:active={
              item.href === '/'
                ? $page.url.pathname === '/'
                : $page.url.pathname.startsWith(item.href)
            }
          >
            <span class="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </a>
        {/each}

        {#if user?.is_admin}
          <div class="nav-divider"></div>
          <a
            href="/admin"
            class="nav-item"
            class:active={$page.url.pathname.startsWith('/admin')}
          >
            <span class="nav-icon">⛨</span>
            <span>Admin</span>
          </a>
        {/if}
      </nav>

      <div class="sidebar-footer">
        <div class="user-chip">
          <div class="avatar">{user?.username?.[0]?.toUpperCase() ?? '?'}</div>
          <span class="username">{user?.username}</span>
        </div>
        <button class="logout-btn" on:click={logout} title="Sign out">↩</button>
      </div>
    </aside>

    <!-- ── Content ── -->
    <main class="content">
      <slot />
    </main>
  </div>
{/if}

<style>
  .shell {
    display: flex;
    min-height: 100vh;
  }

  /* ── Sidebar ── */
  .sidebar {
    width: var(--sidebar-width);
    background: var(--sidebar-bg);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    position: sticky;
    top: 0;
    height: 100vh;
    overflow-y: auto;
    border-right: 1px solid rgba(255,255,255,.04);
  }

  .sidebar-logo {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 1.5rem 1.25rem 1rem;
  }

  .profile-switcher {
    display: flex;
    margin: 0 .75rem .75rem;
    background: rgba(0,0,0,.25);
    border-radius: 8px;
    padding: 3px;
    gap: 2px;
    border-bottom: 1px solid rgba(255,255,255,.05);
    padding-bottom: 3px;
    margin-bottom: 0;
  }

  .profile-btn {
    flex: 1;
    padding: .35rem .5rem;
    border: none;
    border-radius: 6px;
    background: none;
    color: var(--sidebar-fg);
    font-size: .75rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 120ms, color 120ms;
    letter-spacing: -.01em;
  }

  .profile-btn:hover { color: #e2e8f0; }

  .profile-btn--active {
    background: rgba(99,102,241,.35);
    color: #fff;
    font-weight: 600;
  }

  /* Add a bottom border below the switcher via sidebar-nav padding */

  .logo-mark {
    width: 34px;
    height: 34px;
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    color: #fff;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 1rem;
    flex-shrink: 0;
    box-shadow: 0 2px 8px rgba(99,102,241,.4);
  }

  .logo-text {
    color: #fff;
    font-weight: 700;
    font-size: 1rem;
    letter-spacing: -.01em;
  }

  .sidebar-nav {
    flex: 1;
    padding: 1rem .75rem;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: .55rem .85rem;
    border-radius: 8px;
    color: var(--sidebar-fg);
    text-decoration: none;
    font-size: .875rem;
    font-weight: 500;
    transition: background 120ms var(--ease), color 120ms var(--ease);
    letter-spacing: -.01em;
  }

  .nav-item:hover {
    background: rgba(255,255,255,.06);
    color: #e2e8f0;
  }

  .nav-item.active {
    background: rgba(99,102,241,.18);
    color: #fff;
  }

  .nav-item.active .nav-icon {
    color: #a5b4fc;
  }

  .nav-icon {
    font-size: .85rem;
    width: 18px;
    text-align: center;
    flex-shrink: 0;
    opacity: .75;
  }

  .nav-item.active .nav-icon { opacity: 1; }

  .nav-divider {
    height: 1px;
    background: rgba(255,255,255,.05);
    margin: .5rem .25rem;
  }

  .sidebar-footer {
    padding: .875rem 1rem 1.125rem;
    border-top: 1px solid rgba(255,255,255,.05);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .user-chip {
    display: flex;
    align-items: center;
    gap: 9px;
    flex: 1;
    min-width: 0;
  }

  .avatar {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    color: #fff;
    font-size: .75rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .username {
    color: #e2e8f0;
    font-size: .8rem;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .logout-btn {
    background: none;
    border: none;
    color: var(--sidebar-fg);
    cursor: pointer;
    font-size: .95rem;
    padding: 5px;
    border-radius: 6px;
    transition: color 150ms, background 150ms;
    flex-shrink: 0;
    line-height: 1;
  }

  .logout-btn:hover { color: #fca5a5; background: rgba(220,38,38,.12); }

  /* ── Content ── */
  .content {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
  }
</style>
