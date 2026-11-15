import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRoseModel } from "../assets/3d-assets/gift-models/rose-model.mjs";
import { createHibiscusModel } from "../assets/3d-assets/gift-models/hibiscus-model.mjs";
import { createDjembeModel } from "../assets/3d-assets/gift-models/djembe-model.mjs";
import { createPalmBreezeModel } from "../assets/3d-assets/gift-models/palm-breeze-model.mjs";
import { createGamerOtterModel } from "../assets/3d-assets/gift-models/gamer-otter-model.mjs";
import { createLiveIslandModel } from "../assets/3d-assets/gift-models/live-island-model.mjs";
import { createCrystalCrownModel } from "../assets/3d-assets/gift-models/crystal-crown-model.mjs";
import { createPhoenixModel } from "../assets/3d-assets/gift-models/phoenix-model.mjs";
import { createBeachMaracasModel } from "../assets/3d-assets/gift-models/beach-maracas-model.mjs";
import { createRoyalLionsScepterModel } from "../assets/3d-assets/gift-models/royal-lions-scepter-model.mjs";

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
function premiumSvgShape(gift) {
  const n = String(gift.name || "").toLowerCase();
  if (gift.code === "royal-lions-scepter-15000-mgl") return "<g data-gift-artwork=\"royal-lions-scepter-original-v1\"><ellipse cx=\"256\" cy=\"425\" rx=\"104\" ry=\"18\" fill=\"#8b6737\" opacity=\".24\"/><path d=\"M248 404 250 253 262 253 264 404Z\" fill=\"#d19b43\" stroke=\"#fff0bf\" stroke-width=\"9\"/><path d=\"M256 393 256 274\" stroke=\"#f8e3a4\" stroke-width=\"5\"/><path d=\"M246 331 266 331M246 359 266 359\" stroke=\"#7f4b2b\" stroke-width=\"6\" stroke-linecap=\"round\"/><path d=\"M220 278Q256 250 292 278L310 303Q256 331 202 303Z\" fill=\"#d7a243\" stroke=\"#fff0bf\" stroke-width=\"10\"/><path d=\"M219 287 187 301m106-14 32 14\" stroke=\"#f6d887\" stroke-width=\"9\" stroke-linecap=\"round\"/><ellipse cx=\"256\" cy=\"205\" rx=\"103\" ry=\"118\" fill=\"#9b5b2f\" stroke=\"#f7d27c\" stroke-width=\"11\"/><ellipse cx=\"256\" cy=\"211\" rx=\"79\" ry=\"95\" fill=\"#d69a50\" stroke=\"#fff0c3\" stroke-width=\"9\"/><g fill=\"none\" stroke=\"#e6ac58\" stroke-width=\"12\" stroke-linecap=\"round\"><path d=\"M174 179q-31-50-61-41m61 41q-41-23-65 4m73-34q-19-59-51-71m51 71q-1-57 29-82m-22 91q34-58 75-66m-19 74q47-42 88-26m-86 40q56-19 91 13m-92 3q52 14 71 54m-98-20q13 51 4 79m-27-88q-46 26-57 66m61-94q-56 6-83 43\"/></g><path d=\"M190 164 169 117l46 22m107 25 21-47-47 21\" fill=\"#ae6a35\" stroke=\"#fff0c3\" stroke-width=\"9\" stroke-linejoin=\"round\"/><ellipse cx=\"222\" cy=\"199\" rx=\"11\" ry=\"15\" fill=\"#173c5c\" stroke=\"#fff1c6\" stroke-width=\"5\"/><ellipse cx=\"290\" cy=\"199\" rx=\"11\" ry=\"15\" fill=\"#173c5c\" stroke=\"#fff1c6\" stroke-width=\"5\"/><circle cx=\"225\" cy=\"196\" r=\"4\" fill=\"#fff\"/><circle cx=\"293\" cy=\"196\" r=\"4\" fill=\"#fff\"/><path d=\"M207 183q18-20 37-3m26 0q18-17 37 3\" fill=\"none\" stroke=\"#694027\" stroke-width=\"8\" stroke-linecap=\"round\"/><ellipse cx=\"256\" cy=\"248\" rx=\"36\" ry=\"24\" fill=\"#f0d3a0\" stroke=\"#fff1d0\" stroke-width=\"7\"/><ellipse cx=\"256\" cy=\"229\" rx=\"18\" ry=\"13\" fill=\"#35232b\"/><path d=\"M256 241v22m-17 11q17 16 34 0\" fill=\"none\" stroke=\"#6d3a2e\" stroke-width=\"6\" stroke-linecap=\"round\"/><path d=\"M199 248q-15 27 0 39m114-39q15 27 0 39\" fill=\"none\" stroke=\"#f6d78d\" stroke-width=\"7\" stroke-linecap=\"round\"/><path d=\"M204 104 216 56 256 85 296 56 308 104Z\" fill=\"#d3a143\" stroke=\"#fff0c3\" stroke-width=\"10\" stroke-linejoin=\"round\"/><path d=\"M216 97 226 71 256 93 286 71 296 97\" fill=\"none\" stroke=\"#fff0c3\" stroke-width=\"7\"/><path d=\"M256 47 265 69 289 78 265 87 256 110 247 87 223 78 247 69Z\" fill=\"#66c4e5\" stroke=\"#fff\" stroke-width=\"7\"/><path d=\"M211 101h90\" stroke=\"#7d4c2d\" stroke-width=\"8\" stroke-linecap=\"round\"/><g fill=\"#f6dc9a\" stroke=\"#9c672d\" stroke-width=\"4\"><circle cx=\"201\" cy=\"288\" r=\"8\"/><circle cx=\"311\" cy=\"288\" r=\"8\"/><circle cx=\"256\" cy=\"304\" r=\"8\"/><circle cx=\"256\" cy=\"398\" r=\"11\"/></g><path d=\"M230 410q26 17 52 0l-6 28q-20 12-40 0Z\" fill=\"#25344d\" stroke=\"#f4d27f\" stroke-width=\"7\"/><path d=\"M239 415v19m17-18v20m16-21v19\" stroke=\"#7bd3dd\" stroke-width=\"4\"/><path d=\"M256 440q-34 22-55 2m55-2q34 22 55 2\" fill=\"none\" stroke=\"#d8ab53\" stroke-width=\"7\" stroke-linecap=\"round\"/><circle cx=\"201\" cy=\"442\" r=\"9\" fill=\"#f4d27f\"/><circle cx=\"311\" cy=\"442\" r=\"9\" fill=\"#f4d27f\"/></g>";
  if (/djembe master/.test(n)) return '<g data-gift-artwork="djembe-master-original-v1"><path d="M169 163Q256 126 343 163L319 218Q306 251 291 296L278 380Q256 402 234 380L221 296Q206 251 193 218Z" fill="url(#main)" stroke="#fff" stroke-width="10" stroke-linejoin="round"/><ellipse cx="256" cy="164" rx="87" ry="25" fill="#d8c19a" stroke="#fff" stroke-width="10"/><ellipse cx="256" cy="164" rx="68" ry="17" fill="#9b7758" stroke="#f7e5c4" stroke-width="7"/><path d="M194 190Q256 211 318 190M205 228Q256 249 307 228M218 274Q256 291 294 274M231 325Q256 339 281 325" fill="none" stroke="#e8d2a9" stroke-width="7" stroke-linecap="round"/><path d="M194 190 231 325m-24-97 87 97m-72-135 58 103m49-103-58 103m34-103-87 135m63-135 24 135" fill="none" stroke="#f0dcb7" stroke-width="6" stroke-linecap="round"/><path d="M221 380Q256 398 291 380L299 413Q256 436 213 413Z" fill="#532b25" stroke="#fff" stroke-width="9"/><ellipse cx="256" cy="164" rx="78" ry="19" fill="none" stroke="#f4ddb6" stroke-width="7"/></g>';
  if (/palm breeze/.test(n)) return '<g data-gift-artwork="palm-breeze-original-v1"><ellipse cx="256" cy="415" rx="145" ry="25" fill="#d7bd85" opacity=".86"/><path d="M251 405C245 335 253 268 270 212C279 184 279 157 274 130" fill="none" stroke="#815038" stroke-width="24" stroke-linecap="round"/><path d="M274 132C211 83 160 82 108 115M274 132C207 119 169 143 137 184M274 132C242 73 209 52 164 48M276 132C320 71 365 64 421 89M276 132C344 116 388 135 430 177M276 132C324 156 349 189 365 223M273 132C220 150 190 185 178 225M274 132C259 81 265 52 282 30" fill="none" stroke="#477f49" stroke-width="13" stroke-linecap="round"/><path d="M108 115l49 19-25 34m5 16 49-12-8 41m-14-165 45 34-11 34m222-66-49 35 12 29m-3 42-44 11 8 33m-8 42-39-15-5 33m-187-30 42-11 3 32m91-195 11 49-13 26" fill="none" stroke="#91b96c" stroke-width="7" stroke-linecap="round"/><circle cx="257" cy="139" r="18" fill="#765638" stroke="#f2e1bc" stroke-width="5"/><circle cx="281" cy="147" r="17" fill="#80613a" stroke="#f2e1bc" stroke-width="5"/><circle cx="270" cy="115" r="16" fill="#6f5034" stroke="#f2e1bc" stroke-width="5"/><path d="M222 400q36 19 72 0" fill="none" stroke="#b77a46" stroke-width="8"/><path d="M152 416q-36-21-48-2m223 2q36-21 48-2" fill="none" stroke="#d6bd8a" stroke-width="10" stroke-linecap="round"/></g>';
  if (/beach maracas/.test(n)) return "<g data-gift-artwork=\"beach-maracas-original-v1\"><g transform=\"rotate(-18 193 260)\"><path d=\"M180 348q-6-63-4-120 4-34 35-40 49-5 59 37 4 43-15 126-10 48-44 43-28-4-31-46Z\" fill=\"#c95432\" stroke=\"#f1d18a\" stroke-width=\"9\"/><path d=\"M192 385 211 465q7 22 24 13l9-8-20-109Z\" fill=\"#84522f\" stroke=\"#f1d18a\" stroke-width=\"7\"/><path d=\"M181 247q41 18 89-2m-87 43q39 18 78 2m-70 43q31 14 57 4\" stroke=\"#267b69\" stroke-width=\"12\" fill=\"none\"/><path d=\"M190 232q22-26 52-1m-57 62q42-19 77 8\" stroke=\"#f3e0aa\" stroke-width=\"7\" fill=\"none\"/><g fill=\"#f0c26b\"><circle cx=\"190\" cy=\"264\" r=\"7\"/><circle cx=\"224\" cy=\"273\" r=\"7\"/><circle cx=\"247\" cy=\"260\" r=\"7\"/><circle cx=\"201\" cy=\"317\" r=\"7\"/><circle cx=\"229\" cy=\"327\" r=\"7\"/></g></g><g transform=\"rotate(18 324 250)\"><path d=\"M294 342q-17-60-14-120 5-33 37-38 48-3 56 40 0 44-25 124-14 44-45 38-27-6-9-44Z\" fill=\"#e5a343\" stroke=\"#fff0c4\" stroke-width=\"9\"/><path d=\"M333 376 317 462q-4 25-23 18l-10-8 24-109Z\" fill=\"#70452d\" stroke=\"#f4d17d\" stroke-width=\"7\"/><path d=\"M281 234q38 19 88-1m-89 43q38 18 78 2m-72 43q32 13 60 2\" stroke=\"#1d6f73\" stroke-width=\"12\" fill=\"none\"/><path d=\"M291 216q26-25 55-2m-61 61q40-17 77 8\" stroke=\"#fff0c4\" stroke-width=\"7\" fill=\"none\"/><g fill=\"#f4d17d\"><circle cx=\"300\" cy=\"257\" r=\"7\"/><circle cx=\"333\" cy=\"267\" r=\"7\"/><circle cx=\"355\" cy=\"255\" r=\"7\"/><circle cx=\"307\" cy=\"311\" r=\"7\"/><circle cx=\"335\" cy=\"322\" r=\"7\"/></g></g><path d=\"M258 414q22-32 46 1-17 38-39 35-21-7-7-36Z\" fill=\"#f1c5a6\" stroke=\"#fff0db\" stroke-width=\"6\"/><path d=\"M262 419q12 10 20 20m-10-26q12 10 20 21m-30-9 8 20\" stroke=\"#b47d62\" stroke-width=\"4\" fill=\"none\"/><g fill=\"#fff0c4\"><path d=\"m111 141 10 24 24 10-24 10-10 24-10-24-24-10 24-10Z\"/><path d=\"m398 124 8 18 18 8-18 8-8 18-8-18-18-8 18-8Z\"/></g></g>";
  if (/phoenix/.test(n)) return "<g data-gift-artwork=\"phoenix-original-v1\"><path d=\"M255 393q-72-53-132-22 13-60 77-80-64-22-91-93 90 14 142 78-10-89 5-150 22 74 46 143 52-87 133-98-27 80-91 119 74 10 104 81-88-16-135 22 51 17 74 68-61-15-104-58-43 45-108 57 31-50 80-67Z\" fill=\"#cf4331\" stroke=\"#f7bd5d\" stroke-width=\"10\" stroke-linejoin=\"round\"/><path d=\"M255 389q-52-69-94-63 36-50 88-30-27-59 3-127 33 58 13 127 51-29 90 23-58-5-100 70Z\" fill=\"#f08a36\" stroke=\"#ffe0a0\" stroke-width=\"8\"/><path d=\"M257 377q-19-65 7-128 41-62 65-58-22 55-20 91 39-30 68-13-38 28-46 64-28 45-74 44Z\" fill=\"#f3bc4e\" stroke=\"#ffe7b0\" stroke-width=\"7\"/><path d=\"M253 352q-26-72-10-126 16-50 44-72 15 57-3 105 35-14 58-1-34 24-43 58-19 31-46 36Z\" fill=\"#d7442c\"/><path d=\"M255 368q-18-69-1-111 14-43 42-67 12 46-2 83 28-6 47 11-31 18-39 48-22 30-47 36Z\" fill=\"#ffc85a\"/><ellipse cx=\"257\" cy=\"321\" rx=\"46\" ry=\"90\" fill=\"#b93c30\" stroke=\"#f6c56c\" stroke-width=\"8\"/><path d=\"M254 270q-12-57 18-94 31-26 57-12-28 14-35 40 26-13 47 0-28 19-36 46-21 22-51 20Z\" fill=\"#e3a242\" stroke=\"#fff0c3\" stroke-width=\"7\"/><path d=\"M294 226q31-15 57 2l-42 20Z\" fill=\"#f3ca67\" stroke=\"#ffeebf\" stroke-width=\"5\"/><circle cx=\"286\" cy=\"214\" r=\"7\" fill=\"#1f1c2b\"/><path d=\"M248 232q-41-41-46-84 34 31 48 69m22-4q37-46 42-79-34 28-52 64\" fill=\"#f18b36\" stroke=\"#f8d07b\" stroke-width=\"6\"/><g fill=\"none\" stroke-linecap=\"round\"><path d=\"M157 221q-47-51-82-45m83 45q-54-18-84 1m86-1q-32-69-21-105m20 105q20-72 68-88m-25 94q56-49 92-35\" stroke=\"#f4a84b\" stroke-width=\"9\"/><path d=\"M354 263q51-42 87-31m-88 31q62-7 94 21m-94-21q45-57 50-97\" stroke=\"#d94b31\" stroke-width=\"9\"/></g><path d=\"M255 387q-22 39-61 53 54 6 73-27 29 36 69 31-36-25-46-60Z\" fill=\"#f6c65b\" stroke=\"#ffe7ad\" stroke-width=\"7\"/><g fill=\"#fff0ba\"><circle cx=\"111\" cy=\"298\" r=\"8\"/><circle cx=\"398\" cy=\"305\" r=\"9\"/><circle cx=\"367\" cy=\"153\" r=\"7\"/><circle cx=\"149\" cy=\"127\" r=\"6\"/><circle cx=\"255\" cy=\"83\" r=\"7\"/></g></g>";
  if (/crystal crown/.test(n)) return "<g data-gift-artwork=\"crystal-crown-original-v1\"><path d=\"M109 348 133 167 208 248 256 75 303 248 379 167 403 348Z\" fill=\"#d8a644\" stroke=\"#fff0c3\" stroke-width=\"12\" stroke-linejoin=\"round\"/><path d=\"M141 333 161 220 210 273 256 125 302 273 351 220 371 333Z\" fill=\"#f3d580\" stroke=\"#b87c30\" stroke-width=\"7\"/><path d=\"M121 349Q256 393 391 349L380 421Q256 463 132 421Z\" fill=\"#d49b43\" stroke=\"#fff0c3\" stroke-width=\"11\"/><path d=\"M142 374Q256 413 370 374\" fill=\"none\" stroke=\"#fff2c8\" stroke-width=\"8\"/><path d=\"M160 387Q256 426 352 387\" fill=\"none\" stroke=\"#7b4a2d\" stroke-width=\"7\"/><path d=\"M177 249Q205 197 256 227 307 197 335 249M155 289Q205 244 256 267 307 244 357 289\" fill=\"none\" stroke=\"#fff0bf\" stroke-width=\"9\" stroke-linecap=\"round\"/><path d=\"M256 115l-16 31 16 29 16-29Z\" fill=\"#78c8e9\" stroke=\"#f4fbff\" stroke-width=\"7\"/><path d=\"M256 145l-16 27 16 24 16-24Z\" fill=\"#c6efff\" stroke=\"#fff\" stroke-width=\"5\"/><path d=\"M185 270l-13 23 13 22 14-22Z\" fill=\"#c59be8\" stroke=\"#fff2ff\" stroke-width=\"6\"/><path d=\"M327 270l-13 23 13 22 14-22Z\" fill=\"#c59be8\" stroke=\"#fff2ff\" stroke-width=\"6\"/><path d=\"M143 322l-10 18 10 17 11-17Zm226 0-10 18 10 17 11-17Z\" fill=\"#79d6ad\" stroke=\"#f2fff1\" stroke-width=\"5\"/><g fill=\"#fff4cf\" stroke=\"#b88034\" stroke-width=\"3\"><circle cx=\"161\" cy=\"359\" r=\"8\"/><circle cx=\"191\" cy=\"370\" r=\"7\"/><circle cx=\"221\" cy=\"378\" r=\"7\"/><circle cx=\"256\" cy=\"381\" r=\"9\"/><circle cx=\"291\" cy=\"378\" r=\"7\"/><circle cx=\"321\" cy=\"370\" r=\"7\"/><circle cx=\"351\" cy=\"359\" r=\"8\"/></g><path d=\"M256 74v-32m-14 15h28\" stroke=\"#fff0bf\" stroke-width=\"8\" stroke-linecap=\"round\"/><path d=\"M92 180l11-19 11 19 19 11-19 11-11 19-11-19-19-11Z\" fill=\"#f8e7b3\"/><path d=\"M400 222l8-14 8 14 14 8-14 8-8 14-8-14-14-8Z\" fill=\"#e0f8ff\"/></g>";
  if (/live island/.test(n)) return "<g data-gift-artwork=\"live-island-original-v1\"><ellipse cx=\"256\" cy=\"402\" rx=\"202\" ry=\"57\" fill=\"#138a9b\"/><ellipse cx=\"256\" cy=\"396\" rx=\"177\" ry=\"45\" fill=\"#45c8c0\" stroke=\"#f3fff1\" stroke-width=\"9\"/><path d=\"M79 387q35-35 68-7t67 0q39-31 77 2t72 0q42-30 73 7\" fill=\"none\" stroke=\"#b9fff0\" stroke-width=\"10\" stroke-linecap=\"round\"/><path d=\"M115 374q26-66 101-85 28-75 108-50 69 18 69 85 42 27 20 69-70 30-142 22-98 19-156-41Z\" fill=\"#e8cb91\" stroke=\"#fff8de\" stroke-width=\"8\"/><path d=\"M183 324q-4-56 62-86 48-44 92-4 35 33 16 77-48 43-105 28-34 21-65-15Z\" fill=\"#397c51\"/><path d=\"M214 296q25-48 69-49 32-15 53 8-31 7-46 31-41 34-76 10Z\" fill=\"#70a95d\"/><path d=\"M278 272q-17 40-23 78t-10 50\" fill=\"none\" stroke=\"#9af4f0\" stroke-width=\"15\" stroke-linecap=\"round\"/><path d=\"M276 282q-10 33-19 65\" fill=\"none\" stroke=\"#f1ffff\" stroke-width=\"5\" stroke-linecap=\"round\"/><g stroke-linecap=\"round\" fill=\"none\"><path d=\"M174 324q-3-63 17-98\" stroke=\"#815038\" stroke-width=\"13\"/><path d=\"M190 227q-56-40-91-13m91 13q-43-59-15-91m15 91q-7-61 43-84m-43 84q32-51 76-43m-76 43q43-13 76 12\" stroke=\"#4c9b60\" stroke-width=\"10\"/><path d=\"M319 297q5-58 25-81\" stroke=\"#815038\" stroke-width=\"13\"/><path d=\"M344 216q-54-34-85-11m85 11q-24-54 5-77m-5 77q12-58 61-58m-61 58q47-30 78-8\" stroke=\"#347d4d\" stroke-width=\"10\"/><path d=\"M256 332q2-48 20-68\" stroke=\"#815038\" stroke-width=\"10\"/><path d=\"M276 264q-36-22-58-8m58 8q-2-40 24-53m-24 53q30-33 57-27\" stroke=\"#70a85b\" stroke-width=\"8\"/></g><g fill=\"#db865d\" stroke=\"#f9dfb0\" stroke-width=\"5\"><path d=\"M344 326v-42l40 17v25Z\"/><path d=\"M331 284h67l-34-26Z\"/></g><path d=\"M367 283v-31\" stroke=\"#f2d58e\" stroke-width=\"4\"/><path d=\"M367 253l22 14-22 13Z\" fill=\"#f0d17a\"/><path d=\"M112 399q35-16 70-2m-42 13 54-4\" stroke=\"#fff\" stroke-width=\"7\" stroke-linecap=\"round\" fill=\"none\"/><g fill=\"#e9a36c\"><circle cx=\"92\" cy=\"371\" r=\"10\"/><circle cx=\"415\" cy=\"365\" r=\"11\"/><circle cx=\"426\" cy=\"400\" r=\"8\"/></g><circle cx=\"256\" cy=\"386\" r=\"14\" fill=\"#f5d47c\" stroke=\"#e9c16f\" stroke-width=\"5\"/><path d=\"M250 386h12m-6-6v12\" stroke=\"#7a6339\" stroke-width=\"3\" stroke-linecap=\"round\"/></g>";
  if (/gamer otter/.test(n)) return "<g data-gift-artwork=\"gamer-otter-original-v1\"><path d=\"M150 337C113 312 105 276 126 252c22-26 51-25 68-4 27-34 85-48 128-18 38 27 43 77 13 110-23 26-56 34-99 26-32 34-67 31-86-29Z\" fill=\"#805039\" stroke=\"#fff0da\" stroke-width=\"9\" stroke-linejoin=\"round\"/><path d=\"M136 259q-23-65 35-70l24 67m91-2q5-65 67-55l-20 76\" fill=\"#805039\" stroke=\"#fff0da\" stroke-width=\"9\" stroke-linejoin=\"round\"/><path d=\"M151 203q20-18 34 5l-8 34-25-39m142 0q20-23 36-4l-23 43-13-39\" fill=\"#d49a78\"/><ellipse cx=\"256\" cy=\"287\" rx=\"89\" ry=\"69\" fill=\"#ead5b4\" stroke=\"#fff0da\" stroke-width=\"7\"/><ellipse cx=\"218\" cy=\"269\" rx=\"10\" ry=\"15\" fill=\"#241a19\"/><ellipse cx=\"294\" cy=\"269\" rx=\"10\" ry=\"15\" fill=\"#241a19\"/><circle cx=\"215\" cy=\"264\" r=\"4\" fill=\"#fff\"/><circle cx=\"291\" cy=\"264\" r=\"4\" fill=\"#fff\"/><ellipse cx=\"256\" cy=\"292\" rx=\"17\" ry=\"12\" fill=\"#261d1b\"/><path d=\"M242 310q14 15 28 0\" fill=\"none\" stroke=\"#694536\" stroke-width=\"6\" stroke-linecap=\"round\"/><path d=\"M154 300 91 286m66 34-68 8m225-28 63-14m-64 34 68 8\" stroke=\"#b18b6d\" stroke-width=\"4\" stroke-linecap=\"round\"/><path d=\"M167 197q-3-96 89-104 92 8 89 104\" fill=\"none\" stroke=\"#273452\" stroke-width=\"23\" stroke-linecap=\"round\"/><rect x=\"139\" y=\"183\" width=\"47\" height=\"82\" rx=\"18\" fill=\"#273452\" stroke=\"#4ad8df\" stroke-width=\"8\"/><rect x=\"326\" y=\"183\" width=\"47\" height=\"82\" rx=\"18\" fill=\"#273452\" stroke=\"#4ad8df\" stroke-width=\"8\"/><path d=\"M365 241q15 42-18 62l-56 17\" fill=\"none\" stroke=\"#273452\" stroke-width=\"8\" stroke-linecap=\"round\"/><circle cx=\"289\" cy=\"319\" r=\"11\" fill=\"#4ad8df\" stroke=\"#fff\" stroke-width=\"4\"/><path d=\"M177 372q79 38 158 0l20 38q-99 49-198 0z\" fill=\"#2b3656\" stroke=\"#fff\" stroke-width=\"8\"/><path d=\"M210 386v28m-14-14h28\" stroke=\"#f1c66f\" stroke-width=\"8\" stroke-linecap=\"round\"/><circle cx=\"296\" cy=\"385\" r=\"7\" fill=\"#4ad8df\"/><circle cx=\"316\" cy=\"396\" r=\"7\" fill=\"#f28bb6\"/><circle cx=\"296\" cy=\"407\" r=\"7\" fill=\"#e9c367\"/><circle cx=\"276\" cy=\"396\" r=\"7\" fill=\"#9b91ff\"/><path d=\"M350 415q42-4 54 12\" fill=\"none\" stroke=\"#4ad8df\" stroke-width=\"8\" stroke-linecap=\"round\"/></g>";
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

function svgArt(gift, options = {}) {
  const iconOnly = options.iconOnly === true;
  const colors = palette(gift);
  const seed = hash32(gift.code);
  const name = String(gift.name || "").toLowerCase();
  const rot = iconOnly ? 0 : (seed % 31) - 15;
  const star1 = 45 + (seed % 50);
  const star2 = 370 + (seed % 60);
  const ring = 185 + (seed % 35);
  const bg1 = colors[1], bg2 = colors[0], shine = colors[2];
  const premiumAccent = !iconOnly && /premium edition/i.test(name) ? '<g transform="translate(390 115)"><circle r="42" fill="#17142c" fill-opacity=".7" stroke="#ffe08a" stroke-width="5"/><path d="M-25 10l7-31 18 17 18-17 7 31z" fill="#ffcf55" stroke="#fff2bd" stroke-width="4"/><path d="M-28 13h56v10h-56z" fill="#f5a623"/><circle cy="-26" r="5" fill="#fff"/></g>' : '';
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
    shape = "<g data-gift-artwork=\"rose-bloom-original-v1\">\n  <path d=\"M255 297C247 344 252 387 256 431\" fill=\"none\" stroke=\"#398c55\" stroke-width=\"15\" stroke-linecap=\"round\"/>\n  <path d=\"M251 370C205 326 163 342 150 371C192 397 224 399 251 370Z\" fill=\"#399b59\" stroke=\"#e3f4e8\" stroke-opacity=\".55\" stroke-width=\"5\"/>\n  <path d=\"M257 391C297 344 345 350 362 380C326 407 286 416 257 391Z\" fill=\"#2e854f\" stroke=\"#e3f4e8\" stroke-opacity=\".55\" stroke-width=\"5\"/>\n  <path d=\"M151 371Q198 370 250 370M362 380Q312 378 258 391\" fill=\"none\" stroke=\"#a7e4b0\" stroke-width=\"4\" stroke-linecap=\"round\"/>\n  <path d=\"M241 326l-20-12 25 1M269 350l21-15-25 5\" fill=\"#398c55\"/>\n  <g fill=\"#a71645\" stroke=\"#fff0f5\" stroke-opacity=\".72\" stroke-width=\"5\" stroke-linejoin=\"round\">\n    <path d=\"M256 264C206 252 155 275 142 239C124 190 160 144 205 161C237 173 245 221 256 264Z\"/>\n    <path d=\"M256 264C306 252 357 275 370 239C388 190 352 144 307 161C275 173 267 221 256 264Z\"/>\n    <path d=\"M256 264C222 222 210 164 244 132C275 103 316 126 311 168C307 207 281 241 256 264Z\"/>\n    <path d=\"M256 264C290 222 302 164 268 132C237 103 196 126 201 168C205 207 231 241 256 264Z\"/>\n    <path d=\"M256 266C181 248 143 207 166 170C190 132 235 148 256 201C277 148 322 132 346 170C369 207 331 248 256 266Z\"/>\n  </g>\n  <g fill=\"#d92c5d\" stroke=\"#ffe1e9\" stroke-opacity=\".8\" stroke-width=\"4\" stroke-linejoin=\"round\">\n    <path d=\"M256 261C209 239 194 205 218 173C240 144 273 156 276 189C279 217 268 243 256 261Z\"/>\n    <path d=\"M256 261C303 239 318 205 294 173C272 144 239 156 236 189C233 217 244 243 256 261Z\"/>\n    <path d=\"M256 260C226 214 233 171 256 159C279 171 286 214 256 260Z\"/>\n  </g>\n  <path d=\"M246 243C218 218 235 180 258 180C280 180 292 211 269 237C261 247 247 251 240 242C231 231 241 218 251 219C260 220 259 230 253 232\" fill=\"none\" stroke=\"#8f123c\" stroke-width=\"12\" stroke-linecap=\"round\"/>\n  <path d=\"M278 182Q291 166 303 174\" fill=\"none\" stroke=\"#ffafc4\" stroke-width=\"6\" stroke-linecap=\"round\"/>\n  <g fill=\"#fff3f6\" opacity=\".92\"><circle cx=\"183\" cy=\"205\" r=\"7\"/><circle cx=\"327\" cy=\"204\" r=\"6\"/><circle cx=\"288\" cy=\"145\" r=\"6\"/></g>\n</g>";
  } else if (/hibiscus/.test(name)) {
    shape = '<g fill="url(#main)" stroke="#fff" stroke-opacity=".75" stroke-width="7"><ellipse cx="256" cy="178" rx="43" ry="83"/><ellipse cx="256" cy="178" rx="43" ry="83" transform="rotate(72 256 256)"/><ellipse cx="256" cy="178" rx="43" ry="83" transform="rotate(144 256 256)"/><ellipse cx="256" cy="178" rx="43" ry="83" transform="rotate(216 256 256)"/><ellipse cx="256" cy="178" rx="43" ry="83" transform="rotate(288 256 256)"/></g><circle cx="256" cy="256" r="42" fill="url(#shine)" stroke="#fff" stroke-width="7"/><path d="M256 256q44-34 79-7m-79 7 52-65m-52 65 10-79" fill="none" stroke="#ffe7a8" stroke-width="9" stroke-linecap="round"/><circle cx="337" cy="248" r="10" fill="#ffe7a8"/><path d="M256 298v112m0-67q-42-35-72-4m72 25q42-35 72-4" fill="none" stroke="#55bc78" stroke-width="14" stroke-linecap="round"/>';
  } else if (/four leaf clover/.test(name)) {
    shape = '<path d="M256 249c-49-92-145-77-145-5 0 46 40 70 145 115 105-45 145-69 145-115 0-72-96-87-145 5zm0 0c-92-49-77-145-5-145 46 0 70 40 5 145zm0 0c92-49 77-145 5-145-46 0-70 40-5 145z" fill="url(#main)" fill-opacity=".01"/><path d="M256 252c-48-75-125-71-125-16 0 44 52 63 125 99 73-36 125-55 125-99 0-55-77-59-125 16z" fill="url(#main)" stroke="#fff" stroke-width="7"/><path d="M256 252c-75-48-71-125-16-125 44 0 63 52 16 125zm0 0c75-48 71-125 16-125-44 0-63 52-16 125z" fill="url(#shine)" stroke="#fff" stroke-width="7"/><path d="M256 335q-10 49-56 82m56-82q10 49 56 82" fill="none" stroke="#59c77d" stroke-width="17" stroke-linecap="round"/>';
  } else if (/cnc coin/.test(name)) {
    shape = '<circle cx="256" cy="256" r="145" fill="url(#main)" stroke="#fff" stroke-width="13"/><circle cx="256" cy="256" r="115" fill="none" stroke="url(#shine)" stroke-width="12"/><path d="M256 166v180m-43-143h58q38 0 38 33t-38 33h-46q-37 0-37 32t38 32h59" fill="none" stroke="#fff" stroke-width="18" stroke-linecap="round"/><path d="M256 126v-24m0 308v-24" stroke="#fff" stroke-width="8" stroke-linecap="round"/>';
  } else if (/fighting/.test(name)) {
    shape = '<path d="M163 311q-13-22 5-43l39-49q14-16 31-5l20 13 23-43q15-24 34-9 13 10 5 29l-19 45 24-33q17-20 34-5 13 12 1 31l-26 42q25-19 40-1 12 15-3 33l-48 61q-23 30-62 28l-59-7q-40-7-50-43z" fill="url(#main)" stroke="#fff" stroke-width="10" stroke-linejoin="round"/><path d="M162 346l-34 28 41 59 37-30" fill="#f3b2c9" stroke="#fff" stroke-width="8" stroke-linejoin="round"/><path d="M225 253l25 20m21-47 24 19m21-17 22 18" fill="none" stroke="url(#shine)" stroke-width="13" stroke-linecap="round"/>';
  } else if (/baseball/.test(name)) {
    shape = '<circle cx="256" cy="252" r="132" fill="#fff" stroke="#d6e2ef" stroke-width="12"/><path d="M158 154q98 98 0 196m196-196q-98 98 0 196" fill="none" stroke="#d84854" stroke-width="12" stroke-linecap="round"/><path d="M165 173l-15 15m34 14-15 15m34 14-15 15m34 14-15 15m34 14-15 15m34 14-15 15m34-173 15 15m-34 14 15 15m-34 14 15 15m-34 14 15 15m-34 14 15 15m-34 14 15 15" stroke="#d84854" stroke-width="7" stroke-linecap="round"/>';
  } else if (/dj headphone|headphone/.test(name)) {
    shape = '<path d="M112 268v-36q0-144 144-144t144 144v36" fill="none" stroke="url(#main)" stroke-width="31" stroke-linecap="round"/><path d="M112 245q0-23 23-23h27q23 0 23 23v112q0 23-23 23h-27q-23 0-23-23zm215 0q0-23 23-23h27q23 0 23 23v112q0 23-23 23h-27q-23 0-23-23z" fill="url(#main)" stroke="#fff" stroke-width="9"/><path d="M145 258v86m223-86v86" stroke="#fff" stroke-opacity=".75" stroke-width="8" stroke-linecap="round"/><circle cx="256" cy="94" r="16" fill="url(#shine)"/>';
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
  const safeName = String(gift.name || "Minglora Gift")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/\x27/g,"&apos;").slice(0,60);
  const safeLabel = safeName.slice(0,30);
  const defs = '<defs><linearGradient id="main" x1="0" y1="0" x2="1" y2="1"><stop stop-color="'+shine+'"/><stop offset=".55" stop-color="'+bg2+'"/><stop offset="1" stop-color="'+bg1+'"/></linearGradient><radialGradient id="shine" cx=".28" cy=".2" r=".85"><stop stop-color="#fff"/><stop offset=".35" stop-color="'+shine+'"/><stop offset="1" stop-color="'+bg1+'"/></radialGradient><filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="16"/></filter></defs>';
  const stage = iconOnly ? '' : '<circle cx="256" cy="257" r="'+ring+'" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width="22"/><circle cx="256" cy="265" r="160" fill="#100d36" opacity=".17" filter="url(#shadow)"/><ellipse cx="256" cy="408" rx="132" ry="21" fill="#081a3b" opacity=".22"/>';
  const decorations = iconOnly ? '' : spark+'<g transform="translate('+(seed%5)*5+' 0)" opacity=".8">'+sigil+'</g>'+premiumAccent+'<circle cx="392" cy="108" r="7" fill="#fff" opacity=".9"/><circle cx="115" cy="390" r="6" fill="#fff" opacity=".75"/><path d="M90 72q90-48 174-26" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="10" stroke-linecap="round"/>';
  const label = iconOnly ? '' : '<rect x="86" y="438" width="340" height="43" rx="21" fill="#10162d" fill-opacity=".48"/><text x="256" y="467" font-family="Arial,sans-serif" font-size="21" font-weight="800" text-anchor="middle" fill="#fff">'+safeLabel+'</text>';
  return '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" data-gift-code="'+String(gift.code||"")+'" aria-label="'+safeName+'">'+defs+stage+'<g transform="rotate('+rot+' 256 256)">'+shape+'</g>'+decorations+label+'</svg>';
}

