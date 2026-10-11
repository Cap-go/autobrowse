import { describe, expect, test } from 'bun:test';
import { SecretVault, siteMatches, siteOf } from '../src/secrets/vault';

describe('secret vault', () => {
  test('binds secrets to their site and subdomains', () => {
    expect(siteOf('https://www.github.com/login')).toBe('github.com');
    expect(siteMatches('github.com', 'github.com')).toBe(true);
    expect(siteMatches('github.com', 'auth.github.com')).toBe(true);
    expect(siteMatches('github.com', 'github.com.evil.io')).toBe(false);
    expect(siteMatches('github.com', 'evil.io')).toBe(false);
  });

  test('fills only on the right site and redacts values', async () => {
    const vault = new SecretVault();
    await vault.save({ name: 'GitHub Password', label: 'GitHub password', domain: 'github.com', kind: 'password', value: 'hunter2-secret', remember: false });
    expect(vault.find('github password', 'github.com')?.name).toBe('github_password');
    expect(vault.valueForFill('secret:github_password', 'github.com')).toBe('hunter2-secret');
    expect(() => vault.valueForFill('github_password', 'evil.io')).toThrow();
    expect(vault.redact('echo hunter2-secret here')).toBe('echo [REDACTED secret:github_password] here');
    expect(JSON.stringify(vault.list())).not.toContain('hunter2');
  });
});
