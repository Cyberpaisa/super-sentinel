import { describe, it, expect } from 'vitest';
import { checkRatings, type RatingInput } from '../ratings';

describe('Ratings Sentinel', () => {
  it('should return sentinel name "ratings"', async () => {
    const result = await checkRatings([]);
    expect(result.sentinel).toBe('ratings');
  });

  it('should score 0 and fail for empty ratings array', async () => {
    const result = await checkRatings([]);

    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
    expect(result.data.ratingCount).toBe(0);
    expect(result.data.averageValue).toBe(0);
    expect(result.data.uniqueReviewers).toBe(0);
  });

  it('should score ~45 and fail for 1 rating with value 50', async () => {
    const ratings: RatingInput[] = [{ reviewer: 'alice', value: 50 }];

    const result = await checkRatings(ratings);

    // base 30 (1-2 ratings) + bonus = round((50/100)*30) = 15 => total = 45
    expect(result.score).toBe(45);
    expect(result.passed).toBe(false); // 45 < 50
    expect(result.data.ratingCount).toBe(1);
    expect(result.data.uniqueReviewers).toBe(1);
  });

  it('should score < 50 and fail for 2 ratings with low values', async () => {
    const ratings: RatingInput[] = [
      { reviewer: 'alice', value: 20 },
      { reviewer: 'bob', value: 30 },
    ];

    const result = await checkRatings(ratings);

    // base 30 + bonus = round((25/100)*30) = 8 => total = 38
    expect(result.score).toBe(38);
    expect(result.passed).toBe(false);
    expect(result.data.ratingCount).toBe(2);
    expect(result.data.uniqueReviewers).toBe(2);
  });

  it('should score >= 50 and pass for 3 ratings with high values', async () => {
    const ratings: RatingInput[] = [
      { reviewer: 'alice', value: 80 },
      { reviewer: 'bob', value: 90 },
      { reviewer: 'charlie', value: 85 },
    ];

    const result = await checkRatings(ratings);

    // base 50 (3-5 ratings) + bonus = round((85/100)*30) = 26 => total = 76
    expect(result.score).toBeGreaterThanOrEqual(50);
    expect(result.passed).toBe(true);
    expect(result.data.ratingCount).toBe(3);
    expect(result.data.uniqueReviewers).toBe(3);
  });

  it('should score >= 70 and pass for 6+ ratings with high values', async () => {
    const ratings: RatingInput[] = [
      { reviewer: 'alice', value: 90 },
      { reviewer: 'bob', value: 85 },
      { reviewer: 'charlie', value: 88 },
      { reviewer: 'dave', value: 92 },
      { reviewer: 'eve', value: 80 },
      { reviewer: 'frank', value: 95 },
    ];

    const result = await checkRatings(ratings);

    // base 70 (6+ ratings) + bonus = round((88.3/100)*30) = 26 => total = 96
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.passed).toBe(true);
    expect(result.data.ratingCount).toBe(6);
    expect(result.data.uniqueReviewers).toBe(6);
  });

  it('should count unique reviewers correctly with duplicates', async () => {
    const ratings: RatingInput[] = [
      { reviewer: 'alice', value: 80 },
      { reviewer: 'alice', value: 90 }, // duplicate reviewer
      { reviewer: 'bob', value: 85 },
    ];

    const result = await checkRatings(ratings);

    expect(result.data.ratingCount).toBe(3); // all ratings counted
    expect(result.data.uniqueReviewers).toBe(2); // only 2 unique
  });

  it('should cap score at 100', async () => {
    const ratings: RatingInput[] = Array.from({ length: 10 }, (_, i) => ({
      reviewer: `reviewer-${i}`,
      value: 100,
    }));

    const result = await checkRatings(ratings);

    // base 70 + bonus = 30 => total = 100
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.score).toBe(100);
    expect(result.passed).toBe(true);
  });

  it('should clamp negative values to 0 in bonus calculation', async () => {
    const ratings: RatingInput[] = [
      { reviewer: 'alice', value: -10 },
      { reviewer: 'bob', value: -20 },
      { reviewer: 'charlie', value: -5 },
    ];

    const result = await checkRatings(ratings);

    // base 50 + bonus from clamped average (0) = 0 => total = 50
    expect(result.score).toBe(50);
    expect(result.passed).toBe(true); // 50 >= 50
  });

  it('should use passed = score >= 50 threshold', async () => {
    // 1 rating with value 50 => score 45 => not passed
    const result1 = await checkRatings([{ reviewer: 'alice', value: 50 }]);
    expect(result1.passed).toBe(false);
    expect(result1.score).toBeLessThan(50);

    // 3 ratings with moderate values => base 50 + some bonus => passed
    const result2 = await checkRatings([
      { reviewer: 'alice', value: 60 },
      { reviewer: 'bob', value: 70 },
      { reviewer: 'charlie', value: 65 },
    ]);
    expect(result2.passed).toBe(true);
    expect(result2.score).toBeGreaterThanOrEqual(50);
  });

  it('should calculate averageValue correctly and round to 2 decimal places', async () => {
    const ratings: RatingInput[] = [
      { reviewer: 'alice', value: 33 },
      { reviewer: 'bob', value: 67 },
      { reviewer: 'charlie', value: 50 },
    ];

    const result = await checkRatings(ratings);

    // average = (33 + 67 + 50) / 3 = 50
    expect(result.data.averageValue).toBe(50);
  });

  it('should have proper SentinelResult structure', async () => {
    const result = await checkRatings([{ reviewer: 'alice', value: 80 }]);

    expect(result).toHaveProperty('sentinel');
    expect(result).toHaveProperty('passed');
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('data');
    expect(result.data).toHaveProperty('ratingCount');
    expect(result.data).toHaveProperty('averageValue');
    expect(result.data).toHaveProperty('uniqueReviewers');
  });

  it('should handle ratings with optional tag field', async () => {
    const ratings: RatingInput[] = [
      { reviewer: 'alice', value: 80, tag: 'reliability' },
      { reviewer: 'bob', value: 90, tag: 'speed' },
      { reviewer: 'charlie', value: 85 },
    ];

    const result = await checkRatings(ratings);

    expect(result.data.ratingCount).toBe(3);
    expect(result.score).toBeGreaterThanOrEqual(50);
    expect(result.passed).toBe(true);
  });

  it('should use base 30 for 1-2 ratings, base 50 for 3-5, base 70 for 6+', async () => {
    // 1 rating, value 100 => base 30 + bonus 30 = 60
    const r1 = await checkRatings([{ reviewer: 'a', value: 100 }]);
    expect(r1.score).toBe(60);

    // 2 ratings, value 100 => base 30 + bonus 30 = 60
    const r2 = await checkRatings([
      { reviewer: 'a', value: 100 },
      { reviewer: 'b', value: 100 },
    ]);
    expect(r2.score).toBe(60);

    // 3 ratings, value 100 => base 50 + bonus 30 = 80
    const r3 = await checkRatings([
      { reviewer: 'a', value: 100 },
      { reviewer: 'b', value: 100 },
      { reviewer: 'c', value: 100 },
    ]);
    expect(r3.score).toBe(80);

    // 5 ratings, value 100 => base 50 + bonus 30 = 80
    const r5 = await checkRatings(
      Array.from({ length: 5 }, (_, i) => ({ reviewer: `r${i}`, value: 100 }))
    );
    expect(r5.score).toBe(80);

    // 6 ratings, value 100 => base 70 + bonus 30 = 100
    const r6 = await checkRatings(
      Array.from({ length: 6 }, (_, i) => ({ reviewer: `r${i}`, value: 100 }))
    );
    expect(r6.score).toBe(100);
  });
});
