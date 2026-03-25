import * as oidc from 'oidc-provider';
import {TEST_USERS, findAccount} from './accounts.js';
import {PORT, issuer, browserBaseUrl} from './config.js';
import {registerInteractionRoutes} from './interactions.js';

const CLIENTS: oidc.ClientMetadata[] = [
  {
    client_id: 'acurement',
    client_secret: 'acurement',
    grant_types: ['client_credentials'],
    redirect_uris: [],
  },
  {
    client_id: 'benefitall',
    client_secret: 'benefitall',
    grant_types: ['authorization_code', 'client_credentials', 'refresh_token'],
    redirect_uris: ['http://localhost:5173/auth/callback'],
  },
];

const provider = new oidc.Provider(issuer, {
  findAccount,
  cookies: {
    keys: [process.env.COOKIE_SECRET ?? 'dev-cookie-secret'],
  },
  clients: CLIENTS,
  scopes: ['openid', 'offline_access', 'email', 'profile'],
  claims: {
    openid: ['sub'],
    email: ['email', 'email_verified'],
    profile: ['name', 'given_name', 'family_name'],
  },
  // Include scope claims directly in the ID token rather than userinfo-only
  conformIdTokenClaims: false,
  features: {
    devInteractions: {enabled: false},
    clientCredentials: {enabled: true},
    introspection: {enabled: true},
    revocation: {enabled: true},
  },
});

registerInteractionRoutes(provider, TEST_USERS);

// Rewrite browser-facing endpoints in the discovery document so the browser
// can reach the authorize/end_session URLs even when the issuer is an internal hostname.
const DISCOVERY_PATHS = [
  '/.well-known/openid-configuration',
  '/.well-known/oauth-authorization-server',
];
const BROWSER_ENDPOINTS = {
  authorization_endpoint: `${browserBaseUrl}/auth`,
  end_session_endpoint: `${browserBaseUrl}/session/end`,
};

provider.use(async (ctx, next) => {
  await next();
  if (
    DISCOVERY_PATHS.includes(ctx.path) &&
    typeof ctx.body === 'object' &&
    ctx.body !== null
  ) {
    Object.assign(ctx.body, BROWSER_ENDPOINTS);
  }
});

provider.listen(PORT, () => {
  console.log(
    `oidc-provider listening on port ${PORT}, check ${browserBaseUrl}/.well-known/openid-configuration`,
  );
});
