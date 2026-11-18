(() => {
  "use strict";
  const placements = Object.freeze({
    website_header: [".mtop .logo img", ".hc-brand img"],
    login_page: [".auth-brand-logo"],
    admin_dashboard: [".admin-centre-brand-mark"],
    browser_favicon: ["link[rel~='icon']"],
    application_icons: ["link[rel='apple-touch-icon']"],
    mobile_app: ['[data-brand-placement="mobile_app"]'],
    desktop_app: ['[data-brand-placement="desktop_app"]'],
    tablet_app: ['[data-brand-placement="tablet_app"]'],
    website_footer: ['[data-brand-placement="website_footer"]'],
    loading_screen: ['[data-brand-placement="loading_screen"]'],
    splash_screen: ['[data-brand-placement="splash_screen"]'],
    registration_page: ['[data-brand-placement="registration_page"]'],
    password_recovery_page: ['[data-brand-placement="password_recovery_page"]'],
    notifications: ['[data-brand-placement="notifications"]'],
    email_templates: ['[data-brand-placement="email_templates"]'],
    live_streaming: ['[data-brand-placement="live_streaming"]'],
    meetwave: ['[data-brand-placement="meetwave"]'],
    video_watermarks: ['[data-brand-placement="video_watermarks"]'],
    image_watermarks: ['[data-brand-placement="image_watermarks"]'],
    post_share_previews: ['[data-brand-placement="post_share_previews"]'],
    error_pages: ['[data-brand-placement="error_pages"]'],
    maintenance_pages: ['[data-brand-placement="maintenance_pages"]'],
    promotional_pages: ['[data-brand-placement="promotional_pages"]']
  });
  function apply(item) {
    if (!item || !item.placementKey || !/^https:\/\//i.test(String(item.url || ""))) return;
    const key = String(item.placementKey);
    const mime = String(item.mimeType || "").toLowerCase();
    if (!mime.startsWith("image/")) return;
    const selectors = placements[key] || [];
    const combined = [...selectors, '[data-brand-placement="' + CSS.escape(key) + '"]'].join(",");
    let targets = [];
    try { targets = Array.from(document.querySelectorAll(combined)); } catch { return; }
    targets.forEach(target => {
      if (target instanceof HTMLImageElement) {
        target.src = item.url;
        target.removeAttribute("srcset");
        if (item.title) target.alt = item.title;
      } else if (target instanceof HTMLLinkElement && target.rel.toLowerCase().includes("icon")) {
        target.href = item.url;
        target.type = mime;
      } else if (target instanceof HTMLLinkElement) {
        target.href = item.url;
      } else {
        const image = target.querySelector("img");
        if (image) {
          image.src = item.url;
          image.removeAttribute("srcset");
          if (item.title) image.alt = item.title;
        }
      }
    });
  }
  async function refresh() {
    try {
      const response = await fetch("/api/brand/manifest", {
        method: "GET", credentials: "same-origin", cache: "no-store",
        headers: { Accept: "application/json" }
      });
      if (!response.ok) return;
      const payload = await response.json();
      if (!Array.isArray(payload?.placements)) return;
      payload.placements.forEach(apply);
      window.dispatchEvent(new CustomEvent("minglora:brand-manifest-ready", {
        detail: { updatedAt: payload.updatedAt || null, count: payload.placements.length }
      }));
    } catch {
      // A manifest failure leaves the existing, verified source branding unchanged.
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", refresh, { once: true });
  } else {
    refresh();
  }
})();
