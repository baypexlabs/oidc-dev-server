import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes, createHash} from 'node:crypto';

const BASE = process.env.OIDC_BASE_URL ?? 'http://oidc-dev-server:31389';
const CLIENT_ID = 'test-client';
const CLIENT_SECRET = 'test-client';
const REDIRECT_URI = 'http://test.invalid/callback';

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function pkce() {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  return {verifier, challenge};
}

function decodeJwtPayload(token) {
  const [, payload] = token.split('.');
  return JSON.parse(Buffer.from(payload, 'base64url').toString());
}

// Accumulates Set-Cookie headers and re-sends them on subsequent requests.
function makeCookieJar() {
  const cookies = new Map();
  return {
    header: () => [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; '),
    collect(res) {
      for (const header of res.headers.getSetCookie()) {
        const [pair] = header.split(';');
        const eq = pair.indexOf('=');
        cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
      }
    },
  };
}

// Follows redirects manually so we can accumulate cookies and stop before
// navigating to an unresolvable URL (like http://test.invalid/callback).
// Returns {res, finalUrl} where finalUrl is either the page we landed on
// (no Location header) or the URL matched by the stop predicate.
async function followRedirects(url, init, jar, stop) {
  while (true) {
    const res = await fetch(url, {...init, redirect: 'manual'});
    jar.collect(res);
    const location = res.headers.get('location');
    if (!location) return {res, finalUrl: url};
    url = new URL(location, url).toString();
    if (stop?.(url)) return {res, finalUrl: url};
    init = {headers: {cookie: jar.header()}};
  }
}

test('authorization code flow returns profile and email claims', async () => {
  const discovery = await fetch(
    `${BASE}/.well-known/openid-configuration`,
  ).then(r => r.json());

  const {verifier, challenge} = pkce();
  const jar = makeCookieJar();

  // Step 1: Start authorization flow — follow redirects to the login page
  const authUrl = new URL('/auth', BASE);
  authUrl.searchParams.set('client_id', CLIENT_ID);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('scope', 'openid profile email');
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('state', base64url(randomBytes(16)));

  const {res: loginPage, finalUrl: interactionUrl} = await followRedirects(
    authUrl.toString(),
    {},
    jar,
  );
  assert.equal(loginPage.status, 200, 'should reach login page');
  assert.match(await loginPage.text(), /Dev Login/, 'should serve login form');

  // Step 2: Submit login — follow redirects until the callback URL is reached.
  // Consent is auto-granted by the server so no user interaction is needed.
  const {finalUrl: callbackUrl} = await followRedirects(
    `${interactionUrl}/login`,
    {
      method: 'POST',
      body: 'sub=user1',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: jar.header(),
      },
    },
    jar,
    url => url.startsWith(REDIRECT_URI),
  );
  const code = new URL(callbackUrl).searchParams.get('code');
  assert.ok(code, 'callback should include authorization code');

  // Step 3: Exchange the code for tokens
  const tokenRes = await fetch(discovery.token_endpoint, {
    method: 'POST',
    headers: {'content-type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code_verifier: verifier,
    }),
  });
  assert.equal(tokenRes.status, 200, 'token endpoint should succeed');
  const tokens = await tokenRes.json();
  assert.ok(tokens.id_token, 'response should include id_token');

  // Step 4: Verify ID token claims
  const claims = decodeJwtPayload(tokens.id_token);
  assert.equal(claims.sub, 'user1');
  assert.equal(claims.name, 'Alice Example');
  assert.equal(claims.given_name, 'Alice');
  assert.equal(claims.family_name, 'Example');
  assert.equal(claims.email, 'alice@example.com');
  assert.equal(claims.email_verified, true);
  assert.equal(claims.iss, BASE);
  assert.equal(claims.aud, CLIENT_ID);
});
