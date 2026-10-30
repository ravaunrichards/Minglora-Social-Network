import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requiredFiles = [
  'README.md',
  'docs/REPOSITORY_MAP.md',
  'docs/FEATURE_CATALOG.md',
  'docs/PLATFORM_COVERAGE.md',
  'docs/ROADMAP.md',
  'src/server.js',
  'src/store.js',
  'tests/api.test.js',
  'database/migrations/001_social_core.sql',
  'database/migrations/002_extended_social_domains.sql'
];
const requiredDirectories = [
  'apps/web', 'apps/android', 'apps/ios', 'apps/desktop', 'apps/tv', 'apps/admin', 'apps/creator-studio',
  'frontend/components', 'frontend/layouts', 'frontend/pages', 'frontend/navigation', 'frontend/themes',
  'backend/modules/groups', 'backend/modules/pages', 'backend/modules/stories',
  'backend/modules/albums', 'backend/modules/reels', 'backend/modules/watch', 'backend/modules/calls',
  'backend/modules/events', 'backend/modules/marketplace', 'backend/modules/live',
  'backend/modules/account-recovery', 'backend/modules/email-verification',
  'backend/modules/notification-preferences', 'backend/modules/data-rights',
  'backend/realtime', 'backend/workers',
  'database/migrations', 'database/policies', 'database/functions', 'database/schemas', 'database/seeds',
  'packages/api-contracts', 'packages/shared', 'packages/validation',
  'tests/unit', 'tests/integration', 'tests/e2e', 'tests/security', 'tests/accessibility', 'tests/performance',
  'infrastructure/deployment', 'infrastructure/monitoring'
];

const failures = [];
for (const relative of requiredFiles) {
  try {
    const info = await stat(path.join(root, relative));
    if (!info.isFile()) failures.push(`Required path is not a file: ${relative}`);
  } catch {
    failures.push(`Missing required file: ${relative}`);
  }
}
for (const relative of requiredDirectories) {
  try {
    const info = await stat(path.join(root, relative));
    if (!info.isDirectory()) failures.push(`Required path is not a directory: ${relative}`);
  } catch {
    failures.push(`Missing required directory: ${relative}`);
  }
}

let fileCount = 0;
let directoryCount = 0;
async function inspectDirectory(directory, relative = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  if (entries.length === 0) failures.push(`Empty directory: ${relative || '.'}`);
  directoryCount += 1;
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    const child = relative ? path.join(relative, entry.name) : entry.name;
    if (entry.isDirectory()) {
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'coverage') continue;
      await inspectDirectory(absolute, child);
      continue;
    }
    if (!entry.isFile()) continue;
    fileCount += 1;
    if (entry.name === '.gitkeep') failures.push(`Placeholder file is not allowed: ${child}`);
    const body = await readFile(absolute);
    if (body.length === 0) failures.push(`Empty file: ${child}`);
  }
}
await inspectDirectory(root);

if (failures.length) {
  console.error('Repository structure check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Repository structure check passed: ${fileCount} non-empty files across ${directoryCount} directories.`);
  console.log('All required platform, frontend, backend, database, package, test and infrastructure paths exist.');
}
