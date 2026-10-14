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

  test('a subdomain secret never goes to its parent or siblings', () => {
    expect(siteMatches('login.example.com', 'example.com')).toBe(false);
    expect(siteMatches('login.example.com', 'evil.example.com')).toBe(false);
  });

  test('same secret name on two sites fills the right one', async () => {
    const vault = new SecretVault();
    await vault.save({ name: 'password', label: 'Password', domain: 'a.com', kind: 'password', value: 'alpha-123', remember: false });
    await vault.save({ name: 'password', label: 'Password', domain: 'b.com', kind: 'password', value: 'bravo-456', remember: false });
    expect(vault.valueForFill('password', 'b.com')).toBe('bravo-456');
    expect(() => vault.valueForFill('password', 'c.com')).toThrow(/belongs to a.com/);
  });

  test('one-time codes are never reused', async () => {
    const vault = new SecretVault();
    await vault.save({ name: 'code', label: 'Code', domain: 'bank.com', kind: 'otp', value: '123456', remember: false });
    expect(vault.find('code', 'bank.com')).toBeNull();
  });

  test('redacts JSON-escaped and URL-encoded values', async () => {
    const vault = new SecretVault();
    await vault.save({ name: 'pw', label: 'Password', domain: 'x.com', kind: 'password', value: 'a"b\\c d', remember: false });
    const json = JSON.stringify({ text: 'value a"b\\c d here' });
    expect(vault.redact(json)).not.toContain('a\\"b');
    expect(vault.redact('q=a%22b%5Cc%20d')).toBe('q=[REDACTED secret:pw]');
  });
});
