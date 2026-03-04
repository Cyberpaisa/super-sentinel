/**
 * Auto-Feedback Engine — Type definitions
 *
 * Types for the automated on-chain feedback system that rates
 * other agents after service interactions.
 */

export interface FeedbackParams {
  callerWallet: string;
  endpoint: string;
  latencyMs: number;
  wasX402: boolean;
  responseStatus: number;
}

export interface FeedbackResult {
  submitted: boolean;
  txHash: string;
  score: number;
  skippedReason?: string;
}

export interface RateLimitEntry {
  timestamps: number[];
}
