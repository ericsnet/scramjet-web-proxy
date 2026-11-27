import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { getSettings } from "./settings.js";
import { normalizeRoleList, highestRole } from "./roles.js";
import { avatarInfo, deleteAvatar } from "./avatars.js";
import { normalizeIp } from "./ip.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");
const ATTEMPTS_FILE = path.join(DATA_DIR, "login-attempts.json");
const ABSOLUTE_SESSION_MS = 7 * 24 * 60 * 60 * 1000; // 7 días como máximo

export const SESSION_COOKIE = "__Host-pw_session";
const LEGACY_SESSION_COOKIE = "pw_session";
const HEARTBEAT_PATH =
	/^\/(?:api\/(?:chat\/(?:notifications|messages|channels|unread|read|typing)|me|lang|config|admin\/(?:monitor|traffic)))$/;
const HEARTBEAT_ANY_METHOD = /^\/api\/chat\/read$/;

function isHeartbeatRequest(req) {
	const path = req.path || "";
	if (HEARTBEAT_ANY_METHOD.test(path)) return true;
	return ["GET", "HEAD"].includes(String(req.method || "").toUpperCase()) && HEARTBEAT_PATH.test(path);
}

const sessions = new Map(); // tokenHash -> { id, username, createdAt, lastSeenAt, expires, absoluteExpires, ip, userAgent }
const sessionsByUser = new Map(); // username lower -> Set(tokenHash)
const EMPTY_SESSION_KEYS = new Set();

function indexSession(key, session) {
	const owner = String(session?.username || "").toLowerCase();
	if (!owner) return;
	let keys = sessionsByUser.get(owner);
	if (!keys) {
		keys = new Set();
		sessionsByUser.set(owner, keys);
	}
	keys.add(key);
}

function unindexSession(key, session) {
	const owner = String(session?.username || "").toLowerCase();
	const keys = sessionsByUser.get(owner);
	if (!keys) return;
	keys.delete(key);
	if (!keys.size) sessionsByUser.delete(owner);
}

function sessionKeysFor(username) {
	return sessionsByUser.get(String(username || "").toLowerCase()) || EMPTY_SESSION_KEYS;
}
const loginAttempts = new Map(); // username -> { count, resetAt }
const ipAttempts = new Map(); // ip -> { count, resetAt }
const accountIpAttempts = new Map(); // ip:username -> { count, resetAt }
const scryptAsync = promisify(crypto.scrypt);
const ACCOUNT_IP_LIMIT = 10;
const ACCOUNT_IP_WINDOW_MS = 15 * 60 * 1000;
const lastSeenWrite = new Map(); // username -> timestamp

/* ------------------------------ contraseñas ------------------------------ */

function hashPassword(password) {
	const salt = crypto.randomBytes(16).toString("hex");
	const hash = crypto.scryptSync(password, salt, 64).toString("hex");
	return `scrypt:${salt}:${hash}`;
}

