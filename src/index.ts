import {IncomingMessage} from 'node:http';
import * as oidc from 'oidc-provider';

interface TestUser {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
  given_name: string;
  family_name: string;
}

const TEST_USERS: TestUser[] = [
  {
    sub: 'user1',
    email: 'alice@example.com',
    email_verified: true,
    name: 'Alice Example',
    given_name: 'Alice',
    family_name: 'Example',

  },
  {
    sub: 'user2',
    email: 'bob@example.com',
    email_verified: false,
    name: 'Bob Example',
    given_name: 'Bob',
    family_name: 'Example',

  },
];

const usersBySub = new Map(TEST_USERS.map(u => [u.sub, u]));

async function findAccount(
  _ctx: oidc.KoaContextWithOIDC,
  sub: string,
): Promise<oidc.Account | undefined> {
  const user = usersBySub.get(sub);
  if (!user) return undefined;

  return {
    accountId: sub,
    async claims(_use, scope) {
      const claims: oidc.AccountClaims = {sub};
      if (scope.includes('email')) {
        claims.email = user.email;
        claims.email_verified = user.email_verified;
      }
      if (scope.includes('profile')) {
        claims.name = user.name;
        claims.given_name = user.given_name;
        claims.family_name = user.family_name;
      }
      return claims;
    },
  };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => (data += chunk));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function loginForm(uid: string, users: TestUser[]): string {
  const buttons = users
    .map(
      u =>
        `<button name="sub" value="${u.sub}">${u.name} &lt;${u.email}&gt;</button>`,
    )
    .join('\n');
  return `<!DOCTYPE html>
<html><body>
<h1>Dev Login</h1>
<form method="POST" action="/interaction/${uid}/login">
  ${buttons}
</form>
</body></html>`;
}

const issuer = process.env.OIDC_ISSUER ?? 'http://oidc-dev-server:31389';

const provider = new oidc.Provider(issuer, {
  findAccount,
  cookies: {
    keys: [process.env.COOKIE_SECRET ?? 'dev-cookie-secret'],
  },
  clients: [
    {
      client_id: 'acurement',
      client_secret: 'acurement',
      grant_types: ['client_credentials'],
      redirect_uris: [],
    },
    {
      client_id: 'benefitall',
      client_secret: 'benefitall',
      redirect_uris: ['http://localhost:5173/auth/callback'],
    },
  ],
});

// Interaction routes — must run before oidc-provider's own middleware
provider.use(async (ctx, next) => {
  const loginGet = ctx.path.match(/^\/interaction\/([^/]+)$/);
  const loginPost = ctx.path.match(/^\/interaction\/([^/]+)\/login$/);

  if (loginGet && ctx.method === 'GET') {
    const details = await provider.interactionDetails(ctx.req, ctx.res);

    if (details.prompt.name === 'login') {
      ctx.type = 'html';
      ctx.body = loginForm(loginGet[1], TEST_USERS);
      return;
    }

    if (details.prompt.name === 'consent') {
      // Auto-grant all requested scopes/claims for dev convenience
      const {session, params, prompt, grantId} = details;
      const grant = grantId
        ? (await provider.Grant.find(grantId))!
        : new provider.Grant({
            accountId: session!.accountId,
            clientId: params.client_id as string,
          });

      const missing = prompt.details as {
        missingOIDCScope?: string[];
        missingOIDCClaims?: string[];
        missingResourceScopes?: Record<string, string[]>;
      };
      if (missing.missingOIDCScope)
        grant.addOIDCScope(missing.missingOIDCScope.join(' '));
      if (missing.missingOIDCClaims)
        grant.addOIDCClaims(missing.missingOIDCClaims);
      if (missing.missingResourceScopes)
        for (const [indicator, scopes] of Object.entries(
          missing.missingResourceScopes,
        ))
          grant.addResourceScope(indicator, scopes.join(' '));

      const savedGrantId = await grant.save();
      await provider.interactionFinished(ctx.req, ctx.res, {
        consent: {grantId: savedGrantId},
      });
      return;
    }
  }

  if (loginPost && ctx.method === 'POST') {
    const params = new URLSearchParams(await readBody(ctx.req));
    const user = usersBySub.get(params.get('sub') ?? '');
    if (!user) {
      ctx.status = 400;
      ctx.body = 'Unknown user';
      return;
    }
    await provider.interactionFinished(ctx.req, ctx.res, {
      login: {accountId: user.sub},
    });
    return;
  }

  await next();
});

provider.listen(31389, () => {
  console.log(
    'oidc-provider listening on port 31389, check http://localhost:31389/.well-known/openid-configuration',
  );
});
