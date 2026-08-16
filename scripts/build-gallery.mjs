import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { feature } from "topojson-client";
import sharp from "sharp";
import * as exifr from "exifr";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const photosDir = path.join(rootDir, "photos");
const siteDir = path.join(rootDir, "site");
const outputDir = path.resolve(rootDir, process.env.ATLAS_OUTPUT || "dist");
const cacheDir = path.join(rootDir, ".cache");
const mediaCacheDir = path.join(cacheDir, "media");
const locationCachePath = path.join(cacheDir, "locations.json");
const supportedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".tif", ".tiff", ".heic", ".heif"]);

if (outputDir === rootDir || outputDir === path.parse(outputDir).root) {
  throw new Error(`Refusing unsafe output directory: ${outputDir}`);
}

const settings = await readJson(path.join(rootDir, "settings.json"), {});
const overrides = await readJson(path.join(rootDir, "location-overrides.json"), {});
const locationCache = await readJson(locationCachePath, {});
const buildWarnings = [];

await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(outputDir, { recursive: true });
await fs.cp(siteDir, outputDir, { recursive: true });
await fs.mkdir(path.join(outputDir, "vendor"), { recursive: true });
await fs.mkdir(path.join(outputDir, "data", "places"), { recursive: true });
await fs.mkdir(path.join(outputDir, "media", "thumb"), { recursive: true });
await fs.mkdir(path.join(outputDir, "media", "large"), { recursive: true });
await fs.mkdir(mediaCacheDir, { recursive: true });
await fs.writeFile(path.join(outputDir, ".nojekyll"), "", "utf8");

const moduleDir = path.join(rootDir, "node_modules");
await fs.copyFile(path.join(moduleDir, "maplibre-gl", "dist", "maplibre-gl.css"), path.join(outputDir, "vendor", "maplibre-gl.css"));
for (const moduleName of ["maplibre-gl.mjs", "maplibre-gl-shared.mjs", "maplibre-gl-worker.mjs", "maplibre-gl-worker-dev.mjs"]) {
  await fs.copyFile(path.join(moduleDir, "maplibre-gl", "dist", moduleName), path.join(outputDir, "vendor", moduleName));
}
const worldTopology = JSON.parse(await fs.readFile(path.join(moduleDir, "world-atlas", "countries-110m.json"), "utf8"));
const worldGeoJson = feature(worldTopology, worldTopology.objects.countries);
await writeJson(path.join(outputDir, "data", "world.geo.json"), worldGeoJson);

const files = (await walk(photosDir)).filter((file) => supportedExtensions.has(path.extname(file).toLowerCase()));

if (files.length === 0) {
  const demo = await readJson(path.join(siteDir, "demo-data.json"), {});
  demo.settings = { ...demo.settings, ...settings };
  await writeJson(path.join(outputDir, "data", "index.json"), demo);
  await writeJson(path.join(outputDir, "data", "build-report.json"), {
    mode: "demo",
    message: "No photographs were found. Add images to the photos folder and rebuild.",
    warnings: []
  });
  console.log("Travel Atlas built in demo mode. Add photographs to photos/ to replace the demo data.");
  process.exit(0);
}

const basics = [];
for (const filePath of files) {
  const relativePath = path.relative(photosDir, filePath).split(path.sep).join("/");
  const parsed = parsePhotoName(path.basename(filePath));
  if (!parsed.placeQuery) {
    buildWarnings.push(`Skipped because no place could be read from its filename: ${relativePath}`);
    continue;
  }
  const albumPath = path.dirname(relativePath);
  const albumName = albumPath === "." ? "未分组 · Unsorted" : albumPath.replaceAll("/", " · ");
  basics.push({ filePath, relativePath, albumName, ...parsed });
}

const uniqueQueries = [...new Set(basics.map((item) => item.placeQuery))];
const locations = new Map();
for (const query of uniqueQueries) {
  const override = overrides[query];
  if (override && Number.isFinite(Number(override.lat)) && Number.isFinite(Number(override.lng))) {
    locations.set(query, normalizeOverride(query, override));
    continue;
  }
  if (locationCache[query]) {
    locations.set(query, locationCache[query]);
    continue;
  }
  const location = await geocode(query);
  locations.set(query, location);
  locationCache[query] = location;
  await writeJson(locationCachePath, locationCache);
  await wait(1100);
}

