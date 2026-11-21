import { randomBytes, randomInt } from 'node:crypto';

import { ValidationError, type ApiErrorBody } from '../../shared/hum';

import { AdminService } from './adminService';
import { AgentService } from './agentService';
import { AiData } from './aiData';
import { AssistantService } from './assistantService';
import { claudeClient } from './claude';
import { ApiError } from './errors';
import { adminDb, firestoreStore, verifyIdToken } from './firebaseAdmin';
import { CircleWallets, type WalletClient } from './circleWallets';
import { ConvertService, MockExchange } from './convertService';
import { signerFromPkcs8 } from './ed25519';
import { FundingService } from './fundingService';
import { HumService } from './humService';
import { OfflineService } from './offlineService';
import { RequestService } from './requestService';
import { SupportService } from './supportService';
import { VendorService } from './vendorService';
import { MockNairaLedger } from './naira';
import { paystackCheckout } from './paystack';
import { createNotifier } from './push';
import { fetchParsedTransaction } from './solanaRpc';
import { fetchWalletRisk } from './webacy';

// A stray background rejection (e.g. a credential refresh) must not take the whole
// function down with a non-JSON 500; log it so it shows up in Vercel's logs.
process.on('unhandledRejection', (reason) => console.error('Unhandled rejection', reason));

type CircleSdk = typeof import('@circle-fin/developer-controlled-wallets');

/** Loaded only when dollar wallets are used, so a problem in the library can't take down every route. */
function loadCircleSdk(): CircleSdk {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@circle-fin/developer-controlled-wallets') as CircleSdk;
}

interface Services {
  hum: HumService;
  funding: FundingService;
  convert: ConvertService;
  offline: OfflineService;
  circle: CircleWallets;
  assistant: AssistantService;
  agent: AgentService;
  aiData: AiData;
  requests: RequestService;
  vendors: VendorService;
  admin: AdminService;
  support: SupportService;
}

let services: Services | undefined;

/** Lazily built so a missing credential surfaces as a JSON error, not a crash at load. */
export function getServices(): Services {
  if (!services) {
    const store = firestoreStore(adminDb());
    const now = () => Date.now();
    const newId = () => randomBytes(15).toString('base64url');
    const naira = new MockNairaLedger(store, now);
    const notify = createNotifier(store);
    const circle = new CircleWallets({
      store,
      now,
      apiKey: process.env.CIRCLE_API_KEY,
      entitySecret: process.env.CIRCLE_ENTITY_SECRET,
      setupToken: process.env.CIRCLE_SETUP_TOKEN,
      makeClient: (apiKey, entitySecret) =>
        loadCircleSdk().initiateDeveloperControlledWalletsClient({
          apiKey,
          entitySecret,
        }) as unknown as WalletClient,
      registerSecret: async (apiKey, entitySecret) => {
        const response = await loadCircleSdk().registerEntitySecretCiphertext({
          apiKey,
          entitySecret,
          recoveryFileDownloadPath: '/tmp',
        });
        const file = (response as { data?: { recoveryFile?: string } }).data?.recoveryFile;
        return file ?? null;
      },
    });
    const ai = claudeClient();
    // Usernames of Faara's team, comma-separated: they see the admin area.
    const admins = (process.env.FAARA_ADMINS ?? '')
      .split(',')
      .map((name) => name.trim().replace(/^@/, '').toLowerCase())
      .filter(Boolean);
    const admin = new AdminService({ store, now, newId, admins });
    const aiData = new AiData({ store, now, newId });
    const convert = new ConvertService({
      store,
      now,
      newId,
      // Mock rate until an exchange partner is connected.
      exchange: new MockExchange(Number(process.env.MOCK_NGN_PER_USD ?? 1550), now),
      usdc: circle.configured ? circle : undefined,
    });
    services = {
      hum: new HumService({
        store,
        now,
        randomInt: (n) => randomInt(n),
        newId,
        naira,
        fetchTransaction: fetchParsedTransaction,
        walletRisk: fetchWalletRisk,
        notify,
      }),
      convert,
      aiData,
      requests: new RequestService({ store, now, newId, notify }),
      vendors: new VendorService({
        store,
        now,
        notify,
        reviewers: admins,
        audit: (adminUid, action, targetUid, detail) =>
          admin.record(adminUid, action, targetUid, detail),
      }),
      admin,
      support: new SupportService({ store, now, newId, admin, notify }),
      assistant: new AssistantService({ store, now, ai, examples: aiData }),
      agent: new AgentService({
        store,
        now,
        newId,
        ai,
        notify,
        examples: aiData,
        // The agent saves into dollars by buying USDC at the current quoted rate.
        buyUsdc: async (uid, amountKobo) => {
          const quote = await convert.quote(uid, {
            from: 'NGN',
            to: 'USDC',
            amount: amountKobo / 100,
          });
          return { status: (await convert.execute(uid, quote.id)).status };
        },
      }),
      offline: new OfflineService({
        store,
        now,
        newId,
        signer: process.env.OFFLINE_SIGNING_KEY
          ? signerFromPkcs8(process.env.OFFLINE_SIGNING_KEY)
          : null,
        notify,
      }),
      circle,
      funding: new FundingService({
        store,
        now,
        newId,
        naira,
        checkout: paystackCheckout(),
        notify,
      }),
    };
  }
  return services;
}

