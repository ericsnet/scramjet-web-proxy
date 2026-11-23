import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getSettings } from "./settings.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const FILE = path.join(DATA_DIR, "activity.json");

let entries = [];
let saveTimer = null;
let dirty = false;

function load() {
	try {
		fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
		if (!fs.existsSync(FILE)) return;
		const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
		if (Array.isArray(data.entries)) entries = data.entries;
	} catch (err) {
		console.error("No se pudo cargar activity.json:", err.message);
		entries = [];
	}
}

function saveNow() {
	if (!dirty) return;
	try {
		fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
		const tmp = `${FILE}.tmp`;
		fs.writeFileSync(tmp, JSON.stringify({ entries }, null, 2), { mode: 0o600 });
		fs.renameSync(tmp, FILE);
		dirty = false;
	} catch (err) {
		console.error("No se pudo guardar activity.json:", err.message);
	}
}

function scheduleSave() {
	dirty = true;
	if (saveTimer) return;
	saveTimer = setTimeout(() => {
		saveTimer = null;
		saveNow();
	}, 1000);
	saveTimer.unref?.();
}

export function recordActivity(username, { url, query } = {}) {
	const settings = getSettings();
	if (!settings.activityEnabled || !username) return;
	let cleanUrl = "";
	if (typeof url === "string" && url.length <= 4096) {
		try {
			const parsed = new URL(url);
			if (parsed.protocol === "http:" || parsed.protocol === "https:") {
				parsed.username = "";
				parsed.password = "";
				cleanUrl = parsed.href.slice(0, 2048);
			}
		} catch {
			cleanUrl = "";
		}
	}
	const cleanQuery = typeof query === "string" ? query.trim().slice(0, 256) : "";
	if (!cleanUrl && !cleanQuery) return;

	// Evita duplicados seguidos del mismo usuario.
	const last = entries[entries.length - 1];
	if (
		last &&
		last.username === username &&
		last.url === cleanUrl &&
		last.query === cleanQuery
	) {
		return;
	}

	entries.push({
		username,
		url: cleanUrl,
		query: cleanQuery,
		at: new Date().toISOString(),
	});

	// Límite por usuario.
	let count = 0;
	for (let i = entries.length - 1; i >= 0; i--) {
		if (entries[i].username === username) {
			count++;
			if (count > settings.activityPerUser) entries.splice(i, 1);
		}
	}
	if (entries.length > settings.activityTotal) {
		entries.splice(0, entries.length - settings.activityTotal);
	}

	scheduleSave();
}

export function trimActivity() {
	const settings = getSettings();
	const perUser = new Map();
	const kept = [];
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i];
		const count = (perUser.get(entry.username) || 0) + 1;
		if (count > settings.activityPerUser) continue;
		perUser.set(entry.username, count);
		kept.push(entry);
	}
	entries = kept.reverse().slice(-settings.activityTotal);
	dirty = true;
	saveNow();
}

export function getActivity({ username = "", limit = 200, offset = 0, search = "" } = {}) {
	const wanted = String(username || "").toLowerCase();
	const query = String(search || "").toLowerCase();
	const out = [];
	let skipped = 0;
	for (let i = entries.length - 1; i >= 0 && out.length < limit; i--) {
		const e = entries[i];
		if (wanted && String(e.username).toLowerCase() !== wanted) continue;
		if (
			query &&
			!String(e.url || "").toLowerCase().includes(query) &&
			!String(e.query || "").toLowerCase().includes(query)
		) {
			continue;
		}
		if (skipped < offset) {
			skipped++;
			continue;
		}
		out.push(e);
	}
	return out;
}

export function countActivity({ username = "", search = "" } = {}) {
	const wanted = String(username || "").toLowerCase();
	const query = String(search || "").toLowerCase();
	let count = 0;
	for (const e of entries) {
		if (wanted && String(e.username).toLowerCase() !== wanted) continue;
		if (
			query &&
			!String(e.url || "").toLowerCase().includes(query) &&
			!String(e.query || "").toLowerCase().includes(query)
		) {
			continue;
		}
		count++;
	}
	return count;
}

export function activityCounts() {
	const counts = {};
	for (const e of entries) counts[e.username] = (counts[e.username] || 0) + 1;
	return counts;
}

export function clearActivity(username = "") {
	const wanted = String(username || "").toLowerCase();
	if (!wanted) {
		entries = [];
	} else {
		entries = entries.filter((e) => String(e.username).toLowerCase() !== wanted);
	}
	dirty = true;
	saveNow();
}

export function exportActivity() {
	return JSON.parse(JSON.stringify(entries));
}

export function flushActivity() {
	saveNow();
}

load();
