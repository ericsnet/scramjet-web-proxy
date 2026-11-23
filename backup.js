import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSettings } from "./settings.js";
import { exportActivity } from "./activity.js";
import { exportAudit } from "./audit.js";
import { exportBookmarks } from "./bookmarks.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const BACKUP_DIR = path.join(__dirname, "backups");

function ensureDir() {
	fs.mkdirSync(BACKUP_DIR, { recursive: true, mode: 0o700 });
}

function usersMap() {
	try {
		return JSON.parse(fs.readFileSync(path.join(DATA_DIR, "users.json"), "utf8"))
			.users || {};
	} catch {
		return {};
	}
}

function fileStamp(date = new Date()) {
	const pad = (n) => String(n).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
		date.getDate(),
	)}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

export function pruneBackups() {
	ensureDir();
	const settings = getSettings();
	const days = Math.max(1, Number(settings.backupRetentionDays) || 14);
	const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
	for (const name of fs.readdirSync(BACKUP_DIR)) {
		if (!name.endsWith(".json")) continue;
		const full = path.join(BACKUP_DIR, name);
		try {
			if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
		} catch {}
	}
}

export function createBackup(reason = "manual") {
	ensureDir();
	const backup = {
		version: 1,
		exportedAt: new Date().toISOString(),
		reason,
		users: usersMap(),
		settings: getSettings(),
		activity: exportActivity(),
		audit: exportAudit(),
		bookmarks: exportBookmarks(),
	};
	let name = `backup-${fileStamp()}.json`;
	let full = path.join(BACKUP_DIR, name);
	let counter = 1;
	while (fs.existsSync(full)) {
		name = `backup-${fileStamp()}-${counter}.json`;
		full = path.join(BACKUP_DIR, name);
		counter++;
	}
	fs.writeFileSync(full, JSON.stringify(backup, null, 2), { mode: 0o600 });
	pruneBackups();
	return { name, size: fs.statSync(full).size, exportedAt: backup.exportedAt };
}

export function listBackups() {
	ensureDir();
	return fs
		.readdirSync(BACKUP_DIR)
		.filter((name) => name.endsWith(".json"))
		.map((name) => {
			const full = path.join(BACKUP_DIR, name);
			const stat = fs.statSync(full);
			return {
				name,
				size: stat.size,
				createdAt: stat.mtime.toISOString(),
			};
		})
		.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function backupPath(name) {
	const safe = path.basename(String(name || ""));
	if (!safe.endsWith(".json")) return null;
	const full = path.join(BACKUP_DIR, safe);
	if (!fs.existsSync(full)) return null;
	return full;
}

export function restoreBackup(name) {
	const full = backupPath(name);
	if (!full) return { error: "notfound" };
	let data;
	try {
		data = JSON.parse(fs.readFileSync(full, "utf8"));
	} catch {
		return { error: "invalid" };
	}
	if (
		data.version !== 1 ||
		!data.users ||
		typeof data.users !== "object" ||
		Array.isArray(data.users) ||
		!data.settings ||
		typeof data.settings !== "object"
	) {
		return { error: "invalid" };
	}

	createBackup("before-restore");
	fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
	const write = (file, content) => {
		const tmp = path.join(DATA_DIR, `${file}.tmp`);
		fs.writeFileSync(tmp, JSON.stringify(content, null, 2), { mode: 0o600 });
		fs.renameSync(tmp, path.join(DATA_DIR, file));
	};
	write("users.json", { users: data.users });
	write("settings.json", data.settings);
	write("activity.json", { entries: Array.isArray(data.activity) ? data.activity : [] });
	write("audit.json", { events: Array.isArray(data.audit) ? data.audit : [] });
	write("bookmarks.json", {
		bookmarks: data.bookmarks && typeof data.bookmarks === "object" ? data.bookmarks : {},
	});
	return { ok: true };
}

export function backupCount() {
	try {
		return listBackups().length;
	} catch {
		return 0;
	}
}
