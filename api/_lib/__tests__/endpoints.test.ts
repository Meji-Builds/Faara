import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards for the deployed functions themselves, not just the services behind them:
 * every route a routes file exports must be reachable through its function, and shared
 * server code must not load heavy libraries up front (if one fails to load on Vercel,
 * every route goes down with it).
 */

type Handler = (request: Request) => Promise<Response>;
interface FunctionModule {
  POST?: Handler;
  GET?: Handler;
}

// Loading every server function the first time can take a while on a busy machine.
jest.setTimeout(30_000);

const API = join(__dirname, '..', '..');
const ROUTES = join(API, '_lib', 'routes');

/** Routes served under a different name than their export. */
const URL_NAME: Record<string, string> = {
  exportExamples: 'export',
  ticketStatus: 'ticket-status',
};

const families = readdirSync(ROUTES)
  .filter((file) => file.endsWith('.ts'))
  .map((file) => file.replace(/\.ts$/, ''));

describe('server functions', () => {
  it.each(families)('serve every %s route they export', async (family) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const routes = require(join(ROUTES, family)) as Record<string, unknown>;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fn = require(join(API, family, '[action]')) as FunctionModule;
    const missing: string[] = [];
    for (const name of Object.keys(routes)) {
      if (typeof routes[name] !== 'function') continue;
      const url = `https://faara.test/api/${family}/${URL_NAME[name] ?? name}`;
      let reachable = false;
      for (const method of ['POST', 'GET'] as const) {
        const handler = fn[method];
        if (!handler) continue;
        const response = await handler(
          new Request(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            ...(method === 'POST' ? { body: '{}' } : {}),
          }),
        );
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        // Every answer is JSON, and the route exists (it may still refuse: no sign-in here).
        expect(body).not.toBeNull();
        if (!(response.status === 404 && /doesn’t exist/.test(body?.error?.message ?? ''))) {
          reachable = true;
        }
      }
      if (!reachable) missing.push(name);
    }
    expect(missing).toEqual([]);
  });

  it('load heavy libraries only when they are used', () => {
    const heavy = ['@solana/web3.js', '@circle-fin/developer-controlled-wallets'];
    const offenders: string[] = [];
    for (const file of readdirSync(join(API, '_lib'))) {
      if (!file.endsWith('.ts')) continue;
      const source = readFileSync(join(API, '_lib', file), 'utf8');
      for (const library of heavy) {
        // A value import runs when the file loads; `import type` and require() on use don't.
        const eager = new RegExp(`^import (?!type )[^;]*from '${library}'`, 'm');
        if (eager.test(source)) offenders.push(`${file} → ${library}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
