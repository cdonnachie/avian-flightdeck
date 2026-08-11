import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PriceService } from './PriceService';

const priceResponse = (price: number, change = 0) => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  json: async () => ({ 'avian-network': { usd: price, usd_24h_change: change } }),
});

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('last known price', () => {
  it('returns null before anything has been stored', () => {
    expect(PriceService.getLastKnownPrice()).toBeNull();
  });

  it('round-trips a price with a timestamp', () => {
    PriceService.saveLastKnownPrice(0.00012345);

    const stored = PriceService.getLastKnownPrice();
    expect(stored?.price).toBe(0.00012345);
    expect(stored?.timestamp).toBeTypeOf('number');
  });

  it('survives corrupted storage rather than throwing', () => {
    localStorage.setItem('lastKnownPrice', 'not json');
    expect(PriceService.getLastKnownPrice()).toBeNull();
  });
});

describe('shouldNotifyPriceChange', () => {
  it('fires only once the move reaches the threshold', () => {
    expect(PriceService.shouldNotifyPriceChange(100, 110, 10)).toBe(true);
    expect(PriceService.shouldNotifyPriceChange(100, 109, 10)).toBe(false);
  });

  it('treats a fall the same as a rise', () => {
    expect(PriceService.shouldNotifyPriceChange(100, 90, 10)).toBe(true);
    expect(PriceService.shouldNotifyPriceChange(100, 80, 10)).toBe(true);
  });

  it('does not fire on missing or zero prices, which would divide by zero', () => {
    expect(PriceService.shouldNotifyPriceChange(0, 100, 10)).toBe(false);
    expect(PriceService.shouldNotifyPriceChange(100, 0, 10)).toBe(false);
    expect(PriceService.shouldNotifyPriceChange(undefined as never, 100, 10)).toBe(false);
  });

  it('always fires with a zero threshold and an actual change', () => {
    expect(PriceService.shouldNotifyPriceChange(100, 101, 0)).toBe(true);
  });
});

describe('createPriceNotification', () => {
  it('describes a rise', () => {
    const notification = PriceService.createPriceNotification(100, 125);

    expect(notification.type).toBe('price_alert');
    expect(notification.title).toContain('Up');
    expect(notification.title).toContain('25.00%');
    expect(notification.data).toMatchObject({ price: 125, change: 25 });
  });

  it('describes a fall, and signs the change consistently', () => {
    const notification = PriceService.createPriceNotification(100, 75);

    expect(notification.title).toContain('Down');
    expect(notification.title).toContain('25.00%');
    expect(notification.body).toContain('-25.00%');
    expect(notification.data).toMatchObject({ change: -25 });
  });

  it('formats sub-cent prices without collapsing them to zero', () => {
    const notification = PriceService.createPriceNotification(0.00001, 0.00002);
    expect(notification.body).toContain('0.00002000');
  });
});

describe('getAvnPrice', () => {
  it('reads the price and 24h change out of the CoinGecko response', async () => {
    const fetchMock = vi.fn(async () => priceResponse(0.0005, 12.5));
    vi.stubGlobal('fetch', fetchMock);

    const result = await PriceService.getAvnPrice(true);

    expect(result?.price).toBe(0.0005);
    expect(result?.change24h).toBe(12.5);
    expect(result?.lastUpdated).toBeInstanceOf(Date);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('caches the fetched price to localStorage for the next session', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => priceResponse(0.00077)));

    await PriceService.getAvnPrice(true);

    expect(PriceService.getLastKnownPrice()?.price).toBe(0.00077);
  });

  it('falls back to the stored price when the API fails', async () => {
    PriceService.saveLastKnownPrice(0.00099);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );

    const result = await PriceService.getAvnPrice(true);

    expect(result?.price).toBeGreaterThan(0);
  });

  it('does not blow up on a non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 429, statusText: 'Too Many Requests' })),
    );

    await expect(PriceService.getAvnPrice(true)).resolves.not.toThrow();
  });

  it('does not blow up when the payload is missing the coin', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, statusText: 'OK', json: async () => ({}) })),
    );

    await expect(PriceService.getAvnPrice(true)).resolves.not.toThrow();
  });

  it('de-duplicates concurrent callers into a single request', async () => {
    const fetchMock = vi.fn(async () => priceResponse(0.00042));
    vi.stubGlobal('fetch', fetchMock);

    const [first, second] = await Promise.all([
      PriceService.getAvnPrice(true),
      PriceService.getAvnPrice(true),
    ]);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(first?.price).toBe(second?.price);
  });
});
