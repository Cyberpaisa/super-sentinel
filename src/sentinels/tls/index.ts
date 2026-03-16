import * as tls from 'node:tls';
import { createLogger } from '@/lib/utils/logger';
import { type SentinelResult } from '../types';

const logger = createLogger('sentinel:tls');

const DEFAULT_TIMEOUT_MS = 6_000;

export type TLSGrade = 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';

export interface TLSData {
  protocol: string | null;
  cipher: string | null;
  grade: TLSGrade;
  issuer: string | null;
  daysRemaining: number | null;
  authorized: boolean;
  domainMatch: boolean;
  warnings: string[];
  vulnerabilities: string[];
}

const STRONG_CIPHERS = ['AES256-GCM', 'AES128-GCM', 'CHACHA20', 'ECDHE'];

function scoreToGrade(score: number): TLSGrade {
  if (score >= 95) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 65) return 'B';
  if (score >= 50) return 'C';
  if (score >= 35) return 'D';
  return 'F';
}

/**
 * TLS sentinel — connects via node:tls to validate certificate and cipher.
 *
 * Pure function: receives an HTTPS endpoint URL, returns SentinelResult.
 *
 * Checks: protocol version, cipher strength, cert expiry, CA trust chain.
 */
export async function checkTLS(
  endpoint: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<SentinelResult> {
  let hostname: string;
  let port: number;

  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:') {
      return {
        sentinel: 'tls',
        passed: false,
        score: 0,
        data: {
          protocol: 'none',
          cipher: null,
          grade: 'F',
          issuer: null,
          daysRemaining: null,
          authorized: false,
          domainMatch: false,
          warnings: ['Endpoint uses HTTP instead of HTTPS'],
          vulnerabilities: ['NO_TLS'],
        },
      };
    }
    hostname = url.hostname;
    port = url.port ? parseInt(url.port, 10) : 443;
  } catch {
    return {
      sentinel: 'tls',
      passed: false,
      score: 0,
      data: {
        protocol: null,
        cipher: null,
        grade: 'F',
        issuer: null,
        daysRemaining: null,
        authorized: false,
        domainMatch: false,
        warnings: ['Invalid endpoint URL'],
        vulnerabilities: [],
      },
    };
  }

  // Certificate error codes that indicate cert/domain problems (not network issues)
  const CERT_ERROR_CODES = new Set([
    'CERT_HAS_EXPIRED',
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'ERR_TLS_CERT_ALTNAME_INVALID',
    'DEPTH_ZERO_SELF_SIGNED_CERT',
    'SELF_SIGNED_CERT_IN_CHAIN',
    'UNABLE_TO_GET_ISSUER_CERT',
    'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
    'CERT_UNTRUSTED',
    'CERT_REJECTED',
    'CERT_NOT_YET_VALID',
  ]);

  // --- Step 1: Try strict connection (rejectUnauthorized: true) ---
  const strictResult = await tryConnect(hostname, port, timeoutMs, true);

  if (strictResult.connected) {
    // Cert is valid and domain matches — run normal scoring
    return buildResult(endpoint, strictResult, true);
  }

  // --- Step 2: Strict connection failed ---
  const errorCode = strictResult.errorCode ?? '';
  const isCertError = CERT_ERROR_CODES.has(errorCode) || errorCode.startsWith('ERR_TLS_');

  if (!isCertError) {
    // Network error (ECONNREFUSED, ETIMEDOUT, etc.) — host unreachable
    logger.error({ endpoint, error: strictResult.errorMessage }, 'TLS connection failed');
    return {
      sentinel: 'tls',
      passed: false,
      score: 0,
      data: {
        protocol: null,
        cipher: null,
        grade: 'F',
        issuer: null,
        daysRemaining: null,
        authorized: false,
        domainMatch: false,
        warnings: [`TLS connection error: ${strictResult.errorMessage ?? 'unknown'}`],
        vulnerabilities: ['CONNECTION_FAILED'],
      },
    };
  }

  // --- Step 3: Cert error — collect details with permissive connection ---
  logger.warn({ endpoint, errorCode }, 'Certificate verification failed, collecting details');
  const permissiveResult = await tryConnect(hostname, port, timeoutMs, false);

  if (!permissiveResult.connected) {
    // Even permissive connection failed — truly unreachable
    logger.error({ endpoint, error: permissiveResult.errorMessage }, 'TLS connection failed (permissive)');
    return {
      sentinel: 'tls',
      passed: false,
      score: 0,
      data: {
        protocol: null,
        cipher: null,
        grade: 'F',
        issuer: null,
        daysRemaining: null,
        authorized: false,
        domainMatch: false,
        warnings: [`TLS connection error: ${permissiveResult.errorMessage ?? 'unknown'}`],
        vulnerabilities: ['CONNECTION_FAILED'],
      },
    };
  }

  // Build result from permissive connection but apply domain/cert penalty
  return buildResult(endpoint, permissiveResult, false, strictResult.errorMessage ?? undefined);
}

