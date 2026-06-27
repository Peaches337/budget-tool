import { normaliseMerchant, matchTransaction } from './transactionMatcher.js';
import { query } from './db.js';

export type ParsedRow = {
  settled_at: string;   // YYYY-MM-DD
  description: string;
  amount_cents: number; // negative = debit
  balance_cents: number | null;
};

export type DetectedFormat = {
  bank: string;
  rows: ParsedRow[];
};

// ── CSV helpers ──────────────────────────────────────────────────────────────

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur.trim());
  return result;
}

function parseAusDate(d: string): string | null {
  // DD/MM/YYYY or DD-MM-YYYY or YYYY-MM-DD
  const dmy = d.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  const iso = d.match(/^\d{4}-\d{2}-\d{2}$/);
  if (iso) return d;
  return null;
}

function toCents(s: string): number | null {
  if (!s || s.trim() === '') return null;
  const n = parseFloat(s.replace(/[,$\s]/g, ''));
  if (isNaN(n)) return null;
  return Math.round(n * 100);
}

// ── Merchant name cleaner ────────────────────────────────────────────────────

export function cleanDescription(raw: string): string {
  let s = raw
    // Remove card reference: "Card xx1234" or "Card XX1234"
    .replace(/\bCard\s+[xX*]{2}\d+\b/gi, '')
    // Remove value date: "Value Date: DD/MM/YYYY"
    .replace(/\bValue Date:\s*\d{1,2}\/\d{1,2}\/\d{4}\b/gi, '')
    // Remove "AUD 14.95" inline currency amounts
    .replace(/\bAUD\s+[\d,]+\.?\d*\b/gi, '')
    // Remove AU / AUS country suffix
    .replace(/\s+AU[S]?\b/g, '')
    // Remove bare location-ish codes: all-caps word ≥3 chars followed by 2-letter state code
    .replace(/\b[A-Z]{3,}\s+(?:NSW|VIC|QLD|SA|WA|TAS|ACT|NT)\b/g, '')
    // Remove 4–6 digit store/terminal numbers after a space
    .replace(/\s+\d{4,6}\b/g, '')
    // Remove trailing/leading punctuation and extra spaces
    .replace(/[*_\-]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Title-case: lowercase everything, then capitalise first letter of each word
  s = s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

  return s || raw;
}

// ── Format detectors ─────────────────────────────────────────────────────────

type FormatDef = {
  bank: string;
  // match returns column indices or null if not this format
  detect: (headers: string[]) => null | ((cols: string[]) => ParsedRow | null);
};

const FORMATS: FormatDef[] = [
  // NAB: Date,Amount,Narrative,Type,Balance,...
  {
    bank: 'NAB',
    detect(h) {
      const di = h.findIndex(x => /^date$/i.test(x));
      const ai = h.findIndex(x => /^amount$/i.test(x));
      const ni = h.findIndex(x => /^narr/i.test(x));
      const bi = h.findIndex(x => /^balance$/i.test(x));
      if (di < 0 || ai < 0 || ni < 0) return null;
      return (cols) => {
        const date = parseAusDate(cols[di]);
        const amount = toCents(cols[ai]);
        if (!date || amount == null) return null;
        return { settled_at: date, description: cols[ni] || '', amount_cents: amount, balance_cents: bi >= 0 ? toCents(cols[bi]) : null };
      };
    }
  },
  // Westpac: BSB,Account Number,Transaction Date,Narration,Cheque Number,Debit,Credit,Balance,Transaction Type
  {
    bank: 'Westpac',
    detect(h) {
      const bsb = h.findIndex(x => /^bsb$/i.test(x));
      const di = h.findIndex(x => /transaction.?date/i.test(x));
      const ni = h.findIndex(x => /narr/i.test(x));
      const dri = h.findIndex(x => /^debit$/i.test(x));
      const cri = h.findIndex(x => /^credit$/i.test(x));
      const bi = h.findIndex(x => /^balance$/i.test(x));
      if (bsb < 0 || di < 0 || ni < 0) return null;
      return (cols) => {
        const date = parseAusDate(cols[di]);
        if (!date) return null;
        const debit = dri >= 0 ? toCents(cols[dri]) : null;
        const credit = cri >= 0 ? toCents(cols[cri]) : null;
        const amount = debit != null && debit !== 0 ? -debit : (credit ?? 0);
        return { settled_at: date, description: cols[ni] || '', amount_cents: amount, balance_cents: bi >= 0 ? toCents(cols[bi]) : null };
      };
    }
  },
  // St George / Bank of Melbourne / BankSA: Date,Description,Debit,Credit,Balance
  {
    bank: 'St George',
    detect(h) {
      const di = h.findIndex(x => /^date$/i.test(x));
      const ni = h.findIndex(x => /^desc/i.test(x));
      const dri = h.findIndex(x => /^debit$/i.test(x));
      const cri = h.findIndex(x => /^credit$/i.test(x));
      const bi = h.findIndex(x => /^balance$/i.test(x));
      if (di < 0 || ni < 0 || dri < 0 || cri < 0) return null;
      return (cols) => {
        const date = parseAusDate(cols[di]);
        if (!date) return null;
        const debit = toCents(cols[dri]);
        const credit = toCents(cols[cri]);
        const amount = debit != null && debit !== 0 ? -debit : (credit ?? 0);
        return { settled_at: date, description: cols[ni] || '', amount_cents: amount, balance_cents: bi >= 0 ? toCents(cols[bi]) : null };
      };
    }
  },
  // ING: Date,Description,Credit,Debit,Balance
  {
    bank: 'ING',
    detect(h) {
      const di = h.findIndex(x => /^date$/i.test(x));
      const ni = h.findIndex(x => /^desc/i.test(x));
      const cri = h.findIndex(x => /^credit$/i.test(x));
      const dri = h.findIndex(x => /^debit$/i.test(x));
      const bi = h.findIndex(x => /^balance$/i.test(x));
      // ING credit comes before debit — distinguish from St George
      if (di < 0 || ni < 0 || cri < 0 || dri < 0 || cri > dri) return null;
      return (cols) => {
        const date = parseAusDate(cols[di]);
        if (!date) return null;
        const debit = toCents(cols[dri]);
        const credit = toCents(cols[cri]);
        const amount = debit != null && debit !== 0 ? -debit : (credit ?? 0);
        return { settled_at: date, description: cols[ni] || '', amount_cents: amount, balance_cents: bi >= 0 ? toCents(cols[bi]) : null };
      };
    }
  },
  // Suncorp: Date,Transaction,Debit,Credit,Balance
  {
    bank: 'Suncorp',
    detect(h) {
      const di = h.findIndex(x => /^date$/i.test(x));
      const ni = h.findIndex(x => /^transaction$/i.test(x));
      const dri = h.findIndex(x => /^debit$/i.test(x));
      const cri = h.findIndex(x => /^credit$/i.test(x));
      const bi = h.findIndex(x => /^balance$/i.test(x));
      if (di < 0 || ni < 0 || dri < 0 || cri < 0) return null;
      return (cols) => {
        const date = parseAusDate(cols[di]);
        if (!date) return null;
        const debit = toCents(cols[dri]);
        const credit = toCents(cols[cri]);
        const amount = debit != null && debit !== 0 ? -debit : (credit ?? 0);
        return { settled_at: date, description: cols[ni] || '', amount_cents: amount, balance_cents: bi >= 0 ? toCents(cols[bi]) : null };
      };
    }
  },
  // Bendigo: Date,Transaction Date,Narration,Cheque Number,Amount,Balance
  {
    bank: 'Bendigo Bank',
    detect(h) {
      const di = h.findIndex(x => /^date$/i.test(x));
      const ni = h.findIndex(x => /narr/i.test(x));
      const ai = h.findIndex(x => /^amount$/i.test(x));
      const bi = h.findIndex(x => /^balance$/i.test(x));
      if (di < 0 || ni < 0 || ai < 0) return null;
      // Must also have a second date-like column (Transaction Date)
      const secondDate = h.findIndex((x, i) => i !== di && /date/i.test(x));
      if (secondDate < 0) return null;
      return (cols) => {
        const date = parseAusDate(cols[di]);
        const amount = toCents(cols[ai]);
        if (!date || amount == null) return null;
        return { settled_at: date, description: cols[ni] || '', amount_cents: amount, balance_cents: bi >= 0 ? toCents(cols[bi]) : null };
      };
    }
  },
  // ANZ / CommBank: Date,Amount,Description,Balance (very similar — detect by column order)
  {
    bank: 'ANZ / CommBank',
    detect(h) {
      const di = h.findIndex(x => /^date$/i.test(x));
      const ai = h.findIndex(x => /^amount$/i.test(x));
      const ni = h.findIndex(x => /^desc/i.test(x));
      const bi = h.findIndex(x => /^balance$/i.test(x));
      if (di < 0 || ai < 0 || ni < 0) return null;
      return (cols) => {
        const date = parseAusDate(cols[di]);
        const amount = toCents(cols[ai]);
        if (!date || amount == null) return null;
        return { settled_at: date, description: cols[ni] || '', amount_cents: amount, balance_cents: bi >= 0 ? toCents(cols[bi]) : null };
      };
    }
  },
  // Macquarie: Transaction Date,Effective Date,Amount,Balance,Transaction Description
  {
    bank: 'Macquarie',
    detect(h) {
      const di = h.findIndex(x => /transaction.?date/i.test(x));
      const ai = h.findIndex(x => /^amount$/i.test(x));
      const ni = h.findIndex(x => /description/i.test(x));
      const bi = h.findIndex(x => /^balance$/i.test(x));
      if (di < 0 || ai < 0 || ni < 0) return null;
      return (cols) => {
        const date = parseAusDate(cols[di]);
        const amount = toCents(cols[ai]);
        if (!date || amount == null) return null;
        return { settled_at: date, description: cols[ni] || '', amount_cents: amount, balance_cents: bi >= 0 ? toCents(cols[bi]) : null };
      };
    }
  },
];

function tryParseCommBankHeaderless(lines: string[]): DetectedFormat | null {
  // CommBank exports: no header row, 4 columns: Date, Amount, Description, Balance
  // Could be tab-separated or comma-separated (with quoted description)
  const splitLine = (line: string) =>
    line.includes('\t') ? line.split('\t').map(c => c.trim()) : parseCsvLine(line);

  const cols0 = splitLine(lines[0]);
  if (cols0.length < 3) return null;
  if (!parseAusDate(cols0[0])) return null;
  if (toCents(cols0[1]) == null) return null;

  const rows: ParsedRow[] = [];
  for (const line of lines) {
    const c = splitLine(line);
    if (c.length < 3) continue;
    const date = parseAusDate(c[0]);
    const amount = toCents(c[1]);
    if (!date || amount == null) continue;
    rows.push({
      settled_at: date,
      description: c[2],
      amount_cents: amount,
      balance_cents: c[3] ? toCents(c[3]) : null,
    });
  }
  return rows.length ? { bank: 'CommBank', rows } : null;
}

export function detectAndParse(csvText: string): DetectedFormat {
  // Strip UTF-8 BOM that CommBank and some other banks prepend
  const cleaned = csvText.replace(/^﻿/, '');
  const lines = cleaned.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 1) throw new Error('File appears empty.');

  // Try CommBank headerless (tab or comma separated, no header row)
  const tsv = tryParseCommBankHeaderless(lines);
  if (tsv) return tsv;

  if (lines.length < 2) throw new Error('File appears empty or has only a header row.');

  // Try each format starting from the top; skip preamble lines some banks emit (up to 10)
  for (let startLine = 0; startLine < Math.min(10, lines.length); startLine++) {
    const headers = parseCsvLine(lines[startLine]).map(h => h.replace(/^"|"$/g, '').trim());
    for (const fmt of FORMATS) {
      const parser = fmt.detect(headers);
      if (!parser) continue;
      const rows: ParsedRow[] = [];
      for (let i = startLine + 1; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i]);
        const row = parser(cols);
        if (row) rows.push(row);
      }
      if (rows.length > 0) return { bank: fmt.bank, rows };
    }
  }

  throw new Error('Unrecognised file format. Supported banks: ANZ, CommBank, Westpac, NAB, ING, St George, Bendigo, Suncorp, Macquarie.');
}

