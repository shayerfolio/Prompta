import worker from './index';
import { json, type Env } from './env';

// Cloudflare Pages advanced mode. Scheduled events belong to the optional
// standalone Worker, never to the Pages site.
export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if ((path === '/api' || path.startsWith('/api/')) && !env.PIN) {
      return Promise.resolve(json({ error: 'Set the PIN secret in Cloudflare Pages, then redeploy.' }, 503));
    }
    return worker.fetch(request, env);
  },
};
