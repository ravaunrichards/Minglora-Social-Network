# Minglora Android updates and service synchronization

## Release model

Minglora's Android client is a native WebView shell around the production web client. The package does not bundle a separate copy of the website's JavaScript, styles, or API implementation. It loads:

`https://minglora-social-network.onrender.com/`

This creates two independent update channels:

1. **Hosted application and services:** the existing Render service deploys the main-branch Node/web application. The Android shell loads that live site, so compatible UI, CSS, browser JavaScript and API changes become available after the hosted deployment completes. Supabase and LiveKit remain service integrations behind the hosted application.
2. **Native Android package:** Android permissions, WebView behavior, app identity and native update logic are built into the APK. Changes to `apps/android/**` trigger the Android workflow. The workflow builds a debug APK for PR verification and main-branch changes. It publishes a signed latest release only when the release keystore secrets are configured.

The service worker now checks the network first for navigations, scripts, styles and fonts, then falls back to cached content when offline. The web server marks HTML, JavaScript, CSS and the web manifest as requiring revalidation, preventing a previous app shell from masking a successful deployment.

## Update feed

The signed-release workflow publishes two assets to the latest GitHub Release:

- `minglora-android.apk`
- `android-update.json`

The manifest identifies the package, monotonically increasing version code, version name, minimum supported version, release notes, fixed APK download URL, release page and SHA-256 digest. The Android app checks the manifest on launch and at most every six hours while active. A standard update can be postponed; a release can require an update by raising the `MINGLORA_ANDROID_MIN_VERSION_CODE` repository Actions variable.

The app only accepts the fixed HTTPS GitHub release download URL for this repository. Android verifies that the APK package signature matches the installed app during installation. The app opens the download in the browser; the user must approve installation in Android. Silent installation is not attempted.

## One-time signing setup

The repository had no native Android app or signing identity before this change. Therefore the first signed release establishes the identity for all future in-place upgrades. It will not magically match an APK signed independently with another key.

Generate a new protected release key once, outside the repository:

```bash
keytool -genkeypair -v -keystore minglora-release-key.jks -alias minglora -keyalg RSA -keysize 4096 -validity 10000
base64 -w0 minglora-release-key.jks
```

Store the resulting base64 value and key passwords in GitHub repository Actions secrets:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_PASSWORD`

Keep a secure offline backup of the keystore. Never store it in the repository, Render, client code or a public artifact. Loss of the signing key prevents normal upgrades signed with that identity.

Set the optional repository Actions variable `MINGLORA_ANDROID_MIN_VERSION_CODE` to a version code that existing installations must meet. It defaults to `1`; do not raise it without a published release at or above that version.

Until those secrets are configured, the workflow only uploads a debug APK artifact. A debug package uses a distinct `.debug` application ID and must not be treated as a production update.

## Service compatibility and deployment safety

- Do not couple web-only changes to native APK rebuilds; the APK loads the deployed site.
- Keep API changes backward-compatible while older supported APKs exist, or raise the minimum supported version after a compatible release has been published.
- Keep Supabase schema migrations reviewed and applied through the existing deployment process. The Android workflow does not run production database migrations.
- Keep provider credentials only in their existing server-side environments.
- A successful GitHub build does not by itself prove Render or Supabase deployment succeeded. Confirm the relevant service health checks after each deployment.
- An unavailable update manifest never blocks normal app startup. Mandatory update prompts only appear after a valid signed-release manifest says the installed version is below the configured minimum.
