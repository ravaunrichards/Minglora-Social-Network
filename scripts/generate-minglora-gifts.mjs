import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = path.join(ROOT, "data", "minglora-gift-catalog.json");
const ASSET_DIR = path.join(ROOT, "public", "assets", "gifts", "catalog");

function hash32(value) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function palette(gift) {
  const palettes = {
    flowers: ["#f76e9c", "#8f2f78", "#ffd37a"],
    hearts: ["#ff5d89", "#a72d70", "#ffc2d3"],
    animals: ["#39b8ad", "#205f88", "#ffd18c"],
    vehicles: ["#ff9d43", "#a84164", "#9ce8f2"],
    music: ["#9676ff", "#3d4aa0", "#ffb6dd"],
    sports: ["#e7a43c", "#8b4b26", "#d4f17c"],
    food_drink: ["#f7a35e", "#a94c45", "#ffe2a4"],
    fashion_beauty: ["#f28ab8", "#783b85", "#ffe0ae"],
    luxury: ["#e7bb55", "#81572e", "#fff0a8"],
    celebrations: ["#f36d74", "#8b3d9e", "#ffe18b"],
    fantasy: ["#8f83ff", "#3d367d", "#9cf6ee"],
    nature: ["#4cae7c", "#24614f", "#f2d37d"],
    travel: ["#4f9ad8", "#254a88", "#ffc66d"],
    games: ["#6b8cff", "#3e3b91", "#ffcf70"],
    community: ["#e08a58", "#854a61", "#ffe2a0"],
    symbols: ["#65b9d8", "#335d92", "#f7da81"],
    other: ["#8c83d8", "#45436f", "#f4c879"]
  };
  const list = palettes[gift.category] || palettes.other;
  const seed = hash32(gift.code);
  const shift = (seed % 17) - 8;
  return list.map((hex, index) => {
    const num = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, (num >> 16) + shift));
    const g = Math.max(0, Math.min(255, ((num >> 8) & 255) + shift));
    const b = Math.max(0, Math.min(255, (num & 255) + shift));
    return "#" + [r,g,b].map(v => v.toString(16).padStart(2,"0")).join("");
  });
}
function symbolFor(gift) {
  const name = gift.name.toLowerCase();
  const rules = [
    [/hibiscus/,"🌺"], [/rose|flower|tulip|bouquet|blossom|sakura|orchid|lotus/,"🌹"],
    [/cnc coin/,"🪙"], [/easter heart/,"💖"], [/fighting|boxing glove|boxing/,"🥊"],
    [/kitty pillow/,"🐱"], [/otter/,"🦦"], [/four leaf clover|clover/,"🍀"],
    [/dj headphone|headphone/,"🎧"], [/yalla sahel/,"👋"], [/merdeka|festival/,"🎊"],
    [/pop, don/,"🎈"], [/house hat/,"🎩"], [/let.?s be friends/,"🤝"],
    [/audience laughter/,"😂"], [/star hero stage/,"🌟"], [/picture perfect/,"📸"],
    [/championship hall/,"🏆"], [/klcc|jakarta roundabout/,"🏙️"],
    [/alpha wolves/,"🐺"], [/golden falcons|falcon/,"🦅"], [/keeper of atlantis/,"🔱"],
    [/noble stallions|stallion/,"🐎"], [/royal lions|lion/,"🦁"],
    [/ultimate match/,"⚔️"], [/goal of glory/,"🏆"], [/flamenco dancers/,"💃"],
    [/baseball/,"⚾"], [/basketball/,"🏀"], [/football|soccer/,"⚽"], [/volleyball/,"🏐"],
    [/tennis/,"🎾"], [/cricket/,"🏏"], [/boxing glove|boxing/,"🥊"], [/golf/,"⛳"],
    [/cat|kitten/,"🐱"], [/dog|puppy|shiba|corgi/,"🐶"], [/bear|panda/,"🐻"],
    [/lion/,"🦁"], [/tiger/,"🐯"], [/fox/,"🦊"], [/rabbit|bunny/,"🐰"],
    [/horse|unicorn|pegasus/,"🦄"], [/dragon/,"🐉"], [/dinosaur|t.rex|trex/,"🦖"],
    [/whale/,"🐳"], [/dolphin/,"🐬"], [/shark/,"🦈"], [/fish/,"🐠"],
    [/eagle|falcon/,"🦅"], [/parrot/,"🦜"], [/swan|dove/,"🕊️"], [/penguin/,"🐧"],
    [/butterfly/,"🦋"], [/bee/,"🐝"], [/frog/,"🐸"], [/turtle/,"🐢"],
    [/car|vehicle|sports car|truck|bus/,"🏎️"], [/motorcycle|motorbike/,"🏍️"],
    [/bicycle|bike|cycling/,"🚲"], [/helicopter/,"🚁"], [/train/,"🚂"],
    [/plane|jet|aircraft|shuttle/,"✈️"], [/boat|ship|yacht/,"🛥️"], [/rocket/,"🚀"],
    [/guitar/,"🎸"], [/drum/,"🥁"], [/piano|keyboard/,"🎹"], [/mic|microphone/,"🎤"],
    [/music|headphone|speaker|melody|beat/,"🎵"], [/trophy|medal|champion|award/,"🏆"],
    [/ice cream|gelato|popsicle/,"🍦"], [/cake|cupcake|birthday/,"🎂"], [/pizza/,"🍕"],
    [/coffee/,"☕"], [/tea/,"🫖"], [/juice|smoothie/,"🧃"], [/watermelon/,"🍉"],
    [/mango/,"🥭"], [/cherry/,"🍒"], [/corn/,"🌽"], [/chili|chilli|pepper/,"🌶️"],
    [/perfume/,"🧴"], [/diamond|crystal|gem/,"💎"], [/crown|tiara/,"👑"],
    [/ring|necklace|jewelry/,"💍"], [/money|cash|coin|gold mine/,"💰"],
    [/firework|confetti|balloon|party|celebration/,"🎉"], [/tree|forest|garden|island/,"🌳"],
    [/star|moon|sun|galaxy|universe|space|nebula/,"🌌"], [/alien/,"👽"],
    [/game|gaming|controller|arcade/,"🎮"], [/camera|photo/,"📸"],
    [/clapperboard|movie|film/,"🎬"], [/book|study|school/,"📚"],
    [/castle|palace|kingdom/,"🏰"], [/house|home/,"🏠"], [/flag|jamaica|parish/,"🇯🇲"],
    [/umbrella/,"☂️"], [/clock|watch|time/,"⌚"], [/phone|mobile/,"📱"]
  ];
  for (const pair of rules) if (pair[0].test(name)) return pair[1];
  return gift.emoji || "🎁";
}