async function checkPassword(password, stored) {
	const [scheme, salt, hash] = String(stored || "").split(":");
	if (scheme !== "scrypt" || !salt || !hash) return false;
	const candidate = await scryptAsync(password, salt, 64);
	const expected = Buffer.from(hash, "hex");
	return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

// Se usa para que un usuario inexistente tarde lo mismo que uno con contraseña
// incorrecta (evita enumerar cuentas por tiempo de respuesta).
const DUMMY_HASH = hashPassword(crypto.randomBytes(32).toString("hex"));

function hashToken(token) {
	return crypto.createHash("sha256").update(String(token)).digest("hex");
}

/* -------------------------------- almacén -------------------------------- */

let db = { users: {} };
let userIndex = new Map();

function rebuildUserIndex() {
	userIndex = new Map(
		Object.keys(db.users).map((name) => [name.toLowerCase(), name]),
	);
}

function canonicalUser(username) {
	return userIndex.get(String(username || "").toLowerCase()) || null;
}

function save() {
	fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
	const tmp = `${USERS_FILE}.tmp`;
	fs.writeFileSync(tmp, JSON.stringify(db), { mode: 0o600 });
	fs.renameSync(tmp, USERS_FILE);
}

let usersSaveTimer = null;
function scheduleUsersSave() {
	if (usersSaveTimer) return;
	usersSaveTimer = setTimeout(() => {
		usersSaveTimer = null;
		save();
	}, 5000);
	usersSaveTimer.unref?.();
}

export function flushUsers() {
	if (usersSaveTimer) {
		clearTimeout(usersSaveTimer);
		usersSaveTimer = null;
	}
	save();
}

function migrateUsers() {
	let changed = false;
	for (const user of Object.values(db.users)) {
		const defaults = {
			blocked: false,
			blockedUntil: null,
			blockMessage: "",
			notes: "",
			mustChangePassword: false,
			lastLoginAt: null,
			lastSeenAt: null,
			loginCount: 0,
			blockedSites: [],
			siteMessages: {},
			unblockOverrides: [],
			lang: "",
			schedule: null,
			group: "",
			groupOnboarded: false,
			groupRules: true,
			mfa: null,
		};
		for (const [key, value] of Object.entries(defaults)) {
			if (user[key] === undefined) {
				user[key] = value;
				changed = true;
			}
		}
		if (!Array.isArray(user.roles) || !user.roles.length) {
			user.roles = normalizeRoleList(user.role || "user");
			changed = true;
		} else {
			const normalizedRoles = normalizeRoleList(user.roles);
			if (normalizedRoles.join(",") !== user.roles.join(",")) {
				user.roles = normalizedRoles;
				changed = true;
			}
		}
		const highest = highestRole(user.roles);
		if (user.role !== highest) {
			user.role = highest;
			changed = true;
		}
		if (user.blockedUntil && new Date(user.blockedUntil).getTime() <= Date.now()) {
			user.blockedUntil = null;
			changed = true;
		}
	}
	if (changed) save();
}

function seedIfNeeded() {
	fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
	if (fs.existsSync(USERS_FILE)) {
		db = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
		if (!db.users) db.users = {};
		migrateUsers();
		return;
	}
	const raw = process.env.PROXY_INITIAL_USERS;
	if (!raw) {
		throw new Error(
			"No existe data/users.json. Restaura una copia o crea los usuarios iniciales con la variable PROXY_INITIAL_USERS.",
		);
	}
	const initial = JSON.parse(raw);
	db = { users: {} };
	for (const [name, data] of Object.entries(initial)) {
		const roles = normalizeRoleList(data.roles || data.role);
		if (!roles.length) continue;
		if (!validatePassword(data.password)) {
			throw new Error(`Contraseña inicial no válida para ${name}`);
		}
		db.users[name] = {
			role: highestRole(roles),
			roles,
			password: hashPassword(data.password),
			blocked: false,
			blockedUntil: null,
			blockMessage: "",
			notes: "",
			mustChangePassword: false,
			createdAt: new Date().toISOString(),
			lastLoginAt: null,
			lastSeenAt: null,
			loginCount: 0,
			blockedSites: [],
			siteMessages: {},
			unblockOverrides: [],
			lang: "",
			schedule: null,
			mfa: null,
		};
	}
	save();
}

seedIfNeeded();
rebuildUserIndex();

function isEffectivelyBlocked(user) {
	if (!user) return false;
	if (user.blocked) return true;
	if (user.blockedUntil && new Date(user.blockedUntil).getTime() > Date.now()) return true;
	return false;
}

export function listUsers() {
	const now = Date.now();
	return Object.entries(db.users)
		.map(([username, u]) => {
			const until =
				u.blockedUntil && new Date(u.blockedUntil).getTime() > now
					? u.blockedUntil
					: null;
			return {
				username,
				role: u.role,
				roles: Array.isArray(u.roles) && u.roles.length ? u.roles : [u.role],
				group: u.group || "",
				groupOnboarded: !!u.groupOnboarded,
				groupRules: u.groupRules !== false,
				blocked: !!u.blocked,
				blockedUntil: until,
				blockMessage: u.blockMessage || "",
				effectivelyBlocked: !!u.blocked || !!until,
				notes: u.notes || "",
				blockedSites: Array.isArray(u.blockedSites) ? u.blockedSites : [],
				siteMessages: u.siteMessages && typeof u.siteMessages === "object" ? u.siteMessages : {},
				unblockOverrides: Array.isArray(u.unblockOverrides) ? u.unblockOverrides : [],
				lang: u.lang || "",
				schedule: u.schedule || null,
				mfaEnabled: !!u.mfa?.enabled,
				mustChangePassword: !!u.mustChangePassword,
				createdAt: u.createdAt,
				lastLoginAt: u.lastLoginAt || null,
				lastSeenAt: u.lastSeenAt || null,
				loginCount: u.loginCount || 0,
				sessionCount: sessionsForUser(username).length,
				icon: avatarInfo(username),
			};
		})
		.sort((a, b) => a.username.localeCompare(b.username, "es"));
}

export function listUserChatMeta() {
	return Object.keys(db.users).map((username) => {
		const user = db.users[username];
		return {
			username,
			role: user.role,
			roles: Array.isArray(user.roles) && user.roles.length ? user.roles : [user.role],
			icon: avatarInfo(username),
		};
	});
}

export function getUser(username) {
	if (!username) return null;
	const name = canonicalUser(username);
	if (!name) return null;
	const user = db.users[name];
	const until =
		user.blockedUntil && new Date(user.blockedUntil).getTime() > Date.now()
			? user.blockedUntil
			: null;
	return {
		username: name,
		...user,
		role: user.role,
		roles: Array.isArray(user.roles) && user.roles.length ? user.roles : [user.role],
		blockedUntil: until,
		effectivelyBlocked: !!user.blocked || !!until,
		icon: avatarInfo(name),
	};
}

export function getMfa(username) {
	const user = getUser(username);
	return user?.mfa ? JSON.parse(JSON.stringify(user.mfa)) : null;
}

export function setMfa(username, value) {
	const name = canonicalUser(username);
	if (!name) return { error: "notfound" };
	db.users[name].mfa = value || null;
	save();
	return { ok: true };
}

export function clearMfa(username) {
	return setMfa(username, null);
}

export function countAdmins() {
	return Object.values(db.users).filter((u) => ["admin", "creator"].includes(u.role)).length;
}

export function countActiveAdmins() {
	return Object.values(db.users).filter(
		(u) => ["admin", "creator"].includes(u.role) && !isEffectivelyBlocked(u),
	).length;
}

export function validateUsername(username) {
	return /^[A-Za-z0-9._-]{3,32}$/.test(String(username || ""));
}

export function validatePassword(password) {
	return typeof password === "string" && password.length >= 8 && password.length <= 128;
}

export function createUser(username, password, role) {
	const name = String(username || "").trim();
	if (!validateUsername(name)) return { error: "invalid-user" };
	if (!validatePassword(password)) return { error: "invalid-password" };
	if (getUser(name)) return { error: "exists" };
	const roles = normalizeRoleList(role);
	if (!roles.length || roles.includes("creator")) return { error: "invalid-role" };
	if (roles.includes("admin") && roles.includes("moderator")) return { error: "role-conflict" };
	db.users[name] = {
		role: highestRole(roles),
		roles,
		password: hashPassword(password),
		blocked: false,
		blockedUntil: null,
		blockMessage: "",
		notes: "",
		mustChangePassword: false,
		createdAt: new Date().toISOString(),
		lastLoginAt: null,
		lastSeenAt: null,
		loginCount: 0,
		blockedSites: [],
		siteMessages: {},
		unblockOverrides: [],
		lang: "",
		schedule: null,
		group: "",
		groupOnboarded: false,
		groupRules: true,
	};
	userIndex.set(name.toLowerCase(), name);
	save();
	return {
		user: {
			username: name,
			role: highestRole(roles),
			roles,
			group: "",
			groupOnboarded: false,
			groupRules: true,
		},
	};
}

export function deleteUser(username) {
	const user = getUser(username);
	if (!user) return { error: "notfound" };
	if (user.role === "creator") return { error: "protected" };
	if (user.role === "admin" && !isEffectivelyBlocked(user) && countActiveAdmins() <= 1) {
		return { error: "last-admin" };
	}
	delete db.users[user.username];
	userIndex.delete(user.username.toLowerCase());
	save();
	deleteAvatar(user.username);
	destroySessionsOf(user.username);
	return { ok: true };
}

export function setPassword(username, password) {
	const user = getUser(username);
	if (!user) return { error: "notfound" };
	if (!validatePassword(password)) return { error: "invalid-password" };
	db.users[user.username].password = hashPassword(password);
	save();
	return { ok: true };
}

export function setRoles(username, input) {
	const user = getUser(username);
	if (!user) return { error: "notfound" };
	if (user.role === "creator") return { error: "protected" };
	const roles = normalizeRoleList(input);
	if (!roles.length || roles.includes("creator")) return { error: "invalid-role" };
	if (roles.includes("admin") && roles.includes("moderator")) return { error: "role-conflict" };
	const highest = highestRole(roles);
	if (
		user.role === "admin" &&
		!isEffectivelyBlocked(user) &&
		highest !== "admin" &&
		countActiveAdmins() <= 1
	) {
		return { error: "last-admin" };
	}
	db.users[user.username].roles = roles;
	db.users[user.username].role = highest;
	save();
	return { ok: true, role: highest, roles };
}

export function setRole(username, role) {
	return setRoles(username, [role]);
}

export function setUserGroup(username, groupId) {
	const name = canonicalUser(username);
	if (!name) return { error: "notfound" };
	db.users[name].group = String(groupId || "").slice(0, 64);
	db.users[name].groupOnboarded = true;
	save();
	return { ok: true, group: db.users[name].group };
}

export function markGroupOnboarded(username) {
	const name = canonicalUser(username);
	if (!name) return { error: "notfound" };
	db.users[name].groupOnboarded = true;
	save();
	return { ok: true };
}

export function setUserGroupRules(username, enabled) {
	const name = canonicalUser(username);
	if (!name) return { error: "notfound" };
	db.users[name].groupRules = !!enabled;
	save();
	return { ok: true, groupRules: db.users[name].groupRules };
}

export function clearGroupAssignments(groupId) {
	const wanted = String(groupId || "");
	if (!wanted) return 0;
	let count = 0;
	for (const user of Object.values(db.users)) {
		if (user.group === wanted) {
			user.group = "";
			count++;
		}
	}
	if (count) save();
	return count;
}

export function setBlocked(username, blocked, message = "") {
	const user = getUser(username);
	if (!user) return { error: "notfound" };
	if (user.role === "creator") return { error: "protected" };
	const value = !!blocked;
	if (value && user.role === "admin" && !isEffectivelyBlocked(user) && countActiveAdmins() <= 1) {
		return { error: "last-admin" };
	}
	db.users[user.username].blocked = value;
	if (value) {
		db.users[user.username].blockedUntil = null;
		db.users[user.username].blockMessage = String(message || "").trim().slice(0, 500);
	} else {
		db.users[user.username].blockMessage = "";
	}
	save();
	if (value) destroySessionsOf(user.username);
	return { ok: true };
}

export function setBlockUntil(username, until, message = "") {
	const user = getUser(username);
	if (!user) return { error: "notfound" };
	if (user.role === "creator") return { error: "protected" };
	if (until) {
		const date = new Date(until);
		if (Number.isNaN(date.getTime())) return { error: "invalid-date" };
		if (date.getTime() <= Date.now()) return { error: "invalid-date" };
		if (user.role === "admin" && !isEffectivelyBlocked(user) && countActiveAdmins() <= 1) {
			return { error: "last-admin" };
		}
		db.users[user.username].blockedUntil = date.toISOString();
		db.users[user.username].blocked = false;
		db.users[user.username].blockMessage = String(message || "").trim().slice(0, 500);
		save();
		destroySessionsOf(user.username);
		return { ok: true, until: date.toISOString() };
	}
	db.users[user.username].blockedUntil = null;
	db.users[user.username].blockMessage = "";
	save();
	return { ok: true };
}

export function setBlockMessage(username, message) {
	const user = getUser(username);
	if (!user) return { error: "notfound" };
	db.users[user.username].blockMessage = String(message || "").trim().slice(0, 500);
	save();
	return { ok: true };
}

export function setNotes(username, notes) {
	const user = getUser(username);
	if (!user) return { error: "notfound" };
	db.users[user.username].notes = String(notes || "").trim().slice(0, 500);
	save();
	return { ok: true };
}

function normalizeHosts(input) {
	const lines = Array.isArray(input)
		? input
		: String(input || "").split(/\r?\n/);
	const hosts = [];
	const messages = {};
	for (let line of lines) {
		line = String(line).trim();
		if (!line || line.startsWith("#")) continue;
		const [hostPart, ...messageParts] = line.split("|");
		const message = messageParts.join("|").trim().slice(0, 300);
		const cleaned = hostPart.trim().replace(/^\*\./, "");
		if (!cleaned) continue;
		const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(cleaned)
			? cleaned
			: `https://${cleaned}`;
		try {
			const host = new URL(candidate).hostname.toLowerCase().replace(/\.$/, "");
			if (/^[a-z0-9.-]+$/.test(host) && host.includes(".")) {
				hosts.push(host);
				if (message) messages[host] = message;
			}
		} catch {}
		if (hosts.length >= 100) break;
	}
	return { hosts: [...new Set(hosts)], messages };
}

export function setUserBlockedSites(username, input) {
	const user = getUser(username);
	if (!user) return { error: "notfound" };
	const parsed = normalizeHosts(input);
	db.users[user.username].blockedSites = parsed.hosts;
	db.users[user.username].siteMessages = parsed.messages;
	save();
	return {
		ok: true,
		blockedSites: db.users[user.username].blockedSites,
		siteMessages: db.users[user.username].siteMessages,
	};
}

export function setUserLanguage(username, lang) {
	const user = getUser(username);
	if (!user) return { error: "notfound" };
	const value = ["es", "en", "ca"].includes(lang) ? lang : "";
	db.users[user.username].lang = value;
	save();
	return { ok: true };
}

export function addUnblockOverride(username, host) {
	const user = getUser(username);
	if (!user) return { error: "notfound" };
	const clean = String(host || "").toLowerCase().replace(/^\*\./, "").replace(/\.$/, "");
	if (!/^[a-z0-9.-]+$/.test(clean) || !clean.includes(".")) return { error: "invalid-host" };
	const list = Array.isArray(db.users[user.username].unblockOverrides)
		? db.users[user.username].unblockOverrides
		: [];
	if (!list.includes(clean)) list.push(clean);
	db.users[user.username].unblockOverrides = list;
	save();
	return { ok: true };
}

export function setUserSchedule(username, schedule) {
	const user = getUser(username);
	if (!user) return { error: "notfound" };
	if (!schedule || schedule.enabled !== true) {
		db.users[user.username].schedule = null;
		save();
		return { ok: true, schedule: null };
	}
	const days = Array.isArray(schedule.days)
		? [...new Set(schedule.days.map((d) => Number(d)).filter((d) => d >= 0 && d <= 6))]
		: [];
	const start = String(schedule.start || "");
	const end = String(schedule.end || "");
	if (!days.length) return { error: "invalid-schedule" };
	if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(end)) {
		return { error: "invalid-schedule" };
	}
	db.users[user.username].schedule = { enabled: true, days, start, end };
	save();
	return { ok: true, schedule: db.users[user.username].schedule };
}

