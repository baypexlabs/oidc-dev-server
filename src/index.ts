import * as oidc from 'oidc-provider';
import {TEST_USERS, findAccount} from './accounts.js';
import {PORT, issuer, browserBaseUrl} from './config.js';
import {registerInteractionRoutes} from './interactions.js';

// Stable signing key so tokens remain valid across restarts.
// This is a dev-only key — never use in production.
const DEV_JWKS = {
  keys: [
    {
      kty: 'EC',
      crv: 'P-256',
      x: 'Kea6xMFSjDdcObwGGG-AkG-PMDqO0qHGLt254skAS3Q',
      y: 'z9eQ7SoRt106RsPY8s8dnZFTVuav8QFIMiWPNSKNN-U',
      d: 'DV5450_N_r9gcNiIT_1yhH0uIj-91sk3B1neb7WpBJk',
      use: 'sig',
      alg: 'ES256',
      kid: 'dev-key-1',
    },
  ],
};

// Grant types:
//   client_credentials  — service-to-service calls; no user involved
//   authorization_code  — user-facing apps that redirect the browser to the login UI
//   refresh_token       — apps that need to maintain a session beyond the access token TTL
const CLIENTS: oidc.ClientMetadata[] = [
  {
    // Backend service making authenticated API calls on its own behalf
    client_id: 'acurement',
    client_secret: 'acurement',
    grant_types: ['client_credentials'],
    redirect_uris: [],
  },
  {
    // Web app with a user-facing login flow and long-lived sessions
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
  jwks: DEV_JWKS,
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
  ttl: {
    Interaction: 3600,  // 1 hour
    Session: 86400,     // 24 hours
    Grant: 86400,
    AccessToken: 3600,
    IdToken: 3600,
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