// The GLB-ready scene geometry is authored as simple original meshes, not imported models.
function modelDocument(gift) {
  const giftName = String(gift.name || "").trim().toLowerCase();
  if (giftName === "rose") return createRoseModel();
  if (giftName === "hibiscus") return createHibiscusModel();
  if (gift.code === "djembe-master-1v3jzkm") return createDjembeModel();
  if (gift.code === "palm-breeze-gknyt0") return createPalmBreezeModel();
  if (gift.code === "gamer-otter-100-mgl") return createGamerOtterModel();
  if (gift.code === "live-island-rmn3mc") return createLiveIslandModel();
  if (gift.code === "crystal-crown-1itryeu") return createCrystalCrownModel();
  if (gift.code === "phoenix-wep6uk") return createPhoenixModel();
  if (gift.code === "beach-maracas-1exxoag") return createBeachMaracasModel();
  if (gift.code === "royal-lions-scepter-15000-mgl") return createRoyalLionsScepterModel();
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
  if(/premium edition/i.test(n)){
    torus(0,.88,0,.37,.026,"#f8d369",32,10);
    for(let i=0;i<5;i++){const x=(i-2)*.15;cone(x,1.02,0,.055,.22,"#f8d369",10);sphere(x,1.15,0,.035,.035,.035,"#fff1b8",8,5);}
    sphere(0,.89,.39,.055,.055,.04,"#fff1b8",9,6);
  }

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
  const codes=new Set(),giftNames=new Set(),animationKeys=new Set(),namePricePairs=new Set(),imagePaths=new Set(),modelPaths=new Set();
  for(const gift of data.gifts){
    if(!gift||typeof gift!=="object")throw new Error("Gift catalogue contains a non-object record.");
    if(!Number.isSafeInteger(gift.coin_price)||gift.coin_price<1)throw new Error("Invalid coin price: "+gift.name);
    if(!/^[a-z0-9_-]{1,59}$/.test(String(gift.code||"")))throw new Error("Invalid gift code: "+gift.code);
    if(!String(gift.name||"").trim()||!String(gift.category||"").trim())throw new Error("Gift is missing its name or category: "+gift.code);
    if(!String(gift.animation_preset||"").trim()||!String(gift.sound_preset||"").trim())throw new Error("Gift is missing its animation or sound profile: "+gift.code);
    const normalizedName=gift.name.trim().toLocaleLowerCase("en-US");
    if(giftNames.has(normalizedName))throw new Error("Duplicate active gift display name: "+gift.name);
    if(!String(gift.animation_key||"").trim())throw new Error("Gift is missing its unique animation identity: "+gift.name);
    if(animationKeys.has(gift.animation_key))throw new Error("Duplicate gift animation identity: "+gift.animation_key);
    const pair=normalizedName+"|"+gift.coin_price;
    if(codes.has(gift.code))throw new Error("Duplicate gift code: "+gift.code);
    if(namePricePairs.has(pair))throw new Error("Duplicate gift name and price: "+pair);
    if(gift.image_url!=="/assets/gifts/catalog/"+gift.code+".svg"||gift.model_url!=="/assets/gifts/catalog/"+gift.code+".gltf")throw new Error("Gift asset paths are not canonical: "+gift.code);
    if(imagePaths.has(gift.image_url)||modelPaths.has(gift.model_url))throw new Error("Duplicate gift asset path: "+gift.code);
    codes.add(gift.code);giftNames.add(normalizedName);animationKeys.add(gift.animation_key);imagePaths.add(gift.image_url);modelPaths.add(gift.model_url);
  }
  fs.mkdirSync(ASSET_DIR,{recursive:true});
  let count=0;
  for(const gift of data.gifts){
    const svg=svgArt(gift);
    const iconSvg=svgArt(gift,{iconOnly:true});
    const gltf=JSON.stringify(modelDocument(gift));
    writeAsset(path.join(ASSET_DIR,gift.code+".svg"),svg,checkOnly);
    writeAsset(path.join(ASSET_DIR,gift.code+"-icon.svg"),iconSvg,checkOnly);
    writeAsset(path.join(ASSET_DIR,gift.code+".gltf"),gltf,checkOnly);
    count++;
  }
  const expectedFiles=new Set(data.gifts.flatMap(gift=>[gift.code+".svg",gift.code+"-icon.svg",gift.code+".gltf"]));
  const staleFiles=fs.readdirSync(ASSET_DIR).filter(name=>/\.(?:svg|gltf)$/i.test(name)&&!expectedFiles.has(name));
  if(checkOnly&&staleFiles.length)throw new Error("Stale generated gift assets found: "+staleFiles.slice(0,10).join(", "));
  if(!checkOnly)for(const name of staleFiles)fs.unlinkSync(path.join(ASSET_DIR,name));
  const stamp={version:3,giftCount:count,svgAssets:count,svgIconAssets:count,gltfAssets:count,generatedAt:String(data.generated_at||"unspecified")};
  const stampText=JSON.stringify(stamp,null,2);
  writeAsset(path.join(ASSET_DIR,"catalog-build.json"),stampText,checkOnly);
  process.stdout.write("[Minglora Gift Studio] "+(checkOnly?"verified ":"generated ")+count+" primary SVG artworks, "+count+" transparent SVG icons and "+count+" 3D GLTF gift models.\n");
}
main();
