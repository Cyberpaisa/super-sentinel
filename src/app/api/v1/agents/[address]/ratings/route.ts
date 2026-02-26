import { NextRequest } from 'next/server';
import { successResponse, paginatedResponse, handleError } from '@/lib/utils/api-helpers';
import { NotFoundError, ValidationError, ForbiddenError } from '@/lib/utils/errors';
import { verifyWalletSignature } from '@/lib/utils/auth';
import { addressSchema, createRatingSchema, getRatingsQuerySchema } from '@/lib/utils/validation';
import { createLogger } from '@/lib/utils/logger';
import { prisma } from '@/lib/database/prisma';
import { publicClient } from '@/lib/blockchain/client';

/**
 * Minimum time between rating changes for the same wallet (1 hour).
 * Prevents rapid bulk-rating from sybil wallets.
 */
const RATING_COOLDOWN_MS = 60 * 60 * 1000;

/**
 * Maximum number of agents a single wallet can rate per 24h period.
 * Limits sybil impact even with many wallets.
 */
const MAX_RATINGS_PER_DAY = 20;

export const dynamic = 'force-dynamic';

const logger = createLogger('api-ratings');

/**
 * POST /api/v1/agents/:address/ratings
 *
 * Create or update a user rating for an agent.
 * Requires wallet signature for authentication.
 * Upserts: updates existing rating if user already rated this agent.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;

    // Validate address format
    const addrResult = addressSchema.safeParse(address);
    if (!addrResult.success) {
      throw new ValidationError('Invalid address format', {
        address: 'Must be a valid Ethereum address (0x...)',
      });
    }

    const normalizedAddress = address.toLowerCase();

    // Parse and validate request body
    const body = await request.json();
    const parsed = createRatingSchema.safeParse(body);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path.join('.');
        fieldErrors[field] = issue.message;
      }
      throw new ValidationError('Invalid rating data', fieldErrors);
    }

    const { score, comment, signature, userAddress, nonce, timestamp } = parsed.data;

    // Verify wallet signature with nonce + timestamp (anti-replay)
    const verifiedAddress = await verifyWalletSignature(userAddress, signature, nonce, timestamp, 'rate');

    // Sybil protection: verify the wallet has on-chain activity (at least 1 transaction)
    const txCount = await publicClient.getTransactionCount({
      address: verifiedAddress as `0x${string}`,
    });
    if (txCount === 0) {
      throw new ForbiddenError(
        'Your wallet must have at least one on-chain transaction to submit a rating. This prevents Sybil attacks.'
      );
    }

    // Check agent exists
    const agent = await prisma.agent.findUnique({
      where: { address: normalizedAddress },
    });
    if (!agent) {
      throw new NotFoundError(`Agent not found: ${address}`);
    }

    // Anti-sybil: check if this wallet has hit the daily rating limit
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentRatingCount = await prisma.rating.count({
      where: {
        userAddress: verifiedAddress,
        updatedAt: { gte: oneDayAgo },
      },
    });
    if (recentRatingCount >= MAX_RATINGS_PER_DAY) {
      throw new ValidationError('Rating limit exceeded', {
        userAddress: `Maximum ${MAX_RATINGS_PER_DAY} ratings per 24 hours`,
      });
    }

    // Anti-sybil: check cooldown for this specific agent+wallet pair
    const existingRating = await prisma.rating.findUnique({
      where: {
        agentId_userAddress: {
          agentId: normalizedAddress,
          userAddress: verifiedAddress,
        },
      },
      select: { updatedAt: true },
    });
    if (existingRating) {
      const timeSinceLastRating = Date.now() - existingRating.updatedAt.getTime();
      if (timeSinceLastRating < RATING_COOLDOWN_MS) {
        const minutesLeft = Math.ceil((RATING_COOLDOWN_MS - timeSinceLastRating) / 60000);
        throw new ValidationError('Rating cooldown active', {
          userAddress: `Please wait ${minutesLeft} minutes before updating your rating`,
        });
      }
    }

    logger.info(
      { agentAddress: normalizedAddress, userAddress: verifiedAddress, score },
      'Creating/updating rating'
    );

    // Upsert rating (create or update if user already rated)
    const rating = await prisma.rating.upsert({
      where: {
        agentId_userAddress: {
          agentId: normalizedAddress,
          userAddress: verifiedAddress,
        },
      },
      update: {
        rating: score,
        review: comment || null,
      },
      create: {
        agentId: normalizedAddress,
        userAddress: verifiedAddress,
        rating: score,
        review: comment || null,
      },
    });

    logger.info(
      { ratingId: rating.id, agentAddress: normalizedAddress },
      'Rating saved successfully'
    );

    return successResponse(
      {
        id: rating.id,
        agentAddress: rating.agentId,
        userAddress: rating.userAddress,
        score: rating.rating,
        comment: rating.review,
        createdAt: rating.createdAt.toISOString(),
        updatedAt: rating.updatedAt.toISOString(),
      },
      201
    );
  } catch (error) {
    logger.error({ error }, 'Error creating rating');
    return handleError(error);
  }
}

/**
 * GET /api/v1/agents/:address/ratings
 *
 * Get paginated ratings for an agent.
 * Includes average score and total count.
 * Sorted by newest first.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;

    // Validate address format
    const addrResult = addressSchema.safeParse(address);
    if (!addrResult.success) {
      throw new ValidationError('Invalid address format', {
        address: 'Must be a valid Ethereum address (0x...)',
      });
    }

    const normalizedAddress = address.toLowerCase();

    // Parse query params
    const { searchParams } = new URL(request.url);
    const queryResult = getRatingsQuerySchema.safeParse({
      page: searchParams.get('page') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
    });

    if (!queryResult.success) {
      throw new ValidationError('Invalid query parameters');
    }

    const { page, limit } = queryResult.data;
    const skip = (page - 1) * limit;

    // Check agent exists
    const agent = await prisma.agent.findUnique({
      where: { address: normalizedAddress },
    });
    if (!agent) {
      throw new NotFoundError(`Agent not found: ${address}`);
    }

    // Fetch ratings and aggregates in parallel
    const [ratings, total, aggregate] = await Promise.all([
      prisma.rating.findMany({
        where: { agentId: normalizedAddress },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.rating.count({
        where: { agentId: normalizedAddress },
      }),
      prisma.rating.aggregate({
        where: { agentId: normalizedAddress },
        _avg: { rating: true },
      }),
    ]);

    const averageScore = aggregate._avg.rating
      ? Number(aggregate._avg.rating.toFixed(2))
      : 0;

    const data = ratings.map((r) => ({
      id: r.id,
      userAddress: r.userAddress,
      score: r.rating,
      comment: r.review,
      createdAt: r.createdAt.toISOString(),
    }));

    logger.info(
      { agentAddress: normalizedAddress, total, averageScore },
      'Ratings fetched successfully'
    );

    return paginatedResponse(data, { page, limit, total });
  } catch (error) {
    logger.error({ error }, 'Error fetching ratings');
    return handleError(error);
  }
}
