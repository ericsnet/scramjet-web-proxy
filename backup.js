import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { getSettings } from "./settings.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
let BACKUP_DIR = process.env.BACKUP_DIR || "/var/backups/proxy";
const KEY_FILE =
	process.env.BACKUP_KEY_FILE || path.join(DATA_DIR, "backup.key");

function ensureDir() {
	try {
		fs.mkdirSync(BACKUP_DIR, { recursive: true, mode: 0o700 });
	} catch {
		BACKUP_DIR = path.join(__dirname, "backups");
		fs.mkdirSync(BACKUP_DIR, { recursive: true, mode: 0o700 });
	}
}

function usersMap() {
	try {
		return JSON.parse(fs.readFileSync(path.join(DATA_DIR, "users.json"), "utf8"))
			.users || {};
	} catch {
		return {};
	}
}

function groupsList() {
	try {
		const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "groups.json"), "utf8"));
		return Array.isArray(data.groups) ? data.groups : [];
	} catch {
		return [];
	}
}

function backupKey() {
	if (!fs.existsSync(KEY_FILE)) {
		fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true, mode: 0o700 });
		fs.writeFileSync(KEY_FILE, crypto.randomBytes(32).toString("hex"), {
			mode: 0o600,
		});
	}
	const raw = fs.readFileSync(KEY_FILE, "utf8").trim();
	if (/^[a-f0-9]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
	if (raw.length >= 32) return crypto.createHash("sha256").update(raw).digest();
	throw new Error("Clave de backup no válida.");
}

function encrypt(payload) {
	const iv = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv("aes-256-gcm", backupKey(), iv);
	const data = Buffer.concat([
		cipher.update(JSON.stringify(payload), "utf8"),
		cipher.final(),
	]);
	return Buffer.concat([Buffer.from("WPB1"), iv, cipher.getAuthTag(), data]);
}

function decrypt(buffer) {
	if (buffer.subarray(0, 4).toString() !== "WPB1" || buffer.length < 32) {
		throw new Error("Formato de backup no válido.");
	}
	const iv = buffer.subarray(4, 16);
	const tag = buffer.subarray(16, 32);
	const decipher = crypto.createDecipheriv("aes-256-gcm", backupKey(), iv);
	decipher.setAuthTag(tag);
	const data = Buffer.concat([decipher.update(buffer.subarray(32)), decipher.final()]);
	return JSON.parse(data.toString("utf8"));
}

function sanitizedUsers() {
	const source = usersMap();
	const out = {};
	for (const [name, user] of Object.entries(source)) {
		out[name] = {
			role: user.role,
			blocked: !!user.blocked,
			blockedUntil: user.blockedUntil || null,
			mustChangePassword: !!user.mustChangePassword,
			createdAt: user.createdAt || null,
			lang: user.lang || "",
			schedule: user.schedule || null,
			blockedSites: Array.isArray(user.blockedSites) ? user.blockedSites : [],
			siteMessages:
				user.siteMessages && typeof user.siteMessages === "object"
					? user.siteMessages
					: {},
			unblockOverrides: Array.isArray(user.unblockOverrides)
				? user.unblockOverrides
				: [],
			group: user.group || "",
		};
	}
	return out;
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
		if (!name.endsWith(".enc")) continue;
		const full = path.join(BACKUP_DIR, name);
		try {
			if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
		} catch {}
	}
}

export function createBackup(reason = "manual") {
	ensureDir();
	const payload = {
		version: 2,
		sanitized: true,
		exportedAt: new Date().toISOString(),
		reason,
		users: sanitizedUsers(),
		settings: getSettings(),
		groups: groupsList(),
	};
	const encrypted = encrypt(payload);
	let name = `backup-${fileStamp()}.json.enc`;
	let full = path.join(BACKUP_DIR, name);
	let counter = 1;
	while (fs.existsSync(full)) {
		name = `backup-${fileStamp()}-${counter}.json.enc`;
		full = path.join(BACKUP_DIR, name);
		counter++;
	}
	fs.writeFileSync(full, encrypted, { mode: 0o600 });
	pruneBackups();
	return { name, size: fs.statSync(full).size, exportedAt: payload.exportedAt };
}

export function listBackups() {
	ensureDir();
	return fs
		.readdirSync(BACKUP_DIR)
		.filter((name) => name.endsWith(".enc"))
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
	if (!safe.endsWith(".enc")) return null;
	const full = path.join(BACKUP_DIR, safe);
	if (!fs.existsSync(full)) return null;
	return full;
}

export function restoreBackup(name) {
	const full = backupPath(name);
	if (!full) return { error: "notfound" };
	let data;
	try {
		data = decrypt(fs.readFileSync(full));
	} catch {
		return { error: "invalid" };
	}
	if (
		data.version !== 2 ||
		!data.users ||
		typeof data.users !== "object" ||
		Array.isArray(data.users) ||
		!data.settings ||
		typeof data.settings !== "object"
	) {
		return { error: "invalid" };
	}

	createBackup("before-restore");
	const current = usersMap();
	const restored = {};
	for (const [name, record] of Object.entries(data.users)) {
		const previous = current[name] || {};
		restored[name] = {
			role: ["user", "moderator", "admin", "creator"].includes(record.role)
				? record.role
				: "user",
			password: previous.password || "!disabled",
			blocked: !!record.blocked,
			blockedUntil: record.blockedUntil || null,
			blockMessage: previous.blockMessage || "",
			notes: previous.notes || "",
			mustChangePassword: previous.password ? !!record.mustChangePassword : true,
			createdAt: record.createdAt || previous.createdAt || new Date().toISOString(),
			lastLoginAt: previous.lastLoginAt || null,
			lastSeenAt: previous.lastSeenAt || null,
			loginCount: previous.loginCount || 0,
			blockedSites: Array.isArray(record.blockedSites) ? record.blockedSites : [],
			siteMessages:
				record.siteMessages && typeof record.siteMessages === "object"
					? record.siteMessages
					: {},
			unblockOverrides: Array.isArray(record.unblockOverrides)
				? record.unblockOverrides
				: [],
			lang: record.lang || "",
			schedule: record.schedule || null,
		};
	}
	const write = (file, content) => {
		fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
		const tmp = path.join(DATA_DIR, `${file}.tmp`);
		fs.writeFileSync(tmp, JSON.stringify(content, null, 2), { mode: 0o600 });
		fs.renameSync(tmp, path.join(DATA_DIR, file));
	};
	write("users.json", { users: restored });
	write("settings.json", data.settings);
	if (Array.isArray(data.groups)) write("groups.json", { groups: data.groups });
	return { ok: true };
}

export function backupCount() {
	try {
		return listBackups().length;
	} catch {
		return 0;
	}
}
