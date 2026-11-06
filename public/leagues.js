(() => {
  "use strict";
  const state = { overview: null, sessions: [], gifts: [], lastUpdatedAt: null, refreshing: false, refreshError: "" };
  let refreshTimer = null;
  let refreshController = null;
  let refreshInFlight = false;
  let viewGeneration = 0;
  let refreshToken = 0;
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[char]);
  async function request(path, options = {}) {
    let response;
    try {
      response = await fetch("/api" + path, {
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", ...(options.headers || {}) },
        ...options
      });
    } catch {
      throw new Error("Minglora could not be reached. Check your connection and try again.");
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "The League request could not be completed.");
    return data;
  }
  function uniqueItems(items, keyFor) {
    const seen = new Set();
    return (Array.isArray(items) ? items : []).filter(item => {
      const key = keyFor(item);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  function normalizeOverview(overview) {
    const activeMatches = uniqueItems(overview.activeMatches, match => {
      if (["pending", "live"].includes(match.status) && match.challengerId && match.opponentId) {
        return "active:" + [String(match.challengerId), String(match.opponentId)].sort().join("|");
      }
      return match.id ? "id:" + match.id : "";
    });
    return {
      ...overview,
      activeMatches,
      leaderboard: uniqueItems(overview.leaderboard, item => item.id || item.username),
      recentEvents: uniqueItems(overview.recentEvents, item => item.id || [item.type, item.userId, item.createdAt].join(":"))
    };
  }
  function normalizeSessions(sessions) {
    return uniqueItems(sessions, session =>
      session.id || session.sessionId || [session.hostId, session.roomName].filter(Boolean).join(":")
    );
  }
  function updateRefreshStatus() {
    const status = $("#league-refresh-status");
    const button = $("[data-league-refresh]");
    if (status) {
      status.textContent = state.refreshError
        ? "Refresh failed. Tap Refresh to retry."
        : state.lastUpdatedAt
          ? "Updated " + state.lastUpdatedAt.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}) + " · Auto-refresh every 5s"
          : "Auto-refresh every 5 seconds";
    }
    if (button) {
      button.disabled = state.refreshing;
      button.textContent = state.refreshing ? "Refreshing…" : "↻ Refresh";
    }
  }
  function isLeagueViewActive() {
    return Boolean($("#main-content") && document.querySelector("[data-view='leagues'].active"));
  }
  function image(member, ringClass = "") {
    const ring = ringClass ? " " + ringClass : "";
    return member?.avatarUrl
      ? "<img class='league-avatar" + ring + "' src='" + esc(member.avatarUrl) + "' alt=''>"
      : "<span class='league-avatar league-avatar-fallback" + ring + "' aria-hidden='true'>" + esc((member?.name || "M").slice(0,1).toUpperCase()) + "</span>";
  }
  function podiumMarkup(leaderboard) {
    const ranked = [
      { member: leaderboard[1], place: 2 },
      { member: leaderboard[0], place: 1 },
      { member: leaderboard[2], place: 3 }
    ].filter(entry => entry.member && entry.member.id);
    if (!ranked.length) return "";
    return "<div class='league-podium' aria-label='Top three creators'>" + ranked.map(({member, place}) =>
      "<button type='button' class='league-podium-member is-place-" + place + "' data-league-profile='" + esc(member.id) + "' aria-label='Open " + esc(member.name || member.username || "creator") + " profile, ranked number " + place + "'>" +
        "<span class='league-podium-crown' aria-hidden='true'>" + (place === 1 ? "👑" : place === 2 ? "✦" : "✧") + "</span>" +
        image(member, "ml-creator-ring ml-creator-ring--league") +
        "<strong>" + esc(member.name || "Minglora creator") + "</strong><small>@" + esc(member.username || "creator") + "</small>" +
        "<b class='league-podium-points'>" + Number(member.seasonPoints || 0).toLocaleString() + " pts</b>" +
        "<span class='league-podium-base' aria-hidden='true'>" + place + "</span></button>"
    ).join("") + "</div>";
  }
  function leaderboardMarkup(leaderboard) {
    if (!leaderboard.length) return "<div class='league-empty-inline'>Your class leaderboard will appear when creators earn confirmed LIVE Gift points in your region.</div>";
    const remaining = leaderboard.slice(3).map(item =>
      "<button type='button' class='league-leader-row' data-league-profile='" + esc(item.id || "") + "' " + (!item.id ? "disabled" : "") + ">" +
        "<b class='league-position'>#" + Number(item.position || 0) + "</b>" + image(item, "ml-creator-ring ml-creator-ring--league") +
        "<span class='league-leader-name'><strong>" + esc(item.name || "Minglora creator") + "</strong><small>@" + esc(item.username || "creator") + "</small></span>" +
        "<strong class='league-leader-points'>" + Number(item.seasonPoints || 0).toLocaleString() + " pts</strong></button>"
    ).join("");
    return podiumMarkup(leaderboard) + (remaining ? "<div class='league-leaderboard league-leaderboard-rest'>" + remaining + "</div>" : "");
  }
  function meter(value, max) {
    const percent = Math.max(0, Math.min(100, Number(value || 0) / Math.max(1, Number(max || 1)) * 100));
    return "<div class='league-meter' aria-label='" + Math.round(percent) + "% complete'><span style='width:" + percent + "%'></span></div>";
  }
  function classLadderMarkup(classes, active) {
    return "<div class='league-class-ladder'>" + classes.map(item =>
      "<span class='league-class-step " + (item === active ? "is-current" : "") + "'>" + esc(item) + "</span>"
    ).join("") + "</div>";
  }
  function matchLadderMarkup(ranks, active) {
    return "<div class='match-rank-ladder'>" + ranks.map((item, index) =>
      "<span class='match-rank-step " + (item === active ? "is-current" : "") + "'><small>" + (index + 1) + "</small>" + esc(item) + "</span>"
    ).join("") + "</div>";
  }
  function eventLabel(item) {
    const details = item.details || {};
    if (item.type === "creator_promotion") return "Promoted from " + (details.from || "a lower class") + " to " + (details.to || "a new class");
    if (item.type === "creator_demotion") return "Moved from " + (details.from || "a higher class") + " to " + (details.to || "a lower class");
    if (item.type === "league_shield_used") return "A League Shield protected your class";
    if (item.type === "match_rank_change") return "Match rank changed from " + (details.from || "—") + " to " + (details.to || "—");
    if (item.type === "match_completed") return "League Match completed: " + (details.result || "result recorded");
    if (item.type === "match_challenge_received") return "You received a League Match challenge";
    if (item.type === "match_challenge_sent") return "You sent a League Match challenge";
    return item.type.replaceAll("_", " ");
  }
  function matchCard(match, overview) {
    const profile = overview.profile;
    const viewer = overview.viewerId;
    const isChallenger = match.challengerId === viewer;
    const isOpponent = match.opponentId === viewer;
    const isParticipant = isChallenger || isOpponent;
    const alreadySupported = (match.supporters || []).some(item => item.userId === viewer);
    const challengerScore = Number(match.scores?.challenger || 0);
    const opponentScore = Number(match.scores?.opponent || 0);
    const challengerName = match.challenger?.name || "Creator";
    const opponentName = match.opponent?.name || "Creator";
    let controls = "";
    if (match.status === "pending" && isOpponent) {
      controls = "<button class='primary league-action' data-match-accept='" + esc(match.id) + "'>Accept match</button>";
    } else if (match.status === "live" && isParticipant) {
      const side = isChallenger ? "challenger" : "opponent";
      const powers = (overview.powerups || []).map(power => {
        const unavailableShield = power.id === "shield" &&
          (match.activeEffects || []).some(effect => effect.type === "shield" && effect.side === side && new Date(effect.expiresAt).getTime() > Date.now());
        const fixedTimer = power.id === "time_boost" && match.timerMode === "fixed";
        const disabled = power.usedToday || unavailableShield || fixedTimer;
        const reason = power.usedToday ? "Used today" : unavailableShield ? "Your Shield is already active" : fixedTimer ? "Fixed timer" : power.description;
        return "<button type='button' class='league-powerup-btn' data-match-powerup='" + esc(power.id) + "' data-match-id='" + esc(match.id) + "' " + (disabled ? "disabled" : "") + " title='" + esc(reason) + "'><span>" + esc(power.symbol) + "</span><strong>" + esc(power.name) + "</strong><small>" + (power.usedToday ? "Used today" : unavailableShield ? "Active" : fixedTimer ? "Disabled" : "Use") + "</small></button>";
      }).join("");
      controls = "<div class='league-powerup-grid'>" + powers + "</div>";
    } else if (match.status === "live" && !isParticipant) {
      controls = "<div class='league-support-actions'><button type='button' class='league-action' data-match-support='challenger' data-match-id='" + esc(match.id) + "' " + (alreadySupported ? "disabled" : "") + ">Support " + esc(challengerName) + " +3</button><button type='button' class='league-action' data-match-support='opponent' data-match-id='" + esc(match.id) + "' " + (alreadySupported ? "disabled" : "") + ">Support " + esc(opponentName) + " +3</button></div>" + (alreadySupported ? "<small class='league-muted'>Your support has already been counted for this match.</small>" : "");
    }
    const result = match.status === "completed"
      ? "<span class='league-match-result'>" + (match.result === "draw" ? "Draw" : (match.winnerId === viewer ? "You won" : match.winnerId ? "Match completed" : "Completed")) + "</span>"
      : "<span class='league-live-label'>" + (match.status === "live" ? "● LIVE MATCH" : "Awaiting acceptance") + "</span>";
    return "<article class='league-match-card' data-league-match='" + esc(match.id) + "'><div class='league-match-head'><div><span class='league-eyebrow'>MINGLORA LEAGUE MATCH</span><h3>" + esc(match.status === "live" ? "Live creator battle" : "Creator challenge") + "</h3></div>" + result + "</div><div class='league-scoreboard'><div class='league-side'>" + image(match.challenger) + "<strong>" + esc(challengerName) + "</strong><small>Challenger</small><b>" + challengerScore.toLocaleString() + "</b></div><span class='league-score-divider'>VS</span><div class='league-side'>" + image(match.opponent) + "<strong>" + esc(opponentName) + "</strong><small>Opponent</small><b>" + opponentScore.toLocaleString() + "</b></div></div><div class='league-match-meta'><span>" + (match.giftMode === "specific" ? "Selected Gift scoring" : "All LIVE Gifts score") + "</span>" + (match.status === "live" ? "<span>Ends " + new Date(match.endsAt).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}) + "</span>" : "") + "</div>" + controls + "</article>";
  }
  function challengeMarkup(overview, sessions) {
    const own = sessions.filter(item => item.hostId === overview.viewerId);
    const others = sessions.filter(item => item.hostId !== overview.viewerId);
    const gifts = state.gifts.slice().sort((a,b) => Number(a.coin_price)-Number(b.coin_price));
    const ownOptions = own.map(item => "<option value='" + esc(item.id) + "'>" + esc(item.title || "Your LIVE session") + "</option>").join("");
    const otherOptions = others.map(item => "<option value='" + esc(item.id) + "'>" + esc(item.host?.name || "Creator") + " · @" + esc(item.host?.username || "creator") + "</option>").join("");
    const giftOptions = gifts.map(item => "<option value='" + esc(item.code) + "'>" + esc(item.name) + " · " + Number(item.coin_price || 0).toLocaleString() + " Coins</option>").join("");
    return "<section class='card league-challenge-panel'><div class='league-section-heading'><div><span class='league-eyebrow'>GO HEAD-TO-HEAD</span><h2>Challenge a creator</h2><p>Both creators must be connected to a real LIVE room before a match can begin.</p></div><span class='league-feature-icon'>⚔️</span></div>" +
      (own.length && others.length ? "<form id='league-challenge-form' class='league-challenge-form'><label>Your LIVE session<select name='ownSessionId' required>" + ownOptions + "</select></label><label>Creator to challenge<select name='opponentSessionId' required><option value=''>Choose a creator who is LIVE</option>" + otherOptions + "</select></label><label>Match scoring<select name='giftMode'><option value='all'>All LIVE Gifts count</option><option value='specific'>One selected Gift counts</option></select></label><label id='league-specific-gift-field' class='hidden'>Scoring Gift<select name='selectedGiftCode'>" + giftOptions + "</select></label><button class='primary' type='submit'>Send League Match challenge</button></form>" :
        "<div class='league-empty-inline'>" + (!own.length ? "Start your LIVE broadcast first. It will appear here once connected." : "No other eligible creators are LIVE right now. You can challenge someone when they go LIVE.") + "</div>") +
      "</section>";
  }
  function renderMarkup(overview, sessions) {
    const p = overview.profile;
    const matches = overview.activeMatches || [];
    const leaderboard = overview.leaderboard || [];
    const events = overview.recentEvents || [];
    const fragments = Array.from({length:p.fragmentsNeeded}, (_, index) =>
      "<span class='league-fragment " + (index < p.fragments ? "earned" : "") + "'></span>"
    ).join("");
    const matchPercent = p.matchRankPoints;
    return "<div class='league-page'><section class='league-hero'><div class='league-hero-copy'><span class='league-eyebrow'>MINGLORA COMPETITIVE</span><h1>League Arena</h1><p>Build your LIVE creator league. Compete in matches. Earn your place at the top.</p><div class='league-hero-tags'><span>🌍 " + esc(p.region) + " league</span><span>Season starts " + esc(p.seasonKey) + "</span></div></div><div class='league-hero-emblem'><span>🏆</span><small>" + esc(p.leagueClass) + "</small></div></section>" +
      "<section class='league-overview-grid'><article class='card league-stat-card league-primary-stat'><span class='league-eyebrow'>CREATOR LEAGUE</span><div class='league-stat-value'>" + esc(p.leagueClass) + "</div><strong>" + Number(p.seasonPoints).toLocaleString() + " season points</strong><p>" + Number(p.todayGiftPoints).toLocaleString() + " points from LIVE Gifts today</p><div class='league-fragments' aria-label='" + p.fragments + " of 4 promotion fragments'>" + fragments + "</div><small>" + p.fragments + " / 4 fragments to promotion</small></article>" +
      "<article class='card league-stat-card'><span class='league-eyebrow'>MATCH RANK</span><div class='league-stat-value match-rank-value'>" + esc(p.matchRank) + "</div><strong>" + Number(p.matchRankPoints).toLocaleString() + " / 100 rank points</strong>" + meter(matchPercent,100) + "<p>" + (p.matchRankPointsToNext === null ? "Highest match rank reached" : p.matchRankPointsToNext + " points to next rank") + "</p><small>" + p.matchWins + " wins · " + p.matchLosses + " losses · " + p.matchDraws + " draws</small></article>" +
      "<article class='card league-stat-card'><span class='league-eyebrow'>LEAGUE SHIELDS</span><div class='league-stat-value'>🛡️ " + Number(p.leagueShields).toLocaleString() + "</div><strong>Promotion protection</strong><p>Shields protect against one eligible league demotion step. They never change match results.</p><small>" + Number(p.lifetimeGiftPoints).toLocaleString() + " lifetime LIVE Gift points</small></article></section>" +
      "<section class='card league-ladder-panel'><div class='league-section-heading'><div><span class='league-eyebrow'>CREATOR PROGRESSION</span><h2>Creator League classes</h2><p>Daily standings are based on confirmed LIVE Gift coin value within your region and current class.</p></div><span class='league-feature-icon'>📈</span></div>" + classLadderMarkup(overview.classes,p.leagueClass) + "<div class='league-rules-grid'><div><strong>How to move up</strong><p>Top 20% of an active class group earns one fragment. Four fragments promote you one class and award a League Shield.</p></div><div><strong>How protection works</strong><p>Bottom 20% loses one fragment. If no fragment remains, a League Shield protects one demotion; otherwise the class can drop one level.</p></div><div><strong>Daily activity</strong><p>Every enrolled creator in your region and class is ranked each day by confirmed LIVE Gift points. One Gift Coin of value equals one point; creators with no eligible Gifts score zero. At least two enrolled creators are required, not two Gift senders.</p></div></div></section>" +
      "<section class='card league-ladder-panel'><div class='league-section-heading'><div><span class='league-eyebrow'>MATCH PROGRESSION</span><h2>Bronze to Grandmaster</h2><p>Match rank changes only from completed League Match results, never from LIVE Gift league points.</p></div><span class='league-feature-icon'>🥇</span></div>" + matchLadderMarkup(overview.matchRanks,p.matchRank) + "<div class='league-rank-rules'><span>Win: +25</span><span>Draw: +5</span><span>Loss: −15</span><span>100 points advances one rank</span></div></section>" +
      challengeMarkup(overview,sessions) +
      "<section class='league-matches-section'><div class='league-section-heading'><div><span class='league-eyebrow'>LIVE COMPETITION</span><h2>League Matches</h2><p>Gift points are counted for the match score while the original confirmed Gift value stays in Creator League totals.</p></div><div class='league-refresh-tools'><small id='league-refresh-status' aria-live='polite'>Auto-refresh every 5 seconds</small><button type='button' class='league-action' data-league-refresh>↻ Refresh</button></div></div>" + (matches.length ? "<div class='league-matches-grid'>" + matches.map(match=>matchCard(match,overview)).join("") + "</div>" : "<div class='league-empty-inline'>No League Matches yet. Challenge another creator who is LIVE to start one.</div>") + "</section>" +
      "<section class='card league-leaderboard-panel'><div class='league-section-heading'><div><span class='league-eyebrow'>YOUR CLASS</span><h2>" + esc(p.leagueClass) + " leaderboard</h2><p>Regional weekly LIVE Gift standings. Tap any creator to open their profile.</p></div></div>" + leaderboardMarkup(leaderboard) + "</section>" +
      "<section class='card league-events-panel'><div class='league-section-heading'><div><span class='league-eyebrow'>YOUR PROGRESSION</span><h2>League activity</h2></div></div>" + (events.length ? "<div class='league-events-list'>" + events.map(item=>"<div class='league-event-row'><span>✦</span><div><strong>" + esc(eventLabel(item)) + "</strong><small>" + new Date(item.createdAt).toLocaleString() + "</small></div></div>").join("") + "</div>" : "<div class='league-empty-inline'>Promotions, demotions, shields and completed matches will appear here.</div>") + "</section>" +
      "<section class='league-powerup-info'><div class='league-section-heading'><div><span class='league-eyebrow'>MATCH-ONLY TOOLS</span><h2>Match Power-Ups</h2><p>These temporary effects never multiply Creator League points or official class standings.</p></div></div><div class='league-powerup-info-grid'>" + overview.powerups.map(power=>"<article class='league-powerup-info-card'><span>" + esc(power.symbol) + "</span><strong>" + esc(power.name) + "</strong><p>" + esc(power.description) + "</p><small>" + (power.usedToday ? "Used today" : "One free use per UTC day") + "</small></article>").join("") + "</div></section>" +
      "<p class='league-footnote'>Minglora League rules are platform rules, independent of TikTok. Weekly seasons reset season points; lifetime points and Match Rank records remain on your profile.</p></div>";
  }
  function bindActions() {
    const form = $("#league-challenge-form");
    if (form) {
      const giftMode = form.querySelector("[name='giftMode']");
      const giftField = $("#league-specific-gift-field");
      giftMode.addEventListener("change", () => giftField.classList.toggle("hidden", giftMode.value !== "specific"));
      form.addEventListener("submit", async event => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(form).entries());
        const button = form.querySelector("button[type='submit']");
        button.disabled = true;
        try {
          await request("/leagues/matches", { method:"POST", body:JSON.stringify(data) });
          toast("League Match challenge sent.");
          await render();
        } catch (error) {
          toast(error.message);
          button.disabled = false;
        }
      });
    }
    document.querySelectorAll("[data-match-accept]").forEach(button => button.addEventListener("click", async () => {
      button.disabled = true;
      try { await request("/leagues/matches/" + encodeURIComponent(button.dataset.matchAccept) + "/accept", {method:"POST",body:"{}"}); toast("League Match accepted."); await render(); }
      catch(error) { toast(error.message); button.disabled = false; }
    }));
    document.querySelectorAll("[data-match-support]").forEach(button => button.addEventListener("click", async () => {
      button.disabled = true;
      try { await request("/leagues/matches/" + encodeURIComponent(button.dataset.matchId) + "/support", {method:"POST",body:JSON.stringify({side:button.dataset.matchSupport})}); toast("Your match support was counted."); await render(); }
      catch(error) { toast(error.message); button.disabled = false; }
    }));
    document.querySelectorAll("[data-match-powerup]").forEach(button => button.addEventListener("click", async () => {
      button.disabled = true;
      try { await request("/leagues/matches/" + encodeURIComponent(button.dataset.matchId) + "/powerups", {method:"POST",body:JSON.stringify({powerupId:button.dataset.matchPowerup})}); toast("Match power-up activated."); await render(); }
      catch(error) { toast(error.message); button.disabled = false; }
    }));
    document.querySelectorAll("[data-league-profile]").forEach(button => button.addEventListener("click", () => {
      const userId = button.dataset.leagueProfile;
      if (userId) window.dispatchEvent(new CustomEvent("minglora:open-profile", { detail: { userId } }));
    }));
    const refreshButton = $("[data-league-refresh]");
    if (refreshButton) refreshButton.addEventListener("click", () => { void refreshScores({force:true}); });
    updateRefreshStatus();
  }
  function onNavigateAway() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = null;
    viewGeneration += 1;
    refreshToken += 1;
    refreshInFlight = false;
    if (refreshController) refreshController.abort();
    refreshController = null;
    state.refreshing = false;
  }
  async function refreshScores({force = false} = {}) {
    const main = $("#main-content");
    if (!main || !isLeagueViewActive()) { onNavigateAway(); return; }
    if (document.visibilityState !== "visible") return;
    if (refreshInFlight) return;
    const focused = document.activeElement;
    if (!force && focused && ["INPUT","SELECT","TEXTAREA"].includes(focused.tagName)) return;

    refreshInFlight = true;
    const token = ++refreshToken;
    const generation = viewGeneration;
    const controller = new AbortController();
    refreshController = controller;
    state.refreshing = true;
    state.refreshError = "";
    updateRefreshStatus();
    try {
      const [overview, sessions] = await Promise.all([
        request("/leagues/overview", {signal:controller.signal}),
        request("/live/sessions", {signal:controller.signal})
      ]);
      if (token !== refreshToken || generation !== viewGeneration || !isLeagueViewActive()) return;
      state.overview = normalizeOverview(overview);
      state.sessions = normalizeSessions(sessions.sessions);
      state.lastUpdatedAt = new Date();
      state.refreshError = "";
      const scrollTop = main.scrollTop;
      main.innerHTML = renderMarkup(state.overview, state.sessions);
      main.scrollTop = scrollTop;
      bindActions();
    } catch (error) {
      if (token === refreshToken && error?.name !== "AbortError") {
        state.refreshError = error.message || "The League could not refresh.";
        if (force) toast(state.refreshError);
      }
    } finally {
      if (token === refreshToken) {
        refreshInFlight = false;
        state.refreshing = false;
        refreshController = null;
        updateRefreshStatus();
      }
    }
  }
  async function render() {
    onNavigateAway();
    const generation = ++viewGeneration;
    const main = $("#main-content");
    if (!main) return;
    main.innerHTML = "<section class='card empty-state'><h3>Loading League Arena</h3><p>Checking your league record and LIVE match rooms…</p></section>";
    const results = await Promise.allSettled([
      request("/leagues/overview"), request("/live/sessions"), request("/coins/catalog")
    ]);
    if (generation !== viewGeneration || !isLeagueViewActive()) return;
    if (results[0].status !== "fulfilled") throw results[0].reason;
    state.overview = normalizeOverview(results[0].value);
    state.sessions = normalizeSessions(results[1].status === "fulfilled" ? results[1].value.sessions : []);
    state.gifts = results[2].status === "fulfilled" && Array.isArray(results[2].value.gifts) ? results[2].value.gifts : [];
    state.lastUpdatedAt = new Date();
    state.refreshError = "";
    state.refreshing = false;
    main.innerHTML = renderMarkup(state.overview,state.sessions);
    bindActions();
    updateRefreshStatus();
    if (isLeagueViewActive()) refreshTimer = setInterval(() => {
      if (document.visibilityState === "visible") void refreshScores();
    }, 5000);
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && isLeagueViewActive()) void refreshScores();
  });
  window.addEventListener("online", () => {
    if (isLeagueViewActive()) void refreshScores();
  });
  window.addEventListener("pageshow", () => {
    if (isLeagueViewActive()) void refreshScores();
  });
  window.MingloraLeagues = { render, onNavigateAway };
})();