import { writable, derived, get } from 'svelte/store';
import { calcAustralianTax, toAnnual } from '$lib/tax.js';
import type { BudgetCategory, BudgetItem, Frequency } from '$lib/types.js';
import { activeProfile } from '$lib/stores/profile.js';

export type ViewPeriod = 'weekly' | 'fortnightly' | 'monthly' | 'annually';

// ── State ────────────────────────────────────────────────────────────────────

export const categories = writable<BudgetCategory[]>([]);
export const viewPeriod = writable<ViewPeriod>('annually');
export const loading    = writable(false);

// ── Derived computations ─────────────────────────────────────────────────────

export const periodMultiplier = derived(viewPeriod, ($p) => ({
  weekly:      1/52,
  fortnightly: 1/26,
  monthly:     1/12,
  annually:    1
}[$p]));

export const periodLabel = derived(viewPeriod, ($p) => ({
  weekly: 'Weekly', fortnightly: 'Fortnightly',
  monthly: 'Monthly', annually: 'Annual'
}[$p]));

export const summary = derived(categories, ($cats) => {
  const income   = $cats.find(c => c.is_income);
  const expCats  = $cats.filter(c => !c.is_income);

  const taxedGross   = income?.items
    ?.filter(i => i.tax_treatment === 'taxable')
    ?.reduce((s, i) => s + toAnnual(Number(i.amount), i.frequency as Frequency), 0) ?? 0;

  const taxFreeGross = income?.items
    ?.filter(i => i.tax_treatment === 'tax_free' || i.tax_treatment === 'already_taxed')
    ?.reduce((s, i) => s + toAnnual(Number(i.amount), i.frequency as Frequency), 0) ?? 0;

  const tax    = calcAustralianTax(taxedGross);
  const netIncome = taxedGross + taxFreeGross - tax.totalTax;

  const expensesByCat = expCats.map(cat => ({
    id:       cat.id,
    name:     cat.name,
    color:    cat.color,
    annual:   cat.items?.reduce((s, i) => s + toAnnual(Number(i.amount), i.frequency as Frequency), 0) ?? 0
  }));

  const totalExpenses = expensesByCat.reduce((s, c) => s + c.annual, 0);
  const surplus = netIncome - totalExpenses;

  return {
    grossIncome:   taxedGross + taxFreeGross,
    taxedGross,
    taxFreeGross,
    tax,
    netIncome,
    totalExpenses,
    surplus,
    expensesByCat
  };
});

// ── API helpers ──────────────────────────────────────────────────────────────

export async function loadBudget() {
  loading.set(true);
  try {
    const profile = get(activeProfile);
    const res = await fetch(`/api/budget/categories?profile=${profile}`);
    const json = await res.json();
    if (json.ok) categories.set(json.data);
  } catch {
    // network / parse error — store stays empty, UI stays in loading state
  } finally {
    loading.set(false);
  }
}

const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingPatches  = new Map<string, Partial<BudgetItem>>();

function debounce(key: string, fn: () => void, ms = 600) {
  clearTimeout(debounceTimers.get(key));
  debounceTimers.set(key, setTimeout(fn, ms));
}

export async function updateItem(itemId: string, patch: Partial<BudgetItem>) {
  // Optimistic update
  categories.update($cats => $cats.map(cat => ({
    ...cat,
    items: cat.items?.map(i => i.id === itemId ? { ...i, ...patch } : i)
  })));

  // Accumulate all field changes within the debounce window so none are lost
  pendingPatches.set(itemId, { ...(pendingPatches.get(itemId) ?? {}), ...patch });

  debounce(`item-${itemId}`, async () => {
    const fullPatch = pendingPatches.get(itemId);
    pendingPatches.delete(itemId);
    if (!fullPatch) return;
    await fetch(`/api/budget/items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fullPatch)
    });
  });
}

export async function addItem(categoryId: string) {
  const res = await fetch('/api/budget/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category_id: categoryId })
  });
  const json = await res.json();
  if (json.ok) {
    categories.update($cats => $cats.map(cat =>
      cat.id === categoryId
        ? { ...cat, items: [...(cat.items ?? []), json.data] }
        : cat
    ));
    return json.data;
  }
}

export async function deleteItem(itemId: string, categoryId: string) {
  categories.update($cats => $cats.map(cat =>
    cat.id === categoryId
      ? { ...cat, items: cat.items?.filter(i => i.id !== itemId) }
      : cat
  ));
  await fetch(`/api/budget/items/${itemId}`, { method: 'DELETE' });
}

export async function updateCategory(categoryId: string, patch: Partial<BudgetCategory>) {
  categories.update($cats => $cats.map(c =>
    c.id === categoryId ? { ...c, ...patch } : c
  ));
  debounce(`cat-${categoryId}`, async () => {
    await fetch(`/api/budget/categories/${categoryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });
  });
}
