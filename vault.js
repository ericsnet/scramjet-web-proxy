import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const FILE = path.join(DATA_DIR, "vaults.json");
const MAX_ENTRIES = 500;
const MAX_CIPHERTEXT = 24 * 1024;

let db = { vaults: {} };

function save() {
	fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
	const tmp = `${FILE}.tmp`;
	fs.writeFileSync(tmp, JSON.stringify(db, null, 2), { mode: 0o600 });
	fs.renameSync(tmp, FILE);
}

function load() {
	try {
		if (!fs.existsSync(FILE)) {
			save();
			return;
		}
		const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
		db = {
			vaults:
				data.vaults && typeof data.vaults === "object" && !Array.isArray(data.vaults)
					? data.vaults
					: {},
		};
	} catch {
		db = { vaults: {} };
		save();
	}
}

function keyFor(username) {
	const wanted = String(username || "").toLowerCase();
	return Object.keys(db.vaults).find((name) => name.toLowerCase() === wanted) || "";
}

function validBase64(value, max) {
	const text = String(value || "");
	return text.length > 0 && text.length <= max && /^[A-Za-z0-9+/]+={0,2}$/.test(text);
}

function publicVault(vault) {
	if (!vault) return null;
	return {
		configured: true,
		salt: vault.salt,
		check: { iv: vault.check.iv, ciphertext: vault.check.ciphertext },
		entries: (vault.entries || []).map((entry) => ({
			id: entry.id,
			iv: entry.iv,
			ciphertext: entry.ciphertext,
			updatedAt: entry.updatedAt,
		})),
	};
}

export function getVault(username) {
	const key = keyFor(username);
	return publicVault(key ? db.vaults[key] : null);
}

export function initVault(username, { salt = "", checkIv = "", checkCiphertext = "" } = {}) {
	const name = String(username || "");
	if (!name) return { error: "notfound" };
	if (getVault(name)) return { error: "exists" };
	if (!validBase64(salt, 64)) return { error: "invalid-salt" };
	if (!validBase64(checkIv, 32)) return { error: "invalid-iv" };
	if (!validBase64(checkCiphertext, 1024)) return { error: "invalid-check" };
	db.vaults[name] = {
		salt: String(salt),
		check: { iv: String(checkIv), ciphertext: String(checkCiphertext) },
		entries: [],
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	};
	save();
	return { ok: true, vault: getVault(name) };
}

export function saveEntry(username, { id = "", iv = "", ciphertext = "" } = {}) {
	const key = keyFor(username);
	if (!key) return { error: "notconfigured" };
	if (!validBase64(iv, 32) || !validBase64(ciphertext, MAX_CIPHERTEXT)) {
		return { error: "invalid-entry" };
	}
	const vault = db.vaults[key];
	const cleanId = /^[a-f0-9]{16}$/.test(String(id)) ? String(id) : "";
	const entry = {
		id: cleanId || crypto.randomBytes(8).toString("hex"),
		iv: String(iv),
		ciphertext: String(ciphertext),
		updatedAt: new Date().toISOString(),
	};
	const index = vault.entries.findIndex((item) => item.id === entry.id);
	if (index >= 0) {
		vault.entries[index] = entry;
	} else {
		if (vault.entries.length >= MAX_ENTRIES) return { error: "limit" };
		vault.entries.push(entry);
	}
	vault.updatedAt = entry.updatedAt;
	save();
	return { ok: true, entry };
}

export function deleteEntry(username, id) {
	const key = keyFor(username);
	if (!key) return { error: "notconfigured" };
	const vault = db.vaults[key];
	const before = vault.entries.length;
	vault.entries = vault.entries.filter((entry) => entry.id !== String(id || ""));
	if (vault.entries.length === before) return { error: "notfound" };
	vault.updatedAt = new Date().toISOString();
	save();
	return { ok: true };
}

export function resetVault(username) {
	const key = keyFor(username);
	if (!key) return { error: "notfound" };
	delete db.vaults[key];
	save();
	return { ok: true };
}

export function deleteVault(username) {
	return resetVault(username);
}

load();
