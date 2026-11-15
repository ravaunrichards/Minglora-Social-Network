(() => {
  "use strict";
  const state = { overview: null, sessions: [], gifts: [], selectedPowerupId: "momentum_boost", selectedMatchId: "", rankingPeriod: "weekly", rankingClass: "", lastUpdatedAt: null, refreshing: false, refreshError: "" };
  let refreshController = null;
  let refreshInFlight = false;
  let viewGeneration = 0;
  let refreshToken = 0;
  let autoSyncTimer = null;
  let leaderboardLoadToken = 0;
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[char]);
  function currentPowerup() {
    return (state.overview?.powerups || []).find(item => item.id === state.selectedPowerupId) || null;
  }
  function selectedPowerupMatch() {
    return (state.overview?.activeMatches || []).find(item => item.id === state.selectedMatchId) || null;
  }
  function powerupRestriction(power, match) {
    if (!power || !match) return "Choose a live match to activate this power-up.";
    if (match.status !== "live") return "This match is not live.";
    const viewer = state.overview?.viewerId;
    const side = match.challengerId === viewer ? "challenger" : match.opponentId === viewer ? "opponent" : "";
    if (!side) return "Only match participants can activate power-ups.";
    if (power.usedToday) return "This power-up has already been used today.";
    if (power.id === "shield" && (match.activeEffects || []).some(effect =>
      effect.type === "shield" && effect.side === side && new Date(effect.expiresAt).getTime() > Date.now()
    )) return "Your Shield is already active.";
    if (power.id === "time_boost" && match.timerMode === "fixed") return "Time Boost is unavailable in fixed-timer matches.";
    return "";
  }
  function powerupDurationLabel(power) {
    const seconds = Math.max(0, Math.round(Number(power?.durationMs || 0) / 1000));
    return seconds ? seconds + " second" + (seconds === 1 ? "" : "s") : "Match-limited duration";
  }
  function powerupStudioMarkup(overview) {
    const powerups = Array.isArray(overview.powerups) ? overview.powerups : [];
    if (!powerups.some(item => item.id === state.selectedPowerupId)) state.selectedPowerupId = powerups[0]?.id || "";
    const selected = powerups.find(item => item.id === state.selectedPowerupId) || powerups[0] || null;
    const cards = powerups.map(power => {
      const active = power.id === selected?.id;
      return "<button type='button' class='league-powerup-info-card" + (active ? " is-selected" : "") +
        "' data-powerup-select='" + esc(power.id) + "' aria-pressed='" + active + "'>" +
        "<span class='league-powerup-card-symbol' aria-hidden='true'>" + esc(power.symbol) + "</span>" +
        "<strong>" + esc(power.name) + "</strong><p>" + esc(power.description) + "</p>" +
        "<small>" + (power.usedToday ? "Used today" : "One free use per UTC day") + "</small>" +
        "<span class='league-powerup-card-action'>" + (active ? "Selected" : "Select power-up") + "</span></button>";
    }).join("");
    return "<section class='card league-powerup-info' id='league-powerup-panel' aria-labelledby='league-powerup-heading'>" +
      "<div class='league-section-heading'><div><span class='league-eyebrow'>MATCH-ONLY TOOLS</span><h2 id='league-powerup-heading'>Match Power-Ups</h2>" +
      "<p>Select a power-up and activate it during your live match. These temporary effects never multiply Creator League points or official class standings.</p></div></div>" +
      "<div class='league-powerup-info-grid' aria-label='Available Match Power-Ups'>" + cards + "</div>" +
      "<div class='league-powerup-selected-details'>" +
      "<h3 id='league-powerup-selected-title'>" + esc(selected?.name || "Choose a power-up") + "</h3>" +
      "<p id='league-powerup-selected-description'>" + esc(selected?.description || "Select one of the available Match Power-Ups.") + "</p>" +
      "<div class='league-powerup-selected-meta'><span id='league-powerup-selected-duration'>" + (selected ? esc(powerupDurationLabel(selected)) : "—") + "</span>" +
      "<span id='league-powerup-selected-usage'>" + (selected?.usedToday ? "Used today" : "One free use per UTC day") + "</span></div>" +
      "<p class='league-powerup-availability' id='league-powerup-availability' role='status' aria-live='polite'>Choose a power-up from one of your live matches to prepare an activation.</p>" +
      "<button type='button' class='primary league-powerup-activate' id='league-powerup-activate' hidden disabled>Activate for this match</button></div></section>";
  }
  function updatePowerupSelection() {
    const power = currentPowerup();
    const title = $("#league-powerup-selected-title");
    const description = $("#league-powerup-selected-description");
    const duration = $("#league-powerup-selected-duration");
    const usage = $("#league-powerup-selected-usage");
    const availability = $("#league-powerup-availability");
    const activate = $("#league-powerup-activate");
    if (!power) {
      if (title) title.textContent = "No power-ups available";
      if (description) description.textContent = "No Match Power-Ups are currently available.";
      if (availability) availability.textContent = "No Match Power-Ups are currently available.";
      if (activate) { activate.hidden = true; activate.disabled = true; }
      return;
    }
    if (title) title.textContent = power.name;
    if (description) description.textContent = power.description;
    if (duration) duration.textContent = powerupDurationLabel(power);
    if (usage) usage.textContent = power.usedToday ? "Used today" : "One free use per UTC day";
    const match = selectedPowerupMatch();
    const reason = powerupRestriction(power, match);
    if (activate) {
      activate.hidden = !match;
      activate.disabled = !match || Boolean(reason);
      activate.textContent = reason || "Activate for this match";
      activate.dataset.matchId = match?.id || "";
      activate.dataset.powerupId = power.id;
    }
    if (availability) availability.textContent = match
      ? (reason || "Ready to activate in the selected live match.")
      : "Select a power-up from one of your live matches to prepare an activation.";
    document.querySelectorAll("[data-powerup-select]").forEach(button => {
      const active = button.dataset.powerupSelect === power.id;
      button.classList.toggle("is-selected", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }
  async function activateSelectedPowerup(button) {
    const power = currentPowerup();
    const match = selectedPowerupMatch();
    const reason = powerupRestriction(power, match);
    const status = $("#league-powerup-availability");
    if (reason) {
      if (status) status.textContent = reason;
      return;
    }
    button.disabled = true;
    if (status) status.textContent = "Activating " + power.name + " for this match…";
    try {
      await request("/leagues/matches/" + encodeURIComponent(match.id) + "/powerups", {
        method: "POST", body: JSON.stringify({ powerupId: power.id })
      });
      toast("Match power-up activated.");
      await render();
    } catch (error) {
      if (status) status.textContent = error.message;
      toast(error.message);
      button.disabled = false;
    }
  }
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
    if (!status) return;
    status.textContent = state.refreshing
      ? "Updating live scores…"
      : state.refreshError
        ? "Connection interrupted. Minglora will retry automatically."
        : state.lastUpdatedAt
          ? "Updated automatically · " + state.lastUpdatedAt.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})
          : "Live scores update automatically.";
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
        "<span class='league-podium-avatar-wrap'>" + image(member, "ml-creator-ring ml-creator-ring--league") +
          "<span class='league-podium-avatar-medal is-place-" + place + "' role='img' aria-label='Creator League No. " + place + " reward badge'>" + place + "</span></span>" +
        "<strong>" + esc(member.name || "Minglora creator") + "</strong><small>@" + esc(member.username || "creator") + "</small>" +
        "<b class='league-podium-points'>" + Number(member.points ?? member.seasonPoints ?? 0).toLocaleString() + " pts</b>" +
        "<span class='league-podium-base' aria-hidden='true'>" + place + "</span></button>"
    ).join("") + "</div>";
  }
  function leaderboardMarkup(leaderboard) {
    if (!leaderboard.length) return "<div class='league-empty-inline'>No creators have earned confirmed LIVE Gift points for this division and period yet.</div>";
    const remaining = leaderboard.slice(3).map(item => {
      const position = Math.max(0, Number(item.position || 0));
      const award = position >= 4 && position <= 10 ? "top-ten" : position >= 11 && position <= 20 ? "top-twenty" : "";
      const awardMarkup = award
        ? "<span class='league-ranking-medal league-ranking-medal--" + award + "' role='img' aria-label='" +
          (award === "top-ten" ? "Creator League reward badge for positions 4 to 10" : "Creator League reward badge for positions 11 to 20") +
          "' title='" + (award === "top-ten" ? "Top 10 Creator League reward" : "Top 20 Creator League reward") + "'>" +
          "<span aria-hidden='true'>" + (award === "top-ten" ? "✦" : "◆") + "</span></span>"
        : "";
      const bandMarkup = award
        ? "<span class='league-leader-band league-leader-band--" + award + "'>" + (award === "top-ten" ? "TOP 10" : "TOP 20") + "</span>"
        : "";
      const rowClass = award ? " league-leader-row--" + award : "";
      return "<button type='button' class='league-leader-row" + rowClass + "' data-league-profile='" + esc(item.id || "") + "' aria-label='Open " + esc(item.name || item.username || "creator") + " profile, place " + position + "' " + (!item.id ? "disabled" : "") + ">" +
        "<b class='league-position'>#" + position + "</b>" +
        "<span class='league-rank-avatar-wrap'>" + image(item, "ml-creator-ring ml-creator-ring--league") + awardMarkup + "</span>" +
        "<span class='league-leader-name'><strong>" + esc(item.name || "Minglora creator") + "</strong><small>@" + esc(item.username || "creator") + "</small>" + bandMarkup + "</span>" +
        "<strong class='league-leader-points'>" + Number(item.points ?? item.seasonPoints ?? 0).toLocaleString() + " pts</strong></button>";
    }).join("");
    return podiumMarkup(leaderboard) + (remaining ? "<div class='league-leaderboard league-leaderboard-rest'>" + remaining + "</div>" : "");
  }
  function meter(value, max) {
    const percent = Math.max(0, Math.min(100, Number(value || 0) / Math.max(1, Number(max || 1)) * 100));
    return "<div class='league-meter' aria-label='" + Math.round(percent) + "% complete'><span style='width:" + percent + "%'></span></div>";
  }
  function classLadderMarkup(classes, active) {
    const hierarchy = [
      { tier: "A", title: "Highest tier", levels: ["A3", "A2", "A1"] },
      { tier: "B", title: "Upper tier", levels: ["B5", "B4", "B3", "B2", "B1"] },
      { tier: "C", title: "Middle tier", levels: ["C5", "C4", "C3", "C2", "C1"] },
      { tier: "D", title: "Entry tier", levels: ["D5", "D4", "D3", "D2", "D1"] }
    ];
    const available = new Set(Array.isArray(classes) ? classes : []);
    const groups = hierarchy.map(group => {
      const levels = group.levels.filter(item => available.has(item));
      if (!levels.length) return "";
      const currentTier = levels.includes(active);
      return "<article class='league-tier-card league-tier-card--" + group.tier + (currentTier ? " is-active-tier" : "") + "'>" +
        "<div class='league-tier-card-heading'><span class='league-tier-emblem' role='img' aria-label='League " + group.tier + " emblem'><b>" + group.tier + "</b></span>" +
        "<span><strong>League " + group.tier + "</strong><small>" + group.title + "</small></span></div>" +
        "<div class='league-tier-class-list'>" + levels.map(item =>
          "<span class='league-class-step " + (item === active ? "is-current" : "") + "' " + (item === active ? "aria-current='true' aria-label='Current class " + esc(item) + "'" : "") + ">" + esc(item) + "</span>"
        ).join("") + "</div></article>";
    }).join("");
    return "<div class='league-class-ladder league-tier-grid' aria-label='Creator League class hierarchy'>" + groups + "</div>";
  }
  function fragmentRulesMarkup() {
    const groups = [
      { tier: "A", title: "A3–A1", rules: [[3, "Top 1%"], [2, "Top 10%"], [1, "Top 20%"], [0, "Top 60%"], [-1, "Bottom 40%"]] },
      { tier: "B", title: "B5–B1", rules: [[3, "Top 1%"], [2, "Top 10%"], [1, "Top 20%"], [0, "Top 70%"], [-1, "Bottom 30%"]] },
      { tier: "C", title: "C5–C1", rules: [[2, "Top 10%"], [1, "Top 20%"], [0, "Top 80%"], [-1, "Bottom 20%"]] },
      { tier: "D", title: "D1", rules: [[2, "Top 10%"], [1, "Top 20%"], [0, "Top 80%"], [-1, "Bottom 20%"]] },
      { tier: "D", title: "D2–D5", rules: [[2, "Top 10%"], [1, "Top 20%"], [0, "Other placements"]] }
    ];
    const cards = groups.map(group =>
      "<article class='league-fragment-rule-card league-tier-card--" + group.tier + "'><div class='league-fragment-rule-heading'><span class='league-fragment-tier-mark'>" + group.tier + "</span><strong>" + group.title + "</strong></div>" +
      "<div class='league-fragment-rule-steps'>" + group.rules.map(([value, placement]) =>
        "<span class='league-fragment-rule-step'><b>" + (value > 0 ? "+" : "") + value + "</b><small>" + placement + "</small></span>"
      ).join("") + "</div></article>"
    ).join("");
    return "<section class='card league-fragment-reference' id='league-fragment-reference-zone' aria-labelledby='league-fragment-reference-heading'>" +
      "<div class='league-section-heading'><div><span class='league-eyebrow'>DAILY LEAGUE PLACEMENT</span><h2 id='league-fragment-reference-heading'>Fragment rewards and protection</h2>" +
      "<p>Each creator is ranked against their own class in their region using eligible confirmed LIVE Gift value for the completed day.</p></div><span class='league-reference-status'>4 FRAGMENTS = 1 TIER</span></div>" +
      "<div class='league-fragment-rule-grid'>" + cards + "</div>" +
      "<p class='league-fragment-reference-note'>Four accumulated fragments promote one tier; four lost fragments demote one tier. A League Shield automatically protects one fragment loss, does not expire, and the balance is capped at 10. D2–D5 have no fragment-loss penalty. Placement thresholds are an observed public model, not a published TikTok specification.</p></section>";
  }
  function rankingControlsMarkup(overview) {
    const availableClasses = (overview.classes || []).slice().reverse();
    if (!availableClasses.includes(state.rankingClass)) state.rankingClass = overview.profile.leagueClass;
    if (!["daily", "weekly"].includes(state.rankingPeriod)) state.rankingPeriod = "weekly";
    const classOptions = availableClasses.map(item =>
      "<option value='" + esc(item) + "' " + (item === state.rankingClass ? "selected" : "") + ">" + esc(item) + "</option>"
    ).join("");
    const rankingEnabled = overview.profile.rankingEnabled !== false;
    return "<div class='league-ranking-visibility'>" +
      "<label for='league-ranking-toggle'><span><strong>Appear in Creator League rankings</strong><small>When enabled, your public standing and placement reward badge are visible in League details.</small></span></label>" +
      "<input id='league-ranking-toggle' type='checkbox' role='switch' aria-label='Appear in Creator League rankings' aria-describedby='league-ranking-visibility-status' " +
      (rankingEnabled ? "checked" : "") + ">" +
      "<small id='league-ranking-visibility-status' role='status' aria-live='polite'>" +
      (rankingEnabled ? "Your ranking is visible to other members." : "Your ranking is hidden from public standings.") + "</small>" +
      "</div><div class='league-ranking-controls'>" +
      "<div class='league-ranking-period' role='group' aria-label='Leaderboard period'>" +
        "<button type='button' class='league-ranking-filter' data-league-period='daily' aria-pressed='" + (state.rankingPeriod === "daily") + "'>Daily</button>" +
        "<button type='button' class='league-ranking-filter' data-league-period='weekly' aria-pressed='" + (state.rankingPeriod === "weekly") + "'>Weekly</button>" +
      "</div>" +
      "<label class='league-ranking-class-label'>League class<select id='league-ranking-class' aria-label='Choose a Creator League class'>" + classOptions + "</select></label>" +
      "<small id='league-ranking-status' role='status' aria-live='polite'>Loading " + esc(state.rankingPeriod) + " " + esc(state.rankingClass) + " rankings…</small>" +
      "</div><div id='league-leaderboard-results'>" + leaderboardMarkup(overview.leaderboard || []) + "</div>";
  }
  async function loadLeaderboard() {
    const results = $("#league-leaderboard-results");
    const status = $("#league-ranking-status");
    if (!results || !isLeagueViewActive()) return;
    const token = ++leaderboardLoadToken;
    const period = state.rankingPeriod === "daily" ? "daily" : "weekly";
    const leagueClass = state.rankingClass || state.overview?.profile?.leagueClass || "";
    if (status) status.textContent = "Loading " + period + " " + leagueClass + " rankings…";
    try {
      const data = await request("/leagues/leaderboard?period=" + encodeURIComponent(period) + "&class=" + encodeURIComponent(leagueClass));
      if (token !== leaderboardLoadToken || !isLeagueViewActive()) return;
      results.innerHTML = leaderboardMarkup(data.leaderboard || []);
      if (status) {
        const count = Array.isArray(data.leaderboard) ? data.leaderboard.length : 0;
        status.textContent = (period === "daily" ? "Today" : "This week") + " · " +
          data.leagueClass + " · " + data.region + " · " + count + " creators ranked";
      }
    } catch (error) {
      if (token === leaderboardLoadToken && status) status.textContent = "Rankings could not update: " + error.message;
    }
  }
  function eventLabel(item) {
    const details = item.details || {};
    if (item.type === "creator_promotion") return "Promoted from " + (details.from || "a lower class") + " to " + (details.to || "a new class");
    if (item.type === "creator_demotion") return "Moved from " + (details.from || "a higher class") + " to " + (details.to || "a lower class");
    if (item.type === "league_shield_used") return "A League Shield protected your class";
    if (item.type === "match_rank_change") return "A League Match result was recorded";
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
        const restriction = power.usedToday ? "Used today" : unavailableShield ? "Shield active" : fixedTimer ? "Unavailable · fixed timer" : "Available once daily";
        return "<button type='button' class='league-powerup-btn' data-match-powerup-select='" + esc(power.id) + "' data-match-id='" + esc(match.id) + "' aria-label='Select " + esc(power.name) + " for this match'>" +
          "<span aria-hidden='true'>" + esc(power.symbol) + "</span><strong>" + esc(power.name) + "</strong><small>" + restriction + "</small></button>";
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
    return "<section class='card league-challenge-panel' id='league-challenge-zone'><div class='league-section-heading'><div><span class='league-eyebrow'>GO HEAD-TO-HEAD</span><h2>Challenge a creator</h2><p>Both creators must be connected to a real LIVE room before a match can begin.</p></div><span class='league-feature-icon'>⚔️</span></div>" +
      (own.length && others.length ? "<form id='league-challenge-form' class='league-challenge-form'><label>Your LIVE session<select name='ownSessionId' required>" + ownOptions + "</select></label><label>Creator to challenge<select name='opponentSessionId' required><option value=''>Choose a creator who is LIVE</option>" + otherOptions + "</select></label><label>Match scoring<select name='giftMode'><option value='all'>All LIVE Gifts count</option><option value='specific'>One selected Gift counts</option></select></label><label id='league-specific-gift-field' class='hidden'>Scoring Gift<select name='selectedGiftCode'>" + giftOptions + "</select></label><button class='primary' type='submit'>Send League Match challenge</button></form>" :
        "<div class='league-empty-inline'>" + (!own.length ? "Start your LIVE broadcast first. It will appear here once connected." : "No other eligible creators are LIVE right now. You can challenge someone when they go LIVE.") + "</div>") +
      "</section>";
  }
  function renderMarkup(overview, sessions) {
    const p = overview.profile;
    const matches = overview.activeMatches || [];
    const leaderboard = overview.leaderboard || [];
    const events = overview.recentEvents || [];
    return "<div class='league-page'><section class='league-hero' id='league-hero-zone'><div class='league-hero-copy'><span class='league-eyebrow'>MINGLORA COMPETITIVE</span><h1>League Arena</h1><p>Build your LIVE creator league. Compete in matches. Earn your place at the top.</p><div class='league-hero-tags'><span>🌍 " + esc(p.region) + " league</span><span>Season starts " + esc(p.seasonKey) + "</span></div></div><div class='league-hero-emblem'><span>🏆</span><small>" + esc(p.leagueClass) + "</small></div></section>" +
      "<section class='league-overview-grid' id='league-overview-zone'><article class='card league-stat-card league-primary-stat'><span class='league-eyebrow'>CURRENT CREATOR LEAGUE</span><div class='league-stat-value'>" + esc(p.leagueClass) + "</div><strong>" + Number(p.todayGiftPoints).toLocaleString() + " LIVE Gift points today</strong><p>" + Number(p.lifetimeGiftPoints).toLocaleString() + " lifetime eligible points · " + Number(p.seasonPoints).toLocaleString() + " this week</p><small>Your class is determined by daily placement and fragments, not a lifetime gift threshold.</small></article>" +
      "<article class='card league-stat-card'><span class='league-eyebrow'>LEAGUE FRAGMENTS</span><div class='league-stat-value match-rank-value'>" + (p.fragments >= 0 ? "+" : "") + Number(p.fragments || 0) + "</div><strong>" + (p.fragments >= 0 ? Number(p.fragments || 0) + " / 4 promotion fragments" : Math.abs(Number(p.fragments || 0)) + " / 4 demotion fragments") + "</strong>" + meter(Math.abs(Number(p.fragments || 0)),4) + "<small>" + (p.fragments < 0 ? "Recover fragments to protect your current tier." : p.fragments === 0 ? "Earn fragments through strong daily placement." : "Keep earning fragments to reach the next tier.") + "</small></article>" +
      "<article class='card league-stat-card'><span class='league-eyebrow'>LEAGUE SHIELDS</span><div class='league-stat-value match-rank-value'>" + Number(p.leagueShields || 0) + " / 10</div><strong>Automatic fragment protection</strong><p>A Shield absorbs one fragment loss before it affects your progress.</p><small>Earn one when promoted. Unused Shields do not expire.</small></article></section>" +
      "<section class='card league-ladder-panel' id='league-progression-zone'><div class='league-section-heading'><div><span class='league-eyebrow'>CREATOR PROGRESSION</span><h2>Creator League classes</h2><p>Climb the 18 regional tiers through daily class placement, accumulated fragments and League Shields.</p></div><span class='league-feature-icon'>📈</span></div>" + classLadderMarkup(overview.classes,p.leagueClass) + "<div class='league-rules-grid'><div><strong>Daily class placement</strong><p>Confirmed eligible LIVE Gift value ranks creators against others in the same class and region each day.</p></div><div><strong>Four-fragment movement</strong><p>Four earned fragments move you up one tier. Four lost fragments move you down one tier, except protected entry tiers D2–D5.</p></div><div><strong>League Shield protection</strong><p>Every promotion grants a Shield, up to 10. A Shield automatically prevents one fragment loss and never expires.</p></div></div></section>" +
      fragmentRulesMarkup() +
      challengeMarkup(overview,sessions) +
      powerupStudioMarkup(overview) +
      "<section class='league-matches-section' id='league-matches-zone'><div class='league-section-heading'><div><span class='league-eyebrow'>LIVE COMPETITION</span><h2>League Matches</h2><p>Gift points are counted for the match score while the original confirmed Gift value stays in Creator League totals.</p></div><div class='league-refresh-tools'><small id='league-refresh-status' aria-live='polite'>Live scores update automatically.</small></div></div>" + (matches.length ? "<div class='league-matches-grid'>" + matches.map(match=>matchCard(match,overview)).join("") + "</div>" : "<div class='league-empty-inline'>No League Matches yet. Challenge another creator who is LIVE to start one.</div>") + "</section>" +
      "<section class='card league-leaderboard-panel' id='league-leaderboard-zone'><div class='league-section-heading'><div><span class='league-eyebrow'>CREATOR DIVISIONS</span><h2>League leaderboard</h2><p>Browse daily or weekly confirmed LIVE Gift standings across your region's Creator League classes. Tap any creator to open their profile.</p></div></div>" + rankingControlsMarkup(overview) + "</section>" +
      "<section class='card league-events-panel' id='league-events-zone'><div class='league-section-heading'><div><span class='league-eyebrow'>YOUR PROGRESSION</span><h2>League activity</h2></div></div>" + (events.length ? "<div class='league-events-list'>" + events.map(item=>"<div class='league-event-row'><span>✦</span><div><strong>" + esc(eventLabel(item)) + "</strong><small>" + new Date(item.createdAt).toLocaleString() + "</small></div></div>").join("") + "</div>" : "<div class='league-empty-inline'>Promotions, demotions, shields and completed matches will appear here.</div>") + "</section>" +

      "<p class='league-footnote'>Minglora uses its own branding and assets with a TikTok LIVE-style Creator League structure. Daily class placement controls fragment movement; weekly and lifetime gift totals remain reporting statistics and do not directly promote a class.</p></div>";
  }
  function bindActions() {
    const form = $("#league-challenge-form");
    if (form && form.dataset.leagueChallengeBound !== "true") {
      form.dataset.leagueChallengeBound = "true";
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
    document.querySelectorAll("[data-match-accept]").forEach(button => {
      if (button.dataset.leagueAcceptBound === "true") return;
      button.dataset.leagueAcceptBound = "true";
      button.addEventListener("click", async () => {
        button.disabled = true;
        try { await request("/leagues/matches/" + encodeURIComponent(button.dataset.matchAccept) + "/accept", {method:"POST",body:"{}"}); toast("League Match accepted."); await render(); }
        catch(error) { toast(error.message); button.disabled = false; }
      });
    });
    document.querySelectorAll("[data-match-support]").forEach(button => {
      if (button.dataset.leagueSupportBound === "true") return;
      button.dataset.leagueSupportBound = "true";
      button.addEventListener("click", async () => {
        button.disabled = true;
        try { await request("/leagues/matches/" + encodeURIComponent(button.dataset.matchId) + "/support", {method:"POST",body:JSON.stringify({side:button.dataset.matchSupport})}); toast("Your match support was counted."); await render(); }
        catch(error) { toast(error.message); button.disabled = false; }
      });
    });
    document.querySelectorAll("[data-powerup-select]").forEach(button => {
      if (button.dataset.powerupSelectBound === "true") return;
      button.dataset.powerupSelectBound = "true";
      button.addEventListener("click", () => {
        state.selectedPowerupId = button.dataset.powerupSelect || "";
        state.selectedMatchId = "";
        updatePowerupSelection();
      });
    });
    document.querySelectorAll("[data-match-powerup-select]").forEach(button => {
      if (button.dataset.leaguePowerupSelectBound === "true") return;
      button.dataset.leaguePowerupSelectBound = "true";
      button.addEventListener("click", () => {
        state.selectedPowerupId = button.dataset.matchPowerupSelect || "";
        state.selectedMatchId = button.dataset.matchId || "";
        updatePowerupSelection();
        $("#league-powerup-panel")?.scrollIntoView({behavior:"smooth",block:"center"});
      });
    });
    const activatePowerup = $("#league-powerup-activate");
    if (activatePowerup && !activatePowerup.dataset.actionBound) {
      activatePowerup.dataset.actionBound = "true";
      activatePowerup.addEventListener("click", () => { void activateSelectedPowerup(activatePowerup); });
    }
    updatePowerupSelection();

    const rankingToggle = $("#league-ranking-toggle");
    if (rankingToggle && rankingToggle.dataset.rankingVisibilityBound !== "true") {
      rankingToggle.dataset.rankingVisibilityBound = "true";
      rankingToggle.addEventListener("change", async () => {
        const enabled = rankingToggle.checked;
        const status = $("#league-ranking-visibility-status");
        const previous = state.overview?.profile?.rankingEnabled !== false;
        rankingToggle.disabled = true;
        if (status) status.textContent = "Saving your ranking visibility…";
        try {
          const result = await request("/leagues/ranking-preference", {
            method: "POST", body: JSON.stringify({ enabled })
          });
          const saved = result.rankingEnabled === true;
          if (state.overview?.profile) state.overview.profile.rankingEnabled = saved;
          rankingToggle.checked = saved;
          if (status) status.textContent = saved
            ? "Your ranking is visible to other members."
            : "Your ranking is hidden from public standings. Your League progress is unchanged.";
          await loadLeaderboard();
        } catch (error) {
          rankingToggle.checked = previous;
          if (status) status.textContent = error.message || "Your ranking visibility could not be saved.";
          toast(error.message || "Your ranking visibility could not be saved.");
        } finally {
          rankingToggle.disabled = false;
        }
      });
    }
    document.querySelectorAll("[data-league-period]").forEach(button => {
      if (button.dataset.leaguePeriodBound === "true") return;
      button.dataset.leaguePeriodBound = "true";
      button.addEventListener("click", () => {
        const next = button.dataset.leaguePeriod;
        if (!["daily", "weekly"].includes(next) || next === state.rankingPeriod) return;
        state.rankingPeriod = next;
        document.querySelectorAll("[data-league-period]").forEach(item =>
          item.setAttribute("aria-pressed", String(item.dataset.leaguePeriod === next))
        );
        void loadLeaderboard();
      });
    });
    const rankingClass = $("#league-ranking-class");
    if (rankingClass && rankingClass.dataset.leagueClassBound !== "true") {
      rankingClass.dataset.leagueClassBound = "true";
      rankingClass.addEventListener("change", () => {
        state.rankingClass = rankingClass.value;
        void loadLeaderboard();
      });
    }
    document.querySelectorAll("[data-league-profile]").forEach(button => {
      if (button.dataset.leagueProfileBound === "true") return;
      button.dataset.leagueProfileBound = "true";
      button.addEventListener("click", () => {
        const userId = button.dataset.leagueProfile;
        if (userId) window.dispatchEvent(new CustomEvent("minglora:open-profile", { detail: { userId } }));
      });
    });
    updateRefreshStatus();
    void loadLeaderboard();
  }
  function onNavigateAway() {
    viewGeneration += 1;
    if (autoSyncTimer !== null) window.clearInterval(autoSyncTimer);
    autoSyncTimer = null;
    refreshToken += 1;
    refreshInFlight = false;
    if (refreshController) refreshController.abort();
    refreshController = null;
    state.refreshing = false;
  }
  async function refreshScores(force = false) {
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
      // Update only live-data sections. Replacing #main-content every five
      // seconds reset scroll, dropped focus and disrupted the user's current
      // interaction even though they had not navigated away from League Arena.
      const scrollTop = main.scrollTop;
      const scrollX = window.scrollX || 0;
      const scrollY = window.scrollY || 0;
      const focused = document.activeElement;
      const incomingRoot = document.createElement("div");
      incomingRoot.innerHTML = renderMarkup(state.overview, state.sessions);
      const refreshZones = [
        "league-hero-zone",
        "league-overview-zone",
        "league-progression-zone",
        "league-fragment-reference-zone",
        "league-challenge-zone",
        "league-powerup-panel",
        "league-matches-zone",
        "league-leaderboard-zone",
        "league-events-zone"
      ];
      for (const id of refreshZones) {
        const current = document.getElementById(id);
        const incoming = incomingRoot.querySelector("#" + id);
        if (!current || !incoming) continue;
        // Never remove a control while the user is interacting with its section.
        if (focused && current.contains(focused)) continue;
        current.replaceWith(incoming);
      }
      main.scrollTop = scrollTop;
      window.scrollTo(scrollX, scrollY);
      bindActions();
    } catch (error) {
      if (token === refreshToken && error?.name !== "AbortError") {
        state.refreshError = error.message || "Minglora could not update League data.";
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
    autoSyncTimer = window.setInterval(() => void refreshScores(), 20000);
  }
  // League data updates automatically without a page reload or manual refresh control.
  window.MingloraLeagues = { render, onNavigateAway };
})();