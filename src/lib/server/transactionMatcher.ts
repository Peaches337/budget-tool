// Strip common noise from Up merchant names to produce a stable key
export function normaliseMerchant(raw: string): string {
  return raw
    .toLowerCase()
    // Remove card numbers and trailing digits after space
    .replace(/\b\d{4,}\b/g, '')
    // Remove Australian state abbreviations
    .replace(/\b(nsw|vic|qld|sa|wa|tas|act|nt)\b/gi, '')
    // Remove common location noise
    .replace(/\b(au|australia|pty|ltd|pty ltd)\b/gi, '')
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    .trim();
}

type BudgetItem = { id: string; label: string; category_id: string };
type MerchantMapping = { merchant_normalised: string; budget_item_id: string; confirmed: boolean };

export type MatchResult = {
  budget_item_id: string | null;
  confidence: 'high' | 'medium' | 'low' | 'unmatched';
  reason: string;
};

// Simple string similarity (0–1) — Dice coefficient on bigrams
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = (s: string) => new Set(Array.from({ length: s.length - 1 }, (_, i) => s.slice(i, i + 2)));
  const aSet = bigrams(a);
  const bSet = bigrams(b);
  let intersection = 0;
  for (const bg of aSet) if (bSet.has(bg)) intersection++;
  return (2 * intersection) / (aSet.size + bSet.size);
}

export function matchTransaction(
  merchantNormalised: string,
  upCategory: string | null,
  items: BudgetItem[],
  savedMappings: MerchantMapping[]
): MatchResult {
  // High: confirmed saved mapping
  const confirmed = savedMappings.find(
    m => m.merchant_normalised === merchantNormalised && m.confirmed
  );
  if (confirmed) {
    return { budget_item_id: confirmed.budget_item_id, confidence: 'high', reason: 'saved mapping' };
  }

  // Medium: unconfirmed saved mapping
  const unconfirmed = savedMappings.find(
    m => m.merchant_normalised === merchantNormalised && !m.confirmed
  );
  if (unconfirmed) {
    return { budget_item_id: unconfirmed.budget_item_id, confidence: 'medium', reason: 'previous suggestion' };
  }

  // Medium: Up category matches a budget item label (exact or word-level)
  if (upCategory) {
    const catKey = upCategory.toLowerCase().replace(/-/g, ' ');
    const catWords = catKey.split(/\s+/).filter(w => w.length >= 4);
    const catMatch = items.find(i => {
      const labelNorm = normaliseMerchant(i.label);
      return labelNorm === catKey || catWords.some(w => labelNorm.includes(w));
    });
    if (catMatch) {
      return { budget_item_id: catMatch.id, confidence: 'medium', reason: 'category match' };
    }
  }

  // Low: any significant word in merchant appears in budget item label (or vice versa)
  const merchantWords = merchantNormalised.split(/\s+/).filter(w => w.length >= 4);
  if (merchantWords.length) {
    for (const item of items) {
      const labelNorm = normaliseMerchant(item.label);
      const matched = merchantWords.some(w => labelNorm.includes(w) || normaliseMerchant(item.label).split(/\s+/).some(lw => lw.length >= 4 && merchantNormalised.includes(lw)));
      if (matched) {
        return { budget_item_id: item.id, confidence: 'low', reason: 'keyword match' };
      }
    }
  }

  // Low: fuzzy label match ≥0.45
  let best: { item: BudgetItem; score: number } | null = null;
  for (const item of items) {
    const score = similarity(merchantNormalised, normaliseMerchant(item.label));
    if (score >= 0.45 && (!best || score > best.score)) best = { item, score };
  }
  if (best) {
    return { budget_item_id: best.item.id, confidence: 'low', reason: 'fuzzy match' };
  }

  return { budget_item_id: null, confidence: 'unmatched', reason: 'no match found' };
}
