# Minglora Android app

**Status:** Android WebView application shell implemented; signed release publishing is conditional on the owner configuring the app-signing key in GitHub Actions.

The Android package uses a hardened WebView to load the live Minglora web client at:

`https://minglora-social-network.onrender.com/`

This is intentional: browser UI, API and server-side service updates are delivered by the existing hosted application. They do not need a new APK when the web app is deployed. Native Android changes (permissions, WebView behavior, app identity, native update handling) require a new APK.

## Build locally

Requirements: JDK 17, Android SDK Platform 36, Build Tools 36.0.0, and Gradle 9.6.0.

From this directory:

```bash
gradle --no-daemon assembleDebug
```

The development APK is written to `app/build/outputs/apk/debug/app-debug.apk`. Debug builds use a separate application ID ending in `.debug` and do not query production update releases.

For a release build, configure the signing environment variables described below, then run:

```bash
gradle --no-daemon assembleRelease -PmingloraVersionCode=1 -PmingloraVersionName=1.0.0
```

Do not distribute an unsigned release APK.

## Automatic build and release

`.github/workflows/android-release.yml` builds a debug APK for Android changes in pull requests and on main. On main, it publishes a signed APK and update manifest to a GitHub Release when all signing secrets are present. Each release uses an increasing GitHub Actions run number as its Android version code.

Configure these repository Actions secrets:

- `ANDROID_KEYSTORE_BASE64`: base64 encoding of the release keystore file.
- `ANDROID_KEY_ALIAS`: key alias in that keystore.
- `ANDROID_KEYSTORE_PASSWORD`: keystore password.
- `ANDROID_KEY_PASSWORD`: private-key password.

The release keystore must be protected and backed up securely. Never commit it or its passwords. The same key must sign every future release of this Android package; changing it prevents normal in-place upgrades for existing installs.

Optional repository Actions variable:

- `MINGLORA_ANDROID_MIN_VERSION_CODE`: minimum supported Android version code. Defaults to `1`. Raise this only when a mandatory update is justified.

When signing secrets are missing, CI still builds and uploads a debug APK artifact, but it deliberately does not publish a release that users could mistake for a valid upgrade. The first distributable signed APK establishes the signing identity for later upgrades.

## In-app update behavior

The release workflow attaches:

- `minglora-android.apk`
- `android-update.json`

The app checks the latest release manifest on launch and at most every six hours while active. A regular update can be postponed. When the installed version is below `minimumSupportedVersionCode`, the app displays a non-dismissible update prompt. The download opens in the user's browser; Android's package installer still requires the user to approve installation. The app does not silently install APKs.

The update manifest download is HTTPS-only and restricted to this repository's fixed GitHub Release APK path. Android verifies that the APK package signature matches the installed app during installation.

## What updates without a new APK?

- Web UI, CSS, browser JavaScript and web assets served by Render.
- Backend/API behavior after the existing Render service deploys the corresponding main-branch commit.
- Supabase, LiveKit and other server-side integrations after their own reviewed deployments/configuration changes.

Database migrations remain a reviewed deployment operation. This workflow does not automatically apply production database migrations or change provider credentials.

## Security and platform boundaries

- HTTPS-only production origin; cleartext traffic is disabled.
- WebView navigation stays on the Minglora production host; external web links open in the browser.
- TLS certificate errors are rejected, never bypassed.
- JavaScript bridge injection is not enabled.
- File selection is delegated to Android's system picker.
- Camera and microphone access are requested through Android runtime permission prompts when a Minglora LIVE flow requests them.
- The Android shell is not a separately implemented native UI for every Minglora feature; it hosts the responsive web application.
