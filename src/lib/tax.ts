// Shared (client + server) tax utilities

export type Frequency = 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'annually';

export type TaxResult = {
  grossIncome: number;
  incomeTax: number;
  medicareLevy: number;
  lito: number;
  totalTax: number;
  netIncome: number;
};

export type TaxYear = '2024-25' | '2025-26' | '2026-27';

export const TAX_YEARS: TaxYear[] = ['2024-25', '2025-26', '2026-27'];

// Returns the FY string for the current date, e.g. "2025-26"
export function currentTaxYear(): TaxYear {
  const now = new Date();
  const year = now.getFullYear();
  const fy = now.getMonth() >= 6 ? year : year - 1; // FY starts July
  const label = `${fy}-${String(fy + 1).slice(2)}` as TaxYear;
  return TAX_YEARS.includes(label) ? label : '2025-26';
}

export function calcAustralianTax(grossIncome: number, taxYear: TaxYear = '2025-26'): TaxResult {
  const g = Math.max(0, grossIncome);

  // Stage 3 tax cuts apply from 2024-25 onwards; no bracket changes announced for 2025-26 or 2026-27
  let tax = 0;
  if (g <= 18200)        tax = 0;
  else if (g <= 45000)   tax = (g - 18200) * 0.16;
  else if (g <= 135000)  tax = 4288 + (g - 45000) * 0.30;
  else if (g <= 190000)  tax = 31288 + (g - 135000) * 0.37;
  else                   tax = 51638 + (g - 190000) * 0.45;

  let medicare = 0;
  if (g > 26000)       medicare = g * 0.02;
  else if (g > 21335)  medicare = (g - 21335) * 0.1;

  let lito = 0;
  if (g <= 37500)      lito = 700;
  else if (g <= 45000) lito = 700 - (g - 37500) * 0.05;
  else if (g <= 66667) lito = 325 - (g - 45000) * 0.015;

  const incomeTax      = Math.round(Math.max(0, tax - lito));
  const medicareLevy   = Math.round(medicare);
  const totalTax       = incomeTax + medicareLevy;

  return { grossIncome: g, incomeTax, medicareLevy, lito: Math.round(lito), totalTax, netIncome: g - totalTax };
}

export function toAnnual(amount: number, frequency: Frequency): number {
  const m: Record<Frequency, number> = { weekly: 52, fortnightly: 26, monthly: 12, quarterly: 4, annually: 1 };
  return amount * m[frequency];
}

export function fromAnnual(annual: number, frequency: Frequency): number {
  const d: Record<Frequency, number> = { weekly: 52, fortnightly: 26, monthly: 12, quarterly: 4, annually: 1 };
  return annual / d[frequency];
}

export const PERIOD_MULTIPLIER: Record<string, number> = {
  weekly: 1/52, fortnightly: 1/26, monthly: 1/12, annually: 1
};