/**
 * Requests authenticate with a bearer token, not cookies, so any origin may call the
 * API (e.g. the app running on a local dev server).
 */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS_HEADERS },
  });
}

/** CORS preflight handler shared by every route. */
export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return json(error.status, {
      error: { code: error.code, message: error.message },
    } satisfies ApiErrorBody);
  }
  if (error instanceof ValidationError) {
    return json(400, {
      error: { code: 'invalid-argument', message: error.message },
    } satisfies ApiErrorBody);
  }
  console.error(error);
  return json(500, {
    error: { code: 'internal', message: 'Something went wrong.' },
  } satisfies ApiErrorBody);
}

/**
 * Builds a POST handler: authenticates the Firebase ID token in the Authorization
 * header, validates the JSON body, and runs the action.
 */
export function authedRoute<Req, Res>(
  parse: (body: unknown) => Req,
  action: (
    context: { uid: string; services: Services; http: Request },
    request: Req,
  ) => Promise<Res>,
  /** `movesMoney`: refused while Faara's team has paused the account. */
  options: { movesMoney?: boolean } = {},
) {
  return async function POST(request: Request): Promise<Response> {
    try {
      const header = request.headers.get('authorization') ?? '';
      const match = /^Bearer (.+)$/.exec(header);
      if (!match) throw new ApiError('unauthenticated', 'Sign in to continue.');
      let uid: string;
      try {
        uid = await verifyIdToken(match[1] as string);
      } catch {
        throw new ApiError('unauthenticated', 'Your session has expired. Sign in again.');
      }
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        throw new ValidationError('Request body must be JSON.');
      }
      const services = getServices();
      const input = parse(body);
      if (options.movesMoney && (await services.admin.isPaused(uid))) {
        throw new ApiError(
          'permission-denied',
          'Your account is paused. Contact support from Help to sort it out.',
        );
      }
      const result = await action({ uid, services, http: request }, input);
      return json(200, result ?? { ok: true });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

/** `authedRoute` for hum endpoints, which move money unless told otherwise. */
export function humRoute<Req, Res>(
  parse: (body: unknown) => Req,
  action: (service: HumService, uid: string, request: Req) => Promise<Res>,
  options: { movesMoney?: boolean } = { movesMoney: true },
) {
  return authedRoute(
    parse,
    ({ uid, services: all }, request) => action(all.hum, uid, request),
    options,
  );
}

export { errorResponse, json };
