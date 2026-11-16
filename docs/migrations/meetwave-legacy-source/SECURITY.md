# MeetWave security and release signing

## Signing material

Never commit Android keystores, passwords, tokens, or credential files. Keep
release signing material in an encrypted password manager or secrets vault,
with separate encrypted offline backups. GitHub Actions release signing uses
these repository secrets:

- `MEETWAVE_KEYSTORE_BASE64`
- `MEETWAVE_STORE_PASSWORD`
- `MEETWAVE_KEY_ALIAS`
- `MEETWAVE_KEY_PASSWORD`

The release workflow will build a signed APK only when all four are present.
Without them, it builds a debug APK for CI verification and does not publish
that debug APK as an installable release.

**Important:** signing material that has ever been committed to a public
repository must be treated as exposed. Do not assume deleting a file from the
latest commit removes it from Git history or from copies already downloaded.
Preserve a verified backup before making any change to the signing identity.
For already-installed sideloaded apps, changing the signing key can prevent
normal in-place updates; plan key recovery or a migration before rotating it.

## Operational baseline

- Keep production on HTTPS and WebSocket Secure (WSS).
- Keep room access and media permissions under explicit user control.
- Do not log credentials, meeting contents, or private media.
- Review dependency audit results before production releases.
