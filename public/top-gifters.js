(() => {
  "use strict";

  const periods = [
    ["daily", "Daily"],
    ["weekly", "Weekly"],
    ["monthly", "Monthly"],
    ["all_time", "All time"]
  ];
  let activePeriod = "daily";
  let loading = false;

  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
  const count = value => Number(value || 0).toLocaleString();
  const titleFor = position => position === 1 ? "TOP GIFTER" :
    position <= 3 ? "TOP 3 GIFTER" : position <= 10 ? "TOP 10 GIFTER" : "LIVE GIFTER";

  function addTopGiftersTab() {
    const nav = document.querySelector(".live-discovery-board .live-discovery-tabs");
    if (!nav || nav.querySelector("[data-live-discovery='top-gifters']")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.liveDiscovery = "top-gifters";
    button.textContent = "Top Gifters";
    button.setAttribute("aria-label", "Open Top Gifters leaderboard");
    nav.append(button);
  }

  function periodControls() {
    return "<div class='minglora-gifter-periods' role='group' aria-label='Top Gifters period'>" +
      periods.map(([value, label]) =>
        "<button type='button' data-live-gifter-period='" + value + "' aria-pressed='" +
        String(value === activePeriod) + "' class='" + (value === activePeriod ? "is-active" : "") +
        "'>" + label + "</button>"
      ).join("") + "</div>";
  }

  function gifterRow(item, index) {
    const position = Number(item.position || index + 1);
    const user = item.user || {};
    const earned = item.gifterBadge?.badgeName || item.badgeName || "";
    const avatar = user.avatarUrl || user.avatar_url || user.avatar || user.profilePicture || "";
    const image = avatar
      ? "<img src='" + escapeHtml(avatar) + "' alt='' loading='lazy' referrerpolicy='no-referrer'>"
      : "<span class='minglora-gifter-avatar' aria-hidden='true'>" +
        escapeHtml((user.name || item.name || user.username || item.username || "M").slice(0, 1).toUpperCase()) + "</span>";
    return "<article class='minglora-gifter-row'>" +
      "<span class='minglora-gifter-rank'>#" + position + "</span>" + image +
      "<span class='minglora-gifter-person'><strong>" +
      escapeHtml(user.name || item.name || user.username || item.username || "Minglora member") +
      "</strong><small>@" + escapeHtml(user.username || item.username || "member") + "</small>" +
      (earned ? "<small class='minglora-gifter-earned'>" + escapeHtml(earned) + "</small>" : "") +
      "</span><span class='minglora-gifter-title'>" + titleFor(position) +
      "</span><strong class='minglora-gifter-coins'>" + count(item.points ?? item.coinsSent) +
      "<small>Coins sent</small></strong><button type='button' class='minglora-gifter-profile' data-top-gifter-profile='" +
      escapeHtml(user.id || item.userId || "") + "'>Profile</button></article>";
  }

  async function loadLeaderboard() {
    const root = document.getElementById("live-discovery-content");
    if (!root || loading) return;
    loading = true;
    root.innerHTML = "<div class='live-ranking-heading'><strong>Top Gifters</strong><small>Loading confirmed LIVE gift rankings…</small></div>" + periodControls();
    try {
      const response = await fetch("/api/live/rankings/top-gifters?period=" + encodeURIComponent(activePeriod), {
        credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Top Gifters could not be loaded.");
      const items = Array.isArray(data.leaderboard) ? data.leaderboard.slice(0, 20) : [];
      root.innerHTML =
        "<div class='live-ranking-heading'><strong>Top Gifters</strong><small>" +
        "Ranked by real, confirmed LIVE Coins sent · " + escapeHtml(activePeriod === "all_time" ? "All time" : activePeriod) +
        " · " + escapeHtml(data.timeZone || "member timezone") + "</small></div>" +
        periodControls() +
        (items.length
          ? "<div class='minglora-gifter-list'>" + items.map(gifterRow).join("") + "</div>"
          : "<div class='minglora-gifter-empty'><strong>No LIVE gifters ranked yet</strong><p>Confirmed LIVE gifts will appear here. Failed, duplicate and refunded gifts never count.</p></div>");
      root.querySelectorAll("[data-top-gifter-profile]").forEach(button => {
        button.addEventListener("click", () => {
          const userId = button.dataset.topGifterProfile;
          if (userId && typeof window.openProfile === "function") window.openProfile(userId);
        });
      });
      root.querySelectorAll("[data-live-gifter-period]").forEach(button => {
        button.addEventListener("click", () => {
          activePeriod = button.dataset.liveGifterPeriod;
          void loadLeaderboard();
        });
      });
      document.querySelectorAll("[data-live-discovery]").forEach(button =>
        button.classList.toggle("active", button.dataset.liveDiscovery === "top-gifters"));
    } catch (error) {
      root.innerHTML = "<div class='live-ranking-heading'><strong>Top Gifters</strong></div>" +
        periodControls() + "<p class='muted'>" + escapeHtml(error.message || "Top Gifters are temporarily unavailable.") + "</p>";
      root.querySelectorAll("[data-live-gifter-period]").forEach(button =>
        button.addEventListener("click", () => {
          activePeriod = button.dataset.liveGifterPeriod;
          void loadLeaderboard();
        })
      );
    } finally {
      loading = false;
    }
  }

  document.addEventListener("click", event => {
    const button = event.target.closest("[data-live-discovery='top-gifters']");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    activePeriod = "daily";
    void loadLeaderboard();
  }, true);

  const observer = new MutationObserver(addTopGiftersTab);
  const start = () => {
    const main = document.getElementById("main-content");
    if (main) {
      observer.observe(main, { childList: true, subtree: true });
      addTopGiftersTab();
    }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
