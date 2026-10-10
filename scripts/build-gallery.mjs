import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { basename, extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const GALLERY_YML = join(ROOT, "gallery.yml");
const INDEX_HTML = join(ROOT, "index.html");
const FULLS_DIR = join(ROOT, "images", "fulls");
const THUMBS_DIR = join(ROOT, "images", "thumbs");
const THUMB_WIDTH = 360;
const THUMB_HEIGHT = 247;
const START_MARKER = "<!-- GALLERY:START -->";
const END_MARKER = "<!-- GALLERY:END -->";

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function loadGallery() {
  if (!existsSync(GALLERY_YML)) {
    throw new Error(`Missing ${GALLERY_YML}`);
  }
  const data = yaml.load(readFileSync(GALLERY_YML, "utf8"));
  if (!data?.images || !Array.isArray(data.images)) {
    throw new Error("gallery.yml must contain an `images` array");
  }
  return data.images;
}

function resolveThumbName(entry) {
  if (entry.thumb) {
    return entry.thumb;
  }
  const base = basename(entry.file, extname(entry.file));
  return `${base}.jpg`;
}

async function ensureThumb(entry) {
  const fullPath = join(FULLS_DIR, entry.file);
  if (!existsSync(fullPath)) {
    throw new Error(`Full image not found: images/fulls/${entry.file}`);
  }

  const thumbName = resolveThumbName(entry);
  const thumbPath = join(THUMBS_DIR, thumbName);

  if (entry.thumb) {
    if (!existsSync(thumbPath)) {
      throw new Error(
        `Custom thumb not found: images/thumbs/${thumbName} (from gallery.yml)`,
      );
    }
    return thumbName;
  }

  if (existsSync(thumbPath)) {
    return thumbName;
  }

  mkdirSync(THUMBS_DIR, { recursive: true });
  await sharp(fullPath)
    .resize(THUMB_WIDTH, THUMB_HEIGHT, { fit: "cover", position: "centre" })
    .jpeg({ quality: 80, mozjpeg: true })
    .toFile(thumbPath);

  console.log(`Generated thumb: images/thumbs/${thumbName}`);
  return thumbName;
}

function hasText(value) {
  return typeof value === "string" && value.trim() !== "";
}

function renderArticle(entry, thumbName) {
  const fullSrc = escapeHtml(`images/fulls/${entry.file}`);
  const thumbSrc = escapeHtml(`images/thumbs/${thumbName}`);
  const alt = escapeHtml(entry.file);
  const lines = [
    '        <article class="thumb">',
    `          <a href="${fullSrc}" class="image"`,
    `            ><img src="${thumbSrc}" alt="${alt}"`,
    "          /></a>",
  ];

  // title / description / thumb are optional in gallery.yml
  if (hasText(entry.title)) {
    lines.push(`          <h2>${escapeHtml(entry.title)}</h2>`);
  }
  if (hasText(entry.description)) {
    lines.push("          <p>", `            ${escapeHtml(entry.description)}`, "          </p>");
  }

  lines.push("        </article>");
  return lines.join("\n");
}

function updateIndexHtml(articlesHtml) {
  const html = readFileSync(INDEX_HTML, "utf8");
  const start = html.indexOf(START_MARKER);
  const end = html.indexOf(END_MARKER);

  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      `index.html must contain ${START_MARKER} and ${END_MARKER} markers`,
    );
  }

  const before = html.slice(0, start + START_MARKER.length);
  const after = html.slice(end);
  const next = `${before}\n${articlesHtml}\n        ${after}`;
  writeFileSync(INDEX_HTML, next, "utf8");
}

async function main() {
  const images = loadGallery();
  const articles = [];

  for (const entry of images) {
    if (!entry?.file) {
      throw new Error("Each gallery entry requires a `file` field");
    }
    const thumbName = await ensureThumb(entry);
    articles.push(renderArticle(entry, thumbName));
  }

  updateIndexHtml(articles.join("\n"));
  console.log(`Updated gallery: ${images.length} image(s)`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
