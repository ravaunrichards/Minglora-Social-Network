(() => {
  "use strict";
  const periods = [["daily","Today"],["weekly","This week"],["monthly","This month"],["all_time","All time"]];
  let activePeriod = "daily", requestNumber = 0, activeController = null;
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  const number = value => Number(value || 0).toLocaleString();
  const labelForPeriod = value => periods.find(([key]) => key === value)?.[1] || "Today";
  const DEFAULT_RANKING_AVATAR = "/assets/profile-defaults/enigma.png?v=20261116-enigma-brand-1";
  function safeAvatarUrl(user) {
    const value = String(user?.avatar || user?.avatarUrl || user?.avatar_url || user?.profilePicture || "").trim();
    return /^https:\/\//i.test(value) || /^\/(?!\/)/.test(value) ? value : DEFAULT_RANKING_AVATAR;
  }
  function avatarMarkup(user, className) {
    const name = String(user?.name || user?.username || "Minglora member");
    const initial = escapeHtml(name.slice(0,1).toUpperCase());
    const src = safeAvatarUrl(user);
    return src
      ? "<img class='" + className + "' src='" + escapeHtml(src) + "' alt='' loading='lazy' decoding='async' referrerpolicy='no-referrer'>"
      : "<span class='" + className + " ranking-avatar-fallback' aria-hidden='true'>" + initial + "</span>";
  }
  function podiumCard(item, place) {
    if (!item) return "";
    const user = item.user || {};
    const name = escapeHtml(user.name || user.username || "Minglora member");
    const username = escapeHtml(user.username || "member");
    const userId = escapeHtml(user.id || item.userId || "");
    const label = place === 1 ? "1ST PLACE" : place === 2 ? "2ND PLACE" : "3RD PLACE";
    return "<button type='button' class='ranking-podium-card ranking-podium-card--" + place +
      "' data-ranking-profile='" + userId + "' aria-label='Open " + name + " profile, ranked number " + place + "'>" +
      "<span class='ranking-podium-art'><img class='ranking-podium-frame' src='/assets/daily-ranking-badges/place-" + place +
      ".png' alt='' loading='lazy' decoding='async'>" + avatarMarkup(user,"ranking-podium-avatar") + "</span>" +
      "<span class='ranking-podium-place'>" + label + "</span><strong class='ranking-podium-name'>" + name + "</strong>" +
      "<small class='ranking-podium-handle'>@" + username + "</small>" +
      "<span class='ranking-podium-score'>" + number(item.points ?? item.coinsSent) + " Coins</span></button>";
  }
  function rankedRow(item) {
    const place = Math.max(1,Math.floor(Number(item.position || item.rank) || 0));
    const user = item.user || {};
    const name = escapeHtml(user.name || user.username || "Minglora member");
    const username = escapeHtml(user.username || "member");
    const userId = escapeHtml(user.id || item.userId || "");
    const isTopTen = place >= 4 && place <= 10, isTopTwenty = place >= 11 && place <= 20;
    const award = isTopTen ? "top-ten" : isTopTwenty ? "top-twenty" : "";
    const rank = award
      ? "<span class='ranking-position ranking-position--" + award + "' aria-label='Rank " + place + "'>" + place + "</span>"
      : "<span class='ranking-position' aria-label='Rank " + place + "'>#" + place + "</span>";
    const band = isTopTen ? "<span class='ranking-band ranking-band--top-ten'>TOP 10</span>"
      : isTopTwenty ? "<span class='ranking-band ranking-band--top-twenty'>TOP 20</span>" : "";
    const avatar = award
      ? "<span class='ranking-row-avatar-frame ranking-row-avatar-frame--" + award + "'>" +
        "<img class='ranking-row-avatar-frame-art' src='/assets/daily-ranking-badges/" + (isTopTen ? "place-4-10" : "place-11-20") + ".png' alt='' loading='lazy' decoding='async'>" +
        avatarMarkup(user,"ranking-row-avatar ranking-row-avatar--framed") + "</span>"
      : avatarMarkup(user,"ranking-row-avatar");
    return "<button type='button' class='ranking-row" + (award ? " ranking-row--" + award : "") +
      "' data-ranking-profile='" + userId + "' aria-label='Open " + name + " profile, rank " + place + "'>" +
      rank + avatar +
      "<span class='ranking-row-person'><strong>" + name + "</strong><small>@" + username + "</small>" + band + "</span>" +
      "<span class='ranking-row-score'><strong>" + number(item.points ?? item.coinsSent) +
      "</strong><small>Coins sent</small></span></button>";
  }
  function bindProfileActions(root) {
    root.querySelectorAll("[data-ranking-profile]").forEach(button => button.addEventListener("click",() => {
      const userId = button.dataset.rankingProfile;
      if (userId && typeof window.openProfile === "function") window.openProfile(userId);
    }));
  }
  function bindPeriodActions(root) {
    root.querySelectorAll("[data-ranking-period]").forEach(button => button.addEventListener("click",() => {
      const next = button.dataset.rankingPeriod;
      if (!periods.some(([key]) => key === next) || next === activePeriod) return;
      activePeriod = next;
      root.querySelectorAll("[data-ranking-period]").forEach(tab => {
        const selected = tab.dataset.rankingPeriod === activePeriod;
        tab.classList.toggle("is-active",selected);
        tab.setAttribute("aria-pressed",String(selected));
      });
      void loadLeaderboard();
    }));
  }
  async function loadLeaderboard() {
    const root = document.getElementById("main-content");
    const board = root?.querySelector("[data-rankings-board]");
    const status = root?.querySelector("[data-rankings-status]");
    if (!root || !board) return;
    const currentRequest = ++requestNumber;
    if (activeController) activeController.abort();
    activeController = new AbortController();
    board.innerHTML = "<div class='ranking-loading' role='status'>Loading confirmed LIVE rankings…</div>";
    if (status) status.textContent = "Ranked by unique, confirmed LIVE Coins sent · " + labelForPeriod(activePeriod);
    try {
      const response = await fetch("/api/live/rankings/top-gifters?period=" + encodeURIComponent(activePeriod),{
        credentials:"same-origin",cache:"no-store",headers:{Accept:"application/json"},signal:activeController.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Rankings could not be loaded.");
      if (currentRequest !== requestNumber) return;
      const items = (Array.isArray(data.leaderboard) ? data.leaderboard : [])
        .map((item,index) => ({...item,position:Math.max(1,Math.floor(Number(item.position || item.rank) || index + 1))}))
        .filter(item => item.position <= 100).sort((a,b) => a.position - b.position);
      const byPosition = new Map(items.map(item => [item.position,item]));
      const podium = [2,1,3].map(place => podiumCard(byPosition.get(place),place)).join("");
      const rows = items.filter(item => item.position > 3).map(rankedRow).join("");
      if (status) status.textContent = "Top " + items.length + " · Confirmed LIVE Coins sent · " +
        labelForPeriod(activePeriod) + (data.timeZone ? " · " + data.timeZone : "");
      board.innerHTML = items.length
        ? (podium ? "<div class='ranking-podium-stage' aria-label='Top three ranked members'>" + podium + "</div>" : "") +
          (rows ? "<div class='ranking-list' role='list' aria-label='Ranked members'>" + rows + "</div>" : "")
        : "<div class='ranking-empty'><strong>No members are ranked for this period yet.</strong><p>Confirmed LIVE gifts will appear here. Refunded, duplicate and failed gifts do not count.</p></div>";
      bindProfileActions(board);
    } catch (error) {
      if (currentRequest !== requestNumber || error?.name === "AbortError") return;
      board.innerHTML = "<div class='ranking-empty ranking-empty--error'><strong>Rankings are temporarily unavailable.</strong><p>" +
        escapeHtml(error?.message || "Please try again.") +
        "</p><button type='button' class='primary' data-ranking-retry>Try again</button></div>";
      board.querySelector("[data-ranking-retry]")?.addEventListener("click",() => void loadLeaderboard());
    }
  }
  function render() {
    const root = document.getElementById("main-content");
    if (!root) return;
    root.innerHTML = "<section class='ranking-page'><header class='ranking-hero'>" +
      "<div class='ranking-hero-copy'><span class='ranking-kicker'>MINGLORA LEADERBOARDS</span>" +
      "<h1>Rankings</h1><p>See the members leading LIVE gifting across Minglora.</p></div>" +
      "<span class='ranking-hero-mark' aria-hidden='true'>🏆</span></header>" +
      "<section class='ranking-panel' aria-label='LIVE member rankings'><div class='ranking-panel-heading'>" +
      "<div><h2>Top LIVE Gifters</h2><p data-rankings-status>Ranked by unique, confirmed LIVE Coins sent · Today</p></div>" +
      "<span class='ranking-cap-label'>TOP 100</span></div>" +
      "<div class='ranking-periods' role='group' aria-label='Ranking period'>" +
      periods.map(([key,label]) => "<button type='button' data-ranking-period='" + key + "' class='" +
        (key === activePeriod ? "is-active" : "") + "' aria-pressed='" + String(key === activePeriod) + "'>" +
        label + "</button>").join("") + "</div>" +
      "<div data-rankings-board><div class='ranking-loading' role='status'>Loading confirmed LIVE rankings…</div></div>" +
      "<p class='ranking-footnote'>Positions are based on confirmed LIVE gift Coins sent during the selected period. Refunded and duplicate gifts are excluded.</p>" +
      "</section></section>";
    bindPeriodActions(root);
    void loadLeaderboard();
  }
  function onNavigateAway() {
    requestNumber += 1;
    if (activeController) activeController.abort();
    activeController = null;
  }
  window.MingloraRankings = {render,onNavigateAway};
})();