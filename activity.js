import crypto from "node:crypto";
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
		id: crypto.randomBytes(8).toString("hex"),
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

function activityMatches(e, { wanted = "", query = "", from = 0, to = 0, type = "" } = {}) {
	if (wanted && String(e.username).toLowerCase() !== wanted) return false;
	if (
		query &&
		!String(e.url || "").toLowerCase().includes(query) &&
		!String(e.query || "").toLowerCase().includes(query)
	) {
		return false;
	}
	const at = new Date(e.at).getTime();
	if (from && (!Number.isFinite(at) || at < from)) return false;
	if (to && (!Number.isFinite(at) || at > to)) return false;
	if (type === "url" && !e.url) return false;
	if (type === "search" && !e.query) return false;
	return true;
}

export function getActivity({ username = "", limit = 200, offset = 0, search = "", from = 0, to = 0, type = "" } = {}) {
	const filters = {
		wanted: String(username || "").toLowerCase(),
		query: String(search || "").toLowerCase(),
		from: Number(from) || 0,
		to: Number(to) || 0,
		type: String(type || ""),
	};
	const out = [];
	let skipped = 0;
	for (let i = entries.length - 1; i >= 0 && out.length < limit; i--) {
		const e = entries[i];
		if (!activityMatches(e, filters)) continue;
		if (skipped < offset) {
			skipped++;
			continue;
		}
		out.push(e);
	}
	return out;
}

export function countActivity({ username = "", search = "", from = 0, to = 0, type = "" } = {}) {
	const filters = {
		wanted: String(username || "").toLowerCase(),
		query: String(search || "").toLowerCase(),
		from: Number(from) || 0,
		to: Number(to) || 0,
		type: String(type || ""),
	};
	let count = 0;
	for (const e of entries) if (activityMatches(e, filters)) count++;
	return count;
}

export function getActivityById(id) {
	const target = String(id || "").slice(0, 64);
	if (!target) return null;
	return entries.find((entry) => String(entry.id) === target) || null;
}

export function deleteActivity(username, id) {
	const wanted = String(username || "").toLowerCase();
	const target = String(id || "").slice(0, 64);
	if (!wanted || !target) return { error: "invalid-id" };
	const before = entries.length;
	entries = entries.filter(
		(entry) =>
			!(String(entry.username).toLowerCase() === wanted && String(entry.id) === target),
	);
	if (entries.length === before) return { error: "notfound" };
	dirty = true;
	saveNow();
	return { ok: true, removed: before - entries.length };
}

export function deleteActivityRange(username, from, to) {
	const wanted = String(username || "").toLowerCase();
	const start = Number(from) || 0;
	const end = Number(to) || 0;
	if (!start || !end || end < start) return { error: "invalid-range" };
	const before = entries.length;
	entries = entries.filter((e) => {
		if (wanted && String(e.username).toLowerCase() !== wanted) return true;
		const at = new Date(e.at).getTime();
		return !Number.isFinite(at) || at < start || at > end;
	});
	dirty = true;
	saveNow();
	return { ok: true, removed: before - entries.length };
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

export function clearActivityExcept(usernames = []) {
	const keep = new Set(usernames.map((name) => String(name).toLowerCase()));
	entries = entries.filter((e) => keep.has(String(e.username).toLowerCase()));
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

function ensureActivityIds() {
	let changed = false;
	for (const entry of entries) {
		if (!entry.id || typeof entry.id !== "string") {
			entry.id = crypto.randomBytes(8).toString("hex");
			changed = true;
		}
	}
	if (changed) {
		dirty = true;
		saveNow();
	}
}

ensureActivityIds();
