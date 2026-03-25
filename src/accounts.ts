import * as oidc from 'oidc-provider';

export interface TestUser {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
  given_name: string;
  family_name: string;
}

export const TEST_USERS: TestUser[] = [
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

export async function findAccount(
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
