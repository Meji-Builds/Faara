export type Currency = 'NGN' | 'USDC';

export const CURRENCY_SYMBOL: Record<Currency, string> = {
  NGN: '₦',
  USDC: '$',
};

/** Groups the integer part of a numeric string with commas: "12500.5" -> "12,500.5". */
export function groupDigits(value: string): string {
  const [whole = '0', fraction] = value.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

interface FormatOptions {
  /** Always render this many decimal places. Omit to keep the input as-is. */
  decimals?: number;
  /** Prefix with "+" or "−" for signed amounts. */
  signed?: boolean;
}

/** Formats an amount for display, e.g. formatMoney(12500, 'NGN') -> "₦12,500". */
export function formatMoney(
  amount: number,
  currency: Currency,
  options: FormatOptions = {},
): string {
  const { decimals, signed = false } = options;
  const abs = Math.abs(amount);
  const fixed = decimals === undefined ? String(abs) : abs.toFixed(decimals);
  const sign = signed ? (amount < 0 ? '−' : '+') : amount < 0 ? '−' : '';
  return `${sign}${CURRENCY_SYMBOL[currency]}${groupDigits(fixed)}`;
}

/**
 * Applies one keypad press to an amount being typed.
 * Keeps at most two decimal places and a bounded number of digits.
 */
export function applyKeypadInput(current: string, key: string, maxDigits = 9): string {
  if (key === 'backspace') return current.length <= 1 ? '0' : current.slice(0, -1);
  if (key === '.') return current.includes('.') ? current : `${current}.`;

  const [whole = '', fraction] = current.split('.');
  if (fraction !== undefined) return fraction.length >= 2 ? current : current + key;
  if (whole === '0') return key;
  return whole.length >= maxDigits ? current : current + key;
}

/** Initials for an avatar, e.g. "Tolu Adebayo" -> "TA". */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}
