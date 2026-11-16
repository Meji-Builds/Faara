/**
 * GET /api/health: setup diagnostics without secrets. Loads the server dependencies lazily
 * so that even an import failure is reported as JSON instead of crashing the function.
 */
interface Check {
  ok: boolean;
  detail: string;
}

type AdminModule = typeof import('./_lib/firebaseAdmin');

/** Loaded on demand so a broken dependency is reported, not fatal. */
function loadAdmin(): AdminModule {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./_lib/firebaseAdmin') as AdminModule;
}

async function check(run: () => Promise<string> | string): Promise<Check> {
  try {
    return { ok: true, detail: await run() };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    };
  }
}

export async function GET(): Promise<Response> {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  let projectId: string | null = null;

  const serviceAccount = await check(() => {
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set');
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // Never echo the value: parse errors quote part of the input.
      throw new Error('Not valid JSON. Paste the entire service account file, from { to }.');
    }
    for (const field of ['project_id', 'client_email', 'private_key']) {
      if (typeof parsed[field] !== 'string' || !parsed[field])
        throw new Error(`Missing field: ${field}`);
    }
    if (!String(parsed.private_key).includes('BEGIN PRIVATE KEY'))
      throw new Error('private_key looks malformed');
    projectId = String(parsed.project_id);
    return `parsed (project ${projectId})`;
  });

  const firebaseAdmin = !serviceAccount.ok
    ? { ok: false, detail: 'skipped (fix the service account first)' }
    : await check(async () => {
        loadAdmin().adminDb();
        return 'initialised';
      });

  const firestore = firebaseAdmin.ok
    ? await check(async () => {
        await loadAdmin().adminDb().doc('health/ping').get();
        return 'reachable';
      })
    : { ok: false, detail: 'skipped' };

  const body = {
    ok: serviceAccount.ok && firebaseAdmin.ok && firestore.ok,
    node: process.version,
    checks: { serviceAccount, firebaseAdmin, firestore },
    webacyKey: process.env.WEBACY_API_KEY ? 'set' : 'not set',
  };
  return new Response(JSON.stringify(body, null, 2), {
    status: body.ok ? 200 : 500,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
