import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { createStore } from './store.js';
import { createFetchRoutes } from './routes.js';

/**
 * Resolve the Harness home the same way the host does: an explicit `$DSH_HOME`
 * wins, otherwise `~/.dsh`. Resolved locally on purpose — packages shipped with
 * DSH are not declared as plugin dependencies, and a profile install may link
 * this directory, which would break module resolution from a package that is
 * only present in the profile's own tree.
 * @param {NodeJS.ProcessEnv} env - process environment to read.
 * @returns {string} the absolute user-data root.
 */
export function resolveHarnessHome(env = process.env) {
  const configured = env.DSH_HOME?.trim();
  const home = configured !== undefined && configured !== '' ? configured : join(homedir(), '.dsh');
  return home === '~' ? homedir() : resolve(home.startsWith('~/') || home.startsWith('~\\') ? join(homedir(), home.slice(2)) : home);
}

const DATA_DIRECTORY = join(resolveHarnessHome(), 'personal-skins');
const PRIVATE_DENIED = () => new Response('Forbidden', {
  status: 403,
  headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
});

export const inject = ['connection'];

/** Register this plugin's local Fetch endpoints on the desktop/web carrier. */
export function apply(ctx) {
  const store = createStore(DATA_DIRECTORY);
  for (const route of createFetchRoutes({ store })) {
    const fetch = route.fetch;
    ctx.connection.fetch.register({
      ...route,
      fetch: async (request) => {
        if (request.headers.get('sec-fetch-site') === 'cross-site') return PRIVATE_DENIED();
        if (request.method === 'POST' && request.headers.get('x-dsh-personal-skins') !== '1') return PRIVATE_DENIED();
        return fetch(request);
      },
    });
  }
}