export function isWithinSchedule(user, timezone = "Europe/Madrid") {
	const schedule = user?.schedule;
	if (!schedule?.enabled) return true;
	let parts;
	try {
		parts = new Intl.DateTimeFormat("en-GB", {
			timeZone: timezone,
			weekday: "short",
			hour: "2-digit",
			minute: "2-digit",
			hourCycle: "h23",
		}).formatToParts(new Date());
	} catch {
		parts = new Intl.DateTimeFormat("en-GB", {
			timeZone: "UTC",
			weekday: "short",
			hour: "2-digit",
			minute: "2-digit",
			hourCycle: "h23",
		}).formatToParts(new Date());
	}
	const get = (type) => parts.find((p) => p.type === type)?.value || "";
	const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
	const day = dayMap[get("weekday")];
	const hour = Number(get("hour"));
	const minute = Number(get("minute"));
	if (!schedule.days.includes(day)) return false;
	const toMinutes = (hhmm) => {
		const [h, m] = hhmm.split(":").map(Number);
		return h * 60 + m;
	};
	const now = hour * 60 + minute;
	const start = toMinutes(schedule.start);
	const end = toMinutes(schedule.end);
	if (start === end) return true;
	if (start < end) return now >= start && now < end;
	return now >= start || now < end;
}

