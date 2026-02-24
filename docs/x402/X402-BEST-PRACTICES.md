# x402 Best Practices for Super Sentinel

> Integration guide for the x402 payment protocol used by Super Sentinel on Avalanche C-Chain

## How `withX402Payment` Works

Super Sentinel uses a **wrapper pattern** to gate endpoints behind x402 payments. The middleware is defined in `src/lib/middleware/x402-payment.ts`:

```typescript
import { withX402Payment } from '@/lib/middleware/x402-payment';

// Wrap your route handler
export const POST = withX402Payment(async (request: NextRequest) => {
  // This code only executes after payment is verified
  const result = await executeScan(request);
  return NextResponse.json(result);
});
```

### Behavior

- When `X402_CONFIG.enabled` is `false` (default), the wrapper is a no-op and the handler executes normally.
- When enabled, requests without payment proof receive HTTP 402 with discovery headers.
- Requests with a valid `X-Payment-Signature` or `X-Payment-Token` header are verified, settled on-chain, and then the handler executes.

---

## X-402 Headers

### Response Headers (402 Payment Required)

| Header | Example | Description |
|--------|---------|-------------|
| `X-402-Price` | `10000` | Price in smallest unit (USDC has 6 decimals, so 10000 = $0.01) |
| `X-402-Currency` | `USDC` | Token symbol |
| `X-402-Asset` | `0xB97EF9Ef...` | Token contract address on the target chain |
| `X-402-Network` | `eip155:43114` | CAIP-2 chain identifier |
| `X-402-Recipient` | `0xD2f1f6E3...` | Wallet address that receives payment |
| `X-402-Version` | `1` | x402 protocol version |
| `X-402-Reason` | `Payment required` | Human-readable reason (optional) |

### Request Headers (Payment Proof)

| Header | Description |
|--------|-------------|
| `X-Payment-Signature` | EIP-712 / EIP-191 signed receipt (raw signature) |
| `X-Payment-Token` | Base64-encoded JSON with signature + authorization details |

### Response Headers (Successful Payment)

| Header | Description |
|--------|-------------|
| `X-402-Payer` | Address of the wallet that paid |
| `X-402-Paid` | Amount paid in smallest unit |
| `X-402-TxHash` | On-chain settlement transaction hash |

---

## Payment Token Format

The `X-Payment-Token` header contains a base64-encoded JSON object with an EIP-712 `TransferWithAuthorization` (EIP-3009):

```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "eip155:43114",
  "payload": {
    "signature": "0x...",
    "authorization": {
      "from": "0xPayerAddress",
      "to": "0xRecipientAddress",
      "value": "10000",
      "validAfter": 0,
      "validBefore": 1740000000,
      "nonce": "0xRandomBytes32"
    }
  }
}
```

### EIP-712 Domain (USDC on Avalanche)

```typescript
const domain = {
  name: 'USD Coin',
  version: '2',
  chainId: 43114,
  verifyingContract: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
};
```

### EIP-712 Types

```typescript
const types = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
};
```

---

## Facilitator V2 Format

When sending to the UltravioletaDAO facilitator for on-chain settlement, the format **differs** from the client-facing payment token.

### CRITICAL: `validAfter` and `validBefore` MUST be strings

The facilitator V2 schema expects string values for these fields. Sending numbers will cause a 400 error.

```typescript
// CORRECT - strings
const authorization = {
  from: payment.payer,
  to: payment.recipient,
  value: payment.amount.toString(),
  validAfter: '0',                    // string
  validBefore: String(payment.validBefore), // string
  nonce: payment.nonce,
};

// WRONG - numbers (will fail)
const authorization = {
  validAfter: 0,           // number - FAILS
  validBefore: 1740000000, // number - FAILS
};
```

### Full Facilitator Request Body

```typescript
const body = {
  x402Version: 2,
  paymentPayload: {
    x402Version: 2,
    accepted: paymentRequirements,
    payload: {
      signature: '0x...',
      authorization: { /* strings! */ },
    },
  },
  paymentRequirements: {
    scheme: 'exact',
    network: 'eip155:43114',
    amount: '10000',
    asset: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
    payTo: '0xRecipientAddress',
    maxTimeoutSeconds: 60,
  },
};
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `X402_PAYMENT_ENABLED` | No | `false` | Set to `true` to enable payment gating |
| `X402_RECIPIENT_ADDRESS` | Yes (if enabled) | `0x000...` | Wallet that receives USDC payments |
| `FACILITATOR_URL` | No | `https://facilitator.ultravioletadao.xyz` | x402 facilitator for on-chain settlement |
| `PAYER_PRIVATE_KEY` | Only for CLI | -- | Private key for the paying wallet (used by `scripts/x402-scan.ts`) |

---

## Error Handling and Fallbacks

### Facilitator Unreachable

If the facilitator is down or times out, Super Sentinel falls back to **local-only verification**. The payment is accepted based on EIP-712 signature validity, but no on-chain settlement occurs. This ensures the service remains available even if the facilitator has issues.

```typescript
// From x402-payment.ts
if (!settle.settled && settle.error && !settle.error.includes('unreachable')) {
  // Facilitator explicitly rejected — return 402
  return paymentRequiredResponse(`Settlement failed: ${settle.error}`);
}
// If unreachable, proceed with local verification only
```

### Invalid Signature

If EIP-712 recovery fails or the recovered signer doesn't match the `from` address, the middleware returns 402 with `X-402-Reason` explaining the failure.

### Insufficient Balance

The facilitator will reject settlement if the payer's USDC balance is insufficient. This returns a 402 with the facilitator's error message.

### Timeout Configuration

- `/verify` has a 10-second timeout
- `/settle` has a 30-second timeout (on-chain transactions take longer)

---

## CLI Reference: `scripts/x402-scan.ts`

The `scripts/x402-scan.ts` script is a complete working example of an x402 payment client:

```bash
# Run against default endpoint (resolved from ERC-8004 registry)
npx tsx scripts/x402-scan.ts

# Run against a specific endpoint
npx tsx scripts/x402-scan.ts https://super-sentinel.example.com
```

The script demonstrates:
1. Resolving an agent's endpoint from the ERC-8004 registry on-chain
2. Sending a request without payment to discover `X-402-*` headers
3. Signing EIP-712 `TransferWithAuthorization` with viem
4. Building the base64 payment token
5. Retrying the request with the `X-Payment-Token` header
6. Parsing the TRACER scan results

See [`scripts/x402-scan.ts`](../../scripts/x402-scan.ts) for the full implementation.

---

## Checklist for New x402 Integrations

- [ ] Set `X402_PAYMENT_ENABLED=true` in environment
- [ ] Set `X402_RECIPIENT_ADDRESS` to your receiving wallet
- [ ] Ensure the receiving wallet can accept USDC on Avalanche C-Chain
- [ ] Wrap paid endpoints with `withX402Payment(handler)`
- [ ] Test 402 discovery with a request without payment headers
- [ ] Test payment flow using `scripts/x402-scan.ts`
- [ ] Verify on-chain settlement on [Snowtrace](https://snowtrace.io)
- [ ] Confirm earnings are tracked in `EarningsTracker`

---

*Cyber Paisa -- Enigma Group | Colombia Blockchain*
