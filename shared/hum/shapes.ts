/**
 * Fixed set of brand shapes used for visual payment matching. Both phones show the
 * same three shapes (chosen by the server) so people can confirm the pairing by eye.
 */
export const BRAND_SHAPES = ['triangle', 'ring', 'diamond', 'square', 'dot', 'cross'] as const;
export type BrandShape = (typeof BRAND_SHAPES)[number];
export type ShapeTriple = [BrandShape, BrandShape, BrandShape];

export function isBrandShape(value: unknown): value is BrandShape {
  return typeof value === 'string' && (BRAND_SHAPES as readonly string[]).includes(value);
}

/**
 * Picks three distinct shapes in order (120 combinations).
 * `randomInt(n)` must return a uniformly random integer in [0, n).
 */
export function pickShapes(randomInt: (n: number) => number): ShapeTriple {
  const pool: BrandShape[] = [...BRAND_SHAPES];
  const picked: BrandShape[] = [];
  for (let i = 0; i < 3; i++) {
    const [shape] = pool.splice(randomInt(pool.length), 1);
    picked.push(shape as BrandShape);
  }
  return picked as ShapeTriple;
}