export function setMustChangePassword(username, value) {
	const user = getUser(username);
	if (!user) return { error: "notfound" };
	db.users[user.username].mustChangePassword = !!value;
	save();
	return { ok: true };
}

export async function verifyLogin(username, password) {
	const user = getUser(username);
	if (!user) {
		await checkPassword(password, DUMMY_HASH);
		return null;
	}
	if (!(await checkPassword(password, user.password))) return null;
	return {
		username: user.username,
		role: user.role,
		roles: user.roles,
		blocked: isEffectivelyBlocked(user),
		blockedUntil: user.blockedUntil || null,
		blockMessage: user.blockMessage || "",
		mustChangePassword: !!user.mustChangePassword,
	};
}

export async function verifyUserPassword(username, password) {
	const user = getUser(username);
	return !!user && (await checkPassword(password, user.password));
}

export function recordLoginSuccess(username, ip = "") {
	const user = getUser(username);
	if (!user) return;
	const now = new Date().toISOString();
	db.users[user.username].lastLoginAt = now;
	db.users[user.username].lastSeenAt = now;
	db.users[user.username].loginCount = (db.users[user.username].loginCount || 0) + 1;
	if (ip) db.users[user.username].lastLoginIp = String(ip).slice(0, 64);
	save();
}

export function touchUserSeen(username) {
	const user = getUser(username);
	if (!user) return;
	const now = Date.now();
	const last = lastSeenWrite.get(user.username) || 0;
	if (now - last < 60_000) return;
	lastSeenWrite.set(user.username, now);
	db.users[user.username].lastSeenAt = new Date(now).toISOString();
	scheduleUsersSave();
}

