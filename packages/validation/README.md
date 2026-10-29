# Validation package boundary

Reusable validation currently lives in `src/domain/validation.js` as a tested foundation. Move it here only when backend and client actually share the module and package format is configured. Do not keep competing versions of username, audience or content rules.