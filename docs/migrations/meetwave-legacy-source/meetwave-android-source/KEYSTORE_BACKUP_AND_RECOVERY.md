# MeetWave Release Keystore — Backup & Recovery (READ CAREFULLY)

This keystore signs `com.meetwave.app`. **It is permanent.** If you lose it or
change it, existing users can no longer install updates and you would have to
ship a brand-new app listing.

## Files delivered
- `meetwave-release.jks` — the release keystore (PKCS12, RSA-2048, 30-yr validity)
- `credentials.txt` — the keystore password and alias

## Facts
- Alias: `meetwave`
- Key/store password: see `credentials.txt`
  (this is a PKCS12 keystore, so the key password equals the store password)
- Signer certificate SHA-256:
  `de2c424b240bb24e0a5eb2b0df2eda14585fa307aede4e4b6ff809d551d4b23f`

## What to do NOW
1. Move `meetwave-release.jks` and `credentials.txt` into a password manager /
   secrets vault. Keep at least two offline encrypted backups.
2. **Never commit them to GitHub** or any public location.
3. For CI, store the keystore as a base64 secret:
   ```bash
   base64 -w0 meetwave-release.jks   # paste into secret MEETWAVE_KEYSTORE_BASE64
   ```
   and store the password/alias as separate secrets.
4. Delete any plaintext copies from shared/temporary storage once backed up.

## Recovery
As long as you keep this `.jks` + password, every future release signs with the
same identity and installs cleanly as an update over existing installs.
