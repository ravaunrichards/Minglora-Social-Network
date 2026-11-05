(() => {
  "use strict";

  const state = { overview: null, selectedLevel: 1 };
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
      credentials: "same-origin",
      headers: { "Accept": "application/json" }
    });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) throw new Error(data.error || "Gifter progression could not be loaded.");
    return data;
  }

  function badgeMarkup(level, tier, small = false) {
    const numericLevel = Math.max(1, Math.min(50, Math.floor(Number(level) || 1)));
    const tierBand = Math.ceil(numericLevel / 5);
    const badgeName = (typeof tier === "string" ? tier + " Gifter · " : "Gifter · ") + "LV " + numericLevel;
    const art = window.MingloraGifterBadgeArt;
    if (art?.render) return art.render({
      level: numericLevel, tier: tierBand, badgeName, compact: small
    });
    const className = "gp-badge" + (small ? " gp-badge--small" : "");
    return "<span class='" + className + " gp-tier-" + tierBand + "' aria-label='" +
      esc(badgeName) + "'><strong>LV " + number(numericLevel) + "</strong><small>GIFTER</small></span>";
  }

  function levelCard(item) {
    const classes = [
      "gp-level-card",
      item.unlocked ? "is-unlocked" : "is-locked",
      item.current ? "is-current" : ""
    ].filter(Boolean).join(" ");
    return "<button type='button' class='" + classes + "' data-gp-level='" + item.level + "' aria-pressed='" +
      (item.current ? "true" : "false") + "'>" +
      badgeMarkup(item.level, item.tier, true) +
      "<span class='gp-level-card-copy'><strong>LV " + item.level + "</strong><small>" +
      number(item.coinsRequired ?? item.xpRequired) + " Coins</small></span>" +
      (item.unlocked ? "<span class='gp-level-state' aria-label='Unlocked'>✓</span>" : "<span class='gp-level-state' aria-label='Locked'>⌑</span>") +
      "</button>";
  }

  function detailMarkup(item, current) {
    if (!item) return "";
    return "<div class='gp-selected-badge'>" + badgeMarkup(item.level, item.tier) +
      "<div><span class='gp-eyebrow'>" + (item.unlocked ? "UNLOCKED BADGE" : "LOCKED BADGE") +
      "</span><h3>" + esc(item.badgeName) + "</h3><p>" + esc(item.reward) + "</p>" +
      "<small>Lifetime requirement: " + number(item.coinsRequired ?? item.xpRequired) + " Coins sent</small></div></div>" +
      (item.level === current.level
        ? "<p class='gp-selected-note'>This is your current badge.</p>"
        : item.unlocked
          ? "<p class='gp-selected-note'>You have already unlocked this badge.</p>"
          : "<p class='gp-selected-note'>You need " + number(Math.max(0, (item.coinsRequired ?? item.xpRequired) - current.xp)) + " more Coins to unlock this badge.</p>");
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
      (window.MingloraGifterBadgeArt?.render ? window.MingloraGifterBadgeArt.render({
        level: item.level, tier: Math.ceil(Number(item.level) / 5), badgeName: item.badgeName, inline: true
      }) : "<span class='gp-inline-badge'><strong>" + item.level + "</strong></span>") +
      "</span><small>@" + esc(item.username) + "</small></span><strong class='gp-leader-xp'>" +
      number(item.xp) + " Coins sent</strong></article>"
    ).join("") + "</div>";
  }

  function renderMarkup(data) {
    const current = data.current;
    const selected = (data.levels || []).find(item => item.level === state.selectedLevel) ||
      (data.levels || []).find(item => item.current);
    const progressText = current.maxLevel
      ? "You have reached the maximum gifter LV."
      : number(current.xpRemaining) + " Coins to LV " + current.nextLevel;
    const level25 = (data.levels || []).find(item => item.level === 25);
    const chart = (data.levels || []).map(levelCard).join("");
    const leaderboard = renderLeaderboard(data.leaderboard || [], { ...current, userId: data.viewerId });

    return "<div class='gp-page'>" +
      "<header class='gp-heading'><div><span class='gp-eyebrow'>MINGLORA GIFTER JOURNEY</span><h1>Gifter Level &amp; Badges</h1>" +
      "<p>Every confirmed gift you send moves your own Minglora gifter journey forward.</p></div>" +
      "<button type='button' class='gp-back-link' id='gp-back-gifts'>← Back to Gifts</button></header>" +
      "<section class='gp-hero card'><div class='gp-hero-summary'>" +
      "<span class='gp-eyebrow'>YOUR CURRENT BADGE</span><div class='gp-current-badge-row'>" +
      badgeMarkup(current.level, current.tier) +
      "<div><h2>LV " + current.level + " · " + esc(current.tier) + "</h2><p>" + esc(current.badgeName) + "</p>" +
      "<span class='gp-rank-chip'>" + (current.rankPosition ? "Community rank #" + current.rankPosition : "Not ranked yet") + "</span></div></div>" +
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
      "<p>Tap any LV badge to see the total Coins needed to unlock it.</p></div><span class='gp-level-count'>LV " + current.level + " / 50</span></div>" +
      "<div class='gp-selected-level' id='gp-selected-level'>" + detailMarkup(selected, current) + "</div>" +
      "<div class='gp-level-grid' id='gp-level-grid'>" + chart + "</div></section>" +
      "<section class='gp-level25 card'><div class='gp-level25-emblem'>LV 25</div><div class='gp-level25-copy'><span class='gp-eyebrow'>SPECIAL MILESTONE</span><h2>LV 25 · LIVE Entrance Badge</h2><p>Reach LV 25 to unlock your special Minglora LIVE entrance badge and recognition.</p><strong>" + (level25?.unlocked ? "✓ Unlocked" : number(Math.max(0, (level25?.coinsRequired ?? level25?.xpRequired ?? 0) - current.xp)) + " Coins remaining") + "</strong></div></section>" +
      "<div class='gp-lower-grid'><section class='gp-section card'><div class='gp-section-heading'><div><span class='gp-eyebrow'>YOUR ACTIVITY</span><h2>Recent gifts</h2>" +
      "<p>Only successful, server-confirmed gifts are shown.</p></div></div>" + renderHistory(data.history || []) + "</section>" +
      "<section class='gp-section card'><div class='gp-section-heading'><div><span class='gp-eyebrow'>COMMUNITY STANDINGS</span><h2>Top gifters</h2>" +
      "<p>Ranked by confirmed lifetime Coins sent.</p></div></div>" + renderLeaderboard(data.leaderboard || [], { ...current, userId: data.viewerId }) + "</section></div>" +
      "<section class='gp-rules card'><div><span class='gp-eyebrow'>HOW IT WORKS</span><h2>How gifter LV is earned</h2></div>" +
      "<div class='gp-rule-grid'><article><strong>01 · Send a gift</strong><p>Member gifts and LIVE gifts count after Minglora confirms the transaction.</p></article>" +
      "<article><strong>02 · Earn Coins</strong><p>Each Minglora Coin spent on a confirmed gift adds one point to your lifetime gifter progress.</p></article>" +
      "<article><strong>03 · Unlock badges</strong><p>Coin totals are lifetime-based. Your earned LV badges stay unlocked as you progress.</p></article></div>" +
      "<p class='gp-rule-note'>Coin purchases, gifts you receive, failed sends and duplicate transactions do not increase gifter progression. This gifter track is separate from Creator Leagues.</p></section>" +
      "</div>";
  }

  function bindPage(data) {
    document.getElementById("gp-back-gifts")?.addEventListener("click", () => window.activateNav?.("gifts"));
    document.getElementById("gp-level-grid")?.addEventListener("click", event => {
      const button = event.target.closest("[data-gp-level]");
      if (!button) return;
      state.selectedLevel = Number(button.dataset.gpLevel);
      const item = (data.levels || []).find(level => level.level === state.selectedLevel);
      const target = document.getElementById("gp-selected-level");
      if (target) target.innerHTML = detailMarkup(item, data.current);
      document.querySelectorAll("[data-gp-level]").forEach(node => {
        const active = Number(node.dataset.gpLevel) === state.selectedLevel;
        node.classList.toggle("is-current", active && state.selectedLevel === data.current.level);
        node.setAttribute("aria-pressed", active ? "true" : "false");
      });
    });
  }

  async function render() {
    const main = document.getElementById("main-content");
    if (!main) return;
    main.innerHTML = "<section class='card gp-loading'><strong>Loading your gifter progression…</strong><p>Checking confirmed Minglora gifts.</p></section>";
    state.overview = await requestOverview();
    window.dispatchEvent(new CustomEvent('minglora:gifter-badge-updated',{detail:{badge:state.overview.badge||null}}));
    state.selectedLevel = state.overview.current.level;
    main.innerHTML = renderMarkup(state.overview);
    bindPage(state.overview);
  }

  window.MingloraGifterProgression = { render };
})();