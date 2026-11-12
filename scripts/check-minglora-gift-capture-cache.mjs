import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "assets", "animations", "gifts");
const MANIFEST_PATH = path.join(OUTPUT_DIR, "manifest.json");

async function main() {
  let complete = false;
  try {
    const manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, "utf8"));
    complete = Array.isArray(manifest.gifts) &&
      manifest.gifts.length > 0 &&
      manifest.unique_gift_count === manifest.gifts.length &&
      Array.isArray(manifest.source_screenshots) &&
      manifest.source_screenshots.length > 0;
    if (complete) {
      for (const gift of manifest.gifts) {
        for (const relative of [gift.poster, gift.animation]) {
          if (typeof relative !== "string" || !relative.startsWith("assets/animations/gifts/")) {
            complete = false;
            break;
          }
          const absolute = path.resolve(ROOT, relative);
          if (!absolute.startsWith(path.resolve(OUTPUT_DIR) + path.sep)) {
            complete = false;
            break;
          }
          const stat = await fs.stat(absolute).catch(() => null);
          if (!stat?.isFile() || stat.size < 64) {
            complete = false;
            break;
          }
        }
        if (!complete) break;
      }
    }
  } catch {
    complete = false;
  }
  const value = complete ? "true" : "false";
  if (process.env.GITHUB_OUTPUT) {
    await fs.appendFile(process.env.GITHUB_OUTPUT, "reuse=" + value + "\n");
  }
  process.stdout.write("[gift-animation-cache] reuse=" + value + "\n");
}

main().catch(error => {
  process.stderr.write(String(error?.stack || error) + "\n");
  process.exitCode = 1;
});
