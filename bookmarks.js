import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const FILE = path.join(DATA_DIR, "bookmarks.json");
const MAX_PER_USER = 100;

let db = { bookmarks: {} };

function save() {
	fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
	const tmp = `${FILE}.tmp`;
	fs.writeFileSync(tmp, JSON.stringify(db, null, 2), { mode: 0o600 });
	fs.renameSync(tmp, FILE);
}

function load() {
	fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
	if (!fs.existsSync(FILE)) {
		save();
		return;
	}
	try {
		const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
		db = { bookmarks: data.bookmarks || {} };
	} catch (err) {
		console.error("No se pudo cargar bookmarks.json:", err.message);
		db = { bookmarks: {} };
	}
}

function cleanUrl(value) {
	try {
		const url = new URL(String(value || ""));
		if (!/^https?:$/.test(url.protocol)) return "";
		return url.href.slice(0, 2048);
	} catch {
		return "";
	}
}

function cleanLabel(value, url) {
	const label = String(value || "").trim().slice(0, 60);
	if (label) return label;
	try {
		return new URL(url).hostname.slice(0, 60);
	} catch {
		return "Favorito";
	}
}

export function listBookmarks(username) {
	const key = Object.keys(db.bookmarks).find(
		(name) => name.toLowerCase() === String(username).toLowerCase(),
	);
	if (!key) return [];
	return [...db.bookmarks[key]].sort(
		(a, b) => new Date(b.createdAt) - new Date(a.createdAt),
	);
}

export function addBookmark(username, { label, url }) {
	const clean = cleanUrl(url);
	if (!clean) return { error: "invalid-url" };
	const existing = listBookmarks(username);
	if (existing.length >= MAX_PER_USER) return { error: "limit" };
	if (existing.some((b) => b.url === clean)) return { error: "exists" };
	const key =
		Object.keys(db.bookmarks).find(
			(name) => name.toLowerCase() === String(username).toLowerCase(),
		) || username;
	if (!db.bookmarks[key]) db.bookmarks[key] = [];
	const bookmark = {
		id: crypto.randomBytes(8).toString("hex"),
		label: cleanLabel(label, clean),
		url: clean,
		createdAt: new Date().toISOString(),
	};
	db.bookmarks[key].push(bookmark);
	save();
	return { bookmark };
}

export function updateBookmark(username, id, { label, url }) {
	const key = Object.keys(db.bookmarks).find(
		(name) => name.toLowerCase() === String(username).toLowerCase(),
	);
	if (!key) return { error: "notfound" };
	const bookmark = db.bookmarks[key].find((b) => b.id === id);
	if (!bookmark) return { error: "notfound" };
	const clean = cleanUrl(url ?? bookmark.url);
	if (!clean) return { error: "invalid-url" };
	bookmark.url = clean;
	bookmark.label = cleanLabel(label ?? bookmark.label, clean);
	save();
	return { bookmark };
}

export function deleteBookmark(username, id) {
	const key = Object.keys(db.bookmarks).find(
		(name) => name.toLowerCase() === String(username).toLowerCase(),
	);
	if (!key) return { error: "notfound" };
	const index = db.bookmarks[key].findIndex((b) => b.id === id);
	if (index < 0) return { error: "notfound" };
	db.bookmarks[key].splice(index, 1);
	save();
	return { ok: true };
}

export function deleteUserBookmarks(username) {
	for (const key of Object.keys(db.bookmarks)) {
		if (key.toLowerCase() === String(username).toLowerCase()) {
			delete db.bookmarks[key];
			save();
			return;
		}
	}
}

export function exportBookmarks() {
	return JSON.parse(JSON.stringify(db.bookmarks));
}

load();
