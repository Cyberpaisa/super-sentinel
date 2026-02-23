import * as tls from 'node:tls';
import { createLogger } from '@/lib/utils/logger';
import { type SentinelResult } from '../types';

const logger = createLogger('sentinel:tls');

const DEFAULT_TIMEOUT_MS = 10_000;

export type TLSGrade = 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';

export interface TLSData {
  protocol: string | null;
  cipher: string | null;
  grade: TLSGrade;
  issuer: string | null;
  daysRemaining: number | null;
  authorized: boolean;
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
        warnings: ['Invalid endpoint URL'],
        vulnerabilities: [],
      },
    };
  }

  return new Promise<SentinelResult>((resolve) => {
    const warnings: string[] = [];
    const vulnerabilities: string[] = [];
    let score = 100;

    const socket = tls.connect(
      { host: hostname, port, servername: hostname, rejectUnauthorized: false, timeout: timeoutMs },
      () => {
        const protocol = socket.getProtocol();
        const cipherInfo = socket.getCipher();
        const cert = socket.getPeerCertificate();
        const authorized = socket.authorized;

        // Protocol scoring
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
        const cipherName = cipherInfo?.name ?? null;
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

        if (cert && cert.subject) {
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

          if (!authorized) {
            score -= 15;
            warnings.push('Certificate not trusted by CA');
          }
        } else {
          score -= 30;
          warnings.push('No certificate information available');
        }

        score = Math.max(0, Math.min(100, score));
        const grade = scoreToGrade(score);

        socket.end();
        logger.info({ endpoint, score, grade, protocol, cipher: cipherName }, 'TLS check completed');

        resolve({
          sentinel: 'tls',
          passed: score >= 50,
          score,
          data: {
            protocol: protocol ?? null,
            cipher: cipherName,
            grade,
            issuer,
            daysRemaining,
            authorized,
            warnings,
            vulnerabilities,
          },
        });
      }
    );

    socket.on('error', (err) => {
      logger.error({ endpoint, error: err.message }, 'TLS connection failed');
      resolve({
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
          warnings: [`TLS connection error: ${err.message}`],
          vulnerabilities: ['CONNECTION_FAILED'],
        },
      });
    });

    socket.setTimeout(timeoutMs, () => {
      socket.destroy();
      resolve({
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
          warnings: [`TLS connection timed out after ${timeoutMs}ms`],
          vulnerabilities: ['TIMEOUT'],
        },
      });
    });
  });
}
