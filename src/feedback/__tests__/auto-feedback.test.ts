import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetBalance = vi.fn().mockResolvedValue(100_000_000_000_000_000n); // 0.1 AVAX
const mockReadContract = vi.fn().mockResolvedValue(1686n);
const mockWriteContract = vi.fn().mockResolvedValue('0xMockTxHash');
const mockGetAddresses = vi.fn().mockResolvedValue(['0xReviewerWallet']);

vi.mock('@/lib/blockchain/client', () => ({
  publicClient: {
    getBalance: (...args: unknown[]) => mockGetBalance(...args),
    readContract: (...args: unknown[]) => mockReadContract(...args),
  },
  getActiveChain: vi.fn().mockReturnValue({ id: 43113, name: 'Avalanche Fuji' }),
  isMainnet: vi.fn().mockReturnValue(false),
}));

vi.mock('viem', async () => {
  const actual = await vi.importActual('viem');
  return {
    ...actual,
    createWalletClient: vi.fn().mockReturnValue({
      writeContract: (...args: unknown[]) => mockWriteContract(...args),
      getAddresses: (...args: unknown[]) => mockGetAddresses(...args),
    }),
  };
});

vi.mock('viem/accounts', () => ({
  privateKeyToAccount: vi.fn().mockReturnValue({
    address: '0xReviewerWallet',
    type: 'local',
  }),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { AutoFeedbackEngine } from '../auto-feedback';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultParams = () => ({
  callerWallet: '0x1234567890abcdef1234567890abcdef12345678',
  endpoint: '/api/v1/sentinel/scan',
  latencyMs: 1000,
  wasX402: false,
  responseStatus: 500,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AutoFeedbackEngine', () => {
  let engine: AutoFeedbackEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = AutoFeedbackEngine.getInstance();
    engine._reset();

    // Default: enabled
    process.env.AUTO_FEEDBACK_ENABLED = 'true';
    process.env.PAYER_PRIVATE_KEY = '0x0000000000000000000000000000000000000000000000000000000000000001';
    process.env.AUTO_FEEDBACK_COOLDOWN_HOURS = '6';
    process.env.AUTO_FEEDBACK_MAX_DAILY = '10';

    // Default mocks: balance ok, agent registered
    mockGetBalance.mockResolvedValue(100_000_000_000_000_000n);
    mockReadContract.mockResolvedValue(1686n);
    mockWriteContract.mockResolvedValue('0xMockTxHash');
  });

  // -----------------------------------------------------------------------
  // Score calculation
  // -----------------------------------------------------------------------

  describe('calculateScore', () => {
    it('returns base 70 with no bonuses', () => {
      const score = engine.calculateScore({
        callerWallet: '0x1',
        endpoint: '/test',
        latencyMs: 1000,
        wasX402: false,
        responseStatus: 500,
      });
      expect(score).toBe(70);
    });

    it('returns max 100 with all bonuses', () => {
      const score = engine.calculateScore({
        callerWallet: '0x1',
        endpoint: '/test',
        latencyMs: 200,
        wasX402: true,
        responseStatus: 200,
      });
      expect(score).toBe(100);
    });

    it('adds +10 for latency < 500ms', () => {
      const score = engine.calculateScore({
        ...defaultParams(),
        latencyMs: 400,
      });
      expect(score).toBe(80);
    });

    it('adds +10 for x402 payment', () => {
      const score = engine.calculateScore({
        ...defaultParams(),
        wasX402: true,
      });
      expect(score).toBe(80);
    });

    it('adds +10 for status 200', () => {
      const score = engine.calculateScore({
        ...defaultParams(),
        responseStatus: 200,
      });
      expect(score).toBe(80);
    });
  });

  // -----------------------------------------------------------------------
  // Rate limiting
  // -----------------------------------------------------------------------

  describe('rate limiting', () => {
    it('allows first feedback for a wallet+endpoint', async () => {
      const result = await engine.postServiceFeedback(defaultParams());
      expect(result?.submitted).toBe(true);
    });

    it('blocks within cooldown window', async () => {
      await engine.postServiceFeedback(defaultParams());
      const result = await engine.postServiceFeedback(defaultParams());
      expect(result?.skippedReason).toBe('rate-limited');
    });

    it('allows after cooldown expires', async () => {
      // Submit first feedback
      await engine.postServiceFeedback(defaultParams());

      // Fast-forward past cooldown by manipulating rate limits
      vi.spyOn(Date, 'now')
        .mockReturnValueOnce(Date.now() + 7 * 60 * 60 * 1000) // isRateLimited check
        .mockReturnValueOnce(Date.now() + 7 * 60 * 60 * 1000) // daily count filter
        .mockReturnValueOnce(Date.now() + 7 * 60 * 60 * 1000) // recordRateLimit
        .mockReturnValueOnce(Date.now() + 7 * 60 * 60 * 1000); // prune

      const result = await engine.postServiceFeedback(defaultParams());
      expect(result?.submitted).toBe(true);

      vi.restoreAllMocks();
    });

    it('blocks when daily limit exceeded', async () => {
      process.env.AUTO_FEEDBACK_MAX_DAILY = '2';

      // Submit to 2 different endpoints to avoid cooldown
      await engine.postServiceFeedback({
        ...defaultParams(),
        endpoint: '/endpoint-1',
      });
      await engine.postServiceFeedback({
        ...defaultParams(),
        endpoint: '/endpoint-2',
      });

      // 3rd call to the same wallet but a 3rd endpoint — daily limit per key is separate
      // Actually, daily limit is per key (wallet:endpoint), so use same key
      // We need to exhaust daily for the SAME key, so we need time-travel

      // Reset and test daily with same key using time manipulation
      engine._reset();
      process.env.AUTO_FEEDBACK_MAX_DAILY = '1';

      await engine.postServiceFeedback(defaultParams());

      // Fast forward past cooldown but within 24h
      const futureTime = Date.now() + 7 * 60 * 60 * 1000;
      vi.spyOn(Date, 'now')
        .mockReturnValue(futureTime);

      const result = await engine.postServiceFeedback(defaultParams());
      expect(result?.skippedReason).toBe('rate-limited');

      vi.restoreAllMocks();
    });
  });

  // -----------------------------------------------------------------------
  // Disabled / skip conditions
  // -----------------------------------------------------------------------

  describe('skip conditions', () => {
    it('skips when AUTO_FEEDBACK_ENABLED is not true', async () => {
      delete process.env.AUTO_FEEDBACK_ENABLED;
      const result = await engine.postServiceFeedback(defaultParams());
      expect(result?.skippedReason).toBe('disabled');
      expect(result?.submitted).toBe(false);
    });

    it('skips when AVAX balance is too low', async () => {
      mockGetBalance.mockResolvedValueOnce(1_000_000_000_000_000n); // 0.001 AVAX
      const result = await engine.postServiceFeedback(defaultParams());
      expect(result?.skippedReason).toBe('low-balance');
    });

    it('skips when wallet is not registered (agentId = 0)', async () => {
      mockReadContract.mockResolvedValueOnce(0n);
      const result = await engine.postServiceFeedback(defaultParams());
      expect(result?.skippedReason).toBe('not-registered');
    });
  });

  // -----------------------------------------------------------------------
  // Successful submission
  // -----------------------------------------------------------------------

  describe('on-chain submission', () => {
    it('calls writeContract with correct arguments', async () => {
      const params = {
        callerWallet: '0xCallerWallet',
        endpoint: '/api/v1/sentinel/scan',
        latencyMs: 200,
        wasX402: true,
        responseStatus: 200,
      };

      const result = await engine.postServiceFeedback(params);

      expect(result?.submitted).toBe(true);
      expect(result?.txHash).toBe('0xMockTxHash');
      expect(result?.score).toBe(100);

      expect(mockWriteContract).toHaveBeenCalledWith(
        expect.objectContaining({
          abi: expect.any(Array),
          functionName: 'giveFeedback',
          args: expect.arrayContaining([
            1686n, // agentId
            100n, // score
            0, // flags
            'auto-feedback', // tag1
            'full-scan', // tag2 (endpoint contains "scan")
          ]),
        }),
      );
    });

    it('returns null on writeContract error without throwing', async () => {
      mockWriteContract.mockRejectedValueOnce(new Error('tx reverted'));
      const result = await engine.postServiceFeedback(defaultParams());
      expect(result).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Singleton
  // -----------------------------------------------------------------------

  describe('singleton', () => {
    it('returns the same instance', () => {
      const a = AutoFeedbackEngine.getInstance();
      const b = AutoFeedbackEngine.getInstance();
      expect(a).toBe(b);
    });
  });
});
