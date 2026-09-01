// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { sanitizeDescriptionHtml } from '@/lib/security/sanitize-description';

describe('description sanitizer', () => {
  it('removes executable markup and unsafe URLs', () => {
    const result = sanitizeDescriptionHtml('<h3 onclick="alert(1)">Hello</h3><script>alert(2)</script><a href="javascript:alert(3)">bad</a><a href="https://drova.io">good</a>');
    expect(result).toContain('<h3>Hello</h3>');
    expect(result).not.toContain('script');
    expect(result).not.toContain('onclick');
    expect(result).not.toContain('javascript:');
    expect(result).toContain('rel="noreferrer noopener"');
  });

  it('removes tracking images and embedded documents', () => {
    const result = sanitizeDescriptionHtml('<img src="https://tracker.invalid/pixel"><iframe src="https://example.com"></iframe><p>Safe</p>');
    expect(result).toBe('<p>Safe</p>');
  });
});
