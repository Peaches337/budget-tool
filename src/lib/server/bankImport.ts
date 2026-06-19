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

export function detectAndParse(csvText: string): DetectedFormat {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error('File appears empty or has only a header row.');

  // Try each format starting from the top; skip preamble lines some banks emit
  for (let startLine = 0; startLine < Math.min(5, lines.length); startLine++) {
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
  csvText: string
): Promise<{ fileId: string; bank: string; imported: number; matched: number }> {
  const { bank, rows } = detectAndParse(csvText);

  // Create file record
  const [fileRow] = await query<{ id: string }>(
    `INSERT INTO imported_files (user_id, filename, bank_name, row_count)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [userId, filename, bank, rows.length]
  );
  const fileId = fileRow.id;

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
         (user_id, file_id, settled_at, description, amount_cents, currency, balance_cents,
          budget_item_id, match_confidence)
       VALUES ($1,$2,$3,$4,$5,'AUD',$6,$7,$8)`,
      [
        userId, fileId, row.settled_at, row.description, row.amount_cents,
        row.balance_cents ?? null,
        result.budget_item_id,
        result.confidence
      ]
    );
  }

  return { fileId, bank, imported: rows.length, matched };
}
