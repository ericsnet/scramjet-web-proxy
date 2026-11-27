import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AVATAR_DIR = path.join(__dirname, "data", "avatars");
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const infoCache = new Map();

const TYPES = [
	{
		type: "image/png",
		ext: "png",
		match: (buffer) =>
			buffer.length >= 8 &&
			buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
	},
	{
		type: "image/jpeg",
		ext: "jpg",
		match: (buffer) =>
			buffer.length >= 3 &&
			buffer[0] === 0xff &&
			buffer[1] === 0xd8 &&
			buffer[2] === 0xff,
	},
	{
		type: "image/webp",
		ext: "webp",
		match: (buffer) =>
			buffer.length >= 12 &&
			buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
			buffer.subarray(8, 12).toString("ascii") === "WEBP",
	},
];

function key(username) {
	return crypto
		.createHash("sha256")
		.update(String(username || "").toLowerCase())
		.digest("hex")
		.slice(0, 32);
}

function fileFor(username, ext) {
	return path.join(AVATAR_DIR, `${key(username)}.${ext}`);
}

function detect(buffer) {
	if (!Buffer.isBuffer(buffer) || buffer.length < 8) return null;
	return TYPES.find((entry) => entry.match(buffer)) || null;
}

export function avatarType(buffer) {
	return detect(buffer);
}

export function avatarInfo(username) {
	if (!username) return null;
	const cacheKey = String(username).toLowerCase();
	if (infoCache.has(cacheKey)) {
		const cached = infoCache.get(cacheKey);
		return cached ? { ...cached } : null;
	}
	for (const entry of TYPES) {
		const file = fileFor(username, entry.ext);
		try {
			const stat = fs.statSync(file);
			if (!stat.isFile()) continue;
			const version = Math.floor(stat.mtimeMs);
			const info = {
				url: `/avatar/${encodeURIComponent(String(username))}?v=${version}`,
				type: entry.type,
				updatedAt: new Date(stat.mtimeMs).toISOString(),
			};
			infoCache.set(cacheKey, info);
			return { ...info };
		} catch {}
	}
	infoCache.set(cacheKey, null);
	return null;
}

export function avatarFile(username) {
	if (!username) return null;
	for (const entry of TYPES) {
		const file = fileFor(username, entry.ext);
		try {
			const stat = fs.statSync(file);
			if (stat.isFile()) return { path: file, type: entry.type };
		} catch {}
	}
	return null;
}

export function saveAvatar(username, buffer) {
	if (!Buffer.isBuffer(buffer) || !buffer.length) return { error: "empty" };
	if (buffer.length > MAX_AVATAR_BYTES) return { error: "too_large" };
	const type = detect(buffer);
	if (!type) return { error: "invalid_type" };
	try {
		fs.mkdirSync(AVATAR_DIR, { recursive: true, mode: 0o700 });
		const file = fileFor(username, type.ext);
		const tmp = `${file}.tmp`;
		fs.writeFileSync(tmp, buffer, { mode: 0o600 });
		fs.renameSync(tmp, file);
		for (const entry of TYPES) {
			if (entry.ext !== type.ext) {
				try {
					fs.rmSync(fileFor(username, entry.ext), { force: true });
				} catch {}
			}
		}
		infoCache.delete(String(username).toLowerCase());
		return { ok: true, info: avatarInfo(username) };
	} catch (error) {
		return { error: "save_failed", detail: error.message };
	}
}

function removeFiles(username) {
	for (const entry of TYPES) {
		try {
			fs.rmSync(fileFor(username, entry.ext), { force: true });
		} catch {}
	}
}

export function deleteAvatar(username) {
	if (!username) return { ok: true };
	try {
		removeFiles(username);
		infoCache.delete(String(username).toLowerCase());
		return { ok: true };
	} catch {
		return { error: "delete_failed" };
	}
}
