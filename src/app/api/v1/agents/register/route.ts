import { NextRequest } from 'next/server';
import { z } from 'zod';
import { registerAgentSchema } from '@/lib/utils/validation';
import { successResponse, handleError } from '@/lib/utils/api-helpers';
import { ValidationError, ContractNotFoundError } from '@/lib/utils/errors';
import { createLogger } from '@/lib/utils/logger';
import {
  readAgentMetadata,
  verifyContractExists,
} from '@/services/blockchain-service';
import {
  createAgent,
  agentExists,
  type CreateAgentInput,
} from '@/services/agent-service';

export const dynamic = 'force-dynamic';

const logger = createLogger('api-agents-register');

/**
 * POST /api/v1/agents/register
 *
 * Register a new agent on the platform
 *
 * @see docs/api/endpoints.md
 * @see docs/backend/erc804.md
 */
export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body
    const body = await request.json();

    logger.info({ address: body.address, name: body.name, type: body.type }, 'Received agent registration request');

    const validatedData = registerAgentSchema.parse(body);

    const { address, name, type, description } = validatedData;

    // Check if agent already registered
    const exists = await agentExists(address);
    if (exists) {
      throw new ValidationError(
        `Agent already registered at address: ${address}`,
        { address: 'Agent with this address already exists' }
      );
    }

    // Verify contract exists on blockchain
    const hasCode = await verifyContractExists(address);
    if (!hasCode) {
      throw new ContractNotFoundError(address);
    }

    // Read ERC-804 metadata from contract
    logger.info({ address }, 'Reading ERC-804 metadata from contract');
    const metadata = await readAgentMetadata(address);

    // Create agent in database with PENDING status
    const agentData: CreateAgentInput = {
      address,
      name,
      type,
      description,
      owner_address: metadata.owner,
      billing_address: metadata.billingAddress,
      status: 'PENDING',
    };

    const agent = await createAgent(agentData);

    logger.info(
      { address: agent.address, name: agent.name },
      'Agent registered successfully'
    );

    // Return created agent
    return successResponse(
      {
        agent: {
          address: agent.address,
          name: agent.name,
          type: agent.type,
          description: agent.description,
          status: agent.status,
          trust_score: agent.trust_score,
          owner_address: agent.owner_address,
          billing_address: agent.billing_address,
          created_at: agent.created_at.toISOString(),
        },
        message: 'Agent registered successfully',
      },
      201
    );
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      const fields: Record<string, string> = {};
      error.errors.forEach((err) => {
        const field = err.path.join('.');
        fields[field] = err.message;
      });

      logger.warn({ fields }, 'Validation error in agent registration');

      return handleError(
        new ValidationError('Invalid request data', fields)
      );
    }

    // Handle other errors
    logger.error({ error }, 'Error in agent registration');
    return handleError(error);
  }
}