const processed = await mapPool(basics, 4, async (basic, index) => {
  try {
    const photo = await processPhoto(basic, index + 1, basics.length);
    return { ...basic, ...photo, location: locations.get(basic.placeQuery) };
  } catch (error) {
    buildWarnings.push(`Could not process ${basic.relativePath}: ${error.message}`);
    return null;
  }
});

const records = processed.filter(Boolean);
const albumMap = new Map();
for (const record of records) {
  const id = shortHash(`album:${record.albumName}`);
  if (!albumMap.has(id)) albumMap.set(id, { id, name: record.albumName, count: 0 });
  albumMap.get(id).count += 1;
  record.albumId = id;
}

const placeGroups = new Map();
for (const record of records) {
  const id = shortHash(`place:${record.placeQuery.toLocaleLowerCase()}`);
  if (!placeGroups.has(id)) placeGroups.set(id, []);
  placeGroups.get(id).push(record);
}

const places = [];
for (const [placeId, photos] of placeGroups) {
  photos.sort((a, b) => String(a.date || a.relativePath).localeCompare(String(b.date || b.relativePath)));
  const first = photos[0];
  const location = first.location || unresolvedLocation(first.placeQuery);
  const albumIds = [...new Set(photos.map((photo) => photo.albumId))];
  const albumNames = [...new Set(photos.map((photo) => photo.albumName))];
  const placePhotos = photos.map((photo) => ({
    id: photo.id,
    caption: photo.caption,
    album: photo.albumName,
    date: photo.date,
    thumb: photo.thumb,
    large: photo.large,
    width: photo.width,
    height: photo.height
  }));
  const dataUrl = `./data/places/${placeId}.json`;
  await writeJson(path.join(outputDir, "data", "places", `${placeId}.json`), { placeId, photos: placePhotos });
  places.push({
    id: placeId,
    query: first.placeQuery,
    nameZh: location.nameZh,
    nameEn: location.nameEn,
    countryZh: location.countryZh,
    countryEn: location.countryEn,
    countryCode: location.countryCode,
    lat: location.lat,
    lng: location.lng,
    count: placePhotos.length,
    cover: placePhotos[0]?.thumb || null,
    dataUrl,
    albums: albumIds,
    albumNames,
    firstDate: placePhotos.find((photo) => photo.date)?.date || null
  });
}

places.sort((a, b) => b.count - a.count || a.query.localeCompare(b.query));
const albums = [...albumMap.values()].sort((a, b) => a.name.localeCompare(b.name));
const unresolved = places.filter((place) => !Number.isFinite(place.lat) || !Number.isFinite(place.lng)).map((place) => place.query);

await writeJson(path.join(outputDir, "data", "index.json"), {
  meta: {
    demo: false,
    totalPhotos: records.length,
    totalPlaces: places.length,
    generatedAt: new Date().toISOString()
  },
  settings,
  albums,
  places
});
await writeJson(path.join(outputDir, "data", "build-report.json"), {
  mode: "photographs",
  sourceFiles: files.length,
  publishedPhotos: records.length,
  places: places.length,
  unresolvedLocations: unresolved,
  warnings: buildWarnings
});

console.log(`Travel Atlas built with ${records.length} photographs across ${places.length} places.`);
if (unresolved.length) console.warn(`Unresolved locations (${unresolved.length}): ${unresolved.join(", ")}`);
if (buildWarnings.length) console.warn(`Build warnings: ${buildWarnings.length}. See data/build-report.json.`);

async function processPhoto(basic, current, total) {
  const stat = await fs.stat(basic.filePath);
  const id = shortHash(`${basic.relativePath}:${stat.size}`);
  const thumbCache = path.join(mediaCacheDir, `${id}-thumb.webp`);
  const largeCache = path.join(mediaCacheDir, `${id}-large.webp`);
  const thumbOut = path.join(outputDir, "media", "thumb", `${id}.webp`);
  const largeOut = path.join(outputDir, "media", "large", `${id}.webp`);

  const metadata = await sharp(basic.filePath).metadata();
  const orientedWidth = metadata.orientation && metadata.orientation >= 5 ? metadata.height : metadata.width;
  const orientedHeight = metadata.orientation && metadata.orientation >= 5 ? metadata.width : metadata.height;

  if (!(await exists(thumbCache))) {
    await sharp(basic.filePath)
      .rotate()
      .resize(700, 700, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 76, effort: 4 })
      .toFile(thumbCache);
  }
  if (!(await exists(largeCache))) {
    await sharp(basic.filePath)
      .rotate()
      .resize(1800, 1800, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 })
      .toFile(largeCache);
  }
  await fs.copyFile(thumbCache, thumbOut);
  await fs.copyFile(largeCache, largeOut);

  let exif = {};
  try {
    exif = await exifr.parse(basic.filePath, ["DateTimeOriginal", "CreateDate", "ModifyDate"]) || {};
  } catch (_) {
    // A missing or unsupported EXIF block should not block publication.
  }
  const rawDate = exif.DateTimeOriginal || exif.CreateDate || exif.ModifyDate;
  const date = rawDate instanceof Date && !Number.isNaN(rawDate.valueOf()) ? rawDate.toISOString() : null;

  if (current === 1 || current % 100 === 0 || current === total) {
    console.log(`Processed ${current}/${total}: ${basic.relativePath}`);
  }

  return {
    id,
    date,
    thumb: `./media/thumb/${id}.webp`,
    large: `./media/large/${id}.webp`,
    width: orientedWidth || null,
    height: orientedHeight || null
  };
}

