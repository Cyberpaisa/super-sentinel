import { describe, it, expect } from 'vitest';
import {
  addressSchema,
  agentTypeSchema,
  registerAgentSchema,
  createRatingSchema,
} from '@/lib/utils/validation';

describe('addressSchema', () => {
  it('accepts valid 42-char hex address', () => {
    const result = addressSchema.safeParse('0xAbCdEf1234567890abcdef1234567890AbCdEf12');
    expect(result.success).toBe(true);
  });

  it('transforms address to lowercase', () => {
    const result = addressSchema.safeParse('0xABCDEF1234567890ABCDEF1234567890ABCDEF12');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe('0xabcdef1234567890abcdef1234567890abcdef12');
    }
  });

  it('rejects address without 0x prefix', () => {
    const result = addressSchema.safeParse('abcdef1234567890abcdef1234567890abcdef12');
    expect(result.success).toBe(false);
  });

  it('rejects address shorter than 42 chars', () => {
    const result = addressSchema.safeParse('0xabcdef123');
    expect(result.success).toBe(false);
  });

  it('rejects address longer than 42 chars', () => {
    const result = addressSchema.safeParse('0xabcdef1234567890abcdef1234567890abcdef1234');
    expect(result.success).toBe(false);
  });

  it('rejects address with non-hex characters', () => {
    const result = addressSchema.safeParse('0xZZZZZZ1234567890abcdef1234567890abcdef12');
    expect(result.success).toBe(false);
  });

  it('rejects empty string', () => {
    const result = addressSchema.safeParse('');
    expect(result.success).toBe(false);
  });
});

describe('agentTypeSchema', () => {
  const validTypes = ['TRADING', 'LENDING', 'GOVERNANCE', 'ORACLE', 'CUSTOM'];

  validTypes.forEach((type) => {
    it(`accepts type ${type}`, () => {
      const result = agentTypeSchema.safeParse(type);
      expect(result.success).toBe(true);
    });
  });

  it('rejects invalid type', () => {
    const result = agentTypeSchema.safeParse('INVALID');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toContain('TRADING');
    }
  });

  it('rejects lowercase type', () => {
    const result = agentTypeSchema.safeParse('trading');
    expect(result.success).toBe(false);
  });
});

describe('registerAgentSchema', () => {
  const validInput = {
    address: '0xabcdef1234567890abcdef1234567890abcdef12',
    name: 'My Agent',
    type: 'TRADING',
  };

  it('accepts valid input', () => {
    const result = registerAgentSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('address is transformed to lowercase in output', () => {
    const result = registerAgentSchema.safeParse({
      ...validInput,
      address: '0xABCDEF1234567890ABCDEF1234567890ABCDEF12',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.address).toBe('0xabcdef1234567890abcdef1234567890abcdef12');
    }
  });

  it('rejects name shorter than 3 chars', () => {
    const result = registerAgentSchema.safeParse({ ...validInput, name: 'AB' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toContain('3');
    }
  });

  it('rejects name longer than 50 chars', () => {
    const result = registerAgentSchema.safeParse({ ...validInput, name: 'A'.repeat(51) });
    expect(result.success).toBe(false);
  });

  it('description is optional', () => {
    const result = registerAgentSchema.safeParse({ ...validInput });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBeUndefined();
    }
  });

  it('rejects description longer than 500 chars', () => {
    const result = registerAgentSchema.safeParse({
      ...validInput,
      description: 'A'.repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid type', () => {
    const result = registerAgentSchema.safeParse({ ...validInput, type: 'ROBOT' });
    expect(result.success).toBe(false);
  });

  it('rejects missing address', () => {
    const { address: _, ...withoutAddress } = validInput;
    const result = registerAgentSchema.safeParse(withoutAddress);
    expect(result.success).toBe(false);
  });

  it('rejects missing type', () => {
    const { type: _, ...withoutType } = validInput;
    const result = registerAgentSchema.safeParse(withoutType);
    expect(result.success).toBe(false);
  });
});

describe('createRatingSchema', () => {
  const validInput = {
    score: 4,
    signature: '0xsignature',
    userAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
  };

  it('accepts valid input', () => {
    const result = createRatingSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('accepts scores 1-5', () => {
    [1, 2, 3, 4, 5].forEach((score) => {
      const result = createRatingSchema.safeParse({ ...validInput, score });
      expect(result.success).toBe(true);
    });
  });

  it('rejects score 0', () => {
    const result = createRatingSchema.safeParse({ ...validInput, score: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects score 6', () => {
    const result = createRatingSchema.safeParse({ ...validInput, score: 6 });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer score', () => {
    const result = createRatingSchema.safeParse({ ...validInput, score: 3.5 });
    expect(result.success).toBe(false);
  });

  it('comment is optional', () => {
    const result = createRatingSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('rejects comment longer than 280 chars', () => {
    const result = createRatingSchema.safeParse({ ...validInput, comment: 'A'.repeat(281) });
    expect(result.success).toBe(false);
  });

  it('rejects empty signature', () => {
    const result = createRatingSchema.safeParse({ ...validInput, signature: '' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid userAddress', () => {
    const result = createRatingSchema.safeParse({ ...validInput, userAddress: 'notanaddress' });
    expect(result.success).toBe(false);
  });
});
