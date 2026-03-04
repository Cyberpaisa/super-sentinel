import { describe, it, expect, vi, afterEach } from 'vitest';
import { checkA2A } from '../a2a';

// ── Unit tests with mocked fetch ──────────────────────────────────────────────

describe('A2A Sentinel (unit)', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('should return sentinel name "a2a"', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });
    const result = await checkA2A('https://example.com');
    expect(result.sentinel).toBe('a2a');
  });

  it('should score 0 and fail when agent-card.json is not found (404)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });

    const result = await checkA2A('https://example.com');

    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
    expect(result.data.cardFound).toBe(false);
  });

  it('should score 0 and fail for invalid endpoint URL', async () => {
    const result = await checkA2A('not-a-url');

    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
    expect(result.data.cardFound).toBe(false);
    expect(result.data.errorMessage).toBe('Invalid endpoint URL');
  });

  it('should score 0 and fail when agent-card.json is not valid JSON', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('not json');
      },
    });

    const result = await checkA2A('https://example.com');

    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
    expect(result.data.cardFound).toBe(true);
    expect(result.data.schemaValid).toBe(false);
    expect(result.data.errorMessage).toBe('Agent card is not valid JSON');
  });

  it('should score 40 and fail for card with incomplete schema (missing name)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        capabilities: { delegation: true },
        skills: [{ name: 'search' }],
        endpoint: 'https://example.com/agent',
        // name is missing
      }),
    });

    const result = await checkA2A('https://example.com');

    expect(result.score).toBe(40);
    expect(result.passed).toBe(false); // 40 < 50 threshold
    expect(result.data.schemaValid).toBe(false);
  });

  it('should score 40 and fail when capabilities is null', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        name: 'TestAgent',
        capabilities: null,
        skills: [{ name: 'search' }],
        endpoint: 'https://example.com/agent',
      }),
    });

    const result = await checkA2A('https://example.com');

    expect(result.score).toBe(40);
    expect(result.passed).toBe(false);
    expect(result.data.schemaValid).toBe(false);
  });

  it('should score 40 and fail when capabilities is empty object', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        name: 'TestAgent',
        capabilities: {},
        skills: [{ name: 'search' }],
        endpoint: 'https://example.com/agent',
      }),
    });

    const result = await checkA2A('https://example.com');

    expect(result.score).toBe(40);
    expect(result.passed).toBe(false);
    expect(result.data.schemaValid).toBe(false);
  });

  it('should score 40 and fail when capabilities is empty array', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        name: 'TestAgent',
        capabilities: [],
        skills: [{ name: 'search' }],
        endpoint: 'https://example.com/agent',
      }),
    });

    const result = await checkA2A('https://example.com');

    expect(result.score).toBe(40);
    expect(result.passed).toBe(false);
    expect(result.data.schemaValid).toBe(false);
  });

  it('should score 40 and fail when skills is empty array', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        name: 'TestAgent',
        capabilities: { delegation: true },
        skills: [],
        endpoint: 'https://example.com/agent',
      }),
    });

    const result = await checkA2A('https://example.com');

    expect(result.score).toBe(40);
    expect(result.passed).toBe(false);
    expect(result.data.schemaValid).toBe(false);
  });

  it('should score 40 and fail when skills is not an array', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        name: 'TestAgent',
        capabilities: { delegation: true },
        skills: 'not-an-array',
        endpoint: 'https://example.com/agent',
      }),
    });

    const result = await checkA2A('https://example.com');

    expect(result.score).toBe(40);
    expect(result.passed).toBe(false);
    expect(result.data.schemaValid).toBe(false);
  });

  it('should score 80 and pass for valid card with no known capabilities', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        name: 'TestAgent',
        capabilities: { 'custom-feature': true },
        skills: [{ name: 'search' }],
        endpoint: 'https://example.com/agent',
      }),
    });

    const result = await checkA2A('https://example.com');

    expect(result.score).toBe(80);
    expect(result.passed).toBe(true); // 80 >= 50
    expect(result.data.schemaValid).toBe(true);
    expect(result.data.name).toBe('TestAgent');
  });

  it('should score 85 (80 + 1*5) for valid card with 1 known capability', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        name: 'TestAgent',
        capabilities: { delegation: true, 'custom-feature': true },
        skills: [{ name: 'search' }],
        endpoint: 'https://example.com/agent',
      }),
    });

    const result = await checkA2A('https://example.com');

    expect(result.score).toBe(85);
    expect(result.passed).toBe(true);
    expect(result.data.capabilities).toContain('delegation');
  });

  it('should score 100 (capped) for valid card with all 5 known capabilities', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        name: 'TestAgent',
        capabilities: {
          delegation: true,
          'tool-use': true,
          'multi-step': true,
          streaming: true,
          'push-notifications': true,
        },
        skills: [{ name: 'search' }],
        endpoint: 'https://example.com/agent',
      }),
    });

    const result = await checkA2A('https://example.com');

    // 80 + 5*5 = 105, capped at 100
    expect(result.score).toBe(100);
    expect(result.passed).toBe(true);
    expect(result.data.capabilities).toHaveLength(5);
  });

  it('should accept capabilities as an array', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        name: 'TestAgent',
        capabilities: ['delegation', 'tool-use'],
        skills: [{ name: 'search' }],
        url: 'https://example.com/agent', // using "url" instead of "endpoint"
      }),
    });

    const result = await checkA2A('https://example.com');

    expect(result.score).toBe(90); // 80 + 2*5
    expect(result.passed).toBe(true);
    expect(result.data.schemaValid).toBe(true);
    expect(result.data.capabilities).toContain('delegation');
    expect(result.data.capabilities).toContain('tool-use');
  });

  it('should extract skill names from objects with name property', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        name: 'TestAgent',
        capabilities: { delegation: true },
        skills: [{ name: 'search' }, { name: 'summarize' }],
        endpoint: 'https://example.com/agent',
      }),
    });

    const result = await checkA2A('https://example.com');

    expect(result.data.skills).toEqual(['search', 'summarize']);
  });

  it('should extract skill names from string array', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        name: 'TestAgent',
        capabilities: { delegation: true },
        skills: ['search', 'summarize'],
        endpoint: 'https://example.com/agent',
      }),
    });

    const result = await checkA2A('https://example.com');

    expect(result.data.skills).toEqual(['search', 'summarize']);
  });

  it('should use passed = score >= 50 (pass threshold)', async () => {
    // score 40 (incomplete schema) -> not passed
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        // missing name -> schemaValid = false -> score = 40
        capabilities: { delegation: true },
        skills: [{ name: 'search' }],
        endpoint: 'https://example.com/agent',
      }),
    });

    const result = await checkA2A('https://example.com');
    expect(result.passed).toBe(false);
    expect(result.score).toBe(40);
    expect(result.score).toBeLessThan(50);
  });

  it('should score 0 and fail on network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const result = await checkA2A('https://example.com');

    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
    expect(result.data.errorMessage).toBe('Network error');
  });
});

// ── Integration test ──────────────────────────────────────────────────────────

describe('A2A Sentinel (integration)', () => {
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
