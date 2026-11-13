# Minglora Gift System — Requirements and Preservation Notes

**Project:** Minglora Social Network  
**Scope:** Minglora Gift Studio, LIVE gifts, gift artwork, animation, catalogue records, and directly related administration.

## 1. Cartoon gifts

Remove only the unwanted cartoon-style gifts that have been explicitly identified. Do not keep previously retired or deleted gifts selectable. Preserve historical records unless a separate approved data-retention action says otherwise. Do not guess which gift IDs the owner considers unwanted.

## 2. Individual gift animations

Every active gift must resolve to its own animation identity and distinct animation asset. No two active gifts may resolve to identical keyframe sequences. The choreography must suit the gift subject and its actual artwork. Loading an individual animation must not block comments, host controls, viewer controls, or room navigation. Keep a safe fallback for missing or invalid animation files.

## 3. Original uploaded artwork

Use the highest-quality approved original artwork supplied for each gift. Preserve source files and attribution/provenance. Do not replace approved artwork with generic stock art or AI-generated substitutes. Do not use logos, proprietary gift art, or watermarked content from other platforms as Minglora production artwork.

## 4. Missing gift artwork

Make approved uploaded artwork available at the correct catalogue paths and verify that the actual gift cards, previews, and LIVE presentations load it. An asset must not be marked complete while its application reference is missing or broken.

## 5. Separate gift-asset repository

Keep gift asset source files, optimized output, previews, models, animation data, audio, metadata, documentation, and QA organized in the designated gift-asset repository. Do not write to an unverified repository or create a replacement repository without confirming the correct destination. Preserve the canonical Minglora app integration separately.

## 6. Screenshot and reference review

Inspect every supplied gift screenshot and reference folder, including nested files. Record source path, dimensions, format, duplicate/variant candidates, intended gift, and review status. Use reference images to understand layout and behavior, not to copy protected platform branding or unlicensed artwork.

## 7. Preserve gift information

Keep source gift names, unique gift IDs/codes, coin prices, descriptions, labels, categories, subcategories, rarity, asset version, and all available metadata. Do not invent missing fields or prices. Use the canonical configured gift catalogue and backend as the source of truth.

## 8. Duplicate prevention

Do not add duplicate gift records or duplicate artwork under different names. Compare available asset hashes and visual variants, choose the best approved source, and retain a traceable mapping to the original. Keep different genuine editions or variants distinct only where the canonical metadata confirms that distinction.

## 9. Related gift functionality

Preserve and verify gift selection, previews, sending, receiving, sender and recipient identity, gift history, collections, favorites, moderation, and gift administration where implemented. Sending must use the real catalogue and authenticated backend response.

## 10. Coins, transactions, and creator earnings

Use the configured backend for coin pricing, wallet deductions, transaction history, refunds, reconciliation, and creator earnings. Never fabricate balances, counts, payment records, or earnings. Apply the configured revenue-share policy only to eligible, confirmed transactions.

## 11. Asset organization

Maintain recoverable locations for original artwork, optimized artwork, thumbnails, posters, animation files, 3D models, sounds, categories, metadata, manifests, integration code, licenses/provenance, documentation, and tests. Do not represent empty folders or placeholder README files as finished premium assets.

## 12. Copy and export

Provide actions to copy one complete gift record, the available gift metadata for that record, the full current gift catalogue, and these requirements/notes. Copy output must come from the actual catalogue or saved requirements file; missing source fields must remain missing rather than being invented.

## 13. Backup and preservation

Preserve the original uploaded assets and reference screenshots. Keep recoverable asset records and manifests. Make changes incrementally, avoid replacing working files without verifying their use, and do not delete source assets during optimization or deduplication.

## 14. Final quality assurance

Verify that identified unwanted gifts are no longer active, no duplicate gift records or identical animation sequences remain, every active gift has the correct name and coin price, artwork and animation files exist and load, audio and effects behave as configured, all gift features work, and supported screen sizes remain usable. Record browser-based validation separately from physical-device testing.

## Current implementation boundary

The current LIVE build includes an existing canonical gift catalogue and generated asset pipeline. Per-gift motion JSON is generated for every active catalogue gift and loaded lazily by code. Extracted screenshot-derived gift crops remain review-only until human review and provenance/licence status are resolved. Premium hand-authored 3D scenes, dedicated mastered per-gift audio, a fully verified 18-theme artwork collection, and physical-device QA must be tracked as separate outstanding work rather than marked complete.
