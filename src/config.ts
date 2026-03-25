export const PORT = parseInt(process.env.PORT ?? '31389', 10);
export const issuer = process.env.OIDC_ISSUER ?? `http://oidc-dev-server:${PORT}`;

// Browser-facing base URL may differ from the internal issuer when running behind
// a port-forward or in Codespaces. Only browser-redirect endpoints need rewriting;
// token/JWKS endpoints are always called server-to-server.
function detectBrowserBaseUrl(): string {
  if (process.env.OIDC_BROWSER_BASE_URL) return process.env.OIDC_BROWSER_BASE_URL;
  const codespaceName = process.env.CODESPACE_NAME;
  const codespaceDomain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
  if (codespaceName && codespaceDomain) {
    return `https://${codespaceName}-${PORT}.${codespaceDomain}`;
  }
  return `http://localhost:${PORT}`;
}

export const browserBaseUrl = detectBrowserBaseUrl();
