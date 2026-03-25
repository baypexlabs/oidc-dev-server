# oidc-dev-server

A minimal OIDC provider for use in Baypex devcontainers and local Docker Compose stacks. Not for production.

## Adding to a project

In your project's `compose.yml`:

```yaml
services:
  oidc-dev-server:
    image: ghcr.io/baypexlabs/oidc-dev-server:latest
    ports:
      - "31389:31389"
    environment:
      OIDC_ISSUER: http://oidc-dev-server:31389

  your-app:
    # ...
    environment:
      OIDC_ISSUER: http://oidc-dev-server:31389
```

`OIDC_ISSUER` is the URL other containers use to reach the provider (service-to-service). The discovery document at `/.well-known/openid-configuration` advertises browser-facing endpoints (`authorization_endpoint`, `end_session_endpoint`) on `http://localhost:31389` instead, so the user's browser can reach them without knowing the internal hostname.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `OIDC_ISSUER` | `http://oidc-dev-server:31389` | Internal issuer URL (used in tokens and for server-to-server calls) |
| `OIDC_BROWSER_BASE_URL` | `http://localhost:PORT` | Override the browser-facing base URL |
| `PORT` | `31389` | Listening port |
| `COOKIE_SECRET` | `dev-cookie-secret` | Cookie signing key |

In GitHub Codespaces the browser base URL is detected automatically from `CODESPACE_NAME` and `GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN`.

## Pre-configured clients

| `client_id` | Grant | Redirect URI |
|---|---|---|
| `benefitall` | `authorization_code` | `http://localhost:5173/auth/callback` |
| `acurement` | `client_credentials` | — |

All clients use their `client_id` as their `client_secret`.

## Login UI

When an `authorization_code` flow requires user interaction the provider renders a minimal login page listing the available test users as buttons. Clicking one logs in as that user. Consent is auto-granted, so no consent screen appears.

### Test users

| `sub` | Name | Email | `email_verified` |
|---|---|---|---|
| `user1` | Alice Example | alice@example.com | ✓ |
| `user2` | Bob Example | bob@example.com | — |

Test users are defined in `src/accounts.ts`.
