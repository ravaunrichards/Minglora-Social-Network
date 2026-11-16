import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG_PATH = path.join(ROOT, "data", "minglora-gift-catalog.json");
const MOTION_PATH = path.join(ROOT, "public", "assets", "animations", "gifts", "catalog-motion-index.json");
const GIFT_DIR = path.join(ROOT, "public", "assets", "gifts", "catalog");
const ICON_SPRITE_PATH = path.join(ROOT, "public", "assets", "icons", "navigation-3d.svg");
const PUSH_ICON_PATH = path.join(ROOT, "public", "assets", "icons", "minglora-push.svg");
const PACKAGE_PATH = path.join(ROOT, "package.json");
const OUTPUT_PATH = path.join(ROOT, "assets", "manifests", "live-asset-manifest.json");
const GENERATOR = "Minglora LIVE asset manifest generator";
const SCHEMA_VERSION = 1;
const COMPONENTS = Object.freeze({
  artwork: ["public/gifts.js", "public/app.js", "public/gift-effects.js"],
  model: ["public/gift-effects.js"],
  animation: ["public/gift-effects.js", "public/app.js"],
  sound: ["public/gift-effects.js"]
});

const GIFT_SPECIFIC_WEB_AUDIO_DESIGNS = Object.freeze({
  "djembe-master-1v3jzkm": Object.freeze({
    sound_design_id: "djembe-hand-drum-impact-v1",
    sound_profile_scope: "gift_specific_web_audio_synthesis",
    format: "Web Audio API synthesized hand-drum noise, falling low drum tone and rim accent",
    layers: ["filtered_noise_attack", "low_frequency_pitch_drop", "short_rim_tap"],
    status: "gift_specific_synthesized_sound_not_mastered_recording"
  }),
  "palm-breeze-gknyt0": Object.freeze({
    sound_design_id: "palm-breeze-wind-and-chimes-v1",
    sound_profile_scope: "gift_specific_web_audio_synthesis",
    format: "Web Audio API synthesized filtered breeze noise and three soft chime partials",
    layers: ["filtered_wind_sweep", "soft_chime_659hz", "soft_chime_880hz", "soft_chime_1175hz"],
    status: "gift_specific_synthesized_sound_not_mastered_recording"
  }),
  "gamer-otter-100-mgl": Object.freeze({
    sound_design_id: "gamer-otter-arcade-cheer-v1",
    sound_profile_scope: "gift_specific_web_audio_synthesis",
    format: "Web Audio API synthesized four-note arcade arpeggio with low-frequency impact accent",
    layers: ["seeded_arcade_arpeggio_523_659_784_1047hz", "stereo_note_placement", "low_frequency_thump"],
    status: "gift_specific_synthesized_sound_not_mastered_recording"
  }),
  "live-island-rmn3mc": Object.freeze({
    sound_design_id: "live-island-tide-and-chime-v1",
    sound_profile_scope: "gift_specific_web_audio_synthesis",
    format: "Web Audio API synthesized filtered surf swell with four soft tonal chimes",
    layers: ["filtered_surf_noise_swell", "lowpass_tide_sweep", "four_note_island_chime_392_494_587_784hz"],
    status: "gift_specific_synthesized_sound_not_mastered_recording"
  }),
  "crystal-crown-1itryeu": Object.freeze({
    sound_design_id: "crystal-crown-royal-glass-chime-v1",
    sound_profile_scope: "gift_specific_web_audio_synthesis",
    format: "Web Audio API synthesized five-note pure-tone chime with filtered high-frequency shimmer",
    layers: ["five_note_royal_chime_523_659_784_1047_1319hz", "seeded_stereo_note_placement", "highpass_shimmer_noise"],
    status: "gift_specific_synthesized_sound_not_mastered_recording"
  }),
  "phoenix-wep6uk": Object.freeze({
    sound_design_id: "phoenix-flame-rise-and-ember-choir-v1",
    sound_profile_scope: "gift_specific_web_audio_synthesis",
    format: "Web Audio API synthesized filtered flame swell and five ascending firebird tones",
    layers: ["filtered_bandpass_flame_noise_rise", "lowpass_ember_sweep", "five_note_ascending_firebird_chime_220_294_392_523_659hz"],
    status: "gift_specific_synthesized_sound_not_mastered_recording"
  }),
  "beach-maracas-1exxoag": Object.freeze({
    sound_design_id: "beach-maracas-caribbean-shaker-rhythm-v1",
    sound_profile_scope: "gift_specific_web_audio_synthesis",
    format: "Web Audio API synthesized pulsed shaker noise with four bright steelpan-like tones",
    layers: ["five_pulsed_highpass_shaker_bursts", "four_note_island_tonal_accent_262_392_523_659hz", "seeded_stereo_rhythm_placement"],
    status: "gift_specific_synthesized_sound_not_mastered_recording"
  }),
  "royal-lions-scepter-15000-mgl": Object.freeze({
    sound_design_id: "royal-lions-scepter-roar-and-regal-fanfare-v1",
    sound_profile_scope: "gift_specific_web_audio_synthesis",
    format: "Web Audio API synthesized low lion-like formant growl, sub impact, five-note brass-like ceremonial fanfare and high-frequency jewel shimmer",
    layers: ["bandpass_growl_noise_sweep", "low_frequency_staff_impact", "five_note_regal_fanfare_196_294_392_587_784hz", "highpass_jewel_shimmer"],
    status: "gift_specific_synthesized_sound_not_mastered_recording"
  },
  "pop-parrot-alp4e8": Object.freeze({
    sound_design_id: "pop-parrot-rainbow-whistle-chirp-v1",
    sound_profile_scope: "gift_specific_web_audio_synthesis",
    format: "Web Audio API synthesized ascending birdlike whistle chirps with a light high-pass flutter accent",
    layers: ["five_note_ascending_sine_whistles_1047_1319_1568_1175_1760hz", "seeded_micro_pitch_bends_and_stereo_placement", "highpass_feather_flutter_noise"],
    status: "gift_specific_synthesized_sound_not_mastered_recording"
  }),
  "rose-4ieccm": Object.freeze({
    sound_design_id: "rose-golden-bow-petal-rustle-and-celesta-v3",
    sound_profile_scope: "gift_specific_web_audio_synthesis",
    format: "Web Audio API synthesized petal-rustle sweep and five softly enveloped celesta-like notes with seeded stereo placement; not a mastered recording",
    layers: ["filtered_petal_rustle_sweep", "five_note_celesta_like_chime_523_659_784_1047_1319hz", "seeded_stereo_note_placement"],
    status: "gift_specific_synthesized_sound_not_mastered_recording"
  })
});

function fail(message) {
  throw new Error("[Minglora LIVE asset manifest] " + message);
}
function relative(file) {
  return path.relative(ROOT, file).split(path.sep).join("/");
}
function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}
function fileRecord(file, format, extra = {}) {
  if (!fs.existsSync(file)) fail("required generated asset is missing: " + relative(file));
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size <= 0) fail("asset is empty or is not a file: " + relative(file));
  return {
    path: relative(file),
    format,
    file_size_bytes: stat.size,
    sha256: sha256(file),
    ...extra
  };
}
function svgInfo(file) {
  const source = fs.readFileSync(file, "utf8");
  const openingTag = source.match(/<svg\b[^>]*>/i)?.[0] || "";
  if (!openingTag) fail("generated artwork is not a valid SVG: " + relative(file));
  const widthMatch = openingTag.match(/\bwidth=["']([0-9.]+)(?:px)?["']/i);
  const heightMatch = openingTag.match(/\bheight=["']([0-9.]+)(?:px)?["']/i);
  const width = widthMatch ? Number(widthMatch[1]) : null;
  const height = heightMatch ? Number(heightMatch[1]) : null;
  const viewBoxMatch = openingTag.match(/\bviewBox=["']([^"']+)["']/i);
  const viewBox = viewBoxMatch ? viewBoxMatch[1].trim().split(/[ ,]+/).map(Number) : null;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    fail("SVG is missing valid pixel dimensions: " + relative(file));
  }
  if (!viewBox || viewBox.length !== 4 || !viewBox.every(Number.isFinite)) {
    fail("SVG is missing a valid viewBox: " + relative(file));
  }
  const emojiFontOverlay = /font-family=["'][^"']*(?:Apple Color Emoji|Segoe UI Emoji|Noto Color Emoji)/i.test(source);
  const fullCanvasBackground = /<rect\b[^>]*\bwidth=["']512["'][^>]*\bheight=["']512["'][^>]*\bfill=["']url\(#bg\)["']/i.test(source);
  return {
    width_px: width,
    height_px: height,
    view_box: viewBox,
    transparent_background: !fullCanvasBackground,
    emoji_font_overlay_present: emojiFontOverlay
  };
}
function gltfInfo(file) {
  let document;
  try {
    document = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    fail("GLTF is not valid JSON: " + relative(file));
  }
  if (document?.asset?.version !== "2.0") fail("expected glTF 2.0 asset: " + relative(file));
  if (!Array.isArray(document.meshes) || !document.meshes.length) fail("GLTF has no meshes: " + relative(file));
  const accessors = Array.isArray(document.accessors) ? document.accessors : [];
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  let vertexCount = 0;
  let triangleCount = 0;
  let primitiveCount = 0;
  for (const mesh of document.meshes) {
    for (const primitive of mesh.primitives || []) {
      const positionIndex = primitive.attributes?.POSITION;
      const position = Number.isInteger(positionIndex) ? accessors[positionIndex] : null;
      if (!position || position.type !== "VEC3" || !Array.isArray(position.min) || !Array.isArray(position.max)) {
        fail("GLTF primitive has no auditable POSITION bounds: " + relative(file));
      }
      for (let axis = 0; axis < 3; axis++) {
        const low = Number(position.min[axis]);
        const high = Number(position.max[axis]);
        if (!Number.isFinite(low) || !Number.isFinite(high) || high < low) {
          fail("GLTF has invalid POSITION bounds: " + relative(file));
        }
        min[axis] = Math.min(min[axis], low);
        max[axis] = Math.max(max[axis], high);
      }
      vertexCount += Number(position.count) || 0;
      const index = Number.isInteger(primitive.indices) ? accessors[primitive.indices] : null;
      if ((primitive.mode ?? 4) === 4) {
        triangleCount += index ? Math.floor(index.count / 3) : Math.floor((Number(position.count) || 0) / 3);
      }
      primitiveCount++;
    }
  }
  if (!primitiveCount || !min.every(Number.isFinite) || !max.every(Number.isFinite)) {
    fail("GLTF model has no measurable geometry: " + relative(file));
  }
  const dimensions = max.map((value, axis) => Number((value - min[axis]).toFixed(6)));
  const externalBufferUris = (document.buffers || [])
    .map(buffer => String(buffer.uri || ""))
    .filter(uri => uri && !uri.startsWith("data:"));
  return {
    gltf_version: "2.0",
    coordinate_unit: "glTF scene units (generator does not declare a real-world scale)",
    bounds: {
      min: min.map(value => Number(value.toFixed(6))),
      max: max.map(value => Number(value.toFixed(6))),
      dimensions
    },
    mesh_count: document.meshes.length,
    primitive_count: primitiveCount,
    vertex_count: vertexCount,
    triangle_count: triangleCount,
    material_count: Array.isArray(document.materials) ? document.materials.length : 0,
    texture_count: Array.isArray(document.textures) ? document.textures.length : 0,
    embedded_animation_count: Array.isArray(document.animations) ? document.animations.length : 0,
    external_buffer_uris: externalBufferUris
  };
}
function iconSheetRecord() {
  const source = fs.readFileSync(ICON_SPRITE_PATH, "utf8");
  const symbolIds = [...source.matchAll(/<symbol\b[^>]*\bid=["']([^"']+)["']/g)].map(match => match[1]);
  return fileRecord(ICON_SPRITE_PATH, "svg-symbol-sprite", {
    symbol_count: symbolIds.length,
    symbol_ids: symbolIds,
    component_usage: ["public/app.js", "public/index.html"],
    completeness: "shared_application_sprite_not_a_complete_live_control_state_pack"
  });
}
function svgIconPackRecord(manifestRelativePath, itemsKey, packId, assetDirectory, componentUsage) {
  const manifestPath = path.join(ROOT, manifestRelativePath);
  let document;
  try {
    document = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    fail("icon pack manifest is not valid JSON: " + manifestRelativePath);
  }
  if (document.view_box !== "0 0 24 24") fail("icon pack must use the shared 24x24 viewBox: " + manifestRelativePath);
  const items = document[itemsKey];
  if (!Array.isArray(items) || !items.length) fail("icon pack contains no " + itemsKey + ": " + manifestRelativePath);
  const ids = new Set();
  const files = new Set();
  const assets = [];
  for (const item of items) {
    const id = String(item?.id || "");
    if (!/^[a-z0-9_-]{1,64}$/.test(id)) fail("icon pack contains an invalid asset ID: " + manifestRelativePath);
    if (ids.has(id)) fail("icon pack contains duplicate ID " + id + ": " + manifestRelativePath);
    ids.add(id);
    const expectedUrl = "/assets/icons/" + assetDirectory + "/" + id + ".svg";
    if (item.file !== expectedUrl || files.has(item.file)) fail("icon pack has a non-canonical or duplicate SVG URL: " + String(item.file));
    files.add(item.file);
    const assetPath = path.join(ROOT, "public", item.file.replace(/^\/+/, ""));
    let source;
    try {
      source = fs.readFileSync(assetPath, "utf8");
    } catch {
      fail("icon pack SVG is missing: " + relative(assetPath));
    }
    const openingTag = source.match(/<svg\b[^>]*>/i)?.[0] || "";
    if (!openingTag || !/\bviewBox=["']0 0 24 24["']/.test(openingTag)) {
      fail("icon pack SVG has an invalid root or viewBox: " + relative(assetPath));
    }
    if (!/<symbol\b[^>]*\bid=["']icon["'][^>]*\bviewBox=["']0 0 24 24["']/i.test(source)) {
      fail("icon pack SVG is missing its canonical icon symbol: " + relative(assetPath));
    }
    if (!/\bstroke=["']currentColor["']/i.test(source) ||
        !/<(?:path|rect|circle|ellipse|line|polyline|polygon)\b/i.test(source)) {
      fail("icon pack SVG is missing currentColor vector geometry: " + relative(assetPath));
    }
    if (/\p{Extended_Pictographic}/u.test(source)) fail("icon pack SVG must not use emoji glyph artwork: " + relative(assetPath));
    assets.push(fileRecord(assetPath, "svg-symbol", {
      asset_id: id,
      public_url: item.file,
      label: String(item.label || id),
      dimensions: { width_px: 24, height_px: 24, view_box: [0, 0, 24, 24] },
      component_usage: componentUsage,
      source: { type: "original_minglora_svg_icon", generator: null },
      quality: { status: "vector_navigation_asset_design_review_pending", human_visual_review: "not_completed", approved_for_premium_production: false },
      licensing: { status: "review_required", provenance: "original_minglora_svg_icon" }
    }));
  }
  return fileRecord(manifestPath, "json-svg-icon-pack-manifest", {
    pack_id: packId,
    icon_count: assets.length,
    icon_ids: [...ids],
    component_usage: componentUsage,
    completeness: "standalone_svg_icon_pack",
    view_box: document.view_box,
    assets
  });
}

function buildManifest() {
  const catalogue = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
  const motion = JSON.parse(fs.readFileSync(MOTION_PATH, "utf8"));
  const packageData = JSON.parse(fs.readFileSync(PACKAGE_PATH, "utf8"));
  if (!Array.isArray(catalogue.gifts) || catalogue.gifts.length !== catalogue.gift_count) {
    fail("canonical catalogue count does not match its rows.");
  }
  if (!Array.isArray(motion.gifts) || motion.catalogue_count !== catalogue.gifts.length) {
    fail("motion index does not match the canonical catalogue.");
  }
  const motionByCode = new Map(motion.gifts.map(profile => [profile.code, profile]));
  if (motionByCode.size !== motion.gifts.length) fail("motion index contains duplicate gift codes.");
  const seenCodes = new Set();
  const gifts = [];
  let emojiOverlayCount = 0;
  for (const gift of catalogue.gifts) {
    if (!gift || typeof gift !== "object") fail("catalogue contains a non-object gift record.");
    if (typeof gift.active !== "boolean") fail("catalogue record is missing its boolean active state: " + String(gift.code));
    if (!/^[a-z0-9_-]{1,59}$/.test(String(gift.code || ""))) fail("invalid gift code: " + String(gift.code));
    if (seenCodes.has(gift.code)) fail("duplicate gift code: " + gift.code);
    seenCodes.add(gift.code);
    if (!Number.isSafeInteger(gift.coin_price) || gift.coin_price < 1) fail("invalid canonical coin price for " + gift.code);
    if (gift.image_url !== "/assets/gifts/catalog/" + gift.code + ".svg") fail("non-canonical SVG URL for " + gift.code);
    if (gift.model_url !== "/assets/gifts/catalog/" + gift.code + ".gltf") fail("non-canonical GLTF URL for " + gift.code);

    const svgFile = path.join(GIFT_DIR, gift.code + ".svg");
    const gltfFile = path.join(GIFT_DIR, gift.code + ".gltf");
    const artworkDimensions = svgInfo(svgFile);
    const modelDimensions = gltfInfo(gltfFile);
    const modelExtras = JSON.parse(fs.readFileSync(gltfFile, "utf8")).asset?.extras || {};
    const hasGiftSpecificSource = Boolean(modelExtras.source && modelExtras.mingloraAssetId);
    const artwork = fileRecord(svgFile, "svg", {
      public_url: gift.image_url,
      dimensions: { width_px: artworkDimensions.width_px, height_px: artworkDimensions.height_px, view_box: artworkDimensions.view_box },
      transparent_background: artworkDimensions.transparent_background,
      component_usage: COMPONENTS.artwork,
      alt_text: String(gift.name) + " Minglora LIVE gift artwork",
      source: {
        type: "generated_from_repository_catalogue",
        catalogue_record: "data/minglora-gift-catalog.json#" + gift.code,
        generator: "scripts/generate-minglora-gifts.mjs",
        generator_identity: "Minglora Gift Studio"
      },
      quality: {
        status: artworkDimensions.emoji_font_overlay_present ? "generated_vector_art_requires_human_review" : "generated_visual_requires_human_review",
        emoji_font_overlay_present: artworkDimensions.emoji_font_overlay_present,
        human_visual_review: "not_completed",
        approved_for_premium_production: false
      },
      licensing: {
        status: "review_required",
        provenance: "repository_generated_svg",
        notes: "Generated by repository tooling; the system-font emoji overlay has been removed, but category vector templates and subject-specific branches still require human visual review and rights review. Do not treat this as cleared premium artwork."
      }
    });
    if (artworkDimensions.emoji_font_overlay_present) emojiOverlayCount++;

    const iconFile = path.join(GIFT_DIR, gift.code + "-icon.svg");
    const iconDimensions = svgInfo(iconFile);
    if (!iconDimensions.transparent_background) fail("gift icon has an opaque background: " + relative(iconFile));
    if (iconDimensions.emoji_font_overlay_present) fail("gift icon contains a system emoji font overlay: " + relative(iconFile));
    const icon = fileRecord(iconFile, "svg", {
      public_url: "/assets/gifts/catalog/" + gift.code + "-icon.svg",
      dimensions: { width_px: iconDimensions.width_px, height_px: iconDimensions.height_px, view_box: iconDimensions.view_box },
      transparent_background: true,
      vector_only: true,
      component_usage: ["public/gifts.js", "public/app.js"],
      alt_text: String(gift.name) + " transparent Minglora LIVE gift icon",
      source: { type: "generated_from_canonical_gift_subject_vector", catalogue_record: "data/minglora-gift-catalog.json#" + gift.code, generator: "scripts/generate-minglora-gifts.mjs", generator_identity: "Minglora Gift Studio" },
      quality: { status: "transparent_subject_icon_requires_human_review", emoji_font_overlay_present: false, human_visual_review: "not_completed", approved_for_premium_production: false },
      licensing: { status: "review_required", provenance: "repository_generated_subject_vector", notes: "Generated subject-only SVG variant; individual visual and rights approval remain required." }
    });

    const model = fileRecord(gltfFile, "gltf-json", {
      public_url: gift.model_url,
      dimensions: modelDimensions,
      renderer: "model-viewer",
      component_usage: COMPONENTS.model,
      source: {
        type: hasGiftSpecificSource ? "gift_specific_repository_mesh_source" : "generated_procedural_meshes",
        catalogue_record: "data/minglora-gift-catalog.json#" + gift.code,
        generator: "scripts/generate-minglora-gifts.mjs",
        generator_identity: "Minglora Gift Studio",
        ...(hasGiftSpecificSource ? {
          source_file: String(modelExtras.source),
          asset_id: String(modelExtras.mingloraAssetId),
          art_direction: String(modelExtras.artDirection || ""),
          review_status: String(modelExtras.reviewStatus || "design-review-pending")
        } : {})
      },
      quality: {
        status: hasGiftSpecificSource ? "gift_specific_mesh_source_requires_human_visual_review" : "procedural_category_geometry_requires_individual_art_direction",
        gift_specific_mesh_source_present: hasGiftSpecificSource,
        bespoke_high_detail_model_verified: false,
        high_resolution_texture_maps_verified: false,
        embedded_skeletal_animation_verified: false,
        human_visual_review: "not_completed",
        approved_for_premium_production: false
      },
      licensing: {
        status: "review_required",
        provenance: "repository_generated_glTF",
        notes: hasGiftSpecificSource
          ? "A named repository mesh source is recorded, but human visual review and rights review remain outstanding; this source is not approved as premium production artwork."
          : "Generated procedural meshes and materials; not individually rights-cleared or approved as premium production artwork."
      },
      loading: {
        runtime: "model-viewer",
        external_buffers: modelDimensions.external_buffer_uris,
        image_fallback_when_model_url_missing: true,
        model_load_error_image_fallback_implemented: true,
        loading_policy: "not_explicitly_configured_in_gift_effects_runtime"
      }
    });

    const profile = motionByCode.get(gift.code) || null;
    if (gift.active && !profile) fail("active catalogue gift is missing a motion-index entry: " + gift.code);
    if (!gift.active && profile) fail("inactive catalogue gift unexpectedly has a motion-index entry: " + gift.code);
    if (profile && (profile.image_url !== gift.image_url || profile.model_url !== gift.model_url ||
      profile.animation_key !== gift.animation_key || profile.catalog_motion_preset !== gift.animation_preset ||
      profile.motion_duration_ms !== gift.animation_duration_ms || profile.sound_preset !== gift.sound_preset)) {
      fail("motion profile does not match the canonical gift row: " + gift.code);
    }
    const animation = profile ? {
      profile_id: "minglora-live-motion:" + gift.code,
      format: "generated-json-profile-plus-web-animations-runtime",
      index_path: relative(MOTION_PATH),
      component_usage: COMPONENTS.animation,
      animation_key: profile.animation_key,
      motion_preset: profile.motion_preset,
      catalog_motion_preset: profile.catalog_motion_preset,
      gift_specific_motion_override: profile.motion_preset !== profile.catalog_motion_preset,
      motion_effect: profile.motion_effect,
      duration_ms: profile.motion_duration_ms,
      trigger: "server-confirmed LIVE gift event is mounted by public/app.js through window.MingloraGiftFX.mount",
      standalone_animation_file: null,
      embedded_gltf_animation: false,
      status: "procedural_runtime_animation_profile_not_a_mastered_animation_file",
      reduced_motion_support: "runtime_checks_prefers_reduced_motion"
    } : {
      profile_id: null,
      status: "inactive_catalogue_item_no_runtime_motion_profile"
    };
    const specificSound = GIFT_SPECIFIC_WEB_AUDIO_DESIGNS[gift.code] || null;
    const sound = {
      sound_preset: String(gift.sound_preset || ""),
      sound_design_id: specificSound?.sound_design_id || null,
      format: specificSound?.format || "Web Audio API synthesized oscillator tones",
      audio_file: null,
      component_usage: COMPONENTS.sound,
      sound_profile_scope: specificSound?.sound_profile_scope || "category_based_synthesis_with_gift_seed_variation",
      synthesized_layers: specificSound?.layers || null,
      dedicated_mastered_gift_sound: false,
      status: specificSound?.status || "synthetic_category_profile_not_mastered_gift_audio",
      note: specificSound
        ? "Original gift-specific Web Audio sound design triggered with the matching LIVE gift effect; this is synthesis, not a mastered audio recording."
        : "The separate Sound Studio ringtone/notification WAV pack is not a per-gift sound library."
    };

    gifts.push({
      gift_id: "minglora-live-gift:" + gift.code,
      code: gift.code,
      name: String(gift.name),
      category: String(gift.category),
      active: gift.active,
      coin_price: gift.coin_price,
      rarity: typeof gift.rarity === "string" ? gift.rarity : null,
      asset_version: String(packageData.version || "unspecified"),
      artwork,
      icon_url: icon.public_url,
      icon,
      thumbnail: {
        path: artwork.path,
        format: artwork.format,
        dimensions: artwork.dimensions,
        reuse_of_primary_artwork: true
      },
      animated_preview: {
        uses_motion_profile: Boolean(profile),
        profile_id: animation.profile_id,
        preview_file: null,
        renderer: "public/gift-effects.js"
      },
      model,
      animation,
      sound,
      device_support: {
        renderer: "model-viewer with SVG artwork fallback when model URL is absent",
        verified_device_classes: [],
        device_qa_status: "not_verified_on_physical_devices",
        target_classes_pending: ["Android phones", "iPhones", "tablets", "foldables", "desktop/laptops", "supported Smart TVs"]
      },
      loading_and_fallback: {
        artwork_url: gift.image_url,
        icon_url: icon.public_url,
        model_url: gift.model_url,
        model_error_fallback_to_svg: true,
        retry_and_error_state: "not_verified_by_this_manifest_generator"
      },
      production_status: "catalogue_asset_inventory_only_premium_artwork_and_rights_review_required"
    });
  }
  if (motionByCode.size !== gifts.filter(gift => gift.active).length) {
    fail("motion index contains a count different from active catalogue rows.");
  }
  const iconSheet = iconSheetRecord();
  const pushIcon = fileRecord(PUSH_ICON_PATH, "svg", {
    component_usage: ["public/app.js"],
    source: { type: "repository_asset", generator: null },
    licensing: { status: "review_required", provenance: "repository_asset" }
  });
  const liveControlIconPack = svgIconPackRecord(
    "public/assets/icons/live-controls/manifest.json",
    "icons",
    "minglora-live-controls",
    "live-controls",
    ["public/app.js"]
  );
  const liveGiftCategoryIconPack = svgIconPackRecord(
    "public/assets/icons/live-gift-categories/manifest.json",
    "categories",
    "minglora-live-gift-categories",
    "live-gift-categories",
    ["public/app.js", "public/live-gift-access.css"]
  );
  const liveToolsShortcutIconPack = svgIconPackRecord(
    "public/assets/icons/live-tools/manifest.json",
    "shortcuts",
    "minglora-live-tools-shortcuts",
    "live-tools",
    ["public/app.js", "public/live-tiktok-compact.css"]
  );
  const liveProviderStatusIconPack = svgIconPackRecord(
    "public/assets/icons/live-provider-status/manifest.json",
    "icons",
    "minglora-live-provider-status",
    "live-provider-status",
    ["public/app.js", "public/styles.css"]
  );
  const activeCount = gifts.filter(gift => gift.active).length;
  const inactiveCount = gifts.length - activeCount;
  return {
    schema_version: SCHEMA_VERSION,
    generator: GENERATOR,
    manifest_status: "generated_inventory_not_a_premium_quality_or_licensing_approval",
    source_catalog_generated_at: String(catalogue.generated_at || "unspecified"),
    asset_version: String(packageData.version || "unspecified"),
    generated_from: [
      "data/minglora-gift-catalog.json",
      "scripts/generate-minglora-gifts.mjs",
      "scripts/generate-live-gift-motion-index.mjs",
      "public/gift-effects.js",
      "public/gifts.js",
      "public/app.js",
      "public/assets/icons/live-controls/manifest.json",
      "public/assets/icons/live-gift-categories/manifest.json",
      "public/assets/icons/live-tools/manifest.json",
      "public/assets/icons/live-provider-status/manifest.json"
    ],
    summary: {
      catalogue_gift_count: gifts.length,
      active_gift_count: activeCount,
      inactive_gift_count: inactiveCount,
      svg_artwork_file_count: gifts.length,
      svg_gift_icon_file_count: gifts.length,
      transparent_background_gift_icon_count: gifts.filter(gift => gift.icon.transparent_background).length,
      gltf_model_file_count: gifts.length,
      active_motion_profile_count: activeCount,
      transparent_background_artwork_count: gifts.filter(gift => gift.artwork.transparent_background).length,
      emoji_font_overlay_count: emojiOverlayCount,
      dedicated_mastered_gift_sound_file_count: 0,
      gift_specific_synthesized_sound_design_count: gifts.filter(gift => gift.sound.sound_design_id).length,
      synthetic_sound_profile_count: gifts.length,
      physical_device_qa_verified_count: 0,
      live_control_icon_count: liveControlIconPack.icon_count,
      live_gift_category_icon_count: liveGiftCategoryIconPack.icon_count,
      live_tools_shortcut_icon_count: liveToolsShortcutIconPack.icon_count,
      live_provider_status_icon_count: liveProviderStatusIconPack.icon_count,
      required_generated_files_verified: true
    },
    shared_assets: { icons: [iconSheet, pushIcon, liveControlIconPack, liveGiftCategoryIconPack, liveToolsShortcutIconPack, liveProviderStatusIconPack] },
    gifts
  };
}
function main() {
  const checkOnly = process.argv.includes("--check");
  const manifest = buildManifest();
  const serialized = JSON.stringify(manifest, null, 2) + "\n";
  if (checkOnly) {
    if (!fs.existsSync(OUTPUT_PATH)) fail("manifest is missing; run npm run build:live-asset-manifest.");
    const existing = fs.readFileSync(OUTPUT_PATH, "utf8");
    if (existing !== serialized) fail("manifest is stale; run npm run build:live-asset-manifest.");
    process.stdout.write("[Minglora LIVE asset manifest] verified " + manifest.summary.catalogue_gift_count +
      " catalogue gifts and " + manifest.summary.active_motion_profile_count + " active motion profiles.\n");
    return;
  }
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  const temporary = OUTPUT_PATH + ".tmp-" + process.pid;
  fs.writeFileSync(temporary, serialized, { encoding: "utf8", flag: "wx" });
  fs.renameSync(temporary, OUTPUT_PATH);
  process.stdout.write("[Minglora LIVE asset manifest] generated " + manifest.summary.catalogue_gift_count +
    " gift records; verified " + manifest.summary.svg_artwork_file_count + " SVGs, " +
    manifest.summary.gltf_model_file_count + " GLTFs and " +
    manifest.summary.active_motion_profile_count + " active motion profiles.\n");
}
main();
