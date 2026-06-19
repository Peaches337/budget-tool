import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type Profile = 'personal' | 'business';

function createProfileStore() {
  const initial: Profile = browser
    ? ((sessionStorage.getItem('skint_profile') as Profile) ?? 'personal')
    : 'personal';
  const { subscribe, set } = writable<Profile>(initial);
  return {
    subscribe,
    set(v: Profile) {
      if (browser) sessionStorage.setItem('skint_profile', v);
      set(v);
    },
  };
}

export const activeProfile = createProfileStore();