/* -------------------------------- sesiones -------------------------------- */

let sessionsDirty = false;
let sessionsTimer = null;
let sessionsWriting = false;

function sessionsPayload() {
	const entries = [...sessions.entries()].map(([tokenHash, session]) => ({
		tokenHash,
		...session,
	}));
	return JSON.stringify({ sessions: entries });
}

function saveSessionsNow() {
	if (!sessionsDirty || sessionsWriting) return;
	sessionsWriting = true;
	sessionsDirty = false;
	const tmp = `${SESSIONS_FILE}.tmp`;
	let payload;
	try {
		payload = sessionsPayload();
	} catch (err) {
		sessionsWriting = false;
		sessionsDirty = true;
		console.error("No se pudo serializar sessions.json:", err.message);
		return;
	}
	fs.promises
		.mkdir(DATA_DIR, { recursive: true, mode: 0o700 })
		.then(() => fs.promises.writeFile(tmp, payload, { mode: 0o600 }))
		.then(() => fs.promises.rename(tmp, SESSIONS_FILE))
		.catch((err) => {
			sessionsDirty = true;
			console.error("No se pudo guardar sessions.json:", err.message);
		})
		.finally(() => {
			sessionsWriting = false;
			if (sessionsDirty) scheduleSessionsSave();
		});
}

function scheduleSessionsSave() {
	sessionsDirty = true;
	if (sessionsTimer || sessionsWriting) return;
	sessionsTimer = setTimeout(() => {
		sessionsTimer = null;
		saveSessionsNow();
	}, 3000);
	sessionsTimer.unref?.();
}

function loadSessions() {
	fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
	if (!fs.existsSync(SESSIONS_FILE)) return;
	try {
		const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf8"));
		const now = Date.now();
		for (const entry of data.sessions || []) {
			if (!entry.tokenHash || !entry.username || !entry.expires) continue;
			if (entry.expires <= now) continue;
			const user = getUser(entry.username);
			if (!user || isEffectivelyBlocked(user)) continue;
			const session = {
				id: entry.id || crypto.randomBytes(6).toString("hex"),
				username: entry.username,
				createdAt: entry.createdAt || new Date(now).toISOString(),
				lastSeenAt: entry.lastSeenAt || new Date(now).toISOString(),
				lastActiveAt: entry.lastActiveAt || entry.lastSeenAt || new Date(now).toISOString(),
				expires: entry.expires,
				absoluteExpires:
					entry.absoluteExpires && entry.absoluteExpires > entry.expires
						? entry.absoluteExpires
						: Math.max(entry.expires, now + ABSOLUTE_SESSION_MS),
				ip: entry.ip || "",
				userAgent: entry.userAgent || "",
			};
			sessions.set(entry.tokenHash, session);
			indexSession(entry.tokenHash, session);
		}
		sessionsDirty = true;
		saveSessionsNow();
	} catch (err) {
		console.error("No se pudo cargar sessions.json:", err.message);
	}
}

