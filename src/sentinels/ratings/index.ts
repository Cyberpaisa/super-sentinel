import { createLogger } from '@/lib/utils/logger';
import { type SentinelResult } from '../types';

const logger = createLogger('sentinel:ratings');

/**
 * Input for a single rating entry.
 */
export interface RatingInput {
  /** Identifier of the reviewer (address, name, etc.) */
  reviewer: string;
  /** Numeric rating value (0-100) */
  value: number;
  /** Optional tag/category for the rating */
  tag?: string;
}

export interface RatingsData {
  ratingCount: number;
  averageValue: number;
  uniqueReviewers: number;
}

/**
 * Ratings sentinel — evaluates reputation based on community ratings.
 *
 * Score calculation:
 *  - 0 ratings         -> score = 0, passed = false
 *  - 1-2 ratings       -> base 30 + avg normalized to 0-30
 *  - 3-5 ratings       -> base 50 + avg normalized to 0-30
 *  - 6+ ratings        -> base 70 + avg normalized to 0-30
 *  - Capped at 100
 *
 * passed = score >= 50
 */
export async function checkRatings(
  ratings: RatingInput[]
): Promise<SentinelResult> {
  if (ratings.length === 0) {
    logger.info('No ratings provided — score 0');
    return {
      sentinel: 'ratings',
      passed: false,
      score: 0,
      data: { ratingCount: 0, averageValue: 0, uniqueReviewers: 0 },
    };
  }

  const uniqueReviewers = new Set(ratings.map((r) => r.reviewer)).size;
  const averageValue = ratings.reduce((sum, r) => sum + r.value, 0) / ratings.length;

  // Determine base score from rating count
  let base: number;
  if (ratings.length <= 2) {
    base = 30;
  } else if (ratings.length <= 5) {
    base = 50;
  } else {
    base = 70;
  }

  // Normalize average value (0-100) to a 0-30 bonus
  const bonus = Math.round((Math.min(Math.max(averageValue, 0), 100) / 100) * 30);
  const score = Math.min(base + bonus, 100);
  const passed = score >= 50;

  logger.info(
    { ratingCount: ratings.length, averageValue, uniqueReviewers, score, passed },
    'Ratings check completed'
  );

  return {
    sentinel: 'ratings',
    passed,
    score,
    data: {
      ratingCount: ratings.length,
      averageValue: Math.round(averageValue * 100) / 100,
      uniqueReviewers,
    },
  };
}