function premiumSvgShape(gift) {
  const n = String(gift.name || "").toLowerCase();
  if (/you are wanted/.test(n)) return '<circle cx="256" cy="250" r="150" fill="none" stroke="url(#shine)" stroke-width="27"/><circle cx="256" cy="250" r="94" fill="none" stroke="#fff" stroke-width="18"/><circle cx="256" cy="250" r="38" fill="url(#main)"/><path d="M256 95v-40m0 390v-40M101 250H61m390 0h-40" stroke="#fff" stroke-width="15" stroke-linecap="round"/>';
  if (/hot rods/.test(n)) return '<path d="M91 305l35-91q12-27 48-31l38-62h104l54 61q38 5 51 38l20 85-24 28H111z" fill="url(#main)" stroke="#fff" stroke-width="10" stroke-linejoin="round"/><path d="M215 151h91l42 60H176z" fill="#b8f5ff" stroke="#fff" stroke-width="7"/><circle cx="165" cy="329" r="47" fill="#1c2541" stroke="#fff" stroke-width="11"/><circle cx="357" cy="329" r="47" fill="#1c2541" stroke="#fff" stroke-width="11"/><path d="M83 242l-38-18m37 51-52-3m411-42 38-18m-38 51 52-3" stroke="url(#shine)" stroke-width="15" stroke-linecap="round"/>';
  if (/red lightning/.test(n)) return '<path d="M292 67 139 274h99l-21 171 158-234h-99z" fill="url(#main)" stroke="#fff" stroke-width="13" stroke-linejoin="round"/><path d="M106 156l23 27m254 164 27 23" stroke="url(#shine)" stroke-width="17" stroke-linecap="round"/>';
  if (/monster truck/.test(n)) return '<path d="M95 245q0-44 43-44h232q43 0 50 47l18 63H78z" fill="url(#main)" stroke="#fff" stroke-width="10"/><path d="M171 203l34-72h102l37 72" fill="#b7edff" stroke="#fff" stroke-width="8"/><circle cx="153" cy="333" r="69" fill="#172039" stroke="#fff" stroke-width="13"/><circle cx="359" cy="333" r="69" fill="#172039" stroke="#fff" stroke-width="13"/><circle cx="153" cy="333" r="28" fill="url(#shine)"/><circle cx="359" cy="333" r="28" fill="url(#shine)"/>';
  if (/crystal heart/.test(n)) return '<path d="M256 395 121 268q-64-76 1-137 61-57 134 13 73-70 134-13 65 61 1 137z" fill="url(#main)" stroke="#fff" stroke-width="10"/><path d="M256 144v251m-134-127h268m-201-96 67 96 67-96m-134 96 67 127 67-127" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="8"/>';
  if (/iron resolve/.test(n)) return '<path d="M256 76 391 126v122q0 112-135 190Q121 360 121 248V126z" fill="url(#main)" stroke="#fff" stroke-width="12"/><path d="m256 133 17 93 82 18-82 18-17 94-17-94-82-18 82-18z" fill="url(#shine)" stroke="#fff" stroke-width="6"/><path d="M256 115v267" stroke="#fff" stroke-opacity=".75" stroke-width="7"/>';
  if (/a fun house/.test(n)) return '<path d="M105 396V205q0-44 46-44h210q46 0 46 44v191z" fill="url(#main)" stroke="#fff" stroke-width="10"/><path d="m91 169 165-111 165 111z" fill="url(#shine)" stroke="#fff" stroke-width="10"/><path d="M202 396V276q0-58 54-58t54 58v120" fill="#29244e" stroke="#fff" stroke-width="9"/><circle cx="174" cy="210" r="17" fill="#fff"/><circle cx="338" cy="210" r="17" fill="#fff"/>';
  if (/corgi/.test(n)) return '<path d="m139 193-18-107 101 48q34-18 68 0l101-48-19 107q26 38 9 104-25 97-125 97t-125-97q-17-66 8-104z" fill="url(#main)" stroke="#fff" stroke-width="10"/><ellipse cx="211" cy="247" rx="15" ry="21" fill="#222943"/><ellipse cx="301" cy="247" rx="15" ry="21" fill="#222943"/><ellipse cx="256" cy="300" rx="49" ry="34" fill="#fff0d5"/><path d="M240 291q16 17 32 0" fill="none" stroke="#8b5263" stroke-width="8" stroke-linecap="round"/><path d="M158 352q98 57 196 0" fill="none" stroke="url(#shine)" stroke-width="12"/>';
  if (/dreamy night/.test(n)) return '<path d="M332 91q-122 16-125 144-3 121 121 154-39 37-95 32-133-13-133-156 0-148 145-164 47-5 87-10z" fill="url(#shine)" stroke="#fff" stroke-width="9"/><path d="m354 137 13 38 40 13-40 13-13 40-13-40-40-13 40-13zM151 288l9 25 26 9-26 9-9 26-9-26-26-9 26-9z" fill="#fff"/><circle cx="364" cy="326" r="12" fill="#fff"/>';
  if (/vintage car/.test(n)) return '<path d="M104 302q22-77 75-103h155q56 26 74 103l15 29H89z" fill="url(#main)" stroke="#fff" stroke-width="10"/><path d="M187 201q23-74 72-74t74 74" fill="none" stroke="url(#shine)" stroke-width="15"/><path d="M191 208h130l39 77H153z" fill="#bdeeff" stroke="#fff" stroke-width="7"/><circle cx="163" cy="332" r="42" fill="#25283d" stroke="#fff" stroke-width="10"/><circle cx="352" cy="332" r="42" fill="#25283d" stroke="#fff" stroke-width="10"/>';
  if (/gobble grab/.test(n)) return '<ellipse cx="256" cy="289" rx="81" ry="113" fill="url(#main)" stroke="#fff" stroke-width="9"/><path d="M256 193q-124-106-127 14 0 56 76 68-92 43-48 104 48 47 103-26 55 73 103 26 44-61-48-104 76-12 76-68-3-120-127-14z" fill="url(#shine)" stroke="#fff" stroke-width="7"/><circle cx="225" cy="233" r="10" fill="#24243d"/><circle cx="287" cy="233" r="10" fill="#24243d"/><path d="m245 259 22 0-11 27z" fill="#f59b36"/>';
  if (/jet car/.test(n)) return '<path d="M92 305 148 227l95-20 75-76 56 78 49 45-23 48H92z" fill="url(#main)" stroke="#fff" stroke-width="10" stroke-linejoin="round"/><path d="m218 216 35-63 69-22-43 74z" fill="#b8f6ff" stroke="#fff" stroke-width="7"/><path d="m130 292-75 40m335-105 62-39" stroke="url(#shine)" stroke-width="16" stroke-linecap="round"/><circle cx="168" cy="329" r="34" fill="#22283f" stroke="#fff" stroke-width="9"/><circle cx="357" cy="329" r="34" fill="#22283f" stroke="#fff" stroke-width="9"/>';
  if (/super car/.test(n)) return '<path d="M82 307q45-86 111-95l48-65h112l70 67q17 16 26 93l-19 29H102z" fill="url(#main)" stroke="#fff" stroke-width="10"/><path d="M230 165h101l59 66H180z" fill="#b9f2ff" stroke="#fff" stroke-width="7"/><path d="M100 282h316" stroke="url(#shine)" stroke-width="10"/><circle cx="161" cy="337" r="39" fill="#1d253d" stroke="#fff" stroke-width="10"/><circle cx="361" cy="337" r="39" fill="#1d253d" stroke="#fff" stroke-width="10"/>';
  if (/masquerade/.test(n)) return '<path d="M91 191q165-104 330 0l-27 137q-60 37-119-12-59 49-119 12z" fill="url(#main)" stroke="#fff" stroke-width="11"/><path d="M133 218q53-42 105 0-53 73-105 0zm141 0q53-42 105 0-53 73-105 0z" fill="#171d39" stroke="#fff" stroke-width="7"/><path d="m256 260-31 77h62z" fill="url(#shine)"/><path d="M340 91q72-66 98 13-49 12-98-13z" fill="url(#shine)"/>';
  if (/pop out/.test(n)) return '<path d="M180 352q-54-60 0-103t0-102q76-50 76 24t0 105q-2 76 0 107" fill="none" stroke="url(#shine)" stroke-width="25" stroke-linecap="round"/><path d="M332 352q54-60 0-103t0-102q-76-50-76 24t0 105q2 76 0 107" fill="none" stroke="url(#main)" stroke-width="25" stroke-linecap="round"/><path d="m256 59 24 91 88-26-47 80 84 45-96 12 11 95-64-71-64 71 11-95-96-12 84-45-47-80 88 26z" fill="none" stroke="#fff" stroke-width="9"/>';
  if (/villainy slain/.test(n)) return '<path d="M256 73 395 128v122q0 108-139 183Q117 358 117 250V128z" fill="url(#main)" stroke="#fff" stroke-width="11"/><path d="m256 112 22 125 103 21-103 20-22 124-22-124-103-20 103-21z" fill="url(#shine)" stroke="#fff" stroke-width="7"/><path d="m151 360 211-211" stroke="#fff" stroke-width="17" stroke-linecap="round"/>';
  if (/live pro face-off/.test(n)) return '<path d="M93 203q0-52 55-52h41q45 0 45 48v96q0 62-68 62h-18q-55 0-55-56zM419 203q0-52-55-52h-41q-45 0-45 48v96q0 62 68 62h18q55 0 55-56z" fill="url(#main)" stroke="#fff" stroke-width="10"/><path d="m231 165 25-56 25 56-25 56z" fill="url(#shine)" stroke="#fff" stroke-width="8"/><text x="256" y="286" font-size="88" text-anchor="middle" font-weight="900" fill="#fff" stroke="#5b357f" stroke-width="5" paint-order="stroke">VS</text>';
  if (/fair king/.test(n)) return '<path d="M87 175 171 254l85-139 85 139 84-79-27 204H114z" fill="url(#main)" stroke="#fff" stroke-width="11"/><path d="M114 379h284v49H114z" fill="url(#shine)" stroke="#fff" stroke-width="8"/><circle cx="171" cy="254" r="20" fill="#fff"/><circle cx="256" cy="115" r="24" fill="#fff"/><circle cx="341" cy="254" r="20" fill="#fff"/>';
  return "";
}