loadSessions();

export function createSession(username, { ip = "", userAgent = "" } = {}) {
	const settings = getSettings();
	const user = getUser(username);
	const isAdmin = ["admin", "creator"].includes(user?.role);
	const max = isAdmin ? Number.POSITIVE_INFINITY : settings.maxSessionsPerUser;
	const existing = [...sessionKeysFor(username)]
		.map((key) => [key, sessions.get(key)])
		.filter(([, session]) => session && session.expires > Date.now())
		.sort((a, b) => new Date(a[1].createdAt) - new Date(b[1].createdAt));
	const revoked = [];
	while (existing.length >= max) {
		const [oldHash, oldSession] = existing.shift();
		sessions.delete(oldHash);
		unindexSession(oldHash, oldSession);
		revoked.push(oldSession.id);
	}

	const token = crypto.randomBytes(32).toString("hex");
	const now = Date.now();
	const id = crypto.randomBytes(6).toString("hex");
	const ttl = settings.sessionHours * 60 * 60 * 1000;
	const expires = Math.min(now + ttl, now + ABSOLUTE_SESSION_MS);
	const session = {
		id,
		username: user ? user.username : username,
		createdAt: new Date(now).toISOString(),
		lastSeenAt: new Date(now).toISOString(),
		lastActiveAt: new Date(now).toISOString(),
		expires,
		absoluteExpires: now + ABSOLUTE_SESSION_MS,
		ip: String(ip || "").slice(0, 64),
		userAgent: String(userAgent || "").slice(0, 200),
	};
	const tokenHash = hashToken(token);
	sessions.set(tokenHash, session);
	indexSession(tokenHash, session);
	scheduleSessionsSave();
	lastSeenWrite.set(user ? user.username : username, now);
	return { token, id, expires, revoked };
}

export function destroySession(token) {
	const key = hashToken(token);
	const session = sessions.get(key);
	if (session) {
		sessions.delete(key);
		unindexSession(key, session);
		scheduleSessionsSave();
	}
	return session || null;
}

export function destroySessionsOf(username) {
	const wanted = String(username).toLowerCase();
	const removed = [];
	for (const [key, s] of sessions) {
		if (s.username.toLowerCase() === wanted) {
			sessions.delete(key);
			unindexSession(key, s);
			removed.push(s.id);
		}
	}
	if (removed.length) scheduleSessionsSave();
	return removed;
}

export function destroyOtherSessions(username, keepToken) {
	const wanted = String(username).toLowerCase();
	const keepHash = hashToken(keepToken);
	const removed = [];
	for (const [key, s] of sessions) {
		if (s.username.toLowerCase() === wanted && key !== keepHash) {
			sessions.delete(key);
			unindexSession(key, s);
			removed.push(s.id);
		}
	}
	if (removed.length) scheduleSessionsSave();
	return removed;
}

export function sessionsForUser(username) {
	const now = Date.now();
	return [...sessionKeysFor(username)]
		.map((key) => sessions.get(key))
		.filter((session) => session && session.expires > now)
		.sort((a, b) => new Date(b.lastSeenAt) - new Date(a.lastSeenAt))
		.map((session) => ({ ...session }));
}

export function listSessions() {
	const now = Date.now();
	return [...sessions.values()]
		.filter((s) => s.expires > now)
		.sort((a, b) => new Date(b.lastSeenAt) - new Date(a.lastSeenAt))
		.map((s) => {
			const user = getUser(s.username);
			return {
				id: s.id,
				username: s.username,
				role: user ? user.role : "user",
				createdAt: s.createdAt,
				lastSeenAt: s.lastSeenAt,
				lastActiveAt: s.lastActiveAt || s.lastSeenAt,
				expires: s.expires,
				ip: s.ip,
				userAgent: s.userAgent,
			};
		});
}

export function sessionCount() {
	const now = Date.now();
	let count = 0;
	for (const session of sessions.values()) if (session.expires > now) count++;
	return count;
}

export function revokeSessionById(id) {
	for (const [key, s] of sessions) {
		if (s.id === id) {
			sessions.delete(key);
			unindexSession(key, s);
			scheduleSessionsSave();
			return { ...s };
		}
	}
	return null;
}

