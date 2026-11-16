# Minglora Sounds Studio

Minglora Sounds is the creator-owned audio library and soundtrack editor for the social network. It is exposed inside the post and Story composers, not as another primary navigation destination.

## Included in this release

- Upload an original recording or record directly from the device microphone.
- Supported formats: MP3, M4A/MP4 audio, OGG, WebM audio, WAV, FLAC and AAC.
- Private Supabase Storage bucket `minglora-sounds`, with a 50 MB upload limit and owner-folder policies.
- Rights confirmation before an original recording can enter the library.
- Creator-controlled reuse permission; private recordings can be used only by their owner.
- Sound search, trending-by-use, newest, saved and personal-library views.
- Audio preview and favorites.
- Soundtrack trim in/out points, volume, fade-in and fade-out.
- Soundtracks on photo/video posts and Stories, including playback synchronized with video playback.
- Editing an existing post can change or remove its soundtrack without deleting the original uploaded recording.
- Removing a sound from the library archives it for new use while existing post/Story references continue to resolve.

## API

- `GET /api/sounds?q=&sort=trending|new|saved|mine`
- `POST /api/sounds` publishes an uploaded original sound after validating its rights declaration and media asset.
- `POST|DELETE /api/sounds/:id/favorite`
- `DELETE /api/sounds/:id` archives the creator's sound.
- `POST /api/posts` and `PATCH /api/posts/:id` accept optional soundtrack metadata.
- `POST /api/stories` accepts optional soundtrack metadata.

## Rights and catalogue boundary

This release is an original-sounds library. It does not seed a commercial music catalogue or claim that commercial songs are licensed for Minglora. A commercial catalogue requires rights and territory agreements, cue/usage rules, reporting and provider integration before those songs can be offered.

## Editing boundary

Trim, volume and fade settings are stored with the post/Story and applied during playback. Original audio assets remain unmodified. This release does not yet perform server-side audio rendering, export a permanently mixed MP4, or provide a multitrack waveform/DAW-style editor.
