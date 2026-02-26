import { describe, it, expect } from 'vitest';
import {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  RateLimitError,
  InternalError,
  BlockchainError,
  ContractNotFoundError,
  RPCError,
  TransactionFailedError,
  isAppError,
} from '@/lib/utils/errors';

describe('AppError', () => {
  it('has correct statusCode, code, and message', () => {
    const err = new AppError('test message', 418, 'INTERNAL_ERROR');
    expect(err.message).toBe('test message');
    expect(err.statusCode).toBe(418);
    expect(err.code).toBe('INTERNAL_ERROR');
  });

  it('toJSON returns correct structure', () => {
    const err = new AppError('bad input', 400, 'VALIDATION_ERROR', { field: 'required' });
    const json = err.toJSON();
    expect(json).toEqual({
      error: {
        message: 'bad input',
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        fields: { field: 'required' },
      },
    });
  });

  it('toJSON omits fields when not provided', () => {
    const err = new AppError('not found', 404, 'NOT_FOUND');
    const json = err.toJSON();
    expect(json.error.fields).toBeUndefined();
  });

  it('is an instance of Error', () => {
    const err = new AppError('test', 500, 'INTERNAL_ERROR');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('ValidationError', () => {
  it('has statusCode 400 and code VALIDATION_ERROR', () => {
    const err = new ValidationError('invalid');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  it('accepts optional fields', () => {
    const err = new ValidationError('invalid', { address: 'bad format' });
    expect(err.fields).toEqual({ address: 'bad format' });
  });

  it('is instanceof AppError', () => {
    expect(new ValidationError('x')).toBeInstanceOf(AppError);
  });
});

describe('NotFoundError', () => {
  it('has statusCode 404 and code NOT_FOUND', () => {
    const err = new NotFoundError('Agent not found');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('Agent not found');
  });

  it('uses default message when not provided', () => {
    const err = new NotFoundError();
    expect(err.message).toBe('Resource not found');
  });
});

describe('UnauthorizedError', () => {
  it('has statusCode 401 and code UNAUTHORIZED', () => {
    const err = new UnauthorizedError();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
  });
});

describe('ForbiddenError', () => {
  it('has statusCode 403 and code FORBIDDEN', () => {
    const err = new ForbiddenError();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
  });
});

describe('RateLimitError', () => {
  it('has statusCode 429 and code RATE_LIMIT_EXCEEDED', () => {
    const err = new RateLimitError();
    expect(err.statusCode).toBe(429);
    expect(err.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('has default retryAfter of 60', () => {
    const err = new RateLimitError();
    expect(err.retryAfter).toBe(60);
  });
});

describe('InternalError', () => {
  it('has statusCode 500 and code INTERNAL_ERROR', () => {
    const err = new InternalError();
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('INTERNAL_ERROR');
  });
});

describe('BlockchainError', () => {
  it('has statusCode 502 and code BLOCKCHAIN_ERROR', () => {
    const err = new BlockchainError('rpc fail');
    expect(err.statusCode).toBe(502);
    expect(err.code).toBe('BLOCKCHAIN_ERROR');
  });
});

describe('ContractNotFoundError', () => {
  it('has code CONTRACT_NOT_FOUND', () => {
    const err = new ContractNotFoundError('0x1234');
    expect(err.code).toBe('CONTRACT_NOT_FOUND');
    expect(err.message).toContain('0x1234');
  });

  it('is instanceof BlockchainError and AppError', () => {
    const err = new ContractNotFoundError('0x1234');
    expect(err).toBeInstanceOf(BlockchainError);
    expect(err).toBeInstanceOf(AppError);
  });
});

describe('RPCError', () => {
  it('has code RPC_ERROR and statusCode 502', () => {
    const err = new RPCError('connection refused');
    expect(err.code).toBe('RPC_ERROR');
    expect(err.statusCode).toBe(502);
  });

  it('is instanceof BlockchainError', () => {
    expect(new RPCError()).toBeInstanceOf(BlockchainError);
  });

  it('uses default message when not provided', () => {
    const err = new RPCError();
    expect(err.message).toBe('RPC communication failed');
  });
});

describe('TransactionFailedError', () => {
  it('has code TRANSACTION_FAILED', () => {
    const err = new TransactionFailedError();
    expect(err.code).toBe('TRANSACTION_FAILED');
  });

  it('accepts optional txHash', () => {
    const err = new TransactionFailedError('tx failed', '0xabc');
    expect(err.txHash).toBe('0xabc');
  });
});

describe('isAppError', () => {
  it('returns true for AppError subclasses', () => {
    expect(isAppError(new NotFoundError())).toBe(true);
    expect(isAppError(new ValidationError('x'))).toBe(true);
    expect(isAppError(new RPCError())).toBe(true);
    expect(isAppError(new ContractNotFoundError('0x1'))).toBe(true);
  });

  it('returns false for plain Error', () => {
    expect(isAppError(new Error('plain'))).toBe(false);
  });

  it('returns false for non-error values', () => {
    expect(isAppError('string')).toBe(false);
    expect(isAppError(null)).toBe(false);
    expect(isAppError(undefined)).toBe(false);
    expect(isAppError(42)).toBe(false);
  });
});
