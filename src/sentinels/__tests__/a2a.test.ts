import { describe, it, expect } from 'vitest';
import { checkA2A } from '../a2a';

describe('A2A Sentinel', () => {
  it('should FAIL for an endpoint without agent-card.json (httpbin)', async () => {
    const result = await checkA2A('https://httpbin.org');

    expect(result).toHaveProperty('sentinel', 'a2a');
    expect(result).toHaveProperty('passed');
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('data');
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.data.cardFound).toBe(false);
  });
});