export function revokeUserSessions(username, exceptId = "") {
	let count = 0;
	for (const [key, s] of sessions) {
		if (s.username.toLowerCase() !== String(username).toLowerCase()) continue;
		if (exceptId && s.id === exceptId) continue;
		sessions.delete(key);
		unindexSession(key, s);
		count++;
	}
	if (count) scheduleSessionsSave();
	return count;
}

function parseCookies(header) {
	const out = {};
	if (!header) return out;
	for (const part of header.split(";")) {
		const i = part.indexOf("=");
		if (i < 0) continue;
		const key = part.slice(0, i).trim();
		const value = part.slice(i + 1).trim();
		try {
			out[key] = decodeURIComponent(value);
		} catch {
			out[key] = value;
		}
	}
	return out;
}

export function getSession(req) {
	const cookies = parseCookies(req.headers.cookie);
	const token = cookies[SESSION_COOKIE] || cookies[LEGACY_SESSION_COOKIE];
	if (!token) return null;
	const key = hashToken(token);
	const session = sessions.get(key);
	if (!session) return null;
	const now = Date.now();
	if (session.expires <= now) {
		sessions.delete(key);
		unindexSession(key, session);
		scheduleSessionsSave();
		return null;
	}
	const idleMs = Math.max(1, getSettings().sessionIdleHours || 12) * 60 * 60 * 1000;
	if (now - new Date(session.lastSeenAt).getTime() > idleMs) {
		sessions.delete(key);
		unindexSession(key, session);
		scheduleSessionsSave();
		return null;
	}
	const user = getUser(session.username);
	if (!user || isEffectivelyBlocked(user)) {
		sessions.delete(key);
		unindexSession(key, session);
		scheduleSessionsSave();
		return null;
	}

	if (now - new Date(session.lastSeenAt).getTime() > 30_000) {
		session.lastSeenAt = new Date(now).toISOString();
	}
	if (!isHeartbeatRequest(req)) {
		session.lastActiveAt = new Date(now).toISOString();
	}
	const ttl = getSettings().sessionHours * 60 * 60 * 1000;
	const extended = Math.min(now + ttl, session.absoluteExpires || now + ABSOLUTE_SESSION_MS);
	if (extended > session.expires) session.expires = extended;
	const ip = normalizeIp(String(req.ip || req.socket?.remoteAddress || "").slice(0, 64));
	const ua = String(req.headers["user-agent"] || "").slice(0, 200);
	if (ip) session.ip = ip;
	if (ua) session.userAgent = ua;
	scheduleSessionsSave();
	touchUserSeen(user.username);
	return {
		token,
		id: session.id,
		username: user.username,
		role: user.role,
		roles: user.roles,
		icon: avatarInfo(user.username),
		createdAt: session.createdAt,
		lastSeenAt: session.lastSeenAt,
		lastActiveAt: session.lastActiveAt || session.lastSeenAt,
		expires: session.expires,
		mustChangePassword: !!user.mustChangePassword,
		lang: user.lang || "",
	};
}

