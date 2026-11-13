# Minglora LIVE — Desktop Reference Measurements

**Date:** 2026-11-13  
**Source:** `assets/reference/Laptop PC Web/Minglora TikTok/`  
**Purpose:** Layout and interaction guidance only. Captured brand marks, user photography, gift artwork and labels are not production assets.

| Capture | PNG dimensions | Verified screen | Geometry and interaction observations |
|---|---:|---|---|
| `capture-20261112-072900.png` | 1366×644 | Multi-guest LIVE room | Left application rail; central two-part video stage; independent right viewer/chat panel; fixed gift strip at the bottom of the stage. |
| `capture-20261112-072931.png` | 1366×642 | Expanded LIVE gift picker | Gift grid opens as an overlay inside the stage; existing right viewer/chat panel remains separately visible; base gift strip remains at the bottom. |
| `capture-20261112-073154.png` | 1366×642 | Single-host LIVE room | Vertical host video remains centered in the stage; creator identity/follow action at the top; viewer list and chat occupy a distinct right panel; gift strip is docked at the stage bottom. |
| `capture-20261112-072813.png` | 1366×636 | LIVE discovery | Discovery category strip, LIVE preview card and followed-live creator list; this is not the in-room interface. |
| `capture-20261112-072050.png` | 1363×636 | Video/feed detail | Feed video, adjacent action rail and comments panel; not an in-room LIVE layout. |
| `capture-20261112-074126.png` | 1364×638 | Creator scheduler | Scheduling calendar and creator navigation; not a LIVE layout. |

| `capture-20261112-073025.png` | 1366×637 | Multi-guest LIVE room | Additional room state with central video stage, chat/viewer column and dock; kept separate from feed/video views. |
| `capture-20261112-074648.png` | 1366×638 | Multi-guest LIVE room | Four-position participant composition with the viewer/chat rail to the right. |
| `capture-20261112-074718.png` | 1366×634 | Multi-guest LIVE room | Six-position participant grid; unused positions remain visually distinct from active participant video. |
| `capture-20261112-074754.png` | 1366×639 | Multi-guest LIVE room | Four participant tiles and a bottom gift dock spanning the stage. |
| `capture-20261112-074824.png` | 1366×641 | Single-host LIVE room | One portrait host stage, separate right viewer/chat rail and bottom gift dock. |
| `capture-20261112-073623.png` | 1364×639 | LIVE watch preview | Preview/discovery state with an expanded left navigation rail and click-to-watch prompt; not an in-room host control layout. |
| `capture-20261112-074500.png` | 1364×632 | LIVE discovery/watch preview | Discovery categories and watch-preview surface; not an in-room host control layout. |

## Implementation mapping

- **Desktop room:** keep the stage and viewer/chat rail as separate columns. The chat rail must not be hidden behind the gift overlay.
- **Gift selection:** overlay the stage region while preserving access to comments and room identity. Do not replace the base gift dock with an unrelated page.
- **Single-host and multi-guest:** preserve one dominant stream area for a host-only room and a distinct participant arrangement when more than one participant is on stage.
- **Discovery:** keep browsing and opening a LIVE room as separate states.

## Evidence limits

The dimensions are exact PNG IHDR width/height values for these six sampled screenshots. They are image-pixel dimensions, not measured CSS layout units after browser scaling. No iPhone, iPad/tablet, foldable or Smart TV screenshot has been verified in this six-image desktop sample. Android references exist in the separate 1,071-image directory, but the complete Android set has not been human-reviewed. Do not infer device-specific support from these desktop screenshots.

This measurement document supplements, rather than replaces, the original 1,121-file inventory. The original screenshots stay read-only.


## Additional directly inspected desktop states

A 2026-11-13 follow-up opened 23/29 desktop TikTok screenshots. The expanded room set confirms solo-host, two-person, four-position and six-position multi-guest states. It also confirms that the gift browser is an overlay within the main stage region while the separate viewer/chat rail remains present. Discovery and preview screens remain distinct from the in-room control surface; video-feed, profile, short-drama, recharge and scheduling screens are not room-layout evidence.

The pixel dimensions above are source-image dimensions, not CSS pixel measurements. The screenshot references do not establish viewport scaling, actual responsive breakpoints or safe areas on physical devices. The remaining six desktop TikTok screenshots were not rendered successfully by the repository preview and remain pending; no geometry was inferred from their filenames.
