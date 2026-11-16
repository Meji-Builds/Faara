/**
 * Rough distance from the received hum level, used only to order claimants
 * (closest first). Calibrated from the first field test: band RMS ≈ 0.02 at about
 * 60 cm with Normal volume on a Tecno Spark 10 Pro. Level falls roughly as 1/distance;
 * speakers and microphones vary a lot, so treat this as a ranking, not a measurement.
 */
const REFERENCE_LEVEL = 0.02;
const REFERENCE_DISTANCE_CM = 60;
const MIN_CM = 5;
const MAX_CM = 500;

export function estimateDistanceCm(bandLevel: number): number | undefined {
  if (!(bandLevel > 0)) return undefined;
  const estimate = (REFERENCE_DISTANCE_CM * REFERENCE_LEVEL) / bandLevel;
  return Math.round(Math.min(MAX_CM, Math.max(MIN_CM, estimate)));
}
