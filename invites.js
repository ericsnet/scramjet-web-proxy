import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const FILE = path.join(DATA_DIR, "invites.json");
const MAX_ACTIVE_PER_CREATOR = 20;
const MAX_INVITES = 5000;
const DEFAULT_HOURS = 7 * 24;
const MAX_HOURS = 30 * 24;
const DEFAULT_USES = 1;
const MAX_USES = 10;
const KEEP_AFTER_END_MS = 30 * 24 * 60 * 60 * 1000;

let invites = [];
let tokenIndex = new Map();
let saveTimer = null;
let dirty = false;

function tokenHash(token) {
	return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function normalizeUser(value) {
	return String(value || "").toLowerCase();
}

function rebuildIndex() {
	tokenIndex = new Map();
	for (const invite of invites) tokenIndex.set(invite.tokenHash, invite);
}

function saveNow() {
	if (!dirty) return;
	try {
		fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
		const tmp = `${FILE}.tmp`;
		fs.writeFileSync(tmp, JSON.stringify({ invites }), { mode: 0o600 });
		fs.renameSync(tmp, FILE);
		dirty = false;
	} catch (err) {
		console.error("No se pudo guardar invites.json:", err.message);
	}
}

function scheduleSave() {
	dirty = true;
	if (saveTimer) return;
	saveTimer = setTimeout(() => {
		saveTimer = null;
		saveNow();
	}, 500);
	saveTimer.unref?.();
}

function prune() {
	const cutoff = Date.now() - KEEP_AFTER_END_MS;
	const before = invites.length;
	invites = invites.filter((invite) => {
		const end = invite.revokedAt
			? new Date(invite.revokedAt).getTime()
			: new Date(invite.expiresAt).getTime();
		return Number.isFinite(end) && end >= cutoff;
	});
	if (invites.length > MAX_INVITES) {
		invites = invites.slice(-MAX_INVITES);
	}
	if (invites.length !== before) {
		rebuildIndex();
		dirty = true;
	}
}

function load() {
	try {
		fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
		if (!fs.existsSync(FILE)) return;
		const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
		invites = (Array.isArray(data.invites) ? data.invites : [])
			.filter(
				(invite) =>
					invite &&
					typeof invite.id === "string" &&
					typeof invite.tokenHash === "string" &&
					typeof invite.createdBy === "string" &&
					Number.isFinite(new Date(invite.createdAt).getTime()) &&
					Number.isFinite(new Date(invite.expiresAt).getTime()),
			)
			.map((invite) => ({
				id: invite.id.slice(0, 64),
				tokenHash: invite.tokenHash,
				createdBy: invite.createdBy.slice(0, 64),
				createdAt: invite.createdAt,
				expiresAt: invite.expiresAt,
				maxUses: Math.min(MAX_USES, Math.max(1, Number(invite.maxUses) || DEFAULT_USES)),
				uses: Math.max(0, Number(invite.uses) || 0),
				usedBy: Array.isArray(invite.usedBy)
					? invite.usedBy.map((name) => String(name).slice(0, 64)).slice(0, MAX_USES)
					: [],
				revokedAt: invite.revokedAt || null,
				revokedBy: invite.revokedBy || "",
			}));
		prune();
		rebuildIndex();
		saveNow();
	} catch (err) {
		console.error("No se pudo cargar invites.json:", err.message);
		invites = [];
		tokenIndex = new Map();
	}
}

load();

export function inviteStatus(invite) {
	if (!invite) return "invalid";
	if (invite.revokedAt) return "revoked";
	if (new Date(invite.expiresAt).getTime() <= Date.now()) return "expired";
	if (invite.uses >= invite.maxUses) return "used";
	return "active";
}

export function publicInvite(invite) {
	return {
		id: invite.id,
		createdBy: invite.createdBy,
		createdAt: invite.createdAt,
		expiresAt: invite.expiresAt,
		maxUses: invite.maxUses,
		uses: invite.uses,
		usedBy: [...invite.usedBy],
		status: inviteStatus(invite),
	};
}

export function createInvite(createdBy, { hours = DEFAULT_HOURS, maxUses = DEFAULT_USES } = {}) {
	prune();
	const owner = String(createdBy || "").slice(0, 64);
	if (!owner) return { error: "invalid-user" };
	const active = invites.filter(
		(invite) =>
			normalizeUser(invite.createdBy) === normalizeUser(owner) &&
			inviteStatus(invite) === "active",
	).length;
	if (active >= MAX_ACTIVE_PER_CREATOR) {
		return { error: "limit", limit: MAX_ACTIVE_PER_CREATOR };
	}
	const ttlHours = Math.min(MAX_HOURS, Math.max(1, Number(hours) || DEFAULT_HOURS));
	const uses = Math.min(MAX_USES, Math.max(1, Number(maxUses) || DEFAULT_USES));
	const token = crypto.randomBytes(32).toString("base64url");
	const now = Date.now();
	const invite = {
		id: crypto.randomBytes(8).toString("hex"),
		tokenHash: tokenHash(token),
		createdBy: owner,
		createdAt: new Date(now).toISOString(),
		expiresAt: new Date(now + ttlHours * 60 * 60 * 1000).toISOString(),
		maxUses: uses,
		uses: 0,
		usedBy: [],
		revokedAt: null,
		revokedBy: "",
	};
	invites.push(invite);
	tokenIndex.set(invite.tokenHash, invite);
	scheduleSave();
	return { token, invite: publicInvite(invite) };
}

export function findInviteByToken(token) {
	return tokenIndex.get(tokenHash(token)) || null;
}

export function getInvite(id) {
	const wanted = String(id || "");
	return invites.find((invite) => invite.id === wanted) || null;
}

export function listInvites(createdBy = "") {
	const owner = normalizeUser(createdBy);
	return invites
		.filter((invite) => !owner || normalizeUser(invite.createdBy) === owner)
		.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
		.map(publicInvite);
}

export function consumeInvite(token, username) {
	const invite = findInviteByToken(token);
	const status = inviteStatus(invite);
	if (status !== "active") return { error: status };
	invite.uses += 1;
	invite.usedBy.push(String(username || "").slice(0, 64));
	scheduleSave();
	return { ok: true, invite: publicInvite(invite) };
}

export function revokeInvite(id, actor, { admin = false } = {}) {
	const invite = getInvite(id);
	if (!invite) return { error: "notfound" };
	if (
		!admin &&
		normalizeUser(invite.createdBy) !== normalizeUser(actor)
	) {
		return { error: "forbidden" };
	}
	if (invite.revokedAt) return { ok: true, invite: publicInvite(invite) };
	invite.revokedAt = new Date().toISOString();
	invite.revokedBy = String(actor || "").slice(0, 64);
	scheduleSave();
	return { ok: true, invite: publicInvite(invite) };
}

export function flushInvites() {
	if (saveTimer) {
		clearTimeout(saveTimer);
		saveTimer = null;
	}
	dirty = true;
	saveNow();
}