// ── Persist + match ──────────────────────────────────────────────────────────

export async function importFile(
  userId: string,
  filename: string,
  csvText: string,
  netWorthEntryId?: string | null
): Promise<{ fileId: string; bank: string; imported: number; matched: number; latestBalance: number | null }> {
  const { bank, rows } = detectAndParse(csvText);

  // Create file record
  const [fileRow] = await query<{ id: string }>(
    `INSERT INTO imported_files (user_id, filename, bank_name, row_count, net_worth_entry_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [userId, filename, bank, rows.length, netWorthEntryId ?? null]
  );
  const fileId = fileRow.id;

  // If linked to a net worth entry, update its balance to the latest row's balance
  const latestBalance = rows[0]?.balance_cents ?? null;
  if (netWorthEntryId && latestBalance != null) {
    await query(
      `UPDATE net_worth_entries SET amount = $1, last_updated = now() WHERE id = $2 AND user_id = $3`,
      [(latestBalance / 100).toFixed(2), netWorthEntryId, userId]
    );
  }

  // Load budget items + saved merchant mappings for matching
  const items = await query<{ id: string; label: string; category_id: string }>(
    `SELECT bi.id, bi.label, bi.category_id
     FROM budget_items bi
     JOIN budget_categories bc ON bc.id = bi.category_id
     WHERE bc.user_id = $1 AND bc.is_income = false`,
    [userId]
  );
  const mappings = await query<{ merchant_normalised: string; budget_item_id: string; confirmed: boolean }>(
    `SELECT merchant_normalised, budget_item_id, confirmed FROM bank_merchant_mappings WHERE user_id = $1`,
    [userId]
  );

  let matched = 0;
  for (const row of rows) {
    const merchantNorm = normaliseMerchant(row.description);
    const result = matchTransaction(merchantNorm, null, items, mappings);
    if (result.confidence !== 'unmatched') matched++;

    await query(
      `INSERT INTO imported_transactions
         (user_id, file_id, settled_at, description, clean_description, amount_cents, currency, balance_cents,
          budget_item_id, match_confidence, merchant_normalised)
       VALUES ($1,$2,$3,$4,$5,$6,'AUD',$7,$8,$9,$10)`,
      [
        userId, fileId, row.settled_at, row.description, cleanDescription(row.description),
        row.amount_cents, row.balance_cents ?? null,
        result.budget_item_id, result.confidence, merchantNorm
      ]
    );
  }

  return { fileId, bank, imported: rows.length, matched, latestBalance };
}
