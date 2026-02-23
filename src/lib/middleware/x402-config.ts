/**
 * x402 payment protocol configuration.
 *
 * Extracted to its own file to prevent circular imports between
 * x402-payment.ts and x402-verify.ts.
 *
 * The protocol uses HTTP 402 (Payment Required) to signal that an endpoint is
 * monetised.  When a client receives a 402 it reads the `X-402-*` response
 * headers, constructs a payment on the specified network, and retries the
 * request with a proof-of-payment header.
 *
 * Toggle the feature with the `X402_PAYMENT_ENABLED` env var.
 */

export const X402_CONFIG = {
  /** Price per request in USDC (6-decimal format: 500000 = $0.50) */
  price: '500000',
  /** Token symbol */
  currency: 'USDC',
  /** Formatted price for display */
  priceFormatted: '$0.50',
  /** USDC contract address on Avalanche C-Chain */
  asset: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
  /** CAIP-2 chain identifier – Avalanche C-Chain mainnet */
  network: 'eip155:43114',
  /** Address that receives the payment */
  recipient:
    process.env.X402_RECIPIENT_ADDRESS ||
    '0x0000000000000000000000000000000000000000',
  /** Kill-switch: the middleware is a no-op when disabled */
  enabled: process.env.X402_PAYMENT_ENABLED === 'true',
} as const;