/* ------------------------------------------------------------------ */
/*  Helper: low-level TLS connection                                  */
/* ------------------------------------------------------------------ */

interface ConnectResult {
  connected: boolean;
  protocol: string | null;
  cipherName: string | null;
  cert: tls.PeerCertificate | null;
  authorized: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  timedOut: boolean;
}

function tryConnect(
  hostname: string,
  port: number,
  timeoutMs: number,
  rejectUnauthorized: boolean
): Promise<ConnectResult> {
  return new Promise<ConnectResult>((resolve) => {
    const socket = tls.connect(
      { host: hostname, port, servername: hostname, rejectUnauthorized, timeout: timeoutMs },
      () => {
        const protocol = socket.getProtocol();
        const cipherInfo = socket.getCipher();
        const cert = socket.getPeerCertificate();
        const authorized = socket.authorized;
        socket.end();

        resolve({
          connected: true,
          protocol: protocol ?? null,
          cipherName: cipherInfo?.name ?? null,
          cert: cert?.subject ? cert : null,
          authorized,
          errorCode: null,
          errorMessage: null,
          timedOut: false,
        });
      }
    );

    socket.on('error', (err: NodeJS.ErrnoException) => {
      resolve({
        connected: false,
        protocol: null,
        cipherName: null,
        cert: null,
        authorized: false,
        errorCode: err.code ?? null,
        errorMessage: err.message,
        timedOut: false,
      });
    });

    socket.setTimeout(timeoutMs, () => {
      socket.destroy();
      resolve({
        connected: false,
        protocol: null,
        cipherName: null,
        cert: null,
        authorized: false,
        errorCode: 'ETIMEDOUT',
        errorMessage: `TLS connection timed out after ${timeoutMs}ms`,
        timedOut: true,
      });
    });
  });
}

/* ------------------------------------------------------------------ */
/*  Helper: build SentinelResult from connection data                 */
/* ------------------------------------------------------------------ */

function buildResult(
  endpoint: string,
  conn: ConnectResult,
  domainMatch: boolean,
  certErrorMessage?: string
): SentinelResult {
  const warnings: string[] = [];
  const vulnerabilities: string[] = [];
  let score = 100;

  // Domain / certificate verification penalty
  if (!domainMatch) {
    score -= 30;
    vulnerabilities.push('CERT_INVALID');
    warnings.push(`Certificate verification failed: ${certErrorMessage ?? 'unknown reason'}`);
  }

  // Protocol scoring
  const protocol = conn.protocol;
  if (!protocol) {
    score -= 40;
    vulnerabilities.push('UNKNOWN_PROTOCOL');
  } else if (protocol === 'TLSv1.3') {
    // Best — no penalty
  } else if (protocol === 'TLSv1.2') {
    score -= 5;
  } else {
    score -= 30;
    vulnerabilities.push('WEAK_PROTOCOL');
    warnings.push(`Outdated protocol: ${protocol}`);
  }

  // Cipher scoring
  const cipherName = conn.cipherName;
  if (cipherName) {
    const isStrong = STRONG_CIPHERS.some((c) => cipherName.toUpperCase().includes(c));
    if (!isStrong) {
      score -= 10;
      warnings.push(`Weak cipher: ${cipherName}`);
    }
  } else {
    score -= 15;
    warnings.push('Could not determine cipher');
  }

  // Certificate scoring
  let issuer: string | null = null;
  let daysRemaining: number | null = null;
  const cert = conn.cert;

  if (cert) {
    issuer = cert.issuer?.O ?? cert.issuer?.CN ?? null;

    if (cert.valid_to) {
      const expiryDate = new Date(cert.valid_to);
      daysRemaining = Math.floor((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

      if (daysRemaining < 0) {
        score -= 40;
        vulnerabilities.push('CERT_EXPIRED');
      } else if (daysRemaining < 7) {
        score -= 20;
        warnings.push(`Certificate expires in ${daysRemaining} days`);
      } else if (daysRemaining < 30) {
        score -= 10;
        warnings.push(`Certificate expires in ${daysRemaining} days`);
      }
    }

    if (!conn.authorized) {
      score -= 15;
      warnings.push('Certificate not trusted by CA');
    }
  } else {
    score -= 30;
    warnings.push('No certificate information available');
  }

  score = Math.max(0, Math.min(100, score));
  const grade = scoreToGrade(score);

  logger.info({ endpoint, score, grade, protocol, cipher: cipherName, domainMatch }, 'TLS check completed');

  return {
    sentinel: 'tls',
    passed: score >= 50,
    score,
    data: {
      protocol: protocol ?? null,
      cipher: cipherName,
      grade,
      issuer,
      daysRemaining,
      authorized: conn.authorized,
      domainMatch,
      warnings,
      vulnerabilities,
    },
  };
}
