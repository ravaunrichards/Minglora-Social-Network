import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

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
 * existing Supabase Postgres database through MAILHARBOR_DATABASE_URL.
 */
export async function startMailHarborRuntime({ publicServer }) {
  if (!process.env.MAILHARBOR_DATABASE_URL) {
    throw new Error('MAILHARBOR_DATABASE_URL is not set to Minglora’s existing Supabase Postgres connection.');
  }
  if (Buffer.byteLength(String(process.env.MAILHARBOR_SSO_SECRET || '')) < 32) {
    throw new Error('MAILHARBOR_SSO_SECRET must contain at least 32 bytes.');
  }

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
  const internalPort = 3211;
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
