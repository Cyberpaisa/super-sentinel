import { describe, it, expect } from 'vitest';
import { checkX402 } from '../x402';

describe('x402 Sentinel', () => {
  it('should FAIL for an endpoint that does not return 402 (httpbin)', async () => {
    const result = await checkX402('https://httpbin.org/get');

    expect(result).toHaveProperty('sentinel', 'x402');
    expect(result).toHaveProperty('passed');
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('data');
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.data.supported).toBe(false);
  });
});
