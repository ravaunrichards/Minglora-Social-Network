# Platform and product coverage

This document records target scope without claiming that each client or product area is live.

## Client platforms

| Client | Current status |
|---|---|
| Browser | Working responsive starter client in `public/` |
| Android | Planned; target boundary in `apps/android/` |
| iOS/iPadOS | Planned; target boundary in `apps/ios/` |
| Desktop | Planned; target boundary in `apps/desktop/` |
| TV | Planned; target boundary in `apps/tv/` |
| Admin | Planned; boundary in `apps/admin/` |
| Creator Studio | Planned; boundary in `apps/creator-studio/` |

## Product domains

Working slices currently include accounts, profiles, feed scopes, post lifecycle, reactions/comments, relationships, saved posts, Groups, Pages, Stories, direct text messages, basic notifications and substring search.

Target domains still requiring implementation include photos/albums, short video/Reels, Watch, Live/video calls, Events, Marketplace, check-ins/places, Memories, Fundraisers, Ads/monetization, account verification/recovery, notification preferences, data export/deletion, full moderation, media upload/processing, privacy-wide enforcement and production-grade database operations.

## Completion rule

A module is not complete because it has a README, folder, or SQL table. Mark it implemented only after server-side authorization, validated persistence, user-facing UI, tests, operational handling and security/privacy review exist.