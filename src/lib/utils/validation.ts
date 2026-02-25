import { z } from 'zod';

/**
 * Zod validation schemas for agent registration
 * @see docs/api/endpoints.md
 * @see docs/standards/typescript-guidelines.md
 */

// ============================================
// REUSABLE SCHEMAS
// ============================================

/**
 * Validates Ethereum address format (0x followed by 40 hex characters)
 */
export const addressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, {
    message: 'Invalid Ethereum address format. Must be 0x followed by 40 hex characters',
  })
  .transform((val) => val.toLowerCase() as `0x${string}`);

/**
 * Validates agent type enum
 */
export const agentTypeSchema = z.enum(
  ['TRADING', 'LENDING', 'GOVERNANCE', 'ORACLE', 'CUSTOM'],
  {
    errorMap: () => ({
      message: 'Agent type must be one of: TRADING, LENDING, GOVERNANCE, ORACLE, CUSTOM',
    }),
  }
);

// ============================================
// AGENT REGISTRATION SCHEMA
// ============================================

/**
 * Schema for agent registration requests
 * Validates all required fields for registering a new agent
 */
export const registerAgentSchema = z.object({
  address: addressSchema,
  name: z
    .string()
    .min(3, 'Agent name must be at least 3 characters')
    .max(50, 'Agent name must not exceed 50 characters')
    .trim(),
  description: z
    .string()
    .max(500, 'Description must not exceed 500 characters')
    .trim()
    .optional(),
  type: agentTypeSchema,
});

// ============================================
// RATING SCHEMAS
// ============================================

/**
 * Schema for rating submission requests
 */
export const createRatingSchema = z.object({
  score: z
    .number()
    .int('Score must be a whole number')
    .min(1, 'Score must be at least 1')
    .max(5, 'Score must not exceed 5'),
  comment: z
    .string()
    .max(280, 'Comment must not exceed 280 characters')
    .trim()
    .optional(),
  signature: z.string().min(1, 'Signature is required'),
  userAddress: addressSchema,
  nonce: z.string().min(1, 'Nonce is required'),
  timestamp: z.number().int('Timestamp must be an integer'),
});

/**
 * Query params for getting ratings
 */
export const getRatingsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ============================================
// REPORT SCHEMAS
// ============================================

export const reportReasonSchema = z.enum(
  ['PROXY_HIDDEN', 'INCONSISTENT_BEHAVIOR', 'SCAM', 'OTHER'],
  {
    errorMap: () => ({
      message: 'Reason must be one of: PROXY_HIDDEN, INCONSISTENT_BEHAVIOR, SCAM, OTHER',
    }),
  }
);

/**
 * Schema for report submission requests
 */
export const createReportSchema = z.object({
  reason: reportReasonSchema,
  description: z
    .string()
    .min(10, 'Description must be at least 10 characters')
    .max(1000, 'Description must not exceed 1000 characters')
    .trim(),
  signature: z.string().min(1, 'Signature is required'),
  userAddress: addressSchema,
  nonce: z.string().min(1, 'Nonce is required'),
  timestamp: z.number().int('Timestamp must be an integer'),
});

// ============================================
// EXPORTED TYPES
// ============================================

/**
 * TypeScript type for agent registration input
 * Inferred from registerAgentSchema
 */
export type RegisterAgentInput = z.infer<typeof registerAgentSchema>;

/**
 * TypeScript type for Ethereum address
 * Inferred from addressSchema
 */
export type Address = z.infer<typeof addressSchema>;

/**
 * TypeScript type for agent type
 * Inferred from agentTypeSchema
 */
export type AgentType = z.infer<typeof agentTypeSchema>;

/**
 * TypeScript type for rating creation input
 */
export type CreateRatingInput = z.infer<typeof createRatingSchema>;

/**
 * TypeScript type for report creation input
 */
export type CreateReportInput = z.infer<typeof createReportSchema>;

/**
 * TypeScript type for report reason
 */
export type ReportReason = z.infer<typeof reportReasonSchema>;
