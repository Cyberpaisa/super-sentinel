import { NextRequest } from 'next/server';
import { successResponse, handleError } from '@/lib/utils/api-helpers';
import { NotFoundError, ValidationError } from '@/lib/utils/errors';
import { verifyWalletSignature } from '@/lib/utils/auth';
import { addressSchema, createReportSchema } from '@/lib/utils/validation';
import { createLogger } from '@/lib/utils/logger';
import { prisma } from '@/lib/database/prisma';

export const dynamic = 'force-dynamic';

const logger = createLogger('api-reports');

/** Threshold of OPEN reports to auto-flag an agent */
const AUTO_FLAG_THRESHOLD = 3;

/**
 * POST /api/v1/agents/:address/reports
 *
 * Submit a report for a suspicious agent.
 * Requires wallet signature for authentication.
 * Auto-flags agent if 3+ OPEN reports exist.
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
    const parsed = createReportSchema.safeParse(body);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path.join('.');
        fieldErrors[field] = issue.message;
      }
      throw new ValidationError('Invalid report data', fieldErrors);
    }

    const { reason, description, signature, userAddress, nonce, timestamp } = parsed.data;

    // Verify wallet signature with nonce + timestamp (anti-replay)
    const verifiedAddress = await verifyWalletSignature(userAddress, signature, nonce, timestamp, 'report');

    // Check agent exists
    const agent = await prisma.agent.findUnique({
      where: { address: normalizedAddress },
    });
    if (!agent) {
      throw new NotFoundError(`Agent not found: ${address}`);
    }

    // Check for duplicate report from same user
    const existingReport = await prisma.report.findUnique({
      where: {
        agentId_reporterAddress: {
          agentId: normalizedAddress,
          reporterAddress: verifiedAddress,
        },
      },
    });
    if (existingReport) {
      throw new ValidationError('You have already reported this agent', {
        reporter: 'Duplicate report not allowed',
      });
    }

    logger.info(
      { agentAddress: normalizedAddress, reporter: verifiedAddress, reason },
      'Creating report'
    );

    // Create the report and check auto-flagging in a transaction
    const { report, agentFlagged } = await prisma.$transaction(async (tx) => {
      const newReport = await tx.report.create({
        data: {
          agentId: normalizedAddress,
          reporterAddress: verifiedAddress,
          reason,
          description,
          status: 'OPEN',
        },
      });

      // Check if auto-flagging should trigger
      const openReportCount = await tx.report.count({
        where: {
          agentId: normalizedAddress,
          status: 'OPEN',
        },
      });

      let flagged = false;
      if (openReportCount >= AUTO_FLAG_THRESHOLD && agent.status !== 'FLAGGED' && agent.status !== 'SUSPENDED') {
        await tx.agent.update({
          where: { address: normalizedAddress },
          data: { status: 'FLAGGED' },
        });
        flagged = true;

        logger.warn(
          {
            agentAddress: normalizedAddress,
            openReports: openReportCount,
          },
          'Agent auto-flagged due to multiple open reports'
        );
      }

      return { report: newReport, agentFlagged: flagged };
    });

    logger.info(
      { reportId: report.id, agentAddress: normalizedAddress, agentFlagged },
      'Report created successfully'
    );

    return successResponse(
      {
        id: report.id,
        agentAddress: report.agentId,
        reporterAddress: report.reporterAddress,
        reason: report.reason,
        status: report.status,
        createdAt: report.createdAt.toISOString(),
        agentFlagged,
      },
      201
    );
  } catch (error) {
    logger.error({ error }, 'Error creating report');
    return handleError(error);
  }
}
