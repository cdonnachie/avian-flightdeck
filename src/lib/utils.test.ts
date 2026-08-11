import { describe, expect, it } from 'vitest';

import { Logger, walletLogger } from './Logger';
import { cn, isBrowser } from './utils';

describe('cn', () => {
  it('joins class names', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('drops falsy values so conditional classes are safe', () => {
    const isActive = false;
    expect(cn('a', isActive && 'b', undefined, null, '', 'c')).toBe('a c');
  });

  it('lets a later Tailwind utility win over an earlier one in the same group', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  it('keeps utilities from different groups', () => {
    expect(cn('px-2', 'py-4')).toBe('px-2 py-4');
  });

  it('accepts arrays and objects', () => {
    expect(cn(['a', 'b'], { c: true, d: false })).toBe('a b c');
  });
});

describe('isBrowser', () => {
  it('is true under the test shims, which stand in for a browser', () => {
    expect(isBrowser()).toBe(true);
  });
});

describe('Logger', () => {
  it('hands back the same instance for a given module', () => {
    expect(Logger.getLogger('shared')).toBe(Logger.getLogger('shared'));
  });

  it('normalises module names, so casing and punctuation do not fork the instance', () => {
    expect(Logger.getLogger('My Module')).toBe(Logger.getLogger('my_module'));
  });

  it('keeps different modules apart', () => {
    expect(Logger.getLogger('one')).not.toBe(Logger.getLogger('two'));
  });

  it('exposes ready-made loggers for the services', () => {
    expect(walletLogger).toBeInstanceOf(Logger);
  });

  it('persists the debug flag across instances of the same module', () => {
    const logger = Logger.getLogger('toggle_test');
    logger.setDebugEnabled(true);

    expect(localStorage.getItem('toggle_test_debug_enabled')).toBe('true');

    logger.setDebugEnabled(false);
    expect(localStorage.getItem('toggle_test_debug_enabled')).toBe('false');
  });

  it('logs without throwing even when storage is unavailable', () => {
    const logger = Logger.getLogger('resilience');
    expect(() => logger.info('a message', { some: 'context' })).not.toThrow();
    expect(() => logger.error('a failure', new Error('boom'))).not.toThrow();
    expect(() => logger.warn('a warning')).not.toThrow();
    expect(() => logger.debug('a debug line')).not.toThrow();
  });
});
