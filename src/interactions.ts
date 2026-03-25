import {IncomingMessage} from 'node:http';
import * as oidc from 'oidc-provider';
import {TestUser} from './accounts.js';

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

export function registerInteractionRoutes(
  provider: oidc.Provider,
  users: TestUser[],
): void {
  const usersBySub = new Map(users.map(u => [u.sub, u]));

  provider.use(async (ctx, next) => {
    const loginGet = ctx.path.match(/^\/interaction\/([^/]+)$/);
    const loginPost = ctx.path.match(/^\/interaction\/([^/]+)\/login$/);

    if (loginGet && ctx.method === 'GET') {
      const details = await provider.interactionDetails(ctx.req, ctx.res);

      if (details.prompt.name === 'login') {
        ctx.type = 'html';
        ctx.body = loginForm(loginGet[1], users);
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
}