export function sessionCookie(req, token, expires) {
	const secure = !!req.secure;
	const settings = getSettings();
	const maxAge = Math.max(
		0,
		Math.floor(((expires || Date.now() + settings.sessionHours * 3600_000) - Date.now()) / 1000),
	);
	const name = secure ? SESSION_COOKIE : LEGACY_SESSION_COOKIE;
	return `${name}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

export function clearSessionCookie(req) {
	const secure = !!req.secure;
	const suffix = secure ? "; Secure" : "";
	return [
		`${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${suffix}`,
		`${LEGACY_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${suffix}`,
	];
}

export function flushSessions() {
	if (sessionsTimer) {
		clearTimeout(sessionsTimer);
		sessionsTimer = null;
	}
	sessionsDirty = true;
	try {
		fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
		const tmp = `${SESSIONS_FILE}.flush.tmp`;
		fs.writeFileSync(tmp, sessionsPayload(), { mode: 0o600 });
		fs.renameSync(tmp, SESSIONS_FILE);
		sessionsDirty = false;
	} catch (err) {
		console.error("No se pudo guardar sessions.json:", err.message);
	}
}

/* --------------------- persistencia de intentos de login --------------------- */

let attemptsDirty = false;
let attemptsTimer = null;

function saveAttemptsNow() {
	if (!attemptsDirty) return;
	try {
		fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
		const tmp = `${ATTEMPTS_FILE}.tmp`;
		fs.writeFileSync(
			tmp,
			JSON.stringify(
				{
					accounts: [...loginAttempts.entries()],
					ips: [...ipAttempts.entries()],
					accountIps: [...accountIpAttempts.entries()],
				},
				null,
				2,
			),
			{ mode: 0o600 },
		);
		fs.renameSync(tmp, ATTEMPTS_FILE);
		attemptsDirty = false;
	} catch (error) {
		console.error("No se pudo guardar login-attempts.json:", error.message);
	}
}

function scheduleAttemptsSave() {
	attemptsDirty = true;
	if (attemptsTimer) return;
	attemptsTimer = setTimeout(() => {
		attemptsTimer = null;
		saveAttemptsNow();
	}, 500);
	attemptsTimer.unref?.();
}

function loadAttempts() {
	try {
		if (!fs.existsSync(ATTEMPTS_FILE)) return;
		const data = JSON.parse(fs.readFileSync(ATTEMPTS_FILE, "utf8"));
		const now = Date.now();
		const restore = (target, entries) => {
			for (const [key, value] of Array.isArray(entries) ? entries : []) {
				if (!key || !value || !Number.isFinite(Number(value.resetAt))) continue;
				if (Number(value.resetAt) <= now) continue;
				target.set(String(key), {
					count: Math.max(1, Number(value.count) || 1),
					resetAt: Number(value.resetAt),
				});
			}
		};
		restore(loginAttempts, data.accounts);
		restore(ipAttempts, data.ips);
		restore(accountIpAttempts, data.accountIps);
	} catch (error) {
		console.error("No se pudo cargar login-attempts.json:", error.message);
	}
}

export function flushAttempts() {
	saveAttemptsNow();
}

loadAttempts();

/* ------------------------------ rate limiting ------------------------------ */

export function isRateLimited(username) {
	const settings = getSettings();
	const key = String(username || "").toLowerCase();
	const entry = loginAttempts.get(key);
	if (!entry) return false;
	if (entry.resetAt < Date.now()) {
		loginAttempts.delete(key);
		scheduleAttemptsSave();
		return false;
	}
	return entry.count >= settings.maxLoginAttempts;
}

export function recordFailedLogin(username) {
	const settings = getSettings();
	const key = String(username || "").toLowerCase();
	const entry = loginAttempts.get(key);
	const windowMs = settings.lockoutMinutes * 60_000;
	if (!entry || entry.resetAt < Date.now()) {
		loginAttempts.set(key, { count: 1, resetAt: Date.now() + windowMs });
	} else {
		entry.count += 1;
	}
	scheduleAttemptsSave();
}

export function isIpRateLimited(ip) {
	if (!ip) return false;
	const settings = getSettings();
	const entry = ipAttempts.get(ip);
	if (!entry) return false;
	if (entry.resetAt < Date.now()) {
		ipAttempts.delete(ip);
		scheduleAttemptsSave();
		return false;
	}
	return entry.count >= Math.max(5, Number(settings.loginAttemptsPerMinute) || 60);
}

export function isAccountIpRateLimited(ip, username) {
	const key = `${String(ip || "")}:${String(username || "").toLowerCase().slice(0, 64)}`;
	const entry = accountIpAttempts.get(key);
	if (!entry) return false;
	if (entry.resetAt < Date.now()) {
		accountIpAttempts.delete(key);
		scheduleAttemptsSave();
		return false;
	}
	return entry.count >= ACCOUNT_IP_LIMIT;
}

export function recordAccountIpFailure(ip, username) {
	const key = `${String(ip || "")}:${String(username || "").toLowerCase().slice(0, 64)}`;
	const entry = accountIpAttempts.get(key);
	if (!entry || entry.resetAt < Date.now()) {
		accountIpAttempts.set(key, {
			count: 1,
			resetAt: Date.now() + ACCOUNT_IP_WINDOW_MS,
		});
	} else {
		entry.count += 1;
	}
	scheduleAttemptsSave();
}

export function recordIpFailure(ip) {
	if (!ip) return;
	const settings = getSettings();
	const entry = ipAttempts.get(ip);
	const windowMs = 60_000;
	if (!entry || entry.resetAt < Date.now()) {
		ipAttempts.set(ip, { count: 1, resetAt: Date.now() + windowMs });
	} else {
		entry.count += 1;
	}
	scheduleAttemptsSave();
}

export function clearIpFailures(ip) {
	if (ip) {
		ipAttempts.delete(ip);
		scheduleAttemptsSave();
	}
}

export function clearAccountIpFailures(ip, username) {
	if (!ip) return;
	const key = `${String(ip || "")}:${String(username || "").toLowerCase().slice(0, 64)}`;
	accountIpAttempts.delete(key);
	scheduleAttemptsSave();
}

export function clearFailedLogins(username) {
	loginAttempts.delete(String(username || "").toLowerCase());
	scheduleAttemptsSave();
}

setInterval(() => {
	const now = Date.now();
	let changed = false;
	for (const [key, s] of sessions) {
		if (s.expires <= now) {
			sessions.delete(key);
			unindexSession(key, s);
			changed = true;
		}
	}
	let attemptsChanged = false;
	for (const [key, e] of loginAttempts) if (e.resetAt < now) { loginAttempts.delete(key); attemptsChanged = true; }
	for (const [key, e] of ipAttempts) if (e.resetAt < now) { ipAttempts.delete(key); attemptsChanged = true; }
	for (const [key, e] of accountIpAttempts) if (e.resetAt < now) { accountIpAttempts.delete(key); attemptsChanged = true; }
	if (attemptsChanged) scheduleAttemptsSave();
	if (changed) scheduleSessionsSave();
}, 10 * 60 * 1000).unref();
