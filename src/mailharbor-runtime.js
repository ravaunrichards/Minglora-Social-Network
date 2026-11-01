import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const MINGLORA_SUPABASE_REF = 'gzycobgbasnqqhnympkr';

function resolveMailHarborDatabaseUrl() {
  const raw = String(
    process.env.MAILHARBOR_DATABASE_URL || process.env.DATABASE_URL || ''
  ).trim();
  if (!raw) return '';

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('MailHarbor database URL must be a valid PostgreSQL connection URI.');
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('MailHarbor database URL must use PostgreSQL.');
  }

  const host = parsed.hostname.toLowerCase();
  const username = decodeURIComponent(parsed.username || '').toLowerCase();
  const isMingloraDirectHost = host === `db.${MINGLORA_SUPABASE_REF}.supabase.co`;
  const isMingloraSessionPooler =
    host.endsWith('.pooler.supabase.com') &&
    username.endsWith(`.${MINGLORA_SUPABASE_REF}`);

  if (!isMingloraDirectHost && !isMingloraSessionPooler) {
    throw new Error(
      'MailHarbor database URL must point to Minglora’s existing Supabase project.'
    );
  }
  if (!parsed.pathname || parsed.pathname.replace(/^\//, '') !== 'postgres') {
    throw new Error('MailHarbor database URL must target the existing postgres database.');
  }
  if (!parsed.username || !parsed.password) {
    throw new Error('MailHarbor database URL is missing its database credentials.');
  }

  return raw;
}

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.removeListener('error', reject);
      resolve(server.address());
    });
  });
}

/**
 * Start MailHarbor as an embedded subsystem of the Minglora Node service.
 * The API is loopback-only; the realtime WebSocket handler attaches to the
 * existing public Minglora HTTP server. MailHarbor tables use Minglora's
 * existing Supabase Postgres database.
 */
export async function startMailHarborRuntime({ publicServer }) {
  const databaseUrl = resolveMailHarborDatabaseUrl();
  if (!databaseUrl) {
    throw new Error(
      'MAILHARBOR_DATABASE_URL (or DATABASE_URL for the same Minglora Supabase project) is required.'
    );
  }
  if (Buffer.byteLength(String(process.env.MAILHARBOR_SSO_SECRET || '')) < 32) {
    throw new Error('MAILHARBOR_SSO_SECRET must contain at least 32 bytes.');
  }

  // The MailHarbor database module reads this canonical variable. Validate
  // any fallback before exporting it to that module.
  process.env.MAILHARBOR_DATABASE_URL = databaseUrl;

  const backend = '../integrations/mailharbor/source/backend/src/';
  const { loadConfig } = require(backend + 'config.js');
  const { pool } = require(backend + 'db.js');
  const { migrate } = require(backend + 'migrate.js');
  const { createApp } = require(backend + 'server.js');
  const { createRealtimeService } = require(backend + 'realtime.js');
  const { startWorker } = require(backend + 'worker.js');

  const config = loadConfig();
  await migrate(pool);

  const realtime = createRealtimeService({ config, db: pool, server: publicServer });
  const app = createApp({ config, db: pool, realtime });
  const internalServer = http.createServer(app);
  const internalPort = Number(process.env.MAILHARBOR_INTERNAL_PORT || 3211);
  await listen(internalServer, internalPort, '127.0.0.1');

  const worker = startWorker({ config, db: pool });
  void realtime.listenToDatabase();

  process.stdout.write('Minglora MailHarbor embedded runtime is ready.\\n');
  process.stdout.write('MailHarbor API is loopback-only; realtime shares the Minglora public service.\\n');

  let closed = false;
  return {
    close: async () => {
      if (closed) return;
      closed = true;
      await realtime.close();
      await worker.close();
      if (internalServer.listening) {
        await new Promise(resolve => internalServer.close(() => resolve()));
      }
      await pool.end();
    }
  };
}
