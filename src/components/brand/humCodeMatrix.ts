import QRCode from 'qrcode';

export interface HumCodeMatrix {
  /** Modules per side (without quiet zone). */
  size: number;
  isDark: (row: number, col: number) => boolean;
  /** True for the three 7×7 finder patterns (drawn as rounded squares). */
  isFinder: (row: number, col: number) => boolean;
  /** Square, centred area (in modules) kept free for the logo. */
  logoSpan: number;
}

/**
 * QR matrix at error correction level H (recovers ~30% damage), so the dot styling, the
 * centre logo and the shading animation all stay well inside what scanners tolerate.
 */
export function buildHumCodeMatrix(value: string): HumCodeMatrix {
  const qr = QRCode.create(value, { errorCorrectionLevel: 'H' });
  const size = qr.modules.size;
  const inFinder = (r: number, c: number) =>
    (r < 7 && c < 7) || (r < 7 && c >= size - 7) || (r >= size - 7 && c < 7);
  // Keep the logo under ~6% of the symbol area.
  const logoSpan = Math.max(3, Math.floor(size * 0.24) | 1);
  return {
    size,
    isDark: (r, c) => Boolean(qr.modules.get(r, c)),
    isFinder: inFinder,
    logoSpan,
  };
}
