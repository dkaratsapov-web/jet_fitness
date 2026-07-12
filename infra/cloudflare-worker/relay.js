// Jet Fitness — Cloudflare Worker relay (Telegram <-> Yandex Cloud).
//
// Why this exists: in RF-hosted deploys, api.telegram.org is blocked in BOTH
// directions — the Yandex Cloud Function cannot reach Telegram, and Telegram
// cannot deliver webhooks to Yandex. This Worker sits outside RF and forwards
// traffic. It stores nothing; it is a pure transit relay.
//
// Two directions:
//
//  1) Telegram -> Yandex (incoming updates)
//     Telegram's webhook is set to  https://<worker>/webhook
//     The Worker forwards the POST to  ${YANDEX_GATEWAY_URL}/telegram/webhook
//     preserving the X-Telegram-Bot-Api-Secret-Token header.
//
//  2) Yandex -> Telegram (outgoing bot API calls)
//     The bot's grammY apiRoot is set to  https://<worker>
//     grammY calls  https://<worker>/bot<TOKEN>/<method>  (and /file/bot<TOKEN>/...)
//     The Worker forwards them to  https://api.telegram.org/...
//
// Config (wrangler vars/secrets):
//   YANDEX_GATEWAY_URL  - base URL of the Yandex API Gateway (no trailing slash)
//   WEBHOOK_PATH        - path Telegram posts to (default "/webhook")

const TELEGRAM_API = 'https://api.telegram.org';

export default {
  /**
   * @param {Request} request
   * @param {{ YANDEX_GATEWAY_URL?: string, WEBHOOK_PATH?: string }} env
   */
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const webhookPath = env.WEBHOOK_PATH || '/webhook';

    // Direction 2: outgoing Telegram Bot API calls from Yandex.
    if (path.startsWith('/bot') || path.startsWith('/file/bot')) {
      return proxy(request, `${TELEGRAM_API}${path}${url.search}`);
    }

    // Direction 1: incoming Telegram update -> Yandex.
    if (path === webhookPath) {
      if (!env.YANDEX_GATEWAY_URL) {
        return new Response('YANDEX_GATEWAY_URL not configured', { status: 500 });
      }
      const target = `${env.YANDEX_GATEWAY_URL.replace(/\/$/, '')}/telegram/webhook`;
      return proxy(request, target);
    }

    // Lightweight health check for the relay itself.
    if (path === '/health') {
      return new Response(JSON.stringify({ status: 'ok', service: 'jet-relay' }), {
        headers: { 'content-type': 'application/json' },
      });
    }

    return new Response('Not found', { status: 404 });
  },
};

/**
 * Forward a request to `target`, preserving method, headers and body.
 * @param {Request} request
 * @param {string} target
 */
async function proxy(request, target) {
  const init = {
    method: request.method,
    headers: request.headers,
    body:
      request.method === 'GET' || request.method === 'HEAD'
        ? undefined
        : request.body,
  };
  const resp = await fetch(target, init);
  // Pass the upstream response straight back.
  return new Response(resp.body, {
    status: resp.status,
    statusText: resp.statusText,
    headers: resp.headers,
  });
}
