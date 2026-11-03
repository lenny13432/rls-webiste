// Einstieg für Cloudflare Workers:
// /api/... geht an die Datenbank-Schnittstelle, alles andere sind die Seiten aus "public".
import { onRequest } from '../functions/api/[[path]].js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return onRequest({ request, env, waitUntil: (p) => ctx.waitUntil(p) });
    }
    return env.ASSETS.fetch(request);
  }
};
