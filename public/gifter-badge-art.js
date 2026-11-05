(() => {
  "use strict";

  let instance = 0;

  const PALETTES = [
    { light:"#e7f7ff", mid:"#76b8dc", dark:"#285b83", edge:"#f8fdff", glow:"rgba(76,170,226,.34)" },
    { light:"#ffe0b2", mid:"#c17a3b", dark:"#6d351d", edge:"#fff0d9", glow:"rgba(209,127,59,.34)" },
    { light:"#f6fbff", mid:"#9fb2c8", dark:"#465e7c", edge:"#ffffff", glow:"rgba(153,184,218,.34)" },
    { light:"#fff2b0", mid:"#e3a928", dark:"#7f4b0c", edge:"#fff9df", glow:"rgba(245,188,66,.36)" },
    { light:"#f5eaff", mid:"#a88bd8", dark:"#55428e", edge:"#fff7ff", glow:"rgba(168,137,226,.34)" },
    { light:"#e0fcff", mid:"#62c6ed", dark:"#1d5f9d", edge:"#f4ffff", glow:"rgba(69,195,238,.38)" },
    { light:"#ffd6ee", mid:"#d15c9a", dark:"#70234e", edge:"#fff2fa", glow:"rgba(225,90,164,.36)" },
    { light:"#eadbff", mid:"#9867db", dark:"#49227d", edge:"#fbf3ff", glow:"rgba(151,97,222,.4)" },
    { light:"#d9fff2", mid:"#4bbf9c", dark:"#176252", edge:"#f1fff9", glow:"rgba(62,198,158,.38)" },
    { light:"#ffe8c9", mid:"#e1a9ed", dark:"#7c328d", edge:"#fff9ee", glow:"rgba(236,151,219,.44)" }
  ];

  // Distinct jewel cuts by five-level tier; the level number remains the member's exact level.
  const SHAPES = [
    "48,10 67,29 59,60 48,74 37,60 29,29",
    "48,7 72,29 48,75 24,29",
    "48,7 70,20 70,54 48,76 26,54 26,20",
    "48,5 74,25 65,59 48,77 31,59 22,25",
    "48,4 76,27 65,64 48,80 31,64 20,27",
    "48,4 69,14 79,42 48,80 17,42 27,14",
    "48,4 65,10 78,33 72,61 48,81 24,61 18,33 31,10",
    "48,3 70,15 80,39 67,68 48,82 29,68 16,39 26,15",
    "48,3 65,8 80,29 75,60 48,83 21,60 16,29 31,8",
    "48,2 68,8 85,28 78,60 48,85 18,60 11,28 28,8"
  ];

  const safeLevel = value => Math.max(1, Math.min(50, Math.floor(Number(value) || 1)));
  const safeTier = (level, tier) => Math.max(1, Math.min(10, Math.floor(Number(tier) || Math.ceil(safeLevel(level) / 5))));
  const safeText = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[char]));

  function gemSvg(tier, inline = false) {
    const palette = PALETTES[tier - 1];
    const points = SHAPES[tier - 1].split(" ");
    const id = "minglora-gem-" + (++instance);
    const centre = "48,43";
    const facets = points.map(point => "M" + point + " L" + centre).join(" ");
    const topFacet = points.slice(0, 3).join(" ");
    const lowerFacet = points.slice(3).reverse().join(" ");
    return "<svg class='" + (inline ? "gp-inline-gem-svg" : "gp-gem-svg") +
      "' viewBox='0 0 96 90' aria-hidden='true' focusable='false'>" +
      "<defs><linearGradient id='" + id + "' x1='12%' y1='5%' x2='88%' y2='95%'>" +
      "<stop offset='0%' stop-color='" + palette.light + "'/><stop offset='48%' stop-color='" + palette.mid +
      "'/><stop offset='100%' stop-color='" + palette.dark + "'/></linearGradient></defs>" +
      "<path class='gp-gem-drop' d='M48 7 78 27 70 64 48 83 26 64 18 27Z'/>" +
      "<polygon class='gp-gem-body' points='" + SHAPES[tier - 1] + "' fill='url(#" + id + ")' stroke='" + palette.edge +
      "' stroke-width='3.2' stroke-linejoin='round'/>" +
      "<polygon class='gp-gem-facet gp-gem-facet--top' points='" + topFacet + " " + centre + "'/>" +
      "<polygon class='gp-gem-facet gp-gem-facet--bottom' points='" + lowerFacet + " " + centre + "'/>" +
      "<path class='gp-gem-cut-lines' d='" + facets + "'/>" +
      "<path class='gp-gem-flash' d='M30 25 44 14 38 36Z'/>" +
      "<path class='gp-gem-base' d='M35 69 48 78 61 69'/>" +
      "</svg>";
  }

  function render({ level, tier, badgeName, compact = false, inline = false } = {}) {
    const value = safeLevel(level);
    const band = safeTier(value, tier);
    const name = safeText(badgeName || ("Gifter LV " + value));
    if (inline) {
      return "<span class='gp-inline-badge gp-tier-" + band + "' role='img' aria-label='" + name +
        "' title='" + name + "'><span class='gp-inline-gem'>" + gemSvg(band, true) +
        "</span><strong>" + value + "</strong></span>";
    }
    const classes = "gp-badge gp-tier-" + band + (compact ? " gp-badge--small" : "");
    return "<span class='" + classes + "' role='img' aria-label='" + name + "' title='" + name + "'>" +
      "<span class='gp-gem-stage'><span class='gp-gem-aura'></span><span class='gp-gem-orbit'></span>" +
      gemSvg(band, false) + "<span class='gp-gem-sparkle gp-gem-sparkle--one'></span>" +
      "<span class='gp-gem-sparkle gp-gem-sparkle--two'></span></span>" +
      (compact ? "" : "<span class='gp-badge-level'>LV <b>" + value + "</b></span><span class='gp-badge-caption'>GIFTER</span>") +
      "</span>";
  }

  window.MingloraGifterBadgeArt = Object.freeze({ render });
})();
