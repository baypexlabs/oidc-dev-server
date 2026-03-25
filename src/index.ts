import * as oidc from 'oidc-provider';
import {TEST_USERS, findAccount} from './accounts.js';
import {PORT, issuer, browserBaseUrl} from './config.js';
import {registerInteractionRoutes} from './interactions.js';

// Stable RS256 signing key so tokens remain valid across restarts and clients
// don't need to declare id_token_signed_response_alg (RS256 is the default).
// Dev-only — never use in production.
const DEV_JWKS = {
  keys: [
    {
      kty: 'RSA',
      n: 'lynF2NtadAPlyLyE5YrNqv98KIR6308e3kywo7beN_egDzBB2SWdRCLAOrfPtzHeVxOOCWFIeP7YWf_RkgQp_5vv162uRCKtaht0FHvzrBEnpkbHi6WWG1EcHGz6PbMbOc7y_GOkyXUigWasK6rJPniam2qmw4Q6Ycu8OMSdWRfc-KXBUTEQCs5WTEibFM-YxKjLBk9iKgqRnPE9kRLHTe7mfICSUjhDk7yq8OVH0jxf7SeF-EZ-yG5GvzFdvmUIECMZsSHeNJJeQcGUzU8ZAsoGcGB9ihbBlZ7KbvDOFPKqKFIns_6wD7QyOAR9rdex6b36YgUNrRDqWKydMArlUw',
      e: 'AQAB',
      d: 'FHV855rYpTcZ1I9fVUnyCCDIBxvXHX4x6Vhr19yaOuzy5ttbLi6fGGezqL7UCDFhrFtjL_XQvz-OvK-ZB7A0lvnd_kztdx9SZTgN_---zR0NRr3xp_7jUBMsQNSnEc658psF3A8IcJO_9c-VodtdnWzpT_uhUnkFBdNzSCOkQDh7VQU_TfXj7c8fOlmEeyQ_90dmVo82yQMs0lBV1U8yGjOBgqoxAIuyX_M-YnoRcpTqKoJjiyx3zrTsJxGGXx6WG4YDSU1klekrdS6iDFjvxBzCD8E4gg8pN7JoKoz3RHg_Ex9878w-VcAW9Aql0NEmoclGXLgGDOA9HMlZ8n2GoQ',
      p: 'yhAcWMMC9Il1_09HmwAS4xVNbzsQW1X89aPvvUXabH9NT_ifkhyGmK4ah6hKOHBIQDM3XTJNM-EEtQRtU3B90aOkS3HDNFH6ku8hvU_1Ibsbm0RtpuCfefP6MkbCo8qwmUA2dcTKxUVwXDNgD9Qsi9XZ2oa5hWz_NlE3N5LLh1k',
      q: 'v4NymT0Ll6zlNfx2f-rswr5w16r9_f1_yhubJ5WYToeV_nf_JEPfpV2mV4fbTr5Mph8NXYtijOefSMS0ETZh5UM4XFKhKdGSYvM0yda8Q6yuTFU9sn2bNEUCSD28ZiotpTbiJNK2Irk5e7xxWUI77t4nbL5OoIaKSUU1XH-mqIs',
      dp: 'ryyoZosp1LYXBe_FNCssNJITP4sE8yno00v8Wypj4gu7CsmQDSuNxG-rsE_FiIhPGtlL9g_VvlQlsIjV_rBXY5dqp71IbeNkSF3n8iePbF654DHCnhm-KAvLrCqMM1NVJob0r8SbxcodTtF7Rj27IL-Uzk5eJ74GwyBFrngk2oE',
      dq: 'RXwJvjN520QtvZKl4-92i4nRI0607Mxm6wttFcWfBw8Gitc6yQufPz5lNeji1wUQhk1J6iDCVuFK13oW4w_aIPZsooKQWr3g4Ongw0KX9-3VJ3jd877C6woGs_NCQccX3JO3JSkWUC7n_k72yS3Q1O_hWgEKQg_OaJslqzPdYdU',
      qi: 'oTxHk1KoxPs904vOl24WT8QPDCiEWcGGUJe8GElWKVElWzZqfnUdMP8ldcont1jD57mxblR_O9cdtVVE906cbVM0UTSNS6twvpcTw74QtxKeS6a2tZkryyL-dVbasZJqOIobXhOiGCkAJDRTkpOnhNlIDwTphGOLwVAqWTtkWG0',
      use: 'sig',
      alg: 'RS256',
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
  {
    // Used by the integration test suite
    client_id: 'test-client',
    client_secret: 'test-client',
    grant_types: ['authorization_code', 'refresh_token'],
    redirect_uris: ['http://test.invalid/callback'],
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