function svgArt(gift) {
  const colors = palette(gift);
  const seed = hash32(gift.code);
  const symbol = symbolFor(gift);
  const name = String(gift.name || "").toLowerCase();
  const rot = (seed % 31) - 15;
  const star1 = 45 + (seed % 50);
  const star2 = 370 + (seed % 60);
  const ring = 185 + (seed % 35);
  const bg1 = colors[1], bg2 = colors[0], shine = colors[2];
  const icon = (gift.category === "hearts" ? "heart" :
    gift.category === "flowers" ? "petal" :
    gift.category === "animals" ? "creature" :
    gift.category === "vehicles" ? "motion" :
    gift.category === "music" ? "sound" :
    gift.category === "sports" ? "sport" :
    gift.category === "food_drink" ? "delight" :
    gift.category === "luxury" || gift.category === "fashion_beauty" ? "jewel" :
    gift.category === "fantasy" ? "cosmic" :
    gift.category === "nature" ? "leaf" :
    gift.category === "travel" ? "horizon" :
    gift.category === "games" ? "pixel" :
    gift.category === "community" ? "bond" : "spark");
  let shape = premiumSvgShape(gift);
  if (shape) { /* gift-specific premium illustration */
  } else if (/^rose$|^white rose$|^crystal rose$|^my first rose$/.test(name)) {
    shape = '<path d="M256 304v122m0-78c-58-39-81 8-81 8 40 37 62 12 81-8zm0 31c57-42 81 7 81 7-41 37-62 12-81-7z" fill="none" stroke="#58c27b" stroke-width="17" stroke-linecap="round"/><path d="M246 325q-52-39-43-82m65 82q52-39 43-82" fill="none" stroke="#429c68" stroke-width="7"/><g fill="url(#main)" stroke="#fff" stroke-opacity=".7" stroke-width="5"><ellipse cx="256" cy="208" rx="37" ry="79"/><ellipse cx="256" cy="208" rx="37" ry="79" transform="rotate(55 256 256)"/><ellipse cx="256" cy="208" rx="37" ry="79" transform="rotate(110 256 256)"/><ellipse cx="256" cy="208" rx="37" ry="79" transform="rotate(165 256 256)"/></g><circle cx="256" cy="256" r="39" fill="url(#shine)"/>';
  } else if (/cnc coin/.test(name)) {
    shape = '<circle cx="256" cy="256" r="145" fill="url(#main)" stroke="#fff" stroke-width="13"/><circle cx="256" cy="256" r="115" fill="none" stroke="url(#shine)" stroke-width="12"/><path d="M256 166v180m-43-143h58q38 0 38 33t-38 33h-46q-37 0-37 32t38 32h59" fill="none" stroke="#fff" stroke-width="18" stroke-linecap="round"/><path d="M256 126v-24m0 308v-24" stroke="#fff" stroke-width="8" stroke-linecap="round"/>';
  } else if (/fighting/.test(name)) {
    shape = '<path d="M163 311q-13-22 5-43l39-49q14-16 31-5l20 13 23-43q15-24 34-9 13 10 5 29l-19 45 24-33q17-20 34-5 13 12 1 31l-26 42q25-19 40-1 12 15-3 33l-48 61q-23 30-62 28l-59-7q-40-7-50-43z" fill="url(#main)" stroke="#fff" stroke-width="10" stroke-linejoin="round"/><path d="M162 346l-34 28 41 59 37-30" fill="#f3b2c9" stroke="#fff" stroke-width="8" stroke-linejoin="round"/><path d="M225 253l25 20m21-47 24 19m21-17 22 18" fill="none" stroke="url(#shine)" stroke-width="13" stroke-linecap="round"/>';
  } else if (/baseball/.test(name)) {
    shape = '<circle cx="256" cy="252" r="132" fill="#fff" stroke="#d6e2ef" stroke-width="12"/><path d="M158 154q98 98 0 196m196-196q-98 98 0 196" fill="none" stroke="#d84854" stroke-width="12" stroke-linecap="round"/><path d="M165 173l-15 15m34 14-15 15m34 14-15 15m34 14-15 15m34 14-15 15m34 14-15 15m34-173 15 15m-34 14 15 15m-34 14 15 15m-34 14 15 15m-34 14 15 15m-34 14 15 15" stroke="#d84854" stroke-width="7" stroke-linecap="round"/>';
  } else if (/ice cream|gelato|popsicle/.test(name)) {
    shape = '<path d="M186 252h140l-65 174q-5 13-12 0z" fill="#b87b48" stroke="#fff" stroke-width="8" stroke-linejoin="round"/><path d="M186 256q-28-18-28-56 0-75 98-75t98 75q0 38-28 56z" fill="url(#main)" stroke="#fff" stroke-width="9"/><circle cx="224" cy="193" r="14" fill="#fff" fill-opacity=".6"/><circle cx="277" cy="174" r="10" fill="#fff" fill-opacity=".7"/>';
  } else if (/coffee/.test(name)) {
    shape = '<path d="M167 209h177l-18 165q-4 28-31 28h-79q-27 0-31-28z" fill="url(#main)" stroke="#fff" stroke-width="9"/><path d="M344 241h42q52 0 42 60-9 50-63 48" fill="none" stroke="#fff" stroke-width="18"/><path d="M218 175q-28-38 0-69m52 69q-28-38 0-69m52 69q-28-38 0-69" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="10" stroke-linecap="round"/>';
  } else if (icon === "heart") {
    shape = '<path d="M256 356C198 309 132 259 132 194c0-43 31-73 72-73 25 0 43 13 52 32 11-19 30-32 55-32 42 0 73 31 73 73 0 65-66 115-128 162z" fill="url(#main)" stroke="#fff" stroke-opacity=".7" stroke-width="8"/>';
  } else if (icon === "petal") {
    shape = '<g fill="url(#main)" stroke="#fff" stroke-opacity=".68" stroke-width="5"><ellipse cx="256" cy="181" rx="34" ry="81"/><ellipse cx="256" cy="181" rx="34" ry="81" transform="rotate(45 256 256)"/><ellipse cx="256" cy="181" rx="34" ry="81" transform="rotate(90 256 256)"/><ellipse cx="256" cy="181" rx="34" ry="81" transform="rotate(135 256 256)"/></g><circle cx="256" cy="256" r="48" fill="url(#shine)"/><path d="M256 304v111m0-64c-58-42-80 6-80 6 40 37 62 13 80-6zm0 22c57-42 81 8 81 8-41 37-62 12-81-8z" fill="none" stroke="#72d39c" stroke-width="16" stroke-linecap="round"/>';
  } else if (icon === "creature") {
    shape = '<ellipse cx="256" cy="288" rx="104" ry="91" fill="url(#main)" stroke="#fff" stroke-opacity=".65" stroke-width="7"/><circle cx="256" cy="205" r="82" fill="url(#shine)" stroke="#fff" stroke-opacity=".75" stroke-width="7"/><path d="M198 155l-20-67 70 38m48 29 21-67-71 38" fill="url(#main)" stroke="#fff" stroke-opacity=".6" stroke-width="7" stroke-linejoin="round"/><ellipse cx="226" cy="207" rx="10" ry="15" fill="#26334d"/><ellipse cx="286" cy="207" rx="10" ry="15" fill="#26334d"/><path d="M238 245q18 18 36 0" fill="none" stroke="#26334d" stroke-width="8" stroke-linecap="round"/>';
  } else if (icon === "motion") {
    shape = '<path d="M114 278h285l-24-77h-64l-36-47h-85l-40 58z" fill="url(#main)" stroke="#fff" stroke-opacity=".75" stroke-width="8" stroke-linejoin="round"/><path d="M203 164h69l33 42H174z" fill="#d8f5ff" fill-opacity=".82"/><circle cx="181" cy="305" r="39" fill="#303956" stroke="#fff" stroke-width="10"/><circle cx="342" cy="305" r="39" fill="#303956" stroke="#fff" stroke-width="10"/><path d="M78 230h50m-65 27h69" stroke="url(#shine)" stroke-width="13" stroke-linecap="round"/>';
  } else if (icon === "sound") {
    shape = '<path d="M151 283V222q0-24 26-24t26 24v61q0 66-52 66t-52-66v-38" fill="none" stroke="url(#main)" stroke-width="25" stroke-linecap="round"/><path d="M203 260h101m-101 42h101m-101 42h101" stroke="url(#shine)" stroke-width="12" stroke-linecap="round"/><path d="M303 207v155m42-184v213m42-168v123" stroke="url(#main)" stroke-width="17" stroke-linecap="round"/>';
  } else if (icon === "sport") {
    shape = '<path d="M181 127h150l-16 124q-7 63-59 63t-59-63z" fill="url(#main)" stroke="#fff" stroke-width="8"/><path d="M181 158h-48q-10 78 74 86m144-86h48q10 78-74 86" fill="none" stroke="url(#shine)" stroke-width="18"/><rect x="232" y="310" width="48" height="66" rx="8" fill="url(#main)"/><path d="M176 386h160v30H176z" fill="url(#shine)"/>';
  } else if (icon === "delight") {
    shape = '<path d="M141 218h230l-28 132H169z" fill="url(#main)" stroke="#fff" stroke-width="8"/><path d="M126 210q130-93 260 0" fill="none" stroke="url(#shine)" stroke-width="20" stroke-linecap="round"/><path d="M205 146q-15-54 30-74m38 75q-15-55 31-76" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round"/><circle cx="224" cy="258" r="16" fill="#fff" fill-opacity=".75"/><circle cx="278" cy="293" r="13" fill="#fff" fill-opacity=".75"/><circle cx="320" cy="250" r="11" fill="#fff" fill-opacity=".75"/>';
  } else if (icon === "jewel") {
    shape = '<path d="M256 111l133 125-133 175-133-175z" fill="url(#main)" stroke="#fff" stroke-width="8" stroke-linejoin="round"/><path d="M256 111v300m-133-175h266m-133-125l-71 125 71 175 71-175z" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="6"/>';
  } else if (icon === "cosmic") {
    shape = '<path d="M256 111l34 95 100 4-79 64 28 100-83-56-83 56 28-100-79-64 100-4z" fill="url(#main)" stroke="#fff" stroke-width="8" stroke-linejoin="round"/><ellipse cx="256" cy="254" rx="165" ry="60" transform="rotate(-23 256 254)" fill="none" stroke="url(#shine)" stroke-width="13"/>';
  } else if (icon === "leaf") {
    shape = '<path d="M128 337q-28-184 177-225 83-16 118-11-8 234-194 258-56 7-101-22z" fill="url(#main)" stroke="#fff" stroke-width="8"/><path d="M124 385q94-125 260-238M197 309l-10-90m87 26 49-60" fill="none" stroke="#d5fff1" stroke-width="13" stroke-linecap="round"/>';
  } else if (icon === "horizon") {
    shape = '<circle cx="256" cy="236" r="108" fill="url(#shine)"/><path d="M80 296q88-88 176 0t176 0v98H80z" fill="url(#main)" stroke="#fff" stroke-width="8"/><path d="M88 346q84-50 168 0t168 0" fill="none" stroke="#e2fbff" stroke-width="13"/>';
  } else if (icon === "pixel") {
    shape = '<rect x="124" y="166" width="264" height="174" rx="44" fill="url(#main)" stroke="#fff" stroke-width="9"/><path d="M168 225h42v42h-42zm83-12h42v42h-42zm83 12h42v42h-42zm-125 70h84v23h-84z" fill="url(#shine)"/><circle cx="346" cy="293" r="11" fill="#fff"/>';
  } else if (icon === "bond") {
    shape = '<circle cx="194" cy="202" r="64" fill="url(#main)" stroke="#fff" stroke-width="8"/><circle cx="318" cy="202" r="64" fill="url(#shine)" stroke="#fff" stroke-width="8"/><path d="M105 354q10-89 89-89t89 89v38H105zm119 0q10-89 89-89t89 89v38H224z" fill="url(#main)" stroke="#fff" stroke-width="8"/>';
  } else {
    shape = '<path d="M256 110l38 99 107 5-83 69 29 105-91-59-91 59 29-105-83-69 107-5z" fill="url(#main)" stroke="#fff" stroke-width="8" stroke-linejoin="round"/><circle cx="256" cy="250" r="42" fill="url(#shine)"/>';
  }
  const spark = '<path d="M'+star1+' 110l9 20 20 9-20 9-9 20-9-20-20-9 20-9zM'+star2+' 332l8 18 18 8-18 8-8 18-8-18-18-8 18-8z" fill="'+shine+'" opacity=".9"/>';
  const sigils = [
    '<path d="M256 72l15 42 42 15-42 15-15 42-15-42-42-15 42-15z" fill="none" stroke="#fff" stroke-width="8"/>',
    '<circle cx="256" cy="120" r="33" fill="none" stroke="#fff" stroke-width="9"/><path d="M256 76v88m-44-44h88" stroke="#fff" stroke-width="7"/>',
    '<path d="m256 76 48 49-48 49-48-49z" fill="none" stroke="#fff" stroke-width="9"/><circle cx="256" cy="125" r="12" fill="#fff"/>',
    '<path d="M206 85q50-39 100 0v72q-50 39-100 0z" fill="none" stroke="#fff" stroke-width="9"/><path d="M206 121h100" stroke="#fff" stroke-width="7"/>',
    '<path d="M212 82q44 41 88 0m-88 85q44-41 88 0" fill="none" stroke="#fff" stroke-width="9"/>',
    '<path d="m256 72 14 39 41 14-41 14-14 41-14-41-41-14 41-14z" fill="#fff" fill-opacity=".18" stroke="#fff" stroke-width="7"/>',
    '<path d="M211 165V95l45-23 45 23v70" fill="none" stroke="#fff" stroke-width="9"/><circle cx="256" cy="116" r="13" fill="#fff"/>',
    '<path d="M205 80h102v84H205z" fill="none" stroke="#fff" stroke-width="8"/><path d="m205 80 102 84m0-84L205 164" stroke="#fff" stroke-width="7"/>'
  ];
  const sigil = sigils[seed % sigils.length];
  const safeLabel = String(gift.name || "Minglora Gift").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").slice(0,30);
  return '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-label="'+String(gift.name).replace(/&/g,"&amp;").replace(/</g,"&lt;")+'">'+
    '<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="'+bg1+'"/><stop offset="1" stop-color="'+bg2+'"/></linearGradient><linearGradient id="main" x1="0" y1="0" x2="1" y2="1"><stop stop-color="'+shine+'"/><stop offset=".55" stop-color="'+bg2+'"/><stop offset="1" stop-color="'+bg1+'"/></linearGradient><radialGradient id="shine" cx=".28" cy=".2" r=".85"><stop stop-color="#fff"/><stop offset=".35" stop-color="'+shine+'"/><stop offset="1" stop-color="'+bg1+'"/></radialGradient><filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="16"/></filter></defs>'+
    '<rect width="512" height="512" rx="82" fill="url(#bg)"/><circle cx="256" cy="257" r="'+ring+'" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width="22"/><circle cx="256" cy="265" r="160" fill="#100d36" opacity=".17" filter="url(#shadow)"/>'+
    '<ellipse cx="256" cy="408" rx="132" ry="21" fill="#081a3b" opacity=".22"/>'+
    '<g transform="rotate('+rot+' 256 256)">'+shape+'</g>'+spark+'<g transform="translate('+(seed%5)*5+' 0)" opacity=".8">'+sigil+'</g>'+
    '<circle cx="392" cy="108" r="7" fill="#fff" opacity=".9"/><circle cx="115" cy="390" r="6" fill="#fff" opacity=".75"/>'+
    '<text x="256" y="286" font-family="Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif" font-size="118" text-anchor="middle" dominant-baseline="middle" paint-order="stroke" stroke="#fff" stroke-opacity=".2" stroke-width="4">'+symbol+'</text>'+
    '<path d="M90 72q90-48 174-26" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="10" stroke-linecap="round"/>'+
    '<rect x="86" y="438" width="340" height="43" rx="21" fill="#10162d" fill-opacity=".48"/><text x="256" y="467" font-family="Arial,sans-serif" font-size="21" font-weight="800" text-anchor="middle" fill="#fff">'+safeLabel+'</text>'+
    '</svg>';
}

