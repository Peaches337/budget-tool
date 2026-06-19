<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import type { LayoutData } from '../$types';

  export let data: LayoutData;

  $: if (data.user && !data.user.is_admin) goto('/');

  const sections = [
    { href: '/admin/users',         label: 'Users',         icon: '👤', color: '#6366f1' },
    { href: '/admin/households',    label: 'Households',    icon: '⌂',  color: '#0ea5e9' },
    { href: '/admin/templates',     label: 'Templates',     icon: '◧',  color: '#10b981' },
    { href: '/admin/subscriptions', label: 'Subscriptions', icon: '▶',  color: '#8b5cf6' },
    { href: '/admin/settings',      label: 'Settings',      icon: '⚙',  color: '#f59e0b' },
    { href: '/admin/logs',          label: 'Logs',          icon: '≡',  color: '#6b7280' },
    { href: '/admin/backup',        label: 'Backup',        icon: '▣',  color: '#14b8a6' },
  ];

  $: current = $page.url.pathname;
</script>

<div class="admin-shell">
  <aside class="admin-sidebar">
    <div class="admin-sidebar-header">
      <span>Admin</span>
    </div>
    <nav class="admin-list">
      {#each sections as s}
        <a
          href={s.href}
          class="admin-item"
          class:active={current.startsWith(s.href)}
          style="--sec: {s.color}"
        >
          <span class="sec-pip"></span>
          <span class="sec-name">{s.label}</span>
        </a>
      {/each}
    </nav>
  </aside>

  <div class="admin-content">
    <slot />
  </div>
</div>

<style>
  .admin-shell {
    display: flex;
    height: 100vh;
    overflow: hidden;
  }

  .admin-sidebar {
    width: 200px;
    flex-shrink: 0;
    border-right: 1px solid var(--border);
    background: var(--surface);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .admin-sidebar-header {
    padding: 1rem 1rem .6rem;
    font-size: .7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .08em;
    color: var(--fg-faint);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .admin-list {
    flex: 1;
    overflow-y: auto;
    padding: .4rem .5rem;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .admin-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: .45rem .65rem;
    border-radius: var(--radius-sm);
    text-decoration: none;
    color: var(--fg-muted);
    font-size: .84rem;
    transition: background 120ms, color 120ms;
  }

  .admin-item:hover {
    background: var(--surface-2);
    color: var(--fg);
  }

  .admin-item.active {
    background: color-mix(in srgb, var(--sec) 12%, var(--surface-2));
    color: var(--fg);
  }

  .sec-pip {
    width: 7px;
    height: 7px;
    border-radius: 2px;
    background: var(--border);
    flex-shrink: 0;
    transition: background 120ms;
  }

  .admin-item.active .sec-pip,
  .admin-item:hover .sec-pip {
    background: var(--sec);
  }

  .sec-name {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .admin-content {
    flex: 1;
    overflow-y: auto;
    background: var(--bg);
    min-width: 0;
  }
</style>
