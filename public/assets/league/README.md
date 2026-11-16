# League Arena artwork and references

The JPEGs in the repository's root `assets/League/` directory are the original user-uploaded reference captures. The web application serves them only through the explicit filename allowlist in `src/server.js`; the source files remain unchanged.

League Arena displays the uploaded division artwork, 18-class progression diagram, and separate A, B, C, D1, and D2–D5 fragment-threshold references. Its live top-three leaderboard uses the supplied rank-row layout while continuing to render real member avatars, names, scores, and profile actions from Minglora data.

The legacy SVG sprite is retained only for the four Match Power-Up icons because the supplied League reference folder does not contain separate power-up artwork. It is not used as a substitute for the uploaded division, fragment, or leaderboard references.
