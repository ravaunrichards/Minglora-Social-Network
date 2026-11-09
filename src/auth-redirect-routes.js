export function parseAuthRedirectAllowList(value) {
  return [...new Set(String(value || '').split(',').map(item => item.trim()).filter(Boolean))];
}

export function createMingloraAuthRouteState(config = {}, appSiteUrl, providerCallbackUrl) {
  const siteOrigin = new URL(appSiteUrl).origin;
  const siteRedirectUrl = new URL('/', siteOrigin).toString();
  const appRedirectUrl = new URL('/auth/oauth/callback', siteOrigin).toString();
  const allowedRedirectUrls = parseAuthRedirectAllowList(config.uri_allow_list);
  return {
    providerCallbackUrl,
    appSiteUrl: siteOrigin,
    siteRedirectUrl,
    appRedirectUrl,
    configuredSiteUrl: String(config.site_url || ''),
    allowedRedirectUrls,
    redirectReady:
      String(config.site_url || '').replace(/\\/+$/, '') === siteOrigin &&
      allowedRedirectUrls.includes(siteRedirectUrl) &&
      allowedRedirectUrls.includes(appRedirectUrl)
  };
}

export function buildMingloraAuthRoutePatch(config = {}, appSiteUrl) {
  const siteOrigin = new URL(appSiteUrl).origin;
  const siteRedirectUrl = new URL('/', siteOrigin).toString();
  const appRedirectUrl = new URL('/auth/oauth/callback', siteOrigin).toString();
  const allowedRedirectUrls = parseAuthRedirectAllowList(config.uri_allow_list);
  for (const requiredUrl of [siteRedirectUrl, appRedirectUrl]) {
    if (!allowedRedirectUrls.includes(requiredUrl)) allowedRedirectUrls.push(requiredUrl);
  }

  const patch = {};
  if (String(config.site_url || '').replace(/\\/+$/, '') !== siteOrigin) {
    patch.site_url = siteOrigin;
  }
  if (String(config.uri_allow_list || '') !== allowedRedirectUrls.join(',')) {
    patch.uri_allow_list = allowedRedirectUrls.join(',');
  }
  return patch;
}
