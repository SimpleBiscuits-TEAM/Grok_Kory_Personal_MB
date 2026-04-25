import { describe, it, expect } from 'vitest';

/**
 * useFullscreen hook tests
 * Since the browser Fullscreen API isn't available in the test environment,
 * we test the hook's module structure and exported function signature.
 */
describe('useFullscreen hook', () => {
  it('exports useFullscreen function', async () => {
    const mod = await import('./useFullscreen');
    expect(typeof mod.useFullscreen).toBe('function');
  });

  it('hook module has no default export (named export only)', async () => {
    const mod = await import('./useFullscreen');
    expect(mod.default).toBeUndefined();
  });
});
