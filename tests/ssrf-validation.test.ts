import { describe, it, expect } from 'vitest';

/**
 * Test the isUrlSafe function from routescan-indexer-service
 * (Replicated here since it's not exported)
 */
function isUrlSafe(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    const hostname = url.hostname.toLowerCase();

    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      hostname === '[::1]' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('172.16.') ||
      hostname.startsWith('172.17.') ||
      hostname.startsWith('172.18.') ||
      hostname.startsWith('172.19.') ||
      hostname.startsWith('172.2') ||
      hostname.startsWith('172.3') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      (url.protocol !== 'https:' && url.protocol !== 'http:')
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

describe('SSRF URL Validation', () => {
  it('allows valid public HTTPS URLs', () => {
    expect(isUrlSafe('https://example.com/metadata.json')).toBe(true);
    expect(isUrlSafe('https://arweave.net/abc123')).toBe(true);
    expect(isUrlSafe('https://ipfs.io/ipfs/Qm123')).toBe(true);
  });

  it('allows valid public HTTP URLs', () => {
    expect(isUrlSafe('http://example.com/agent.json')).toBe(true);
  });

  it('blocks localhost', () => {
    expect(isUrlSafe('http://localhost:3000/admin')).toBe(false);
    expect(isUrlSafe('http://localhost/secret')).toBe(false);
  });

  it('blocks loopback IPs', () => {
    expect(isUrlSafe('http://127.0.0.1:8080')).toBe(false);
    expect(isUrlSafe('http://0.0.0.0')).toBe(false);
  });

  it('blocks private network ranges (10.x.x.x)', () => {
    expect(isUrlSafe('http://10.0.0.1/api')).toBe(false);
    expect(isUrlSafe('http://10.255.255.255')).toBe(false);
  });

  it('blocks private network ranges (192.168.x.x)', () => {
    expect(isUrlSafe('http://192.168.1.1/admin')).toBe(false);
    expect(isUrlSafe('http://192.168.0.100')).toBe(false);
  });

  it('blocks private network ranges (172.16-31.x.x)', () => {
    expect(isUrlSafe('http://172.16.0.1')).toBe(false);
    expect(isUrlSafe('http://172.20.0.1')).toBe(false);
    expect(isUrlSafe('http://172.31.255.255')).toBe(false);
  });

  it('blocks .local and .internal domains', () => {
    expect(isUrlSafe('http://myservice.local/api')).toBe(false);
    expect(isUrlSafe('http://db.internal:5432')).toBe(false);
  });

  it('blocks non-HTTP protocols', () => {
    expect(isUrlSafe('ftp://example.com/file')).toBe(false);
    expect(isUrlSafe('file:///etc/passwd')).toBe(false);
  });

  it('returns false for invalid URLs', () => {
    expect(isUrlSafe('not-a-url')).toBe(false);
    expect(isUrlSafe('')).toBe(false);
  });

  it('blocks IPv6 loopback', () => {
    expect(isUrlSafe('http://[::1]:3000')).toBe(false);
  });
});