function parsePhotoName(filename) {
  const stem = path.basename(filename, path.extname(filename)).trim();
  if (!stem) return { placeQuery: "", caption: "" };
  if (stem.includes("__")) {
    const [place, ...captionParts] = stem.split("__");
    const rawCaption = captionParts.join("__").replaceAll("_", " ").trim();
    return {
      placeQuery: place.trim(),
      caption: /^\d+$/.test(rawCaption) ? "" : rawCaption
    };
  }
  const placeQuery = stem.replace(/[\s_-]*\(?\d{1,6}\)?$/, "").trim() || stem;
  return { placeQuery, caption: "" };
}

async function geocode(query) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("namedetails", "1");
  url.searchParams.set("accept-language", "zh-CN,zh,en");
  if (settings.geocodingEmail) url.searchParams.set("email", settings.geocodingEmail);

  const repository = process.env.GITHUB_REPOSITORY ? `https://github.com/${process.env.GITHUB_REPOSITORY}` : "local-build";
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": `ShansTravelAtlas/1.0 (${repository})`,
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const results = await response.json();
    if (!results.length) return unresolvedLocation(query);
    const result = results[0];
    const details = result.namedetails || {};
    const address = result.address || {};
    const fallbackName = address.city || address.town || address.village || address.county || result.name || query.split(",")[0];
    const code = String(address.country_code || "").toLowerCase();
    const regionZh = code ? displayRegion(code, "zh-CN") : (address.country || "");
    const regionEn = code ? displayRegion(code, "en") : (address.country || "");
    return {
      lat: Number(result.lat),
      lng: Number(result.lon),
      nameZh: details["name:zh"] || details["name:zh-Hans"] || fallbackName,
      nameEn: details["name:en"] || result.name || fallbackName,
      countryZh: regionZh,
      countryEn: regionEn,
      countryCode: code
    };
  } catch (error) {
    buildWarnings.push(`Could not geocode “${query}”: ${error.message}`);
    return unresolvedLocation(query);
  }
}

function normalizeOverride(query, value) {
  const fallback = query.split(",")[0].trim();
  const code = String(value.countryCode || "").toLowerCase();
  return {
    lat: Number(value.lat),
    lng: Number(value.lng),
    nameZh: value.nameZh || value.nameEn || fallback,
    nameEn: value.nameEn || value.nameZh || fallback,
    countryZh: value.countryZh || (code ? displayRegion(code, "zh-CN") : ""),
    countryEn: value.countryEn || (code ? displayRegion(code, "en") : ""),
    countryCode: code
  };
}

function unresolvedLocation(query) {
  const fallback = query.split(",")[0].trim();
  return { lat: null, lng: null, nameZh: fallback, nameEn: fallback, countryZh: "", countryEn: "", countryCode: "" };
}

function displayRegion(code, locale) {
  try { return new Intl.DisplayNames([locale], { type: "region" }).of(code.toUpperCase()) || code.toUpperCase(); }
  catch (_) { return code.toUpperCase(); }
}

async function walk(directory) {
  if (!(await exists(directory))) return [];
  const output = [];
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await walk(fullPath));
    else if (entry.isFile()) output.push(fullPath);
  }
  return output;
}

async function mapPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch (_) { return fallback; }
}

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function exists(file) {
  try { await fs.access(file); return true; }
  catch (_) { return false; }
}

function shortHash(value) {
  return crypto.createHash("sha1").update(value).digest("hex").slice(0, 16);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
