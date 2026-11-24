import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const CACHE_DIR = path.join(DATA_DIR, "categories");
const DAY = 24 * 60 * 60 * 1000;

const SOURCES = {
	adult: "https://raw.githubusercontent.com/blocklistproject/Lists/master/porn.txt",
	gambling: "https://raw.githubusercontent.com/blocklistproject/Lists/master/gambling.txt",
	social: "https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/social-only/hosts",
};

const sets = new Map();
const meta = new Map();

function ensureCache() {
	fs.mkdirSync(CACHE_DIR, { recursive: true, mode: 0o700 });
}

function parse(text) {
	const set = new Set();
	for (let line of String(text).split(/\r?\n/)) {
		line = line.trim();
		if (!line || line.startsWith("#") || line.startsWith("!")) continue;
		if (line.startsWith("||")) line = line.slice(2);
		if (line.endsWith("^")) line = line.slice(0, -1);
		const parts = line.split(/\s+/);
		let host = parts[0] || "";
		if (parts.length >= 2 && /^(0\.0\.0\.0|127\.0\.0\.1|::1)$/.test(parts[0])) {
			host = parts[1];
		}
		host = host.toLowerCase().replace(/\.$/, "");
		if (!/^[a-z0-9.-]+$/.test(host) || !host.includes(".")) continue;
		set.add(host);
	}
	return set;
}

async function download(name) {
	const url = SOURCES[name];
	if (!url) return null;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 45_000);
	try {
		const res = await fetch(url, { signal: controller.signal });
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const text = await res.text();
		const set = parse(text);
		if (!set.size) throw new Error("lista vacía");
		ensureCache();
		fs.writeFileSync(path.join(CACHE_DIR, `${name}.txt`), text, { mode: 0o600 });
		sets.set(name, set);
		meta.set(name, { updatedAt: Date.now(), count: set.size });
		console.log(`Lista ${name}: ${set.size} dominios`);
		return set;
	} catch (err) {
		console.error(`No se pudo descargar la lista ${name}: ${err.message}`);
		return null;
	} finally {
		clearTimeout(timer);
	}
}

function loadCached(name) {
	try {
		const file = path.join(CACHE_DIR, `${name}.txt`);
		if (!fs.existsSync(file)) return false;
		const set = parse(fs.readFileSync(file, "utf8"));
		if (!set.size) return false;
		sets.set(name, set);
		meta.set(name, { updatedAt: fs.statSync(file).mtimeMs, count: set.size });
		return true;
	} catch {
		return false;
	}
}

export async function refreshCategory(name, force = false) {
	if (!SOURCES[name]) return null;
	const info = meta.get(name);
	if (!force && info && Date.now() - info.updatedAt < DAY) return sets.get(name);
	return (await download(name)) || sets.get(name) || null;
}

export async function refreshCategories(force = false) {
	for (const name of Object.keys(SOURCES)) {
		if (force || !loadCached(name)) await refreshCategory(name, force);
	}
}

export function categoryBlocked(hostname, categories = []) {
	const host = String(hostname || "").toLowerCase().replace(/\.$/, "");
	if (!host) return null;
	const labels = host.split(".");
	for (const category of categories) {
		const set = sets.get(category);
		if (!set) continue;
		for (let i = 0; i < labels.length - 1; i++) {
			const candidate = labels.slice(i).join(".");
			if (set.has(candidate)) return category;
		}
	}
	return null;
}

export function categoryStats() {
	return Object.fromEntries(
		Object.keys(SOURCES).map((name) => [
			name,
			{
				count: meta.get(name)?.count || sets.get(name)?.size || 0,
				updatedAt: meta.get(name)?.updatedAt || null,
			},
		]),
	);
}

export async function initCategories() {
	ensureCache();
	for (const name of Object.keys(SOURCES)) loadCached(name);
	setInterval(() => {
		refreshCategories(false).catch(() => {});
	}, DAY).unref();
}
