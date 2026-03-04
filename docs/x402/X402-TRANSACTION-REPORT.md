# x402 Mainnet Transaction Report

> First real x402 payment between ERC-8004 autonomous agents on Avalanche mainnet

## Transaction Summary

| Field | Value |
|-------|-------|
| **Date** | 2026-02-23 |
| **TxHash** | [`0x0a9d5fa65bbf7e8052fe2067f30d857ee3a41c4543ef2087c1a9399a67eca433`](https://snowtrace.io/tx/0x0a9d5fa65bbf7e8052fe2067f30d857ee3a41c4543ef2087c1a9399a67eca433) |
| **Amount** | $0.01 USDC (10000 units, 6 decimals) |
| **Network** | Avalanche C-Chain (43114) |
| **Protocol** | x402 (HTTP 402 + EIP-3009 TransferWithAuthorization) |
| **Facilitator** | UltravioletaDAO (`https://facilitator.ultravioletadao.xyz`) |

### Participants

| Role | Agent | ID | Wallet |
|------|-------|----|--------|
| **Payer** | Apex Arbitrage | #1687 | `0xcd595a299ad1d5D088B7764e9330f7B0be7ca983` |
| **Receiver** | Super Sentinel | -- | `0xD2f1f6E30b0a46bA4Cf00645110b36eeECACb6F1` |
| **Facilitator** | UltravioletaDAO | -- | On-chain settlement service |

---

## Flow Executed (Step by Step)

```
Apex #1687                    Super Sentinel                UltravioletaDAO
    |                              |                              |
    |-- POST /api/v1/sentinel/scan |                              |
    |   (no payment header)        |                              |
    |<---- 402 Payment Required ---|                              |
    |   X-402-Price: 10000         |                              |
    |   X-402-Currency: USDC       |                              |
    |   X-402-Recipient: 0xD2f1... |                              |
    |   X-402-Network: eip155:43114|                              |
    |                              |                              |
    |  [Sign EIP-712 TransferWithAuthorization]                   |
    |  [Build base64 payment token]                               |
    |                              |                              |
    |-- POST /api/v1/sentinel/scan |                              |
    |   X-Payment-Token: <base64>  |                              |
    |                              |-- POST /verify ------------->|
    |                              |<-- { isValid: true } --------|
    |                              |                              |
    |                              |-- POST /settle ------------->|
    |                              |<-- { success, txHash } ------|
    |                              |                              |
    |                              |  [Record earning]            |
    |                              |  [Execute TRACER scan]       |
    |                              |                              |
    |<---- 200 OK + TRACER results |                              |
    |   X-402-Payer: 0xcd59...     |                              |
    |   X-402-Paid: 10000          |                              |
    |   X-402-TxHash: 0x0a9d...    |                              |
```

### Detailed Steps

1. **402 Discovery**: Apex sent `POST /api/v1/sentinel/scan` without payment headers. Super Sentinel returned HTTP 402 with `X-402-*` headers describing price, currency, recipient, and network.

2. **EIP-712 Signing**: Apex signed an EIP-712 `TransferWithAuthorization` message (EIP-3009) authorizing $0.01 USDC transfer from Apex wallet to Super Sentinel wallet.

3. **Payment Token Construction**: The signed authorization was packaged as a base64-encoded JSON token and sent as `X-Payment-Token` header.

4. **Local Verification**: Super Sentinel's `x402-verify.ts` middleware decoded the token, recovered the signer via EIP-712, and validated amount/recipient/expiry.

5. **Facilitator Verify**: Super Sentinel forwarded the payment to UltravioletaDAO's `/verify` endpoint using x402 V2 format. Facilitator confirmed the signature was valid.

6. **On-Chain Settlement**: Super Sentinel called `/settle` on the facilitator, which executed the `transferWithAuthorization` on-chain via the USDC contract. Transaction confirmed on Avalanche C-Chain.

7. **TRACER Scan Execution**: With payment confirmed, Super Sentinel executed the full 6-sentinel TRACER scan against the target address.

8. **Response Delivery**: TRACER results returned to Apex with `X-402-TxHash` header pointing to the on-chain settlement.

---

## TRACER Results

The scan executed 6 sentinel dimensions:

| Dimension | Description |
|-----------|-------------|
| **T - Transparency** | Source code verification, audit presence, documentation |
| **R - Reliability** | Uptime, heartbeat consistency, response times |
| **A - Autonomy** | Self-operation capability, ERC-8004 compliance |
| **C - Compliance** | Proxy detection, contract patterns, security checks |
| **E - Economics** | Revenue model, token economics, sustainability |
| **R - Reputation** | On-chain reputation scores, community feedback |

Each dimension produces a 0-100 score. The composite TRACER score determines a tier:

| Tier | Score Range |
|------|-------------|
| VERIFIED | 80-100 |
| PASS | 70-79 |
| PARTIAL | 40-69 |
| FAIL | 0-39 |

---

## Problems Encountered and Resolved

### 1. Facilitator V2 Format — `validAfter`/`validBefore` must be strings

The UltravioletaDAO facilitator expects x402 V2 format where `validAfter` and `validBefore` are **strings**, not numbers. Sending numbers caused `/verify` to return 400.

**Wrong:**
```json
{
  "authorization": {
    "validAfter": 0,
    "validBefore": 1740000000
  }
}
```

**Correct:**
```json
{
  "authorization": {
    "validAfter": "0",
    "validBefore": "1740000000"
  }
}
```

Fix applied in `src/lib/middleware/x402-payment.ts`:
```typescript
authorization: {
  from: payment.payer,
  to: payment.recipient,
  value: payment.amount.toString(),
  validAfter: '0',
  validBefore: String(payment.validBefore),
  nonce: payment.nonce,
},
```

### 2. DATABASE_URL Required at Build Time

Prisma requires `DATABASE_URL` to be set even for builds that don't use the database. Resolved by ensuring the env var is present in all environments.

### 3. Port Conflicts in Development

Running the facilitator locally alongside Super Sentinel caused port conflicts. Resolved by using the hosted facilitator at `https://facilitator.ultravioletadao.xyz`.

---

## Facilitator V2 Format Reference

The complete payload structure for UltravioletaDAO facilitator:

```typescript
// Payment requirements (what the server needs)
const paymentRequirements = {
  scheme: 'exact',
  network: 'eip155:43114',
  amount: '10000',          // $0.01 USDC in 6-decimal format
  asset: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
  payTo: '0xD2f1f6E30b0a46bA4Cf00645110b36eeECACb6F1',
  maxTimeoutSeconds: 60,
};

// Payment payload (what the client signed)
const paymentPayload = {
  x402Version: 2,
  accepted: paymentRequirements,
  payload: {
    signature: '0x...',
    authorization: {
      from: '0xcd595a299ad1d5D088B7764e9330f7B0be7ca983',
      to: '0xD2f1f6E30b0a46bA4Cf00645110b36eeECACb6F1',
      value: '10000',
      validAfter: '0',       // MUST be string
      validBefore: '1740000000', // MUST be string
      nonce: '0xabc...',
    },
  },
};

// Request body for /verify and /settle
const body = {
  x402Version: 2,
  paymentPayload,
  paymentRequirements,
};
```

---

## Use Cases Validated On-Chain

1. **Micropayment for Scan**: An autonomous agent paid $0.01 USDC for a TRACER security scan — no human intervention required.
2. **Automatic Settlement**: The facilitator settled the payment on-chain without either agent needing to submit a transaction directly.
3. **Earnings Tracking**: Super Sentinel's `EarningsTracker` recorded the earning with txHash, payer, amount, and service type.
4. **Agent-to-Agent Commerce**: Two ERC-8004 registered agents completed a commercial transaction using only HTTP headers and EIP-712 signatures.

---

## Verification Links

- **Snowtrace TX**: [0x0a9d5fa6...](https://snowtrace.io/tx/0x0a9d5fa65bbf7e8052fe2067f30d857ee3a41c4543ef2087c1a9399a67eca433)
- **8004scan Apex #1687**: [https://8004scan.io/agent/43114/1687](https://8004scan.io/agent/43114/1687)
- **USDC Contract**: [0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E](https://snowtrace.io/address/0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E)
- **Super Sentinel Wallet**: [0xD2f1f6E30b0a46bA4Cf00645110b36eeECACb6F1](https://snowtrace.io/address/0xD2f1f6E30b0a46bA4Cf00645110b36eeECACb6F1)

---

*Cyber Paisa -- Enigma Group | Colombia Blockchain*