// The GLB-ready scene geometry is authored as simple original meshes, not imported models.
function modelDocument(gift) {
  const seed = hash32(gift.code);
  const hue = seed % 360;
  const colors = palette(gift);
  const base = colors[0], light = colors[2], dark = colors[1];
  const parts = [];
  function addPart(vertices, indices, color) {
    const normals = [];
    for (let i=0;i<vertices.length;i+=3) {
      const n = Math.hypot(vertices[i],vertices[i+1],vertices[i+2]) || 1;
      normals.push(vertices[i]/n,vertices[i+1]/n,vertices[i+2]/n);
    }
    parts.push({positions:vertices,normals,indices,color});
  }
  function sphere(cx,cy,cz,sx,sy,sz,color,seg=14,rings=9) {
    const v=[],idx=[];
    for(let y=0;y<=rings;y++){
      const phi=Math.PI*y/rings;
      for(let x=0;x<=seg;x++){
        const theta=2*Math.PI*x/seg;
        const nx=Math.sin(phi)*Math.cos(theta),ny=Math.cos(phi),nz=Math.sin(phi)*Math.sin(theta);
        v.push(cx+nx*sx,cy+ny*sy,cz+nz*sz);
      }
    }
    for(let y=0;y<rings;y++)for(let x=0;x<seg;x++){
      const a=y*(seg+1)+x,b=a+seg+1;
      idx.push(a,b,a+1,a+1,b,b+1);
    }
    const norms=[];
    for(let y=0;y<=rings;y++)for(let x=0;x<=seg;x++){
      const phi=Math.PI*y/rings,theta=2*Math.PI*x/seg;
      norms.push(Math.sin(phi)*Math.cos(theta),Math.cos(phi),Math.sin(phi)*Math.sin(theta));
    }
    parts.push({positions:v,normals:norms,indices:idx,color});
  }
  function box(cx,cy,cz,sx,sy,sz,color) {
    const faces=[
      [[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1],[0,0,1]],
      [[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1],[0,0,-1]],
      [[-1,-1,-1],[-1,-1,1],[-1,1,1],[-1,1,-1],[-1,0,0]],
      [[1,-1,1],[1,-1,-1],[1,1,-1],[1,1,1],[1,0,0]],
      [[-1,1,1],[1,1,1],[1,1,-1],[-1,1,-1],[0,1,0]],
      [[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1],[0,-1,0]]
    ];
    const v=[],n=[],idx=[];
    for(const f of faces){
      const baseIdx=v.length/3;
      for(let j=0;j<4;j++){
        const p=f[j];v.push(cx+p[0]*sx/2,cy+p[1]*sy/2,cz+p[2]*sz/2);
        n.push(f[4][0],f[4][1],f[4][2]);
      }
      idx.push(baseIdx,baseIdx+1,baseIdx+2,baseIdx,baseIdx+2,baseIdx+3);
    }
    parts.push({positions:v,normals:n,indices:idx,color});
  }
  function cylinder(cx,cy,cz,r,h,color,seg=16,rt=r) {
    const v=[],n=[],idx=[];
    for(let i=0;i<=seg;i++){
      const a=2*Math.PI*i/seg,x=Math.cos(a),z=Math.sin(a);
      v.push(cx+x*r,cy-h/2,cz+z*r,cx+x*rt,cy+h/2,cz+z*rt);
      n.push(x,0,z,x,0,z);
    }
    for(let i=0;i<seg;i++){const a=i*2,b=a+2;idx.push(a,b,a+1,a+1,b,b+1);}
    const baseIdx=v.length/3;
    v.push(cx,cy-h/2,cz);n.push(0,-1,0);
    for(let i=0;i<=seg;i++){const a=2*Math.PI*i/seg;v.push(cx+Math.cos(a)*r,cy-h/2,cz+Math.sin(a)*r);n.push(0,-1,0);}
    for(let i=0;i<seg;i++)idx.push(baseIdx,baseIdx+i+1,baseIdx+i+2);
    parts.push({positions:v,normals:n,indices:idx,color});
  }
  function torus(cx,cy,cz,major,minor,color,seg=24,sides=8) {
    const v=[],n=[],idx=[];
    for(let i=0;i<=seg;i++)for(let j=0;j<=sides;j++){
      const u=2*Math.PI*i/seg,q=2*Math.PI*j/sides;
      const x=(major+minor*Math.cos(q))*Math.cos(u),z=(major+minor*Math.cos(q))*Math.sin(u),y=minor*Math.sin(q);
      v.push(cx+x,cy+y,cz+z);n.push(Math.cos(q)*Math.cos(u),Math.sin(q),Math.cos(q)*Math.sin(u));
    }
    for(let i=0;i<seg;i++)for(let j=0;j<sides;j++){
      const a=i*(sides+1)+j,b=a+sides+1;idx.push(a,b,a+1,a+1,b,b+1);
    }
    parts.push({positions:v,normals:n,indices:idx,color});
  }
  function cone(cx,cy,cz,r,h,color,seg=14){cylinder(cx,cy,cz,r,h,color,seg,0.002);}
  function jewel(){sphere(0,.48,0,.24,.29,.24,light,12,8);cone(0,.74,0,.22,.28,base,12);}
  function heart(){
    sphere(-.16,.17,0,.22,.23,.17,base);
    sphere(.16,.17,0,.22,.23,.17,base);
    cone(0,-.08,0,.29,.55,base,12);
    sphere(0,.27,.14,.07,.06,.04,light,10,6);
  }
  // A common plinth anchors each independent 3D sculpture.
  cylinder(0,-.68,0,.64,.12,dark,28);
  torus(0,-.59,0,.55,.035,light,28,8);
  const c=gift.category,n=gift.name.toLowerCase();
  if(/you are wanted/.test(n)){
    torus(0,.2,0,.46,.055,light,32,10);torus(0,.2,0,.27,.04,base,28,8);
    sphere(0,.2,.04,.13,.13,.09,"#ffffff",12,8);cylinder(0,.2,0,.06,.82,base,14,.015);
  } else if(/hot rods/.test(n)){
    box(0,-.05,0,1.18,.28,.58,base);box(.04,.19,0,.62,.27,.52,light);
    for(const x of [-.4,.4])for(const z of [-.31,.31]){torus(x,-.27,z,.16,.07,dark,20,8);cylinder(x,-.27,z,.045,.09,light,12);}
    box(-.2,.03,.34,.42,.07,.06,"#ffffff");box(.22,.03,.34,.42,.07,.06,"#ffffff");
  } else if(/red lightning/.test(n)){
    box(0,.12,0,.16,.96,base);box(-.1,.28,0,.4,.16,light);box(.1,-.18,0,.4,.16,light);
    cone(0,.68,0,.16,.32,light);sphere(0,-.38,0,.2,.12,.18,light,12,7);
  } else if(/monster truck/.test(n)){
    box(0,.05,0,1.12,.28,.64,base);box(0,.26,0,.62,.27,.55,light);
    for(const x of [-.4,.4])for(const z of [-.34,.34]){torus(x,-.33,z,.24,.09,dark,22,9);cylinder(x,-.33,z,.095,.1,light,16);}
    box(0,-.1,0,.72,.08,.66,light);
  } else if(/crystal heart/.test(n)){
    heart();torus(0,.18,0,.5,.035,light,32,8);for(let i=0;i<6;i++){const a=i*Math.PI/3;sphere(Math.cos(a)*.42,.2,Math.sin(a)*.42,.055,.055,.055,"#ffffff",8,5);}
  } else if(/iron resolve|villainy slain/.test(n)){
    box(0,.12,0,.68,.82,.16,base);torus(0,.18,.1,.31,.04,light,24,8);cone(0,.48,.2,.14,.4,light);
    box(0,.22,-.16,.12,.92,.1,light);box(0,.6,-.16,.38,.09,.1,light);
  } else if(/a fun house/.test(n)){
    box(0,.02,0,.84,.75,.62,base);cone(0,.59,0,.56,.48,light);cylinder(0,-.1,.34,.16,.56,dark,16,.16);
    sphere(-.22,.15,.34,.08,.08,.05,light);sphere(.22,.15,.34,.08,.08,.05,light);
  } else if(/corgi/.test(n)){
    sphere(0,-.12,0,.39,.38,.34,base);sphere(0,.34,.04,.32,.3,.29,light);
    cone(-.23,.62,0,.14,.42,base);cone(.23,.62,0,.14,.42,base);
    sphere(-.12,.37,.28,.045,.06,.035,dark,8,5);sphere(.12,.37,.28,.045,.06,.035,dark,8,5);
    sphere(0,.18,.31,.09,.06,.05,light,9,6);
  } else if(/dreamy night/.test(n)){
    sphere(0,.2,0,.4,.4,.12,light);sphere(.16,.33,.1,.34,.37,.13,dark);
    for(let i=0;i<5;i++){const a=i*2*Math.PI/5;sphere(Math.cos(a)*.52,.22+Math.sin(a)*.4,.12,.055,.055,.055,light,8,5);}
  } else if(/vintage car/.test(n)){
    box(0,-.06,0,1.02,.27,.58,base);box(0,.18,0,.59,.32,.51,light);
    sphere(-.4,-.27,.29,.18,.18,.09,dark);sphere(.4,-.27,.29,.18,.18,.09,dark);
    torus(0,-.06,-.32,.26,.035,light,20,7);box(0,-.25,0,.9,.07,.58,light);
  } else if(/gobble grab/.test(n)){
    sphere(0,.05,0,.3,.42,.29,base);sphere(0,.45,.02,.22,.22,.2,light);
    for(let i=0;i<5;i++){const a=(i-2)*.42;sphere(Math.sin(a)*.38,.32+Math.cos(a)*.08,-.08,.13,.25,.08,[base,light,"#e88b47","#c74e51","#e6c05b"][i],12,8);}
    cone(0,.29,.2,.09,.15,"#f6a23a");sphere(0,-.38,.02,.08,.12,.08,light);
  } else if(/jet car/.test(n)){
    box(0,-.08,0,1.1,.22,.48,base);box(.08,.19,0,.43,.26,.42,light);
    cone(.58,.04,0,.2,.4,light);box(-.1,.06,.36,.35,.07,.45,base);
    torus(-.39,-.25,.25,.12,.055,dark,18,7);torus(.39,-.25,.25,.12,.055,dark,18,7);
    cylinder(-.62,-.05,0,.1,.3,"#f28b49",12,.01);
  } else if(/super car/.test(n)){
    box(0,-.08,0,1.18,.2,.57,base);box(0,.1,0,.65,.26,.48,light);
    for(const x of [-.42,.42]){torus(x,-.25,.3,.14,.055,dark,18,7);torus(x,-.25,-.3,.14,.055,dark,18,7);}
    box(0,-.19,0,1.05,.07,.62,light);
  } else if(/masquerade/.test(n)){
    box(0,.22,0,.8,.35,.12,base);sphere(-.2,.22,.09,.16,.11,.07,dark);sphere(.2,.22,.09,.16,.11,.07,dark);
    torus(0,.24,0,.47,.035,light,24,7);cone(.33,.53,0,.17,.48,light);
  } else if(/pop out/.test(n)){
    cylinder(0,-.05,0,.32,.25,base,20,.32);for(let i=0;i<4;i++)torus(0,.12+i*.13,0,.2,.025,light,18,6);
    sphere(0,.64,0,.23,.22,.22,light);cone(0,.9,0,.13,.22,base);
  } else if(/live pro face-off/.test(n)){
    sphere(-.28,.16,0,.24,.25,.22,base);sphere(.28,.16,0,.24,.25,.22,light);
    torus(-.28,.16,0,.27,.055,light,20,8);torus(.28,.16,0,.27,.055,base,20,8);
    box(0,.58,0,.32,.1,.1,light);
  } else if(/fair king/.test(n)){
    cylinder(0,.02,0,.4,.14,light,24,.36);for(let i=0;i<5;i++){const x=(i-2)*.16;cone(x,.32,0,.11,.48,base,12);sphere(x,.58,0,.06,.06,.06,light,9,6);}
    torus(0,.02,0,.42,.035,dark,24,7);
  } else if(/cnc coin/.test(n)){
    cylinder(0,.02,0,.43,.13,"#d7a83d",32,.025);
    cylinder(0,.02,.075,.4,.07,"#f3d36d",32,.02);
    torus(0,.02,0,.4,.025,"#fff0a8",32,8);
    sphere(0,.1,.12,.075,.075,.035,"#fff4bb",10,7);
  } else if(/fighting/.test(n)){
    sphere(0,.17,0,.34,.28,.3,"#d85c73",18,10);
    sphere(.21,.3,.04,.19,.17,.19,"#f0788d",14,9);
    sphere(.03,.39,.03,.17,.16,.17,"#f0788d",14,9);
    sphere(-.14,.34,.02,.16,.15,.16,"#f0788d",14,9);
    cylinder(-.12,-.12,0,.23,.25,"#b33d5a",16,.03);
    torus(0,.12,0,.34,.025,light,24,7);
  } else if(/four leaf clover/.test(n)){
    for(let i=0;i<4;i++){const a=Math.PI/4+i*Math.PI/2;sphere(Math.cos(a)*.18,.34+Math.sin(a)*.04,Math.sin(a)*.18,.19,.19,.16,"#55b96d",12,8);}
    cylinder(0,-.08,0,.025,.5,"#36894e",10,.005);
  } else if(/dj headphone/.test(n)){
    torus(0,.28,0,.34,.055,"#6d70ba",24,8);
    sphere(-.34,.08,0,.11,.2,.12,"#4a4d9c",12,8);
    sphere(.34,.08,0,.11,.2,.12,"#4a4d9c",12,8);
    sphere(-.34,.08,.13,.06,.12,.04,light,10,7);
    sphere(.34,.08,.13,.06,.12,.04,light,10,7);
  } else if(/^rose$|^white rose$|^crystal rose$|^my first rose$/.test(n)){
    cylinder(0,-.28,0,.035,.76,"#55b975",12);
    sphere(-.23,-.34,0,.24,.075,.12,"#6cc88a");
    sphere(.21,-.18,0,.23,.075,.12,"#72d99a");
    for(let ring=0;ring<3;ring++)for(let i=0;i<6;i++){
      const a=2*Math.PI*i/6+(ring*.48),r=.09+ring*.095;
      sphere(Math.cos(a)*r,.4+ring*.055,Math.sin(a)*r,.12,.095,.15,ring===2?light:base,10,7);
    }
    sphere(0,.51,0,.12,.12,.12,light,12,8);
  } else if(/baseball/.test(n)){
    sphere(0,.18,0,.43,.43,.43,"#f8f8f4",18,12);
    torus(0,.18,0,.39,.018,"#d94f59",24,6);
    torus(0,.18,0,.27,.014,"#d94f59",24,6);
    for(let i=0;i<7;i++){const y=-.16+i*.055;sphere(-.34,y,.19,.025,.012,.012,"#d94f59",7,4);sphere(.34,y,-.19,.025,.012,.012,"#d94f59",7,4);}
  } else if(/basketball/.test(n)){
    sphere(0,.18,0,.43,.43,.43,"#df873e",18,12);
    torus(0,.18,0,.42,.018,"#302d34",24,6);
    torus(0,.18,0,.29,.018,"#302d34",24,6);
  } else if(/ice cream|gelato|popsicle/.test(n)){
    cylinder(0,-.03,0,.23,.5,"#ba854e",18,.015);
    sphere(0,.37,0,.31,.28,.3,base,16,10);
    sphere(-.12,.49,.13,.06,.05,.05,light,8,5);
  } else if(/coffee/.test(n)){
    cylinder(0,.05,0,.27,.42,base,20,.24);
    torus(.28,.11,0,.16,.045,light,16,7);
    cylinder(0,.3,0,.25,.07,dark,20);
    sphere(0,.46,0,.07,.12,.06,light,9,6);
  } else if(c==="flowers"||/flower|tulip|bouquet|hibiscus|sakura|blossom|orchid|lotus/.test(n)){
    cylinder(0,-.28,0,.045,.72,"#55b975",12);
    sphere(-.23,-.34,0,.24,.08,.12,"#6cc88a");
    sphere(.21,-.18,0,.23,.08,.12,"#72d99a");
    for(let ring=0;ring<2;ring++)for(let i=0;i<8;i++){
      const a=2*Math.PI*i/8+(ring*.37),r=ring?.27:.16;
      sphere(Math.cos(a)*r,.42+ring*.04,Math.sin(a)*r,.14,.09,.19,ring?light:base,10,7);
    }
    sphere(0,.48,0,.13,.13,.13,light,12,8);
  } else if(c==="hearts"||/heart|love|kiss|cupid|hug/.test(n)){
    heart();torus(0,.18,0,.43,.025,light,24,8);
  } else if(c==="animals"||/animal|pet|alien/.test(n)){
    sphere(0,-.1,0,.43,.43,.34,base);
    sphere(0,.38,.02,.33,.31,.31,light);
    cone(-.2,.68,0,.14,.3,base,10);cone(.2,.68,0,.14,.3,base,10);
    sphere(-.12,.41,.29,.045,.06,.03,dark,8,5);sphere(.12,.41,.29,.045,.06,.03,dark,8,5);
    sphere(0,.27,.31,.12,.08,.05,light,10,6);
    torus(.39,-.15,0,.12,.035,light,12,6);
  } else if(c==="vehicles"){
    box(0,-.12,0,1.05,.34,.56,base);
    box(.05,.15,0,.58,.32,.49,light);
    for(const x of [-.35,.35])for(const z of [-.3,.3]){
      sphere(x,-.38,z,.17,.17,.11,dark,12,8);
      sphere(x,-.38,z+.04,.07,.07,.04,light,10,6);
    }
    if(/plane|jet|aircraft|shuttle/.test(n)){box(0,.3,0,.22,.72,.16,base);box(0,.05,0,1.22,.08,.38,light);cone(0,.71,0,.12,.34,base);}
    if(/rocket/.test(n)){cylinder(0,.12,0,.18,.75,base,14,.08);cone(0,.58,0,.18,.32,light);cone(0,-.32,0,.15,.35,"#f28b49");}
    if(/ship|boat|yacht/.test(n)){box(0,-.24,0,1.05,.16,.4,dark);box(0,.08,0,.5,.42,.36,light);cone(0,.7,0,.28,.65,base);}
  } else if(c==="music"){
    sphere(-.18,.02,0,.28,.35,.16,base);
    box(.22,.18,0,.54,.09,.11,light);
    cylinder(.46,.25,0,.055,.35,dark,10);
    sphere(-.18,.4,.04,.16,.13,.1,light,10,6);
    torus(-.17,-.11,.12,.18,.025,light,16,6);
  } else if(c==="sports"){
    if(/trophy|cup|medal|champion|award/.test(n)){
      cylinder(0,.14,0,.29,.5,light,18,.2);
      cylinder(0,-.25,0,.08,.28,base,12);
      cylinder(0,-.4,0,.32,.08,light,18);
      torus(-.29,.26,0,.15,.04,base);torus(.29,.26,0,.15,.04,base);
    } else {
      sphere(0,.16,0,.43,.43,.43,base,16,10);
      torus(0,.16,0,.43,.018,light,22,6);
      torus(0,.16,0,.32,.018,dark,22,6);
      sphere(.1,.34,.35,.05,.05,.03,light,8,5);
    }
  } else if(c==="food_drink"){
    if(/donut|doughnut|ring/.test(n)){torus(0,.18,0,.32,.15,base,24,10);sphere(.18,.34,.17,.06,.035,.04,light,8,5);}
    else if(/cup|coffee|tea|drink|soda|juice/.test(n)){
      cylinder(0,.03,0,.28,.58,base,18,.21);torus(0,.34,0,.22,.035,light,18,6);
      torus(.31,.09,0,.12,.035,light,16,6);sphere(0,.38,0,.2,.035,.2,dark,12,6);
    } else {
      cylinder(0,-.02,0,.42,.22,light,20);
      cylinder(0,.17,0,.36,.22,base,20);
      sphere(-.12,.33,.06,.13,.12,.12,light,10,6);
      sphere(.12,.34,-.04,.13,.12,.12,light,10,6);
    }
  } else if(c==="luxury"||c==="fashion_beauty"){
    if(/ring|bracelet|necklace/.test(n)){torus(0,.13,0,.4,.065,light,28,10);jewel();}
    else if(/crown|tiara|king|queen|royal/.test(n)){
      cylinder(0,.04,0,.38,.12,light,20);
      for(let i=0;i<5;i++){const x=(i-2)*.16;cone(x,.28,0,.11,.5,base,10);sphere(x,.55,0,.055,.055,.055,light,8,5);}
      cylinder(0,-.08,0,.38,.12,dark,20);
    } else if(/perfume|bottle/.test(n)){box(0,.13,0,.5,.56,.32,base);cylinder(0,.49,0,.11,.2,light,12);box(0,-.19,0,.58,.12,.38,light);}
    else{jewel();torus(0,.2,0,.4,.045,light,24,8);}
  } else if(c==="celebrations"){
    box(0,.02,0,.76,.68,.68,base);box(0,.02,.35,.12,.7,.08,light);
    box(0,.03,0,.8,.1,.74,light);
    torus(-.15,.47,0,.16,.045,light,14,7);torus(.15,.47,0,.16,.045,light,14,7);
    sphere(0,.51,0,.1,.09,.1,base,10,6);
  } else if(c==="fantasy"){
    cone(0,.1,0,.32,.9,base);cone(-.23,-.03,0,.18,.65,light);cone(.23,-.03,0,.18,.65,light);
    torus(0,.15,0,.53,.03,light,26,7);sphere(0,.66,0,.1,.1,.1,light,10,6);
  } else if(c==="games"){
    box(0,.08,0,.95,.43,.32,base);
    box(-.27,.13,.2,.24,.06,.045,light);
    sphere(.25,.22,.2,.07,.07,.045,light,8,5);sphere(.39,.08,.2,.07,.07,.045,light,8,5);
    torus(0,-.13,0,.42,.025,light,20,6);
  } else if(c==="nature"){
    cylinder(0,-.02,0,.08,.55,"#7f553a",12);
    sphere(0,.35,0,.38,.4,.35,"#4fbd78");
    sphere(-.2,.52,.02,.24,.24,.23,light);
    sphere(.2,.52,0,.24,.24,.23,base);
  } else if(c==="travel"){
    sphere(0,.14,0,.42,.42,.42,base,16,10);
    torus(0,.14,0,.52,.035,light,26,8);
    torus(0,.14,0,.58,.025,dark,26,8);
    sphere(.21,.28,.35,.08,.08,.07,light,10,6);
  } else if(c==="community"){
    sphere(-.26,.15,0,.21,.23,.2,base);
    sphere(0,.33,0,.23,.25,.21,light);
    sphere(.26,.15,0,.21,.23,.2,dark);
    torus(0,-.08,0,.45,.03,light,22,7);
  } else if(c==="symbols"){
    jewel();torus(0,.17,0,.43,.03,light,24,7);
  } else {
    sphere(0,.15,0,.39,.43,.33,base,14,9);
    torus(0,.15,0,.52,.035,light,24,8);
    cone(0,.63,0,.16,.3,light,12);
    sphere(-.22,-.12,.2,.11,.11,.1,light,10,6);
    sphere(.22,-.12,-.2,.1,.1,.1,dark,10,6);
  }
  // A small unique signature gem distinguishes objects that share a shape family.
  sphere(.48,.58,.1,.07,.07,.07,light,9,6);

  const binParts=[],bufferViews=[],accessors=[],primitives=[],materials=[];
  let byteOffset=0;
  function align4(buf){const pad=(4-(buf.length%4))%4;return pad?Buffer.concat([buf,Buffer.alloc(pad)]):buf;}
  function addBuffer(buf,target){
    const padded=align4(buf);
    const viewIndex=bufferViews.length;
    bufferViews.push({buffer:0,byteOffset,byteLength:buf.length,target});
    binParts.push(padded);byteOffset+=padded.length;return viewIndex;
  }
  for(const p of parts){
    if(!p.indices.length)continue;
    const pos=Buffer.from(new Float32Array(p.positions).buffer);
    const nor=Buffer.from(new Float32Array(p.normals).buffer);
    const maxIndex=Math.max(...p.indices);
    const use32=maxIndex>65535;
    const ind=use32?Buffer.from(new Uint32Array(p.indices).buffer):Buffer.from(new Uint16Array(p.indices).buffer);
    const pv=addBuffer(pos,34962),nv=addBuffer(nor,34962),iv=addBuffer(ind,34963);
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(let i=0;i<p.positions.length;i+=3)for(let k=0;k<3;k++){min[k]=Math.min(min[k],p.positions[i+k]);max[k]=Math.max(max[k],p.positions[i+k]);}
    const pa=accessors.length;
    accessors.push({bufferView:pv,componentType:5126,count:p.positions.length/3,type:"VEC3",min,max});
    const na=accessors.length;accessors.push({bufferView:nv,componentType:5126,count:p.normals.length/3,type:"VEC3"});
    const ia=accessors.length;accessors.push({bufferView:iv,componentType:use32?5125:5123,count:p.indices.length,type:"SCALAR"});
    const color=typeof p.color==="string" && /^#[0-9a-f]{6}$/i.test(p.color)?p.color:base;
    const rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255);
    const materialIndex=primitives.length;
    const materialsRef=materials.length;
    materials.push({name:"Minglora "+gift.name+" finish "+(materialsRef+1),pbrMetallicRoughness:{baseColorFactor:[rgb[0],rgb[1],rgb[2],1],metallicFactor:.45,roughnessFactor:.28}});
    primitives.push({attributes:{POSITION:pa,NORMAL:na},indices:ia,material:materialIndex,mode:4});
  }
  const bin=Buffer.concat(binParts);
  return {
    asset:{version:"2.0",generator:"Minglora Gift Studio"},
    scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0,name:"Minglora "+gift.name}],
    meshes:[{name:gift.name,primitives}],
    materials,
    buffers:[{byteLength:bin.length,uri:"data:application/octet-stream;base64,"+bin.toString("base64")}],
    bufferViews,accessors
  };
}
function writeAsset(file,content,checkOnly){
  if(checkOnly){if(!fs.existsSync(file)||fs.readFileSync(file,"utf8")!==content)throw new Error("Generated gift asset mismatch: "+file);return;}
  fs.writeFileSync(file,content);
}
function main(){
  const checkOnly=process.argv.includes("--check");
  const data=JSON.parse(fs.readFileSync(MANIFEST,"utf8"));
  if(!Array.isArray(data.gifts)||data.gifts.length!==data.gift_count)throw new Error("Gift catalogue manifest count does not match its records.");
  const codes=new Set(),namePricePairs=new Set(),imagePaths=new Set(),modelPaths=new Set();
  for(const gift of data.gifts){
    if(!gift||typeof gift!=="object")throw new Error("Gift catalogue contains a non-object record.");
    if(!Number.isSafeInteger(gift.coin_price)||gift.coin_price<1)throw new Error("Invalid coin price: "+gift.name);
    if(!/^[a-z0-9_-]{1,59}$/.test(String(gift.code||"")))throw new Error("Invalid gift code: "+gift.code);
    if(!String(gift.name||"").trim()||!String(gift.category||"").trim())throw new Error("Gift is missing its name or category: "+gift.code);
    if(!String(gift.animation_preset||"").trim()||!String(gift.sound_preset||"").trim())throw new Error("Gift is missing its animation or sound profile: "+gift.code);
    const pair=gift.name.toLocaleLowerCase("en-US")+"|"+gift.coin_price;
    if(codes.has(gift.code))throw new Error("Duplicate gift code: "+gift.code);
    if(namePricePairs.has(pair))throw new Error("Duplicate gift name and price: "+pair);
    if(gift.image_url!=="/assets/gifts/catalog/"+gift.code+".svg"||gift.model_url!=="/assets/gifts/catalog/"+gift.code+".gltf")throw new Error("Gift asset paths are not canonical: "+gift.code);
    if(imagePaths.has(gift.image_url)||modelPaths.has(gift.model_url))throw new Error("Duplicate gift asset path: "+gift.code);
    codes.add(gift.code);namePricePairs.add(pair);imagePaths.add(gift.image_url);modelPaths.add(gift.model_url);
  }
  fs.mkdirSync(ASSET_DIR,{recursive:true});
  let count=0;
  for(const gift of data.gifts){
    const svg=svgArt(gift);
    const gltf=JSON.stringify(modelDocument(gift));
    writeAsset(path.join(ASSET_DIR,gift.code+".svg"),svg,checkOnly);
    writeAsset(path.join(ASSET_DIR,gift.code+".gltf"),gltf,checkOnly);
    count++;
  }
  const stamp={version:1,giftCount:count,svgAssets:count,gltfAssets:count,generatedAt:String(data.generated_at||"unspecified")};
  const stampText=JSON.stringify(stamp,null,2);
  writeAsset(path.join(ASSET_DIR,"catalog-build.json"),stampText,checkOnly);
  process.stdout.write("[Minglora Gift Studio] "+(checkOnly?"verified ":"generated ")+count+" individual SVG artworks and "+count+" 3D GLTF gift models.\n");
}
main();
