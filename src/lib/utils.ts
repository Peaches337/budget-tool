export function fmt(n: number, period = 1): string {
  if (!n || isNaN(n)) return '–';
  return '$' + Math.abs(n * period).toLocaleString('en-AU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
}

export function fmtSigned(n: number, period = 1): string {
  if (!n || isNaN(n)) return '–';
  const abs = Math.abs(n * period).toLocaleString('en-AU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
  return (n < 0 ? '-' : '+') + '$' + abs;
}
