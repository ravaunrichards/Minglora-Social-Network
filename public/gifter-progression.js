(() => {
  "use strict";

  const state = { overview: null };
  let refreshInFlight = false;
  let viewGeneration = 0;
  let autoSyncTimer = null;

  const BADGE_LEVEL_PANELS = Object.freeze([
    { file: "levels-1-4.jpg", alt: "Minglora Gifter badge levels 1–4" },
    { file: "levels-5-9.jpg", alt: "Minglora Gifter badge levels 5–9" },
    { file: "levels-10-14.jpg", alt: "Minglora Gifter badge levels 10–14" },
    { file: "levels-15-19.jpg", alt: "Minglora Gifter badge levels 15–19" },
    { file: "levels-20-24.jpg", alt: "Minglora Gifter badge levels 20–24" },
    { file: "levels-25-29.jpg", alt: "Minglora Gifter badge levels 25–29" },
    { file: "levels-30-34.jpg", alt: "Minglora Gifter badge levels 30–34" },
    { file: "levels-35-39.jpg", alt: "Minglora Gifter badge levels 35–39" },
    { file: "levels-40-44.jpg", alt: "Minglora Gifter badge levels 40–44" },
    { file: "levels-45-49.jpg", alt: "Minglora Gifter badge levels 45–49" },
    { file: "levels-50.jpg", alt: "Minglora Gifter badge level 50", final: true }
  ]);

  function isGifterViewActive() {
    return Boolean(document.querySelector("#main-content .gp-page"));
  }

  function onNavigateAway() {
    viewGeneration += 1;
    if (autoSyncTimer !== null) window.clearInterval(autoSyncTimer);
    autoSyncTimer = null;
  }

  function publishBadge(overview) {
    window.dispatchEvent(new CustomEvent("minglora:gifter-badge-updated", { detail: {
      badge: overview.badge || null,
      newGifterIdentity: overview.newGifterIdentity || null
    }}));
  }

  async function refreshOverview() {
    if (refreshInFlight || !isGifterViewActive() || document.visibilityState !== "visible") return;
    refreshInFlight = true;
    const generation = viewGeneration;
    try {
      const overview = await requestOverview();
      if (generation !== viewGeneration || !isGifterViewActive()) return;
      state.overview = overview;
      const main = document.getElementById("main-content");
      if (!main) return;
      const focused = document.activeElement;
      if (focused && main.contains(focused)) return;
      const mainScrollTop = main.scrollTop;
      const windowScrollX = window.scrollX || 0;
      const windowScrollY = window.scrollY || 0;
      const incomingRoot = document.createElement("div");
      incomingRoot.innerHTML = renderMarkup(overview);
      const incomingPage = incomingRoot.firstElementChild;
      const currentPage = main.querySelector(".gp-page");
      if (currentPage && incomingPage) currentPage.replaceWith(incomingPage);
      else main.innerHTML = renderMarkup(overview);
      main.scrollTop = mainScrollTop;
      window.scrollTo(windowScrollX, windowScrollY);
      bindPage();
      publishBadge(overview);
    } catch (error) {
      console.warn("[Minglora Gifter Progression] Automatic sync failed:", error?.message || error);
    } finally {
      refreshInFlight = false;
    }
  }

  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
  const number = value => Number(value || 0).toLocaleString();
  const date = value => {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "Date unavailable" : parsed.toLocaleString();
  };

  async function requestOverview() {
    const response = await fetch("/api/gifter-progression/overview", {
      cache: "no-store",
      credentials: "same-origin",
      headers: { "Accept": "application/json" }
    });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) throw new Error(data.error || "Gifter progression could not be loaded.");
    return data;
  }

  function renderBadgePanels() {
    return "<div class='gp-art-panel-stack' aria-label='Original Gifter Badge Levels artwork'>" +
      BADGE_LEVEL_PANELS.map(panel =>
        "<figure class='gp-art-panel" + (panel.final ? " gp-art-panel--final" : "") + "'>" +
        "<img src='/assets/gifter-badge-level-panels/" + panel.file + "' alt='" +
        esc(panel.alt) + "' loading='lazy' decoding='async'>" +
        "</figure>"
      ).join("") + "</div>";
  }

  function renderLevelDirectory(items) {
    const ordered = [...items].sort((a, b) => Number(a.level) - Number(b.level));
    return "<section class='gp-level-directory card' aria-labelledby='gp-level-directory-title'>" +
      "<div class='gp-level-directory-heading'><div><span class='gp-eyebrow'>ORDERED REFERENCE</span>" +
      "<h2 id='gp-level-directory-title'>Levels &amp; badge names</h2>" +
      "<p>All 50 levels in sequence. This text directory is separate from the original artwork above.</p></div>" +
      "<div class='gp-level-layout-controls' role='group' aria-label='Level directory orientation'>" +
      "<button type='button' class='gp-level-layout-button is-active' data-gp-level-layout='horizontal' aria-pressed='true'>Horizontal</button>" +
      "<button type='button' class='gp-level-layout-button' data-gp-level-layout='vertical' aria-pressed='false'>Vertical</button></div></div>" +
      "<div class='gp-level-index-grid' id='gp-level-index-grid' data-layout='horizontal'>" +
      ordered.map(item => {
        const stateLabel = item.current ? "Current" : item.adminAwarded ? "Admin awarded" : item.unlocked ? "Unlocked" : "Locked";
        const stateClass = item.current ? "is-current" : item.adminAwarded ? "is-admin-awarded" : item.unlocked ? "is-unlocked" : "is-locked";
        return "<article class='gp-level-index-item " + stateClass + "'>" +
          "<span class='gp-level-index-level'>LV " + number(item.level) + "</span>" +
          "<strong class='gp-level-index-badge'>" + esc(item.tier || "Gifter") + " Gifter</strong>" +
          "<small class='gp-level-index-coins'>" + number(item.coinsRequired ?? item.xpRequired) + " Coins required</small>" +
          "<span class='gp-level-index-state'>" + stateLabel + "</span></article>";
      }).join("") + "</div></section>";
  }

  function renderHistory(items) {
    if (!items.length) {
      return "<div class='gp-empty'><span>🎁</span><strong>No confirmed gifts sent yet</strong><p>Your real gifting activity will appear here after a gift is successfully sent.</p></div>";
    }
    return "<div class='gp-history-list'>" + items.map(item =>
      "<article class='gp-history-row'><span class='gp-history-icon'>🎁</span><div class='gp-history-copy'><strong>" +
      esc(item.giftName) + "</strong><small>To @" + esc(item.recipientUsername || "member") + " · " +
      (item.contextType === "live" ? "LIVE gift" : "Member gift") + "</small><small>" + esc(date(item.createdAt)) +
      "</small></div><strong class='gp-history-xp'>+" + number(item.coinAmount) + " Coins</strong></article>"
    ).join("") + "</div>";
  }

  function renderLeaderboard(items, current) {
    if (!items.length) {
      return "<div class='gp-empty'><span>🏅</span><strong>The leaderboard is waiting for its first gifter</strong><p>Only members with confirmed gifts appear here.</p></div>";
    }
    return "<div class='gp-leaderboard-list'>" + items.map(item =>
      "<article class='gp-leader-row " + (item.userId === current.userId ? "is-you" : "") + "'>" +
      "<span class='gp-rank-number'>" + item.rank + "</span>" +
      "<span class='gp-leader-avatar'>" + esc((item.name || item.username || "M").slice(0, 1).toUpperCase()) + "</span>" +
      "<span class='gp-leader-copy'><span class='gp-leader-name'><strong>" + esc(item.name) + "</strong>" +
      "<span class='gp-leader-level'>LV " + number(item.level) + "</span>" +
      "</span><small>@" + esc(item.username) + "</small></span><strong class='gp-leader-xp'>" +
      number(item.xp) + " Coins sent</strong></article>"
    ).join("") + "</div>";
  }

  function renderMarkup(data) {
    const current = data.current;
    const progressText = current.maxLevel
      ? "You have reached the maximum gifter LV."
      : number(current.xpRemaining) + " Coins to LV " + current.nextLevel;
    const level25 = (data.levels || []).find(item => item.level === 25);
    const badgePanels = renderBadgePanels();
    const levelDirectory = renderLevelDirectory(data.levels || []);
    const leaderboard = renderLeaderboard(data.leaderboard || [], { ...current, userId: data.viewerId });
    const newGifterNotice = data.newGifterIdentity?.active
      ? "<p class='gp-new-gifter-notice'><strong>✦ NEW GIFTER</strong> identity active until " + esc(date(data.newGifterIdentity.expiresAt)) + "</p>"
      : "";

    return "<div class='gp-page'>" +
      "<header class='gp-heading'><div><span class='gp-eyebrow'>MINGLORA GIFTER JOURNEY</span><h1>Gifter Level &amp; Badges</h1>" +
      "<p>Every confirmed gift you send moves your own Minglora gifter journey forward.</p></div>" +
      "<div class='gp-heading-actions'><button type='button' class='gp-back-link' id='gp-back-gifts'>← Back to Gifts</button></div></header>" +
      "<section class='gp-hero card'><div class='gp-hero-art'><img class='gp-reference-art' src='/assets/Gifters%20Level%20Up.png' alt='Gifters Level Up chart' loading='eager' decoding='async'><a class='gp-chart-fullsize' href='/assets/Gifters%20Level%20Up.png' target='_blank' rel='noopener noreferrer' aria-label='Open the full-size Gifters Level Up chart in a new tab to zoom'>View full-size chart to zoom ↗</a></div><div class='gp-hero-summary'>" +
      "<span class='gp-eyebrow'>YOUR GIFTER STATUS</span><div class='gp-current-badge-row'><div class='gp-current-status-copy'>" +
      "<h2>" + (current.hasUnlockedBadge ? "LV " + current.level + " · " + esc(current.tier) : "No badge earned yet") + "</h2><p>" + (current.hasUnlockedBadge ? esc(current.badgeName) : "Your gifter levels are locked until you send gifts.") + "</p>" +
      "<span class='gp-rank-chip'>" + (current.rankPosition ? "Community rank #" + current.rankPosition : "Not ranked yet") + "</span></div></div>" +
      newGifterNotice +
      "<div class='gp-progress-heading'><strong>" + (current.maxLevel ? "Maximum level reached" : "Progress to LV " + current.nextLevel) +
      "</strong><span>" + number(current.xp) + " Coins</span></div><div class='gp-progress-track' role='progressbar' aria-valuemin='0' aria-valuemax='100' aria-valuenow='" +
      current.progressPercent + "'><span style='width:" + current.progressPercent + "%'></span></div>" +
      "<p class='gp-progress-foot'>" + esc(progressText) + "</p></div></section>" +
      "<section class='gp-stats-grid' aria-label='Gifter statistics'>" +
      "<article class='gp-stat-card'><span>Total Coins sent</span><strong>" + number(current.totalCoinsSent) + "</strong><small>Lifetime Coins from confirmed gifts</small></article>" +
      "<article class='gp-stat-card'><span>Coins to next LV</span><strong>" + (current.maxLevel ? "MAX" : number(current.xpRemaining)) + "</strong><small>" + (current.maxLevel ? "LV 50 reached" : "More Coins needed") + "</small></article>" +
      "<article class='gp-stat-card'><span>Gifts sent</span><strong>" + number(current.giftsSent) + "</strong><small>Unique confirmed transactions</small></article>" +
      "<article class='gp-stat-card'><span>Members supported</span><strong>" + number(current.uniqueRecipients) + "</strong><small>Different recipients</small></article></section>" +
      "<section class='gp-section card'><div class='gp-section-heading'><div><span class='gp-eyebrow'>THE FULL PROGRESSION</span><h2>LV 1–50</h2>" +
      "<p>Earn levels with confirmed gifts, or receive an admin-awarded badge. Admin awards do not count as Coins spent.</p></div><span class='gp-level-count'>LV " + current.level + " / 50</span></div>" +
      badgePanels + "</section>" +
      levelDirectory +
      "<section class='gp-level25 card'><div class='gp-level25-copy'><span class='gp-eyebrow'>SPECIAL MILESTONE</span><h2>LV 25 · LIVE Entrance Badge</h2><p>LV 25 unlocks special Minglora LIVE entrance recognition.</p><strong>" + (level25?.adminAwarded ? "✓ Unlocked by admin award" : level25?.unlocked ? "✓ Unlocked" : number(Math.max(0, (level25?.coinsRequired ?? level25?.xpRequired ?? 0) - current.xp)) + " Coins remaining") + "</strong></div></section>" +
      "<div class='gp-lower-grid'><section class='gp-section card'><div class='gp-section-heading'><div><span class='gp-eyebrow'>YOUR ACTIVITY</span><h2>Recent gifts</h2>" +
      "<p>Only successful, server-confirmed gifts are shown.</p></div></div>" + renderHistory(data.history || []) + "</section>" +
      "<section class='gp-section card'><div class='gp-section-heading'><div><span class='gp-eyebrow'>COMMUNITY STANDINGS</span><h2>Top gifters</h2>" +
      "<p>Ranked by confirmed lifetime Coins sent.</p></div></div>" + renderLeaderboard(data.leaderboard || [], { ...current, userId: data.viewerId }) + "</section></div>" +
      "<section class='gp-rules card'><div><span class='gp-eyebrow'>HOW IT WORKS</span><h2>How gifter LV is earned</h2></div>" +
      "<div class='gp-rule-grid'><article><strong>01 · Send a gift</strong><p>Member gifts and LIVE gifts count after Minglora confirms the transaction.</p></article>" +
      "<article><strong>02 · Earn Coins</strong><p>Each Minglora Coin spent on a confirmed gift adds one point to your lifetime gifter progress.</p></article>" +
      "<article><strong>03 · Unlock badges</strong><p>Gift spending unlocks levels through the published Coin thresholds. An authorized admin may separately grant a level or unlock all 50 badges; these awards are clearly marked and never add Coin spend.</p></article></div>" +
      "<p class='gp-rule-note'>NEW GIFTER appears after your first confirmed gift and remains active for 7 days from that first gift. The timer does not restart when you send more gifts. Coin purchases, gifts you receive, failed sends and duplicate transactions do not increase gifter progression. Admin-awarded badges do not add Coin spend. A badge reset starts a new progression period but retains lifetime gift history. This gifter track is separate from Creator Leagues.</p></section>" +
      "</div>";
  }

  function bindPage() {
    document.getElementById("gp-back-gifts")?.addEventListener("click", () => window.activateNav?.("gifts"));
    const levelGrid = document.getElementById("gp-level-index-grid");
    levelGrid?.parentElement?.querySelector(".gp-level-layout-controls")?.addEventListener("click", event => {
      const button = event.target.closest("[data-gp-level-layout]");
      if (!button || !levelGrid) return;
      const layout = button.dataset.gpLevelLayout === "vertical" ? "vertical" : "horizontal";
      levelGrid.dataset.layout = layout;
      levelGrid.parentElement?.querySelectorAll("[data-gp-level-layout]").forEach(control => {
        const active = control === button;
        control.classList.toggle("is-active", active);
        control.setAttribute("aria-pressed", active ? "true" : "false");
      });
    });
  }

  async function render() {
    onNavigateAway();
    const generation = ++viewGeneration;
    const main = document.getElementById("main-content");
    if (!main) return;
    main.innerHTML = "<section class='card gp-loading' role='status' aria-live='polite'><strong>Loading your gifter progression…</strong><p>Checking confirmed Minglora gifts.</p></section>";
    try {
      const overview = await requestOverview();
      if (generation !== viewGeneration) return;
      if (!overview || !overview.current || !Array.isArray(overview.levels) || overview.levels.length !== 50) {
        throw new Error("Minglora returned incomplete gifter progression data. Please retry.");
      }
      state.overview = overview;
      main.innerHTML = renderMarkup(overview);
      bindPage();
      publishBadge(overview);
      autoSyncTimer = window.setInterval(() => void refreshOverview(), 30000);
    } catch (error) {
      if (generation !== viewGeneration) return;
      const message = error?.message || "Minglora could not load your confirmed gift progress.";
      main.innerHTML = "<section class='card gp-loading gp-load-error' role='alert'><strong>Your 50 gifter levels could not load</strong><p>" +
        esc(message) + "</p><div class='gp-load-actions'><button type='button' class='primary' id='gp-retry'>Try again</button><button type='button' class='gp-back-link' id='gp-error-back'>Back to Gifts</button></div></section>";
      document.getElementById("gp-retry")?.addEventListener("click", () => void render());
      document.getElementById("gp-error-back")?.addEventListener("click", () => window.activateNav?.("gifts"));
    }
  }

  // Gifter progression syncs quietly without interrupting the member's page.
  window.MingloraGifterProgression = { render, onNavigateAway };
})();