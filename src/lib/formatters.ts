/**
 * Monetary formatting utility for Nigerian Naira (₦).
 * All monetary amounts in the database are stored as integer kobo (100 kobo = 1 Naira).
 * This prevents floating point rounding errors in financial ledgers.
 */

export function formatNaira(amountInKobo: number | null | undefined): string {
  if (amountInKobo === null || amountInKobo === undefined || isNaN(amountInKobo)) {
    return '₦0.00';
  }

  const nairaValue = amountInKobo / 100;
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(nairaValue);
}

export function formatNairaWhole(amountInKobo: number | null | undefined): string {
  if (amountInKobo === null || amountInKobo === undefined || isNaN(amountInKobo)) {
    return '₦0';
  }
  const nairaValue = Math.round(amountInKobo / 100);
  return '₦' + nairaValue.toLocaleString('en-NG');
}

export function nairaToKobo(nairaAmount: number | string): number {
  const parsed = typeof nairaAmount === 'string' ? parseFloat(nairaAmount.replace(/[^0-9.-]+/g, '')) : nairaAmount;
  if (isNaN(parsed)) return 0;
  return Math.round(parsed * 100);
}

export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '—';
  try {
    const d = new Date(dateString);
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(d);
  } catch {
    return dateString;
  }
}

export function formatDateTime(dateString: string | null | undefined): string {
  if (!dateString) return '—';
  try {
    const d = new Date(dateString);
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(d);
  } catch {
    return dateString;
  }
}

export function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return '0';
  return num.toLocaleString('en-NG');
}
