import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createHmac } from 'crypto';
import { query, queryOne } from '$lib/server/db.js';
import { syncUserTransactions } from '$lib/server/bankSync.js';

const SECRET_KEY_ENV = 'UP_WEBHOOK_SECRET_KEY';

function getWebhookSecret(): string | null {
  return process.env[SECRET_KEY_ENV] ?? null;
}

async function verifySignature(secret: string, body: string, signature: string | null): Promise<boolean> {
  if (!signature) return false;
  const expected = createHmac('sha256', secret).update(body).digest('hex');
  // Constant-time comparison
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return a.equals(b) || timingSafeEqual(a, b);
}

function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export const POST: RequestHandler = async (event) => {
  const secret = getWebhookSecret();
  const rawBody = await event.request.text();

  if (secret) {
    const sig = event.request.headers.get('X-Up-Authenticity-Signature');
    const valid = await verifySignature(secret, rawBody, sig);
    if (!valid) {
      return json({ ok: false, error: 'Invalid signature' }, { status: 401 });
    }
  }

  let payload: {
    data: {
      type: string;
      attributes: { eventType: string };
      relationships?: {
        transaction?: { data?: { id: string } };
        webhook?: { data?: { id: string } };
      };
    };
  };

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const eventType = payload?.data?.attributes?.eventType;

  // PING event — Up sends this when webhook is first created
  if (eventType === 'PING') {
    return json({ ok: true });
  }

  if (eventType === 'TRANSACTION_CREATED' || eventType === 'TRANSACTION_SETTLED') {
    const transactionId = payload?.data?.relationships?.transaction?.data?.id;
    if (!transactionId) return json({ ok: false, error: 'Missing transaction ID' }, { status: 400 });

    // Find which user owns a connection (webhook is global, we find by transaction presence or just sync all active)
    // Since Up webhooks don't include user context directly, sync all active connections
    const connections = await query<{ user_id: string }>(
      `SELECT user_id FROM bank_connections WHERE status = 'active'`,
      []
    );

    // Fire off syncs asynchronously — don't block the response
    for (const conn of connections) {
      syncUserTransactions(conn.user_id).catch(() => {});
    }

    return json({ ok: true });
  }

  // Unknown event type — acknowledge so Up doesn't retry
  return json({ ok: true });
};
