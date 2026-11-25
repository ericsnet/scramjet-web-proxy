import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import express from "express";
import { server as wisp } from "@mercuryworkshop/wisp-js/server";

import {
	clearSessionCookie,
	sessionCookie,
	createSession,
	destroySession,
	destroySessionsOf,
	destroyOtherSessions,
	getSession,
	verifyLogin,
	verifyUserPassword,
	recordFailedLogin,
	clearFailedLogins,
	validatePassword,
	listUsers,
	getUser,
	createUser,
	deleteUser,
	setPassword,
	setRole,
	setBlocked,
	setBlockUntil,
	setBlockMessage,
	setNotes,
	setMustChangePassword,
	setUserBlockedSites,
	setUserSchedule,
	isWithinSchedule,
	setUserLanguage,
	addUnblockOverride,
	recordLoginSuccess,
	listSessions,
	sessionsForUser,
	sessionCount,
	revokeSessionById,
	revokeUserSessions,
	isIpRateLimited,
	isAccountIpRateLimited,
	isRateLimited,
	recordIpFailure,
	recordAccountIpFailure,
	flushSessions,
	flushAttempts,
} from "./auth.js";
import {
	loginPage,
	accountPage,
	errorPage,
	adminPage,
	activityPage,
	sessionsPage,
	securityPage,
	securityAlertPage,
	trafficPage,
	monitorPage,
	settingsPage,
	auditPage,
	systemPage,
	maintenancePage,
	blockedPage,
	quarantinePage,
	requestsPage,
	statsPage,
	bookmarksPage,
	historyPage,
	chatPage,
} from "./pages.js";
import {
	recordActivity,
	getActivity,
	countActivity,
	activityCounts,
	clearActivity,
	clearActivityExcept,
	trimActivity,
	exportActivity,
	flushActivity,
} from "./activity.js";
import {
	addAudit,
	listAudit,
	clearAudit,
	auditToCsv,
	auditActions,
	auditCount,
	exportAudit,
	clearQuarantineAttempts,
	flushAudit,
} from "./audit.js";
import { getSettings, saveSettings, resetSettings } from "./settings.js";
import {
	listBookmarks,
	addBookmark,
	updateBookmark,
	deleteBookmark,
	deleteUserBookmarks,
	exportBookmarks,
} from "./bookmarks.js";
import {
	createBackup,
	listBackups,
	backupPath,
	restoreBackup,
	pruneBackups,
	backupCount,
} from "./backup.js";
import { count as metric, metricsSnapshot } from "./metrics.js";
import { avatarFile, deleteAvatar, saveAvatar } from "./avatars.js";
import { normalizeIp } from "./ip.js";
import { activatePanic, panicUntil, flushPanic, CLASSROOM_URL } from "./panic.js";
import { handleHtcpcp } from "./htcpcp.js";
import {
	areFriends,
	acceptFriendRequest,
	cancelFriendRequest,
	getFriendState,
	rejectFriendRequest,
	removeFriend,
	sendFriendRequest,
	flushFriends,
} from "./friends.js";
import { isPrivateDestination } from "./net-guard.js";
import { recordHttp, trafficSnapshot, wispOpen, wispClose, wispBytes } from "./traffic.js";
import { isAdminRole, isStaffRole, canManageRole, canAssignRole } from "./roles.js";
import {
	securityMiddleware,
	securitySummary,
	listSecurityAlerts,
	listBans,
	banTarget,
	unbanTarget,
	isUserBanned,
	dismissAlert,
	recordSuccessfulLogin,
	flushSecurity,
} from "./security.js";
import {
	refreshCategories,
	categoryBlocked,
	categoryStats,
	initCategories,
} from "./categories.js";
import {
	createRequest,
	listRequests,
	countPendingRequests,
	resolveRequest,
	exportRequests,
} from "./requests.js";
import {
	postChatMessage,
	postChatPoll,
	votePoll,
	toggleReaction,
	listChat,
	listChatChannels,
	createGroupChannel,
	getOrCreateDmChannel,
	saveChatUpload,
	getChatAttachment,
	getChatAttachmentMessage,
	isChannelMember,
	getChatMessage,
	getChatUnread,
	markChatRead,
	deleteChatMessage,
	deleteChatMessagesByUser,
	clearChat,
	flushChat,
} from "./chat.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function creatorNameSet() {
	const set = new Set();
	for (const entry of listUsers()) {
		if (entry.role === "creator") set.add(String(entry.username).toLowerCase());
	}
	return set;
}

const ALLOWED_HOSTS = new Set(
	String(
		process.env.ALLOWED_HOSTS || "raspi-eric.tail41ccf3.ts.net",
	)
		.split(",")
		.map((value) => value.trim().toLowerCase())
		.filter(Boolean),
);

function hostName(req) {
	const raw = String(req.headers.host || "").trim().toLowerCase();
	if (raw.startsWith("[")) {
		const end = raw.indexOf("]");
		return end > 0 ? raw.slice(0, end + 1) : raw;
	}
	return raw.split(":")[0];
}

function hideCreatorData(req, items, getUsername) {
	if (req.user?.role === "creator") return items;
	const creators = creatorNameSet();
	return items.filter(
		(item) => !creators.has(String(getUsername(item) || "").toLowerCase()),
	);
}
const VERSION = (() => {
	try {
		return JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8")).version;
	} catch {
		return "?";
	}
})();
const nm = (pkg, sub) => path.join(__dirname, "node_modules/@mercuryworkshop", pkg, sub);
const execFileAsync = promisify(execFile);

const app = express();
app.set("trust proxy", "loopback");
app.disable("x-powered-by");
app.use(express.urlencoded({ extended: false, limit: "64kb" }));
app.use(express.json({ limit: "64kb" }));
app.use((req, res, next) => {
	const host = hostName(req);
	if (req.path === "/healthz" && ["localhost", "127.0.0.1", "[::1]"].includes(host)) {
		return next();
	}
	if (!ALLOWED_HOSTS.has(host)) {
		return sendHttpError(req, res, 421, "Destino no válido", "El dominio usado para acceder no está permitido.");
	}
	next();
});
app.use(securityMiddleware);
app.use((req, res, next) => {
	const until = panicUntil(req._deviceId);
	if (!until) return next();
	res.set("Cache-Control", "no-store");
	if (req.path === "/api/panic" || req.path === "/healthz") return next();
	if (req.path.startsWith("/api/")) {
		return res.status(403).json({
			error: "panic",
			message: "Modo pánico activo. Vuelve en unos minutos.",
		});
	}
	return res.redirect(302, CLASSROOM_URL);
});
app.use((req, res, next) => {
	const startedAt = Date.now();
	res.once("finish", () => recordHttp(req, res, startedAt));
	next();
});
app.use((req, res, next) => {
	metric("requests_total");
	next();
});

/* ------------------------------- utilidades ------------------------------- */

function escapeRegExp(value) {
	return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function instrumentWispTraffic() {
	if (!wisp.ServerConnection?.prototype || !wisp.ServerStream?.prototype) return;
	const connection = wisp.ServerConnection.prototype;
	const stream = wisp.ServerStream.prototype;
	if (connection.__trafficPatched) return;
	connection.__trafficPatched = true;
	const createStream = connection.create_stream;
	connection.create_stream = function (streamId, type, hostname, port) {
		const result = createStream.apply(this, arguments);
		try {
			wispOpen(this, streamId, type, hostname, port);
		} catch {}
		return result;
	};
	const closeStream = connection.close_stream;
	connection.close_stream = function (streamId) {
		const result = closeStream.apply(this, arguments);
		try {
			wispClose(this, streamId);
		} catch {}
		return result;
	};
	const putData = stream.put_data;
	stream.put_data = function (data) {
		try {
			wispBytes(this.conn, this.stream_id, "in", data?.length || data?.byteLength || 0);
		} catch {}
		return putData.apply(this, arguments);
	};
	const tcpToWs = stream.tcp_to_ws;
	stream.tcp_to_ws = function () {
		const socket = this.socket;
		if (socket && !socket.__trafficRecv) {
			socket.__trafficRecv = true;
			const recv = socket.recv.bind(socket);
			socket.recv = async () => {
				const data = await recv();
				try {
					wispBytes(this.conn, this.stream_id, "out", data?.length || data?.byteLength || 0);
				} catch {}
				return data;
			};
		}
		return tcpToWs.apply(this, arguments);
	};
}

function applyWispBlocklist() {
	if (!wisp.options) return;
	// El bloqueo se decide por conexión para respetar listas por usuario,
	// categorías y excepciones aprobadas.
	wisp.options.hostname_whitelist = null;
	wisp.options.hostname_blacklist = null;
}

applyWispBlocklist();
instrumentWispTraffic();
initCategories().then(() => {
	if ((getSettings().categories || []).length) {
		return refreshCategories(false);
	}
}).catch((err) => console.error("Categorías:", err.message));

function isLoopbackAddress(value) {
	const address = String(value || "");
	return (
		address === "::1" ||
		address === "127.0.0.1" ||
		address.startsWith("127.") ||
		address === "::ffff:127.0.0.1"
	);
}

function clientIp(req) {
	const remote = String(req.socket?.remoteAddress || "");
	if (req.ip) return normalizeIp(req.ip.slice(0, 64));
	if (isLoopbackAddress(remote)) {
		const forwarded = String(req.headers["x-forwarded-for"] || "")
			.split(",")[0]
			.trim();
		if (forwarded) return normalizeIp(forwarded.slice(0, 64));
	}
	return normalizeIp(remote.slice(0, 64));
}

function clientUa(req) {
	return String(req.headers["user-agent"] || "").slice(0, 200);
}

function audit(req, action, target = "", detail = "") {
	addAudit({
		actor: req.user?.username || "sistema",
		action,
		target,
		detail,
		ip: clientIp(req),
		userAgent: clientUa(req),
	});
}

const quarantineAttempts = new Map(); // clave -> timestamp (anti-flood)
let quarantineWindow = 0;
let quarantineCount = 0;
const QUARANTINE_VIEW_FILE = path.join(__dirname, "data/quarantine-view.json");
const QUARANTINE_VIEW_MS = 10 * 60 * 1000;

function readQuarantineView() {
	try {
		return JSON.parse(fs.readFileSync(QUARANTINE_VIEW_FILE, "utf8"));
	} catch {
		return null;
	}
}

function writeQuarantineView(value) {
	try {
		if (!value) {
			fs.rmSync(QUARANTINE_VIEW_FILE, { force: true });
			return;
		}
		fs.writeFileSync(QUARANTINE_VIEW_FILE, JSON.stringify(value), { mode: 0o600 });
	} catch {}
}

function hasQuarantineAttempts() {
	return listAudit({ action: "quarantine.attempt", limit: 1 }).length > 0;
}

function purgeQuarantineIfDue() {
	const marker = readQuarantineView();
	if (!marker) return;
	if (Date.now() - Number(marker.firstViewedAt || 0) < QUARANTINE_VIEW_MS) return;
	clearQuarantineAttempts();
	writeQuarantineView(null);
}

function touchQuarantineView() {
	purgeQuarantineIfDue();
	if (!hasQuarantineAttempts()) {
		writeQuarantineView(null);
		return;
	}
	let marker = readQuarantineView();
	if (!marker) {
		marker = { firstViewedAt: Date.now() };
		writeQuarantineView(marker);
	}
	const remaining = QUARANTINE_VIEW_MS - (Date.now() - marker.firstViewedAt);
	if (remaining > 0 && remaining < 2_147_483_647) {
		const timer = setTimeout(() => {
			purgeQuarantineIfDue();
		}, remaining + 250);
		timer.unref?.();
	}
}

setInterval(purgeQuarantineIfDue, 30_000).unref();

function requestTarget(req) {
	try {
		const match = String(req.path || "").match(/\/~\/sj\/[^/]+\/[^/]+\/(.+)$/);
		if (match) {
			return decodeURIComponent(match[1]).slice(0, 2048);
		}
	} catch {}
	return String(req.originalUrl || req.path || "").slice(0, 2048);
}

function recordQuarantineAttempt(req, session, target, detail = "") {
	const actor = session?.username || "desconocido";
	const cleanTarget = String(target || "desconocido").slice(0, 2048);
	const key = `${actor}|${cleanTarget}`;
	const now = Date.now();
	metric("quarantine_rejected_total");
	if (now - quarantineWindow > 60_000) {
		quarantineWindow = now;
		quarantineCount = 0;
	}
	if (quarantineCount >= 200) return;
	const last = quarantineAttempts.get(key) || 0;
	if (now - last < 5000) return;
	quarantineCount++;
	quarantineAttempts.set(key, now);
	if (quarantineAttempts.size > 5000) quarantineAttempts.clear();
	addAudit({
		actor,
		action: "quarantine.attempt",
		target: cleanTarget,
		detail,
		ip: clientIp(req),
		userAgent: clientUa(req),
	});
}

function normalizeUsername(value) {
	return String(value || "")
		.normalize("NFKC")
		.trim()
		.replace(/\s+/g, " ");
}

function safeNext(next) {
	if (typeof next !== "string") return "/";
	if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/";
	if (/[\u0000-\u001f\u007f]/.test(next)) return "/";
	try {
		const parsed = new URL(next, "http://local.invalid");
		if (parsed.origin !== "http://local.invalid") return "/";
		return `${parsed.pathname}${parsed.search}${parsed.hash}`;
	} catch {
		return "/";
	}
}

function wantsJsonRequest(req) {
	return (
		req.path.startsWith("/api/") ||
		req.is("application/json") ||
		String(req.get("accept") || "").includes("application/json")
	);
}

function sendHttpError(req, res, status, title = "", message = "") {
	if (res.headersSent) return;
	if (wantsJsonRequest(req)) {
		return res.status(status).json({
			error: title || `http_${status}`,
			message: message || "No se pudo completar la petición.",
		});
	}
	return res
		.status(status)
		.type("html")
		.send(errorPage({ status, title, message, user: req.user || null }));
}

function requireAuth(req, res, next) {
	const session = getSession(req);
	if (!session) {
		if (req.path.startsWith("/api/")) {
			return res.status(401).json({ error: "unauthorized" });
		}
		const nextUrl = encodeURIComponent(req.originalUrl || "/");
		return res.redirect(303, `/login?next=${nextUrl}`);
	}

	if (isUserBanned(session.username)) {
		destroySession(session.token);
		const token = createBlockFlash(
			"Tu cuenta está bloqueada por seguridad. Contacta con un administrador.",
		);
		if (req.path.startsWith("/api/")) {
			return res.status(403).json({ error: "user_banned" });
		}
		return res.redirect(303, `/blocked?t=${token}`);
	}

	const settings = getSettings();
	if (settings.quarantineMode && !isAdminRole(session.role)) {
		if (req.path === "/api/navigate-check") {
			req.user = session;
			return next();
		}
		recordQuarantineAttempt(
			req,
			session,
			requestTarget(req),
			`${req.method} ${req.originalUrl || req.path}`,
		);
		if (req.path.startsWith("/api/")) {
			return res.status(503).json({ error: "quarantine" });
		}
		return res.redirect(303, "/quarantine");
	}
	if (settings.maintenanceMode && !isAdminRole(session.role)) {
		if (req.path.startsWith("/api/")) {
			return res.status(503).json({ error: "maintenance" });
		}
		return res.redirect(303, "/maintenance");
	}

	if (
		!isAdminRole(session.role) &&
		!isWithinSchedule(getUser(session.username), settings.timezone)
	) {
		if (req.path.startsWith("/api/")) {
			return res.status(403).json({ error: "outside_hours" });
		}
		return res.redirect(303, "/denied?reason=schedule");
	}

	if (session.mustChangePassword) {
		const allowed = ["/account", "/api/account/password", "/api/me", "/logout"];
		if (!allowed.includes(req.path)) {
			if (req.path.startsWith("/api/")) {
				return res.status(403).json({ error: "password_change_required" });
			}
			return res.redirect(303, "/account?force=1");
		}
	}

	req.user = session;
	const isAsset =
		req.path.startsWith("/scramjet") ||
		req.path.startsWith("/controller") ||
		req.path.startsWith("/libcurl") ||
		req.path === "/scramjet-utils.js" ||
		req.path === "/sw.js" ||
		req.path.startsWith("/favicon");
	if (req.method === "GET" && !req.path.startsWith("/api/") && !isAsset) {
		res.setHeader("Set-Cookie", sessionCookie(req, session.token, session.expires));
	}
	next();
}

function requireAdmin(req, res, next) {
	if (!req.user || !isAdminRole(req.user.role)) {
		return sendHttpError(req, res, 403, "Acceso restringido", "Solo administradores.");
	}
	next();
}

function requireStaff(req, res, next) {
	if (!req.user || !isStaffRole(req.user.role)) {
		return sendHttpError(req, res, 403, "Acceso restringido", "Solo administradores o moderadores.");
	}
	next();
}

const CHAT_ERRORS = {
	disabled: "El chat está desactivado.",
	empty: "Escribe un mensaje.",
	too_long: "El mensaje es demasiado largo.",
	slow: "Espera unos segundos antes de enviar otro mensaje.",
	rate: "Has enviado demasiados mensajes. Espera un minuto.",
	forbidden: "No puedes borrar ese mensaje.",
	channel: "No tienes acceso a ese canal.",
	channel_required: "Indica el canal del mensaje.",
	notfound: "Ese mensaje ya no existe.",
};

const FRIEND_ERRORS = {
	"invalid-user": "Usuario no válido.",
	"already-friends": "Ya sois amigos.",
	pending: "Ya hay una solicitud pendiente.",
	limit: "Tienes demasiadas solicitudes pendientes.",
	notfound: "La solicitud o amistad ya no existe.",
	"not-friends": "Solo puedes hacer esto con amigos.",
};

function isChatModerator(user) {
	return !!user && isStaffRole(user.role);
}

function chatOnlineCount() {
	const cutoff = Date.now() - 5 * 60 * 1000;
	const users = new Set();
	for (const session of listSessions()) {
		const seen = new Date(session.lastSeenAt).getTime();
		if (Number.isFinite(seen) && seen >= cutoff) {
			users.add(String(session.username).toLowerCase());
		}
	}
	return users.size;
}

function chatUserMeta() {
	const map = new Map();
	for (const entry of listUsers()) {
		map.set(String(entry.username).toLowerCase(), {
			role: entry.role,
			icon: entry.icon,
		});
	}
	return map;
}

function enrichChatMessage(message, user, meta) {
	const own =
		String(message.username).toLowerCase() ===
		String(user?.username || "").toLowerCase();
	const entry = meta.get(String(message.username).toLowerCase()) || {};
	return {
		...message,
		role: entry.role || "user",
		icon: entry.icon || null,
		canDelete:
			isChatModerator(user) || (!!getSettings().chatAllowUserDelete && own),
	};
}

function wantsChatJson(req) {
	return (
		req.is("application/json") ||
		String(req.get("accept") || "").includes("application/json")
	);
}

// Protección CSRF: exige Origin válido en peticiones que cambian estado.
function sameOrigin(req, res, next) {
	const site = req.headers["sec-fetch-site"];
	if (site && site !== "same-origin" && site !== "none") {
		return sendHttpError(req, res, 403, "Origen no válido", "La petición no proviene del origen correcto.");
	}
	const origin = req.headers.origin;
	if (!origin || origin === "null") {
		const referer = req.headers.referer;
		if (referer) {
			try {
				const parsed = new URL(referer);
				const local =
					parsed.protocol === "http:" &&
					["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
				if ((parsed.protocol === "https:" || local) && parsed.host === req.headers.host) {
					return next();
				}
			} catch {}
		}
		return sendHttpError(req, res, 403, "Origen requerido", "Falta la cabecera de origen de la petición.");
	}
	try {
		const parsed = new URL(origin);
		const local =
			parsed.protocol === "http:" &&
			["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
		if (parsed.protocol !== "https:" && !local) {
			return sendHttpError(req, res, 403, "Origen no válido", "La petición no proviene del origen correcto.");
		}
		if (parsed.host !== req.headers.host) {
			return sendHttpError(req, res, 403, "Origen no válido", "La petición no proviene del origen correcto.");
		}
	} catch {
		return sendHttpError(req, res, 403, "Origen no válido", "La petición no proviene del origen correcto.");
	}
	next();
}

// Para descargas GET: bloquea navegación cruzada si el navegador lo indica.
function sameSiteRequest(req, res, next) {
	const site = req.headers["sec-fetch-site"];
	if (site && site !== "same-origin" && site !== "none") {
		return sendHttpError(req, res, 403, "Origen no válido", "La petición no proviene del origen correcto.");
	}
	const referer = req.headers.referer;
	if (referer) {
		try {
			if (new URL(referer).host !== req.headers.host) {
				return sendHttpError(req, res, 403, "Origen no válido", "La petición no proviene del origen correcto.");
			}
		} catch {
			return sendHttpError(req, res, 403, "Origen no válido", "La petición no proviene del origen correcto.");
		}
	}
	next();
}

const blockFlashes = new Map(); // token -> { message, expires }

function createBlockFlash(message) {
	const token = crypto.randomBytes(18).toString("hex");
	blockFlashes.set(token, {
		message: String(message || "").slice(0, 500),
		expires: Date.now() + 10 * 60 * 1000,
	});
	return token;
}

/* ------------------------- conexiones Wisp activas ------------------------- */

const wispConnections = new Map(); // sessionId -> Set<{ username, socket }>

function trackWisp(sessionId, username, socket) {
	let set = wispConnections.get(sessionId);
	if (!set) {
		set = new Set();
		wispConnections.set(sessionId, set);
	}
	const entry = { username, socket };
	set.add(entry);
	socket.on("close", () => {
		set.delete(entry);
		if (!set.size) wispConnections.delete(sessionId);
	});
}

function closeSessionConnections(sessionId) {
	const set = wispConnections.get(sessionId);
	if (!set) return;
	for (const { socket } of set) {
		try {
			socket.destroy();
		} catch {}
	}
	wispConnections.delete(sessionId);
}

function closeUserConnections(username, exceptSessionId = "") {
	const wanted = String(username).toLowerCase();
	for (const [id, set] of wispConnections) {
		if (exceptSessionId && id === exceptSessionId) continue;
		let hasUser = false;
		for (const entry of set) {
			if (entry.username.toLowerCase() === wanted) hasUser = true;
		}
		if (!hasUser) continue;
		for (const { socket } of set) {
			try {
				socket.destroy();
			} catch {}
		}
		wispConnections.delete(id);
	}
}

function closeNonAdminConnections() {
	for (const [id, set] of wispConnections) {
		let keep = true;
		for (const entry of set) {
			const user = getUser(entry.username);
			if (!user || !isAdminRole(user.role) || user.effectivelyBlocked) keep = false;
		}
		if (keep) continue;
		for (const { socket } of set) {
			try {
				socket.destroy();
			} catch {}
		}
		wispConnections.delete(id);
	}
}
function matchSite(host, list) {
	const clean = String(host || "").toLowerCase().replace(/\.$/, "");
	for (const item of list || []) {
		const value = String(item || "").toLowerCase().replace(/\.$/, "");
		if (!value) continue;
		if (clean === value || clean.endsWith(`.${value}`)) return value;
	}
	return null;
}

function checkHostPolicy(user, hostname) {
	if (!user || isAdminRole(user.role)) return { blocked: false };
	const settings = getSettings();
	const host = String(hostname || "").toLowerCase().replace(/\.$/, "");
	if (!host) return { blocked: false };

	if (matchSite(host, user.unblockOverrides)) return { blocked: false };

	if (settings.accessMode === "allowlist") {
		const allowed = settings.allowedSites || [];
		if (!allowed.length || !matchSite(host, allowed)) {
			return {
				blocked: true,
				reason: "allowlist",
				message: settings.allowlistMessage || "Este sitio no está permitido.",
			};
		}
		return { blocked: false };
	}

	const globalMatch = matchSite(host, settings.blockedSites);
	if (globalMatch) {
		return {
			blocked: true,
			reason: "blocked",
			message:
				(settings.siteMessages || {})[globalMatch] ||
				settings.defaultBlockMessage ||
				"Este sitio está bloqueado.",
		};
	}

	const userMatch = matchSite(host, user.blockedSites);
	if (userMatch) {
		return {
			blocked: true,
			reason: "user",
			message:
				(user.siteMessages || {})[userMatch] ||
				settings.defaultBlockMessage ||
				"Este sitio está bloqueado.",
		};
	}

	const category = categoryBlocked(host, settings.categories || []);
	if (category) {
		return {
			blocked: true,
			reason: "category",
			category,
			message:
				(settings.categoryMessages || {})[category] ||
				settings.defaultBlockMessage ||
				"Este sitio está bloqueado.",
		};
	}

	return { blocked: false };
}

function checkUrlPolicy(user, value) {
	const settings = getSettings();
	if (!user || isAdminRole(user.role)) return { blocked: false };
	if (settings.quarantineMode) {
		return {
			blocked: true,
			reason: "quarantine",
			message: settings.quarantineMessage || "El proxy está en cuarentena.",
		};
	}
	if (!isWithinSchedule(user, settings.timezone)) {
		return {
			blocked: true,
			reason: "schedule",
			message: "El acceso está fuera del horario permitido para tu cuenta.",
		};
	}
	let host;
	try {
		host = new URL(value).hostname;
	} catch {
		return { blocked: false };
	}
	return checkHostPolicy(user, host);
}
const LOGIN_ERRORS = {
	1: "Usuario o contraseña incorrectos.",
	password: "La contraseña no es correcta.",
	rate: "Demasiados intentos fallidos. Espera unos minutos.",
	blocked: "Esta cuenta está bloqueada. Contacta con el administrador.",
	temporary: "Esta cuenta está bloqueada temporalmente. Contacta con el administrador.",
	maintenance: "El proxy está en mantenimiento. Solo los administradores pueden entrar.",
};

const CSRF_COOKIE = "pw_csrf";
const HOST_CSRF_COOKIE = "__Host-pw_csrf";

function cookieValue(req, name) {
	for (const part of String(req.headers.cookie || "").split(";")) {
		const index = part.indexOf("=");
		if (index < 0) continue;
		if (part.slice(0, index).trim() === name) {
			try {
				return decodeURIComponent(part.slice(index + 1).trim());
			} catch {
				return part.slice(index + 1).trim();
			}
		}
	}
	return "";
}

function ensureCsrf(req, res) {
	let token = cookieValue(req, HOST_CSRF_COOKIE) || cookieValue(req, CSRF_COOKIE);
	if (!/^[a-f0-9]{48}$/.test(token)) {
		token = crypto.randomBytes(24).toString("hex");
		const secure = req.secure || req.headers["x-forwarded-proto"] === "https";
		const name = secure ? HOST_CSRF_COOKIE : CSRF_COOKIE;
		const cookie = `${name}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600${secure ? "; Secure" : ""}`;
		try {
			res.append("Set-Cookie", cookie);
		} catch {
			res.setHeader("Set-Cookie", cookie);
		}
	}
	return token;
}

function validCsrf(req) {
	const token = cookieValue(req, HOST_CSRF_COOKIE) || cookieValue(req, CSRF_COOKIE);
	const provided = String(req.body.csrf || "");
	if (!/^[a-f0-9]{48}$/.test(token) || !/^[a-f0-9]{48}$/.test(provided)) return false;
	return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(provided));
}

const ACCOUNT_ERRORS = {
	icon: "No se pudo eliminar el icono.",
	current: "La contraseña actual no es correcta.",
	match: "Las contraseñas nuevas no coinciden.",
	short: "La nueva contraseña debe tener entre 8 y 128 caracteres.",
	same: "La nueva contraseña debe ser distinta de la actual.",
	disabled: "El administrador ha desactivado el cambio de contraseña.",
	notfound: "La sesión ya no existe.",
};

const ADMIN_ERRORS = {
	self: "No puedes eliminarte ni quitarte el rol de administrador a ti mismo.",
	"self-block": "No puedes bloquear tu propia cuenta.",
	"self-logout": "Usa “Salir” para cerrar tu propia sesión.",
	exists: "Ese usuario ya existe.",
	"invalid-user": "Usuario no válido: de 3 a 32 caracteres (letras, números, punto, guion o guion bajo).",
	"invalid-password": "La contraseña debe tener entre 8 y 128 caracteres.",
	"invalid-role": "Rol no válido.",
	"invalid-date": "La fecha de bloqueo no es válida o ya ha pasado.",
	"invalid-schedule": "Horario no válido: elige al menos un día y horas correctas.",
	notfound: "Usuario no encontrado.",
	"last-admin": "Debe quedar al menos un administrador activo.",
	"creator-protected": "La cuenta del creador está protegida y no puede modificarse.",
	protected: "La cuenta del creador está protegida y no puede modificarse.",
	forbidden: "No tienes permisos sobre un administrador.",
};

const ADMIN_OK = {
	created: "Usuario creado.",
	deleted: "Usuario eliminado.",
	reset: "Contraseña actualizada.",
	role: "Rol actualizado.",
	blocked: "Cuenta bloqueada permanentemente.",
	unblocked: "Cuenta desbloqueada.",
	tempblocked: "Cuenta bloqueada temporalmente.",
	tempcleared: "Bloqueo temporal retirado.",
	logout: "Sesiones del usuario cerradas.",
	notes: "Notas guardadas.",
	blockmessage: "Mensaje de bloqueo guardado.",
	sites: "Sitios del usuario actualizados.",
	schedule: "Horario actualizado.",
	mustchange: "Se exigirá cambio de contraseña en el próximo acceso.",
	mustchange_off: "Ya no se exigirá cambio de contraseña.",
	revoked: "Sesión cerrada.",
	saved: "Ajustes guardados.",
	reset_settings: "Ajustes restablecidos.",
	chat_cleared: "Chat vaciado.",
};

/* --------------------------- rutas públicas --------------------------- */

app.get("/healthz", (req, res) => res.type("text/plain").send("ok"));

app.get("/robots.txt", (req, res) => {
	res.type("text/plain").send("User-agent: *\nDisallow: /\n");
});

app.get("/.well-known/security.txt", (req, res) => {
	res.type("text/plain").send(
		[
			"Contact: https://github.com/ericsnet/scramjet-web-proxy/security/advisories/new",
			"Preferred-Languages: es, en",
			"Canonical: https://raspi-eric.tail41ccf3.ts.net/.well-known/security.txt",
			"Expires: 2027-11-24T00:00:00Z",
			"",
		].join("\n"),
	);
});

app.get("/favicon.png", (req, res) => {
	res.set("Cache-Control", "public, max-age=86400");
	res.type("image/png").sendFile(path.join(__dirname, "public/favicon.png"));
});

app.get(["/favicon.svg", "/favicon.ico"], (req, res) => res.redirect(302, "/favicon.png"));

app.get("/page-i18n.js", (req, res) => {
	res.set("Cache-Control", "public, max-age=3600");
	res.type("application/javascript").sendFile(path.join(__dirname, "public/page-i18n.js"));
});

app.get("/api/config", requireAuth, (req, res) => {
	const settings = getSettings();
	const session = getSession(req);
	const payload = {
		landingTitle: settings.landingTitle,
		landingSubtitle: settings.landingSubtitle,
		quickLinks: settings.quickLinks,
		defaultSearchEngine: settings.defaultSearchEngine,
		maintenanceMode: settings.maintenanceMode,
		maintenanceMessage: settings.maintenanceMessage,
	};
	if (session) {
		payload.blockedSites = settings.blockedSites || [];
		payload.allowedSites = settings.allowedSites || [];
		payload.accessMode = settings.accessMode;
	}
	res.set("Cache-Control", "no-store");
	res.json(payload);
});

app.get("/metrics", (req, res) => {
	const settings = getSettings();
	const token = settings.metricsToken;
	if (!token) return res.status(404).end();
	const provided =
		String(req.query.token || "") ||
		String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
	const a = crypto.createHash("sha256").update(String(provided)).digest();
	const b = crypto.createHash("sha256").update(String(token)).digest();
	if (!crypto.timingSafeEqual(a, b)) return res.status(404).end();

	const snap = metricsSnapshot();
	let wisp = 0;
	for (const set of wispConnections.values()) wisp += set.size;
	const lines = [
		`webproxy_uptime_seconds ${Math.floor(process.uptime())}`,
		`webproxy_users_total ${listUsers().length}`,
		`webproxy_sessions_active ${sessionCount()}`,
		`webproxy_activity_entries ${exportActivity().length}`,
		`webproxy_audit_events ${auditCount()}`,
		`webproxy_backups_total ${backupCount()}`,
		`webproxy_wisp_connections ${wisp}`,
		`webproxy_blocked_sites ${(settings.blockedSites || []).length}`,
		`webproxy_allowed_sites ${(settings.allowedSites || []).length}`,
		`webproxy_memory_rss_bytes ${process.memoryUsage().rss}`,
		...Object.entries(snap).map(([name, value]) => `webproxy_${name} ${value}`),
	];
	res.type("text/plain; version=0.0.4; charset=utf-8").send(lines.join("\n") + "\n");
});

app.get("/api/lang", (req, res) => {
	const settings = getSettings();
	const session = getSession(req);
	const user = session ? getUser(session.username) : null;
	let cookieLang = "";
	for (const part of String(req.headers.cookie || "").split(";")) {
		const [key, value] = part.trim().split("=");
		if (key === "pw_lang") cookieLang = decodeURIComponent(value || "");
	}
	const lang = user?.lang || cookieLang || settings.language || "es";
	res.set("Cache-Control", "no-store");
	res.json({ lang: ["es", "en", "ca"].includes(lang) ? lang : "es" });
});

app.get("/login", (req, res) => {
	const settings = getSettings();
	const session = getSession(req);
	if (session) {
		if (settings.maintenanceMode && !isAdminRole(session.role)) {
			return res.redirect(303, "/maintenance");
		}
		return res.redirect(303, "/");
	}
	const error = LOGIN_ERRORS[req.query.error] || "";
	res.set("Cache-Control", "no-store");
	res.type("html").send(
		loginPage({
			next: safeNext(req.query.next),
			error,
			maintenance: settings.maintenanceMode ? settings.maintenanceMessage : "",
			csrf: ensureCsrf(req, res),
		}),
	);
});

app.get("/quarantine", (req, res) => {
	const settings = getSettings();
	const session = getSession(req);
	if (isAdminRole(session?.role)) return res.redirect(303, "/");
	res.status(503).set("Cache-Control", "no-store").type("html").send(
		quarantinePage({ settings, user: session || null }),
	);
});

app.get("/maintenance", (req, res) => {
	const settings = getSettings();
	const session = getSession(req);
	if (isAdminRole(session?.role)) return res.redirect(303, "/");
	res.status(503).set("Cache-Control", "no-store").type("html").send(
		maintenancePage({ settings, user: session || null }),
	);
});

app.get("/blocked", (req, res) => {
	const token = String(req.query.t || "");
	const entry = blockFlashes.get(token);
	if (!entry || entry.expires < Date.now()) {
		blockFlashes.delete(token);
		return res.redirect(303, "/login?error=blocked");
	}
	blockFlashes.delete(token);
	res.status(403).set("Cache-Control", "no-store").type("html").send(
		blockedPage({ message: entry.message }),
	);
});

app.get("/denied", (req, res) => {
	const session = getSession(req);
	const settings = getSettings();
	if (isAdminRole(session?.role)) return res.redirect(303, "/");
	const reason = String(req.query.reason || "schedule");
	const schedule = reason === "schedule";
	res.status(403).set("Cache-Control", "no-store").type("html").send(
		blockedPage({
			title: schedule ? "Fuera de horario" : "Acceso denegado",
			message: schedule
				? "El acceso a tu cuenta está fuera del horario permitido. Vuelve a intentarlo dentro de tu horario."
				: "No tienes acceso en este momento.",
			user: session || null,
		}),
	);
});

app.post("/api/login", sameOrigin, async (req, res) => {
	if (!validCsrf(req)) {
		return sendHttpError(req, res, 403, "Token de seguridad no válido", "Recarga el login e inténtalo de nuevo.");
	}
	const username = normalizeUsername(req.body.username);
	const password = String(req.body.password || "");
	const next = safeNext(req.body.next);
	const settings = getSettings();
	const ip = clientIp(req);

	if (
		isIpRateLimited(ip) ||
		isAccountIpRateLimited(ip, username) ||
		isRateLimited(username)
	) {
		metric("logins_failed_total");
		addAudit({
			actor: username || "desconocido",
			action: "login.rate",
			ip,
			userAgent: clientUa(req),
		});
		res.set("Retry-After", "600");
		const wantsJson =
			req.is("application/json") ||
			String(req.get("accept") || "").includes("application/json");
		if (wantsJson) return res.status(429).json({ error: "rate" });
		return res.status(429).type("html").send(
			loginPage({
				next,
				error: LOGIN_ERRORS.rate,
				maintenance: settings.maintenanceMode ? settings.maintenanceMessage : "",
				csrf: ensureCsrf(req, res),
			}),
		);
	}

	const user = await verifyLogin(username, password);
	if (!user) {
		recordFailedLogin(username);
		recordIpFailure(ip);
		recordAccountIpFailure(ip, username);
		metric("logins_failed_total");
		addAudit({
			actor: username || "desconocido",
			action: "login.fail",
			ip,
			userAgent: clientUa(req),
		});
		return res.redirect(303, `/login?error=1&next=${encodeURIComponent(next)}`);
	}
	if (isUserBanned(user.username)) {
		metric("logins_blocked_total");
		addAudit({
			actor: user.username,
			action: "login.banned",
			ip,
			userAgent: clientUa(req),
		});
		const token = createBlockFlash(
			"Tu cuenta está bloqueada por seguridad. Contacta con un administrador.",
		);
		return res.redirect(303, `/blocked?t=${token}`);
	}
	if (user.blocked) {
		metric("logins_blocked_total");
		addAudit({
			actor: user.username,
			action: "login.blocked",
			ip,
			userAgent: clientUa(req),
		});
		const message =
			user.blockMessage ||
			(user.blockedUntil
				? "Esta cuenta está bloqueada temporalmente."
				: "Esta cuenta está bloqueada.");
		const token = createBlockFlash(message);
		return res.redirect(303, `/blocked?t=${token}`);
	}
	if (settings.quarantineMode && !isAdminRole(user.role)) {
		addAudit({
			actor: user.username,
			action: "login.quarantine",
			ip,
			userAgent: clientUa(req),
		});
		return res.redirect(303, "/quarantine");
	}
	if (settings.maintenanceMode && !isAdminRole(user.role)) {
		addAudit({
			actor: user.username,
			action: "login.maintenance",
			ip,
			userAgent: clientUa(req),
		});
		return res.redirect(303, `/login?error=maintenance&next=${encodeURIComponent(next)}`);
	}
	if (
		!isAdminRole(user.role) &&
		!isWithinSchedule(getUser(user.username), settings.timezone)
	) {
		addAudit({
			actor: user.username,
			action: "login.schedule",
			ip,
			userAgent: clientUa(req),
		});
		return res.redirect(303, "/denied?reason=schedule");
	}

	recordSuccessfulLogin(user.username, ip, {
		exempt: user.role === "creator",
		device: req._deviceId || "",
		userAgent: clientUa(req),
	});

	clearFailedLogins(username);
	metric("logins_success_total");
	const session = createSession(user.username, {
		ip,
		userAgent: clientUa(req),
	});
	for (const revokedId of session.revoked || []) closeSessionConnections(revokedId);
	recordLoginSuccess(user.username, ip);
	addAudit({
		actor: user.username,
		action: "login.success",
		ip,
		userAgent: clientUa(req),
	});
	res.setHeader("Set-Cookie", sessionCookie(req, session.token, session.expires));
	res.redirect(303, next);
});

app.post("/logout", sameOrigin, (req, res) => {
	const session = getSession(req);
	if (session) {
		addAudit({
			actor: session.username,
			action: "logout",
			ip: clientIp(req),
			userAgent: clientUa(req),
		});
		destroySession(session.token);
		closeSessionConnections(session.id);
	}
	res.setHeader("Set-Cookie", clearSessionCookie(req));
	res.redirect(303, "/login");
});

/* --------------------------- a partir de aquí, login --------------------------- */

app.use(requireAuth);

app.param("username", (req, res, next, value) => {
	if (!isStaffRole(req.user?.role)) return next();
	const target = getUser(value);
	if (!target) return next();
	if (target.role === "creator") {
		return res.redirect(303, "/admin?error=creator-protected");
	}
	if (req.user?.role === "creator") return next();
	if (!canManageRole(req.user?.role, target.role)) {
		addAudit({
			actor: req.user?.username || "",
			action: "admin.forbidden",
			target: target.username,
			detail: `${req.user?.role || "sin rol"} -> ${target.role}`,
			ip: clientIp(req),
			userAgent: clientUa(req),
		});
		return res.redirect(303, "/admin?error=forbidden");
	}
	next();
});

app.all(
	["/coffee", "/teapot"],
	express.text({ type: "message/coffeepot", limit: "4kb" }),
	handleHtcpcp,
);

app.post("/api/panic", requireAuth, sameOrigin, (req, res) => {
	const until = activatePanic(req._deviceId);
	audit(req, "panic.activate", "", `hasta ${new Date(until).toISOString()}`);
	res.redirect(303, CLASSROOM_URL);
});

app.get("/api/me", (req, res) => {
	const user = getUser(req.user.username);
	res.set("Cache-Control", "no-store");
	res.json({
		username: req.user.username,
		role: req.user.role,
		mustChangePassword: req.user.mustChangePassword,
		icon: user?.icon || null,
		blockedSites: user?.blockedSites || [],
		schedule: user?.schedule || null,
	});
});

app.get("/avatar/:user", (req, res) => {
	const target = getUser(req.params.user);
	if (!target) return res.status(404).end();
	const file = avatarFile(target.username);
	if (!file) return res.status(404).end();
	res.set("Cache-Control", "private, max-age=300");
	res.set("X-Content-Type-Options", "nosniff");
	res.set("Content-Disposition", 'inline; filename="avatar"');
	res.type(file.type).sendFile(file.path);
});

app.get("/api/navigate-check", async (req, res) => {
	const url = String(req.query.url || "");
	let parsed;
	try {
		parsed = new URL(url);
		if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) {
			throw new Error("bad");
		}
	} catch {
		return res.status(400).json({ error: "invalid-url" });
	}
	if (await isPrivateDestination(parsed.hostname)) {
		return res.status(200).json({
			blocked: true,
			reason: "private",
			message: "Los destinos locales o privados no están permitidos.",
			host: parsed.hostname,
		});
	}
	const result = checkUrlPolicy(getUser(req.user.username), parsed.href);
	if (result.reason === "quarantine") {
		recordQuarantineAttempt(
			req,
			req.user,
			parsed.href,
			`Intento de navegación a ${parsed.hostname}`,
		);
	}
	res.set("Cache-Control", "no-store");
	res.json({ ...result, host: parsed.hostname });
});

app.post("/api/activity", sameOrigin, (req, res) => {
	recordActivity(req.user.username, {
		url: typeof req.body.url === "string" ? req.body.url : "",
		query: typeof req.body.query === "string" ? req.body.query : "",
	});
	res.status(204).end();
});

/* ------------------------------ chat interno ------------------------------ */

function chatOnlineUsers() {
	const cutoff = Date.now() - 5 * 60 * 1000;
	const names = new Map();
	for (const session of listSessions()) {
		const seen = new Date(session.lastSeenAt).getTime();
		if (Number.isFinite(seen) && seen >= cutoff) {
			names.set(String(session.username).toLowerCase(), session.username);
		}
	}
	return [...names.values()].sort((a, b) => a.localeCompare(b, "es"));
}

function chatOnlineIcons(names) {
	const wanted = new Set((names || []).map((name) => String(name).toLowerCase()));
	const out = {};
	for (const entry of listUsers()) {
		if (entry.icon && wanted.has(String(entry.username).toLowerCase())) {
			out[entry.username] = entry.icon;
		}
	}
	return out;
}

function chatChannelOf(req, fallback = "general") {
	return String(req.query.channel || req.body?.channel || fallback).slice(0, 80) || "general";
}

function chatEnriched(messages, user, meta) {
	return messages.map((message) => enrichChatMessage(message, user, meta));
}

app.get("/chat", (req, res) => {
	const settings = getSettings();
	const canModerate = isChatModerator(req.user);
	const friendNotices = {
		"friend-request": "Solicitud de amistad enviada.",
		"friend-accepted": "Solicitud aceptada. Ya sois amigos.",
		"friend-rejected": "Solicitud rechazada.",
		"friend-cancelled": "Solicitud cancelada.",
		"friend-removed": "Amistad eliminada.",
	};
	const notice =
		req.query.ok === "sent"
			? "Mensaje enviado."
			: req.query.ok === "deleted"
				? "Mensaje eliminado."
				: friendNotices[req.query.ok] || "";
	const error = CHAT_ERRORS[req.query.error] || FRIEND_ERRORS[req.query.error] || "";
	const roles = chatUserMeta();
	const channels = settings.chatEnabled ? listChatChannels(req.user.username) : [];
	const onlineUsers = settings.chatShowOnline
		? hideCreatorData(req, chatOnlineUsers(), (name) => name)
		: [];
	const allChatUsers = hideCreatorData(req, listUsers(), (entry) => entry.username).filter(
		(entry) =>
			entry.username.toLowerCase() !== req.user.username.toLowerCase() &&
			!entry.effectivelyBlocked,
	);
	const friendState = getFriendState(req.user.username);
	const friendSet = new Set(friendState.friends.map((name) => name.toLowerCase()));
	const incomingSet = new Set(friendState.incoming.map((name) => name.toLowerCase()));
	const outgoingSet = new Set(friendState.outgoing.map((name) => name.toLowerCase()));
	const friendEntries = allChatUsers.filter((entry) =>
		friendSet.has(entry.username.toLowerCase()),
	);
	const requestableUsers = allChatUsers.filter((entry) => {
		const name = entry.username.toLowerCase();
		return !friendSet.has(name) && !incomingSet.has(name) && !outgoingSet.has(name);
	});
	let currentChannel = chatChannelOf(req);
	if (!channels.some((channel) => channel.id === currentChannel)) {
		currentChannel = channels[0]?.id || "general";
	}
	let messages = [];
	let latestSeq = 0;
	let revision = 0;
	if (settings.chatEnabled) {
		const result = listChat({
			username: req.user.username,
			channelId: currentChannel,
			after: 0,
			limit: 200,
		});
		if (!result.error) {
			messages = chatEnriched(result.messages, req.user, roles);
			latestSeq = result.latestSeq;
			revision = result.revision;
		}
	}
	res.set("Cache-Control", "no-store");
	res.type("html").send(
		chatPage({
			user: req.user,
			settings,
			messages,
			latestSeq,
			revision,
			online: onlineUsers.length,
			onlineUsers,
			channels,
			currentChannel,
			users: allChatUsers,
			friends: friendEntries,
			incomingRequests: friendState.incoming,
			outgoingRequests: friendState.outgoing,
			requestableUsers,
			canModerate,
			notice,
			error,
		}),
	);
});

app.get("/api/chat/unread", (req, res) => {
	const settings = getSettings();
	if (!settings.chatEnabled) return res.json({ enabled: false, unread: 0, latestSeq: 0 });
	res.set("Cache-Control", "no-store");
	res.json({ enabled: true, ...getChatUnread(req.user.username), currentUser: req.user.username });
});

app.get("/api/chat/channels", (req, res) => {
	const settings = getSettings();
	if (!settings.chatEnabled) return res.status(403).json({ error: "disabled" });
	const online = settings.chatShowOnline
		? hideCreatorData(req, chatOnlineUsers(), (name) => name)
		: [];
	res.set("Cache-Control", "no-store");
	res.json({
		channels: listChatChannels(req.user.username),
		online,
		onlineIcons: chatOnlineIcons(online),
	});
});

app.post("/api/chat/channels/dm", sameOrigin, (req, res) => {
	const target = getUser(req.body.username || "");
	if (!target || target.username.toLowerCase() === req.user.username.toLowerCase()) {
		return res.status(400).json({ error: "invalid-user" });
	}
	if (req.user.role !== "creator" && !areFriends(req.user.username, target.username)) {
		return res.status(403).json({
			error: "not_friends",
			message: "Solo puedes abrir un chat privado con amigos.",
		});
	}
	const result = getOrCreateDmChannel(req.user.username, target.username);
	if (result.error) return res.status(400).json({ error: result.error });
	res.status(201).json({ channel: result.channel });
});

app.post("/api/chat/channels/group", sameOrigin, (req, res) => {
	const known = new Set(listUsers().map((entry) => entry.username.toLowerCase()));
	const members = (Array.isArray(req.body.members) ? req.body.members : [req.body.members])
		.map((member) => String(member || "").trim())
		.filter((member) => member && known.has(member.toLowerCase()));
	if (req.user.role !== "creator") {
		const nonFriend = members.find(
			(member) =>
				member.toLowerCase() !== req.user.username.toLowerCase() &&
				!areFriends(req.user.username, member),
		);
		if (nonFriend) {
			return res.status(400).json({
				error: "not_friends",
				message: `${nonFriend} no es tu amigo. Añádelo primero.`,
			});
		}
	}
	const result = createGroupChannel(req.user.username, req.body.name, members);
	if (result.error) return res.status(400).json({ error: result.error });
	audit(req, "chat.channel", result.channel.name, "grupo");
	res.status(201).json({ channel: result.channel });
});

function friendRedirect(req, res, key, value) {
	const next = safeNext(req.body.next || "/chat");
	const parsed = new URL(next, "http://local.invalid");
	parsed.searchParams.set(key, value);
	return res.redirect(303, `${parsed.pathname}${parsed.search}`);
}

app.post("/api/friends/request", sameOrigin, (req, res) => {
	const target = getUser(req.body.username || "");
	if (!target || target.username.toLowerCase() === req.user.username.toLowerCase()) {
		return friendRedirect(req, res, "error", "invalid-user");
	}
	const result = sendFriendRequest(req.user.username, target.username);
	if (result.error) return friendRedirect(req, res, "error", result.error.replaceAll("_", "-"));
	audit(req, result.accepted ? "friend.accept" : "friend.request", target.username);
	return friendRedirect(req, res, "ok", result.accepted ? "friend-accepted" : "friend-request");
});

app.post("/api/friends/accept", sameOrigin, (req, res) => {
	const result = acceptFriendRequest(req.user.username, req.body.username || "");
	if (result.error) return friendRedirect(req, res, "error", result.error);
	audit(req, "friend.accept", req.body.username || "");
	return friendRedirect(req, res, "ok", "friend-accepted");
});

app.post("/api/friends/reject", sameOrigin, (req, res) => {
	const result = rejectFriendRequest(req.user.username, req.body.username || "");
	if (result.error) return friendRedirect(req, res, "error", result.error);
	audit(req, "friend.reject", req.body.username || "");
	return friendRedirect(req, res, "ok", "friend-rejected");
});

app.post("/api/friends/cancel", sameOrigin, (req, res) => {
	const result = cancelFriendRequest(req.user.username, req.body.username || "");
	if (result.error) return friendRedirect(req, res, "error", result.error);
	audit(req, "friend.cancel", req.body.username || "");
	return friendRedirect(req, res, "ok", "friend-cancelled");
});

app.post("/api/friends/remove", sameOrigin, (req, res) => {
	const result = removeFriend(req.user.username, req.body.username || "");
	if (result.error) return friendRedirect(req, res, "error", result.error);
	audit(req, "friend.remove", req.body.username || "");
	return friendRedirect(req, res, "ok", "friend-removed");
});

app.post("/api/chat/read", sameOrigin, (req, res) => {
	if (!getSettings().chatEnabled) return res.status(403).json({ error: "disabled" });
	const result = markChatRead(req.user.username, chatChannelOf(req), req.body.seq);
	if (result.error) return res.status(403).json({ error: result.error });
	res.status(204).end();
});

app.get("/api/chat/messages", (req, res) => {
	const settings = getSettings();
	if (!settings.chatEnabled) return res.status(403).json({ error: "disabled" });
	const channelId = chatChannelOf(req);
	const after = Math.max(0, Number.parseInt(req.query.after, 10) || 0);
	const result = listChat({ username: req.user.username, channelId, after, limit: 200 });
	if (result.error) return res.status(403).json({ error: result.error });
	const roles = chatUserMeta();
	const online = settings.chatShowOnline
		? hideCreatorData(req, chatOnlineUsers(), (name) => name)
		: null;
	res.set("Cache-Control", "no-store");
	res.json({
		...result,
		messages: chatEnriched(result.messages, req.user, roles),
		online,
		onlineIcons: chatOnlineIcons(online || []),
		canModerate: isChatModerator(req.user),
		allowUserDelete: !!settings.chatAllowUserDelete,
		maxLength: settings.chatMaxLength,
		currentUser: req.user.username,
		unread: getChatUnread(req.user.username).unread,
	});
});

app.post("/api/chat/messages", sameOrigin, (req, res) => {
	const json = wantsChatJson(req);
	const requestedChannel = String(req.body.channel || "").trim();
	if (!requestedChannel) {
		if (!json) return res.redirect(303, "/chat?error=channel_required");
		return res.status(400).json({
			error: "channel_required",
			message: CHAT_ERRORS.channel_required,
		});
	}
	const result = postChatMessage(req.user.username, req.body.text, {
		channelId: requestedChannel,
		attachmentId: String(req.body.attachment || ""),
	});
	if (result.error) {
		if (!json) return res.redirect(303, `/chat?error=${encodeURIComponent(result.error)}`);
		const status = result.error === "disabled" ? 403 : result.error === "slow" || result.error === "rate" ? 429 : 400;
		return res.status(status).json({
			error: result.error,
			message: CHAT_ERRORS[result.error] || "No se pudo enviar el mensaje.",
			retryAfter: result.retryAfter || 0,
		});
	}
	if (!json) return res.redirect(303, "/chat?ok=sent");
	res.status(201).json({ message: enrichChatMessage(result.message, req.user, chatUserMeta()) });
});

app.post("/api/chat/polls", sameOrigin, (req, res) => {
	const result = postChatPoll(req.user.username, {
		channelId: chatChannelOf(req),
		question: req.body.question,
		options: Array.isArray(req.body.options) ? req.body.options : String(req.body.options || "").split("\n"),
	});
	if (result.error) return res.status(400).json({ error: result.error, message: "Encuesta no válida." });
	res.status(201).json({ message: enrichChatMessage(result.message, req.user, chatUserMeta()) });
});

app.post("/api/chat/polls/:id/vote", sameOrigin, (req, res) => {
	const result = votePoll(req.user.username, req.params.id, req.body.option, chatChannelOf(req));
	if (result.error) return res.status(400).json({ error: result.error });
	res.json({ message: enrichChatMessage(result.message, req.user, chatUserMeta()) });
});

app.post("/api/chat/messages/:id/reaction", sameOrigin, (req, res) => {
	const result = toggleReaction(req.user.username, req.params.id, req.body.emoji, chatChannelOf(req));
	if (result.error) return res.status(400).json({ error: result.error });
	res.json({ message: enrichChatMessage(result.message, req.user, chatUserMeta()) });
});

app.post("/api/chat/upload", sameOrigin, express.raw({ type: "application/octet-stream", limit: "6mb" }), (req, res) => {
	if (!getSettings().chatEnabled) return res.status(403).json({ error: "disabled" });
	let fileName = String(req.headers["x-file-name"] || "archivo");
	try {
		fileName = decodeURIComponent(fileName);
	} catch {}
	const result = saveChatUpload(req.user.username, req.body, {
		name: fileName,
		type: req.headers["x-file-type"],
	});
	if (result.error) {
		const status = result.error === "too_large" ? 413 : 400;
		return res.status(status).json({ error: result.error });
	}
	res.status(201).json({ upload: result.upload });
});

app.get("/api/chat/files/:id", (req, res) => {
	const message = getChatAttachmentMessage(req.params.id);
	if (!message) return res.status(404).end();
	const allowed = listChatChannels(req.user.username).some((channel) => channel.id === message.channelId);
	if (!allowed) return res.status(403).end();
	const file = getChatAttachment(req.params.id);
	if (!file) return res.status(404).end();
	const attachment = message.attachment;
	res.set("Cache-Control", "private, max-age=3600");
	res.set("X-Content-Type-Options", "nosniff");
	res.type(attachment.type || "application/octet-stream");
	res.set(
		"Content-Disposition",
		`inline; filename*=UTF-8''${encodeURIComponent(attachment.name || "archivo")}`,
	);
	res.sendFile(file.path);
});

app.post("/api/chat/messages/:id/delete", sameOrigin, (req, res) => {
	const json = wantsChatJson(req);
	const settings = getSettings();
	if (!settings.chatEnabled) {
		if (!json) return res.redirect(303, "/chat?error=disabled");
		return res.status(403).json({ error: "disabled", message: CHAT_ERRORS.disabled });
	}
	const message = getChatMessage(req.params.id);
	if (!message || !isChannelMember(req.user.username, message.channelId)) {
		if (!json) return res.redirect(303, "/chat?error=notfound");
		return res.status(404).json({ error: "notfound", message: CHAT_ERRORS.notfound });
	}
	const own = String(message.username).toLowerCase() === String(req.user.username).toLowerCase();
	const allowed = isChatModerator(req.user) || (!!settings.chatAllowUserDelete && own);
	if (!allowed) {
		if (!json) return res.redirect(303, "/chat?error=forbidden");
		return res.status(403).json({ error: "forbidden", message: CHAT_ERRORS.forbidden });
	}
	deleteChatMessage(message.id);
	audit(req, "chat.delete", message.username, own ? "mensaje propio" : "moderación");
	if (!json) return res.redirect(303, "/chat?ok=deleted");
	res.status(204).end();
});

/* -------------------------------- favoritos -------------------------------- */

app.get("/api/bookmarks", (req, res) => {
	res.set("Cache-Control", "no-store");
	res.json({ bookmarks: listBookmarks(req.user.username) });
});

app.post("/api/bookmarks", sameOrigin, (req, res) => {
	const result = addBookmark(req.user.username, {
		label: String(req.body.label || ""),
		url: String(req.body.url || ""),
	});
	if (result.error === "invalid-url") return res.status(400).json({ error: result.error });
	if (result.error === "limit") return res.status(409).json({ error: result.error });
	if (result.error === "exists") return res.status(409).json({ error: result.error });
	audit(req, "bookmark.create", result.bookmark.url);
	res.status(201).json({ bookmark: result.bookmark });
});

app.post("/api/bookmarks/:id/update", sameOrigin, (req, res) => {
	const result = updateBookmark(req.user.username, req.params.id, {
		label: req.body.label === undefined ? undefined : String(req.body.label),
		url: req.body.url === undefined ? undefined : String(req.body.url),
	});
	if (result.error) return res.status(404).json({ error: result.error });
	audit(req, "bookmark.update", result.bookmark.url);
	res.json({ bookmark: result.bookmark });
});

app.post("/api/bookmarks/:id/delete", sameOrigin, (req, res) => {
	const result = deleteBookmark(req.user.username, req.params.id);
	if (result.error) return res.status(404).json({ error: result.error });
	audit(req, "bookmark.delete", req.params.id);
	res.status(204).end();
});

app.get("/api/history", (req, res) => {
	const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
	res.set("Cache-Control", "no-store");
	res.json({
		history: getActivity({
			username: req.user.username,
			limit,
			search: String(req.query.q || ""),
		}),
	});
});

app.post("/api/account/history/clear", sameOrigin, (req, res) => {
	if (!getSettings().allowUserHistoryClear) {
		return res.redirect(303, "/history?error=disabled");
	}
	clearActivity(req.user.username);
	audit(req, "history.clear_self");
	res.redirect(303, "/history?ok=cleared");
});

/* --------------------------------- cuenta --------------------------------- */

app.get("/account", (req, res) => {
	const settings = getSettings();
	const sessions = sessionsForUser(req.user.username);
	const notice =
		req.query.ok === "password"
			? "Contraseña actualizada correctamente."
			: req.query.ok === "session"
				? "Sesión cerrada."
				: req.query.ok === "icon"
					? "Icono actualizado correctamente."
					: req.query.ok === "icon-removed"
						? "Icono eliminado."
						: "";
	const error = ACCOUNT_ERRORS[req.query.error] || "";
	res.set("Cache-Control", "no-store");
	res.type("html").send(
		accountPage({
			user: req.user,
			sessions,
			currentId: req.user.id,
			allowPasswordChange: settings.allowUserPasswordChange || isAdminRole(req.user.role),
			forced: req.user.mustChangePassword || req.query.force === "1",
			notice,
			error,
		}),
	);
});

app.get("/bookmarks", (req, res) => {
	res.set("Cache-Control", "no-store");
	res.type("html").send(
		bookmarksPage({
			user: req.user,
			bookmarks: listBookmarks(req.user.username),
			notice: req.query.ok === "created" ? "Favorito guardado." : "",
			error: "",
		}),
	);
});

app.get("/history", (req, res) => {
	const settings = getSettings();
	const page = Math.max(1, Number(req.query.page) || 1);
	const limit = 25;
	const search = String(req.query.q || "").slice(0, 100);
	const total = countActivity({ username: req.user.username, search });
	const activity = getActivity({
		username: req.user.username,
		limit,
		offset: (page - 1) * limit,
		search,
	});
	res.set("Cache-Control", "no-store");
	res.type("html").send(
		historyPage({
			user: req.user,
			activity,
			total,
			page,
			pages: Math.max(1, Math.ceil(total / limit)),
			search,
			canClear: settings.allowUserHistoryClear,
			notice: req.query.ok === "cleared" ? "Historial vaciado." : "",
		}),
	);
});

app.post("/api/account/language", sameOrigin, (req, res) => {
	const lang = String(req.body.lang || "");
	setUserLanguage(req.user.username, lang);
	const value = ["es", "en", "ca"].includes(lang) ? lang : "es";
	res.setHeader(
		"Set-Cookie",
		`pw_lang=${value}; Path=/; SameSite=Lax; Max-Age=31536000${req.secure ? "; Secure" : ""}`,
	);
	res.redirect(303, safeNext(req.body.next || "/account"));
});

app.post(
	"/api/account/icon",
	sameOrigin,
	express.raw({
		type: ["image/png", "image/jpeg", "image/webp", "application/octet-stream"],
		limit: "2mb",
	}),
	(req, res) => {
		if (
			!req.is("image/png") &&
			!req.is("image/jpeg") &&
			!req.is("image/webp") &&
			!req.is("application/octet-stream")
		) {
			return res.status(415).json({
				error: "invalid_type",
				message: "Usa una imagen PNG, JPG o WebP.",
			});
		}
		const result = saveAvatar(req.user.username, req.body);
		if (result.error) {
			const messages = {
				empty: "Selecciona una imagen.",
				too_large: "La imagen supera el límite de 2 MB.",
				invalid_type: "El archivo no es una imagen válida.",
				save_failed: "No se pudo guardar el icono.",
			};
			return res.status(result.error === "too_large" ? 413 : 400).json({
				error: result.error,
				message: messages[result.error] || "No se pudo guardar el icono.",
			});
		}
		audit(req, "user.icon", "", result.info?.type || "");
		res.set("Cache-Control", "no-store").json({ ok: true, icon: result.info });
	},
);

app.post("/api/account/icon/delete", sameOrigin, (req, res) => {
	const result = deleteAvatar(req.user.username);
	if (result.error) return res.redirect(303, "/account?error=icon");
	audit(req, "user.icon_remove");
	res.redirect(303, "/account?ok=icon-removed");
});

app.post("/api/account/password", sameOrigin, async (req, res) => {
	const settings = getSettings();
	if (
		!settings.allowUserPasswordChange &&
		!isAdminRole(req.user.role) &&
		!req.user.mustChangePassword
	) {
		return res.redirect(303, "/account?error=disabled");
	}
	const current = String(req.body.current || "");
	const password = String(req.body.password || "");
	const confirm = String(req.body.confirm || "");

	if (!(await verifyUserPassword(req.user.username, current))) {
		return res.redirect(303, "/account?error=current");
	}
	if (password !== confirm) return res.redirect(303, "/account?error=match");
	if (!validatePassword(password)) return res.redirect(303, "/account?error=short");
	if (password === current) return res.redirect(303, "/account?error=same");

	setPassword(req.user.username, password);
	setMustChangePassword(req.user.username, false);
	audit(req, "user.password_self");
	const revoked = destroyOtherSessions(req.user.username, req.user.token);
	for (const id of revoked) closeSessionConnections(id);
	res.redirect(303, "/account?ok=password");
});

app.post("/api/account/sessions/revoke-others", sameOrigin, (req, res) => {
	const removed = destroyOtherSessions(req.user.username, req.user.token);
	for (const id of removed) closeSessionConnections(id);
	audit(req, "session.revoke_others", "", `${removed.length} sesiones`);
	res.redirect(303, "/account?ok=session");
});

app.post("/api/account/sessions/:id/revoke", sameOrigin, (req, res) => {
	const session = revokeSessionById(req.params.id);
	if (!session || session.username.toLowerCase() !== req.user.username.toLowerCase()) {
		return res.redirect(303, "/account?error=notfound");
	}
	audit(req, "session.revoke", session.username, `sesión ${session.id}`);
	closeSessionConnections(session.id);
	if (req.params.id === req.user.id) {
		res.setHeader("Set-Cookie", clearSessionCookie(req));
		return res.redirect(303, "/login");
	}
	res.redirect(303, "/account?ok=session");
});

app.get("/api/requests", (req, res) => {
	res.set("Cache-Control", "no-store");
	res.json({ requests: listRequests({ username: req.user.username }) });
});

app.post("/api/requests", sameOrigin, (req, res) => {
	const host = String(req.body.host || "").trim().toLowerCase().replace(/^\*\./, "");
	const reason = String(req.body.reason || "").trim().slice(0, 500);
	if (!host) return res.status(400).json({ error: "invalid-host" });
	const policy = checkHostPolicy(getUser(req.user.username), host);
	if (!policy.blocked) return res.status(400).json({ error: "not-blocked" });
	const result = createRequest(req.user.username, host, reason);
	if (result.error) {
		return res.status(result.error === "exists" ? 409 : 400).json({ error: result.error });
	}
	audit(req, "request.create", host);
	res.status(201).json({ request: result.request });
});

/* ------------------------------ administración ------------------------------ */

app.get("/admin", requireStaff, (req, res) => {
	const error = ADMIN_ERRORS[req.query.error] || "";
	const notice = ADMIN_OK[req.query.ok] || "";
	touchQuarantineView();
	const users = listUsers();
	const counts = activityCounts();
	if (req.user.role !== "creator") {
		const creators = creatorNameSet();
		for (const username of Object.keys(counts)) {
			if (creators.has(username.toLowerCase())) delete counts[username];
		}
	}
	res.set("Cache-Control", "no-store");
	res.type("html").send(
		adminPage({
			user: req.user,
			users,
			counts,
			canManage: isAdminRole(req.user.role),
			quarantine: getSettings().quarantineMode,
			quarantineAttempts: hideCreatorData(
				req,
				listAudit({ action: "quarantine.attempt", limit: 20 }),
				(e) => e.actor,
			),
			security: securitySummary(),
			error,
			notice,
		}),
	);
});

const PREVIEW_ERROR_CODES = [
	400, 401, 403, 404, 405, 408, 413, 418, 421, 429, 451, 500, 501, 502, 503, 504,
];

app.get("/admin/error-preview", requireAdmin, (req, res) => {
	const requested = Number(req.query.code);
	const code = PREVIEW_ERROR_CODES.includes(requested) ? requested : 404;
	res
		.set("Cache-Control", "no-store")
		.status(code)
		.type("html")
		.send(
			errorPage({
				status: code,
				user: req.user,
				previewCodes: PREVIEW_ERROR_CODES,
			}),
		);
});

app.get("/admin/security", requireAdmin, (req, res) => {
	const includeDismissed = req.query.all === "1";
	const notices = {
		banned: "Bloqueo aplicado.",
		unbanned: "Bloqueo retirado.",
		dismissed: "Alerta descartada.",
	};
	const errors = {
		"invalid-ip": "La IP no es válida.",
		notfound: "Esa IP o alerta ya no existe.",
		"self-ban": "No puedes banear tu propio dispositivo, usuario o IP actual.",
	};
	res.set("Cache-Control", "no-store");
	res.type("html").send(
		securityPage({
			user: req.user,
			alerts: listSecurityAlerts({ includeDismissed }),
			bans: listBans(),
			summary: securitySummary(),
			currentIp: clientIp(req),
			currentDevice: req._deviceId || "",
			includeDismissed,
			notice: notices[req.query.ok] || "",
			error: errors[req.query.error] || "",
		}),
	);
});

app.get("/admin/security/alerts/:id", requireAdmin, (req, res) => {
	const alert = listSecurityAlerts({ includeDismissed: true, limit: 1000 }).find(
		(item) => item.id === req.params.id,
	);
	if (!alert) return res.redirect(303, "/admin/security?error=notfound");
	res.set("Cache-Control", "no-store");
	res.type("html").send(securityAlertPage({ user: req.user, alert }));
});

app.post("/api/admin/security/ban", requireAdmin, sameOrigin, (req, res) => {
	const type = ["ip", "device", "user"].includes(String(req.body.type))
		? String(req.body.type)
		: "device";
	const target = String(req.body.target || req.body.ip || "").trim();
	if (type === "ip" && target === clientIp(req)) {
		return res.redirect(303, "/admin/security?error=self-ban");
	}
	if (type === "device" && target === req._deviceId) {
		return res.redirect(303, "/admin/security?error=self-ban");
	}
	if (type === "user" && target.toLowerCase() === req.user.username.toLowerCase()) {
		return res.redirect(303, "/admin/security?error=self-ban");
	}
	if (type === "user" && !getUser(target)) {
		return res.redirect(303, "/admin/security?error=notfound");
	}
	const result = banTarget(type, target, {
		by: req.user.username,
		reason: String(req.body.reason || "").slice(0, 200),
		alertId: String(req.body.alert || ""),
		kind: String(req.body.kind || (type === "user" ? "user" : "")),
	});
	if (result.error) return res.redirect(303, `/admin/security?error=${result.error}`);
	if (type === "user") {
		destroySessionsOf(target);
		closeUserConnections(target);
	}
	audit(req, "security.ban", `${type}:${target}`, String(req.body.reason || "").slice(0, 200));
	res.redirect(303, "/admin/security?ok=banned");
});

app.post("/api/admin/security/unban", requireAdmin, sameOrigin, (req, res) => {
	const key = String(req.body.key || req.body.ip || "").trim();
	const result = key.includes(":") ? unbanTarget(key) : unbanTarget(`ip:${key}`);
	if (result.error) return res.redirect(303, `/admin/security?error=${result.error}`);
	audit(req, "security.unban", key);
	res.redirect(303, "/admin/security?ok=unbanned");
});

app.post("/api/admin/security/dismiss", requireAdmin, sameOrigin, (req, res) => {
	const result = dismissAlert(String(req.body.id || ""));
	if (result.error) return res.redirect(303, `/admin/security?error=${result.error}`);
	audit(req, "security.dismiss", String(req.body.id || ""));
	res.redirect(303, "/admin/security?ok=dismissed");
});

function monitorSnapshot(req) {
	const now = Date.now();
	const sessions = hideCreatorData(req, listSessions(), (session) => session.username);
	const users = hideCreatorData(req, listUsers(), (entry) => entry.username);
	const userMap = new Map(users.map((entry) => [entry.username.toLowerCase(), entry]));
	const activity = hideCreatorData(req, getActivity({ limit: 1000 }), (entry) => entry.username);
	const latest = new Map();
	for (const entry of activity) {
		const key = String(entry.username || "").toLowerCase();
		if (!latest.has(key)) latest.set(key, entry);
	}
	const wisp = hideCreatorData(
		req,
		trafficSnapshot().wisp.streams,
		(stream) => stream.username,
	);
	const entries = new Map();
	for (const session of sessions) {
		const key = String(session.username || "").toLowerCase();
		let entry = entries.get(key);
		if (!entry) {
			const details = userMap.get(key) || {};
			entry = {
				username: details.username || session.username,
				role: details.role || session.role || "user",
				icon: details.icon || null,
				ips: new Set(),
				sessions: 0,
				lastSeenAt: session.lastSeenAt,
				createdAt: session.createdAt,
				userAgent: session.userAgent,
				streams: [],
			};
			entries.set(key, entry);
		}
		entry.sessions += 1;
		if (session.ip) entry.ips.add(session.ip);
		if (new Date(session.lastSeenAt) > new Date(entry.lastSeenAt)) {
			entry.lastSeenAt = session.lastSeenAt;
			entry.userAgent = session.userAgent;
		}
	}
	for (const stream of wisp) {
		const entry = entries.get(String(stream.username || "").toLowerCase());
		if (!entry) continue;
		entry.streams.push({
			host: stream.host,
			port: stream.port,
			bytes: (stream.bytesIn || 0) + (stream.bytesOut || 0),
		});
	}
	const resultUsers = [...entries.values()].map((entry) => {
		const current = latest.get(String(entry.username).toLowerCase()) || null;
		return {
			username: entry.username,
			role: entry.role,
			icon: entry.icon,
			online: now - new Date(entry.lastSeenAt).getTime() < 5 * 60 * 1000,
			ips: [...entry.ips].filter(Boolean).slice(0, 4),
			sessions: entry.sessions,
			lastSeenAt: entry.lastSeenAt,
			createdAt: entry.createdAt,
			userAgent: entry.userAgent,
			streams: entry.streams
				.sort((a, b) => b.bytes - a.bytes)
				.slice(0, 8),
			current: current
				? { url: current.url || "", query: current.query || "", at: current.at }
				: null,
		};
	}).sort((a, b) => Number(b.online) - Number(a.online) || new Date(b.lastSeenAt) - new Date(a.lastSeenAt));
	const recent = activity
		.filter((entry) => now - new Date(entry.at).getTime() <= 24 * 60 * 60 * 1000)
		.slice(0, 80)
		.map((entry) => ({
			username: entry.username,
			url: entry.url || "",
			query: entry.query || "",
			at: entry.at,
		}));
	return {
		generatedAt: new Date(now).toISOString(),
		stats: {
			online: resultUsers.filter((entry) => entry.online).length,
			sessions: sessions.length,
			streams: wisp.length,
			recent: recent.length,
		},
		users: resultUsers,
		recent,
	};
}

app.get("/admin/monitor", requireAdmin, (req, res) => {
	res.set("Cache-Control", "no-store");
	res.type("html").send(
		monitorPage({ user: req.user, snapshot: monitorSnapshot(req) }),
	);
});

app.get("/api/admin/monitor", requireAdmin, (req, res) => {
	res.set("Cache-Control", "no-store");
	res.json(monitorSnapshot(req));
});

app.get("/admin/traffic", requireAdmin, (req, res) => {
	const snapshot = trafficSnapshot();
	res.set("Cache-Control", "no-store");
	res.type("html").send(
		trafficPage({
			user: req.user,
			snapshot,
			sessions: sessionCount(),
			security: securitySummary(),
		}),
	);
});

app.get("/api/admin/traffic", requireAdmin, (req, res) => {
	res.set("Cache-Control", "no-store");
	res.json({
		...trafficSnapshot(),
		sessions: sessionCount(),
		security: securitySummary(),
	});
});

app.get("/admin/requests", requireStaff, (req, res) => {
	const status = ["pending", "approved", "denied"].includes(String(req.query.status))
		? String(req.query.status)
		: "pending";
	res.set("Cache-Control", "no-store");
	res.type("html").send(
		requestsPage({
			user: req.user,
			requests: hideCreatorData(req, listRequests({ status }), (r) => r.username),
			status,
			canManage: isAdminRole(req.user.role) || req.user.role === "moderator",
		}),
	);
});

app.post("/api/admin/requests/:id/approve", requireStaff, sameOrigin, (req, res) => {
	const request = listRequests().find((r) => r.id === req.params.id);
	if (!request) return res.redirect(303, "/admin/requests?error=notfound");
	if (getUser(request.username)?.role === "creator" && req.user.role !== "creator") {
		return res.redirect(303, "/admin/requests?error=forbidden");
	}
	const result = resolveRequest(request.id, "approved", req.user.username);
	if (result.error) return res.redirect(303, "/admin/requests?error=notfound");
	addUnblockOverride(request.username, request.host);
	closeUserConnections(request.username);
	audit(req, "request.approve", request.username, request.host);
	res.redirect(303, "/admin/requests?status=pending");
});

app.post("/api/admin/requests/:id/deny", requireStaff, sameOrigin, (req, res) => {
	const request = listRequests().find((r) => r.id === req.params.id);
	if (!request) return res.redirect(303, "/admin/requests?error=notfound");
	if (getUser(request.username)?.role === "creator" && req.user.role !== "creator") {
		return res.redirect(303, "/admin/requests?error=forbidden");
	}
	resolveRequest(request.id, "denied", req.user.username);
	audit(req, "request.deny", request.username, request.host);
	res.redirect(303, "/admin/requests?status=pending");
});

app.get("/admin/sessions", requireStaff, (req, res) => {
	const users = listUsers().filter(
		(u) => req.user.role === "creator" || u.role !== "creator",
	);
	const wanted = String(req.query.user || "");
	const filter = users.some(
		(u) => u.username.toLowerCase() === wanted.toLowerCase(),
	)
		? wanted
		: "";
	const sessions = hideCreatorData(req, listSessions(), (s) => s.username).filter(
		(s) => !filter || s.username.toLowerCase() === filter.toLowerCase(),
	);
	const notice =
		req.query.ok === "revoked"
			? "Sesión cerrada."
			: req.query.ok === "logout"
				? "Sesiones del usuario cerradas."
				: "";
	const error = ADMIN_ERRORS[req.query.error] || "";
	res.set("Cache-Control", "no-store");
	res.type("html").send(
		sessionsPage({ user: req.user, users, sessions, filter, currentId: req.user.id, notice, error }),
	);
});

app.post("/api/admin/sessions/:id/revoke", requireStaff, sameOrigin, (req, res) => {
	const info = listSessions().find((s) => s.id === req.params.id);
	if (!info) return res.redirect(303, "/admin/sessions?error=notfound");
	const targetUser = getUser(info.username);
	if (targetUser?.role === "creator") {
		return res.redirect(303, "/admin/sessions?error=forbidden");
	}
	if (targetUser?.role === "admin" && !isAdminRole(req.user.role)) {
		return res.redirect(303, "/admin/sessions?error=forbidden");
	}
	const session = revokeSessionById(req.params.id);
	if (!session) return res.redirect(303, "/admin/sessions?error=notfound");
	audit(req, "session.revoke", session.username, `sesión ${session.id}`);
	closeSessionConnections(session.id);
	if (req.params.id === req.user.id) {
		res.setHeader("Set-Cookie", clearSessionCookie(req));
		return res.redirect(303, "/login");
	}
	res.redirect(303, "/admin/sessions?ok=revoked");
});

app.get("/admin/activity", requireStaff, (req, res) => {
	const users = listUsers().filter(
		(u) => req.user.role === "creator" || u.role !== "creator",
	);
	const wanted = String(req.query.user || "");
	const filter = users.some(
		(u) => u.username.toLowerCase() === wanted.toLowerCase(),
	)
		? wanted
		: "";
	const notice = req.query.ok === "cleared" ? "Historial vaciado." : "";
	const settings = getSettings();
	const counts = activityCounts();
	if (req.user.role !== "creator") {
		const creators = creatorNameSet();
		for (const username of Object.keys(counts)) {
			if (creators.has(username.toLowerCase())) delete counts[username];
		}
	}
	res.set("Cache-Control", "no-store");
	res.type("html").send(
		activityPage({
			user: req.user,
			users,
			counts,
			activity: hideCreatorData(
				req,
				getActivity({ username: filter, limit: 500 }),
				(e) => e.username,
			),
			filter,
			notice,
			retention: settings.activityPerUser,
			activityEnabled: settings.activityEnabled,
			canManage: isAdminRole(req.user.role),
		}),
	);
});

app.post("/api/admin/activity/clear", requireAdmin, sameOrigin, (req, res) => {
	const wanted = String(req.body.user || "").trim();
	const target = wanted ? getUser(wanted) : null;
	if (target?.role === "creator" && req.user.role !== "creator") {
		return res.redirect(303, "/admin/activity?error=forbidden");
	}
	if (target) {
		clearActivity(target.username);
	} else if (req.user.role === "creator") {
		clearActivity();
	} else {
		clearActivityExcept([...creatorNameSet()]);
	}
	audit(req, "activity.clear", target ? target.username : "", target ? "historial del usuario" : "todo el historial");
	const suffix = target ? `&user=${encodeURIComponent(target.username)}` : "";
	res.redirect(303, `/admin/activity?ok=cleared${suffix}`);
});

app.get("/admin/activity.csv", requireAdmin, sameSiteRequest, (req, res) => {
	const wanted = String(req.query.user || "").trim();
	const target = wanted ? getUser(wanted) : null;
	if (target?.role === "creator" && req.user.role !== "creator") {
		return res.status(403).type("text/plain").send("No autorizado.");
	}
	const rows = hideCreatorData(
		req,
		getActivity({
			username: target ? target.username : "",
			limit: 10000,
		}),
		(e) => e.username,
	);
	const csvEscape = (value) => {
		let text = String(value ?? "");
		if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
		return `"${text.replaceAll('"', '""')}"`;
	};
	const lines = ["fecha,usuario,busqueda,url"];
	for (const entry of rows) {
		lines.push(
			[entry.at, entry.username, entry.query, entry.url]
				.map(csvEscape)
				.join(","),
		);
	}
	audit(req, "activity.export", target ? target.username : "", "CSV");
	res.setHeader("Content-Type", "text/csv; charset=utf-8");
	res.setHeader(
		"Content-Disposition",
		`attachment; filename="actividad-${new Date().toISOString().slice(0, 10)}.csv"`,
	);
	res.send(lines.join("\n"));
});

app.post("/api/admin/quarantine", requireAdmin, sameOrigin, (req, res) => {
	const enabled = String(req.body.enabled) === "1";
	const result = saveSettings({
		quarantineMode: enabled,
		quarantineMessage: req.body.message,
	});
	if (result.error) return res.status(400).type("text/plain").send(result.error);
	if (enabled) closeNonAdminConnections();
	audit(req, enabled ? "quarantine.enable" : "quarantine.disable");
	const next = safeNext(req.body.next || "/admin");
	res.redirect(303, next);
});

app.get("/admin/stats", requireStaff, (req, res) => {
	const activity = hideCreatorData(req, exportActivity(), (e) => e.username);
	const hostCounts = new Map();
	const userCounts = new Map();
	for (const entry of activity) {
		if (entry.username) userCounts.set(entry.username, (userCounts.get(entry.username) || 0) + 1);
		if (!entry.url) continue;
		try {
			const host = new URL(entry.url).hostname;
			hostCounts.set(host, (hostCounts.get(host) || 0) + 1);
		} catch {}
	}
	const topHosts = [...hostCounts.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, 10);
	const byUser = [...userCounts.entries()].sort((a, b) => b[1] - a[1]);
	const failCounts = new Map();
	for (const event of hideCreatorData(req, exportAudit(), (e) => e.actor)) {
		if (!["login.fail", "login.rate", "login.blocked", "login.quarantine"].includes(event.action)) continue;
		failCounts.set(event.actor, (failCounts.get(event.actor) || 0) + 1);
	}
	const failed = [...failCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
	res.set("Cache-Control", "no-store");
	res.type("html").send(
		statsPage({
			user: req.user,
			topHosts,
			byUser,
			failed,
			categories: categoryStats(),
		}),
	);
});

app.get("/admin/settings", requireAdmin, (req, res) => {
	const notice = ADMIN_OK[req.query.ok] || "";
	const error = req.query.error ? String(req.query.error) : "";
	res.set("Cache-Control", "no-store");
	res.type("html").send(
		settingsPage({ user: req.user, settings: getSettings(), notice, error }),
	);
});

app.post("/api/admin/settings", requireAdmin, sameOrigin, async (req, res) => {
	const arr = (value) => (Array.isArray(value) ? value : value ? [value] : []);
	const labels = arr(req.body.linkLabel);
	const urls = arr(req.body.linkUrl);
	const icons = arr(req.body.linkIcon);
	const quickLinks = labels
		.map((label, i) => ({
			label,
			url: urls[i] || "",
			icon: icons[i] || "",
		}))
		.filter((link) => String(link.label).trim() || String(link.url).trim());

	const wasMaintenance = getSettings().maintenanceMode;
	const wasQuarantine = getSettings().quarantineMode;
	const oldCategories = JSON.stringify(getSettings().categories || []);
	const oldBlocked = JSON.stringify({
		mode: getSettings().accessMode,
		blocked: getSettings().blockedSites || [],
		allowed: getSettings().allowedSites || [],
	});
	const payload = {
		sessionHours: req.body.sessionHours,
		maxSessionsPerUser: req.body.maxSessionsPerUser,
		sessionIdleHours: req.body.sessionIdleHours,
		maxLoginAttempts: req.body.maxLoginAttempts,
		loginAttemptsPerMinute: req.body.loginAttemptsPerMinute,
		lockoutMinutes: req.body.lockoutMinutes,
		activityEnabled: req.body.activityEnabled === "on",
		activityPerUser: req.body.activityPerUser,
		activityTotal: req.body.activityTotal,
		chatEnabled: req.body.chatEnabled === "on",
		chatShowOnline: req.body.chatShowOnline === "on",
		chatAllowUserDelete: req.body.chatAllowUserDelete === "on",
		chatTitle: req.body.chatTitle,
		chatWelcome: req.body.chatWelcome,
		chatMaxLength: req.body.chatMaxLength,
		chatMaxMessages: req.body.chatMaxMessages,
		chatRetentionDays: req.body.chatRetentionDays,
		chatSlowModeSeconds: req.body.chatSlowModeSeconds,
		chatMaxPerMinute: req.body.chatMaxPerMinute,
		maintenanceMode: req.body.maintenanceMode === "on",
		maintenanceMessage: req.body.maintenanceMessage,
		quarantineMode: req.body.quarantineMode === "on",
		quarantineMessage: req.body.quarantineMessage,
		defaultSearchEngine: req.body.defaultSearchEngine,
		landingTitle: req.body.landingTitle,
		landingSubtitle: req.body.landingSubtitle,
		quickLinks,
		allowUserPasswordChange: req.body.allowUserPasswordChange === "on",
		blockedSites: req.body.blockedSites,
		allowedSites: req.body.allowedSites,
		accessMode: req.body.accessMode,
		categories: req.body.categories
			? Array.isArray(req.body.categories)
				? req.body.categories
				: [req.body.categories]
			: [],
		defaultBlockMessage: req.body.defaultBlockMessage,
		allowlistMessage: req.body.allowlistMessage,
		categoryMessages: {
			adult: req.body.categoryMessageAdult,
			gambling: req.body.categoryMessageGambling,
			social: req.body.categoryMessageSocial,
		},
		language: req.body.language,
		timezone: req.body.timezone,
		backupEnabled: req.body.backupEnabled === "on",
		backupRetentionDays: req.body.backupRetentionDays,
		metricsToken: req.body.metricsToken,
		allowUserHistoryClear: req.body.allowUserHistoryClear === "on",
		revision: req.body.revision,
	};
	const result = saveSettings(payload);
	if (result.error) {
		return res.status(result.stale ? 409 : 400).type("html").send(
			settingsPage({
				user: req.user,
				settings: getSettings(),
				error: result.stale
					? "Los ajustes han cambiado en otra pestaña. Se muestran los valores actuales; revisa y vuelve a guardar."
					: result.error,
			}),
		);
	}
	if (result.settings?.maintenanceMode && !wasMaintenance) {
		closeNonAdminConnections();
	}
	if (result.settings?.quarantineMode && !wasQuarantine) {
		closeNonAdminConnections();
	}
	applyWispBlocklist();
	const newBlocked = JSON.stringify({
		mode: result.settings?.accessMode,
		blocked: result.settings?.blockedSites || [],
		allowed: result.settings?.allowedSites || [],
	});
	if (newBlocked !== oldBlocked) {
		closeNonAdminConnections();
	}
	if ((result.settings?.categories || []).length) {
		await refreshCategories(false);
	}
	if (JSON.stringify(result.settings?.categories || []) !== oldCategories) {
		closeNonAdminConnections();
	}
	trimActivity();
	audit(req, "settings.save");
	res.redirect(303, "/admin/settings?ok=saved");
});

app.post("/api/admin/settings/reset", requireAdmin, sameOrigin, (req, res) => {
	const oldBlocked = JSON.stringify({
		mode: getSettings().accessMode,
		blocked: getSettings().blockedSites || [],
		allowed: getSettings().allowedSites || [],
	});
	resetSettings();
	applyWispBlocklist();
	const newBlocked = JSON.stringify({
		mode: getSettings().accessMode,
		blocked: getSettings().blockedSites || [],
		allowed: getSettings().allowedSites || [],
	});
	if (newBlocked !== oldBlocked) {
		closeNonAdminConnections();
	}
	trimActivity();
	audit(req, "settings.reset");
	res.redirect(303, "/admin/settings?ok=reset_settings");
});

app.post("/api/admin/categories/refresh", requireAdmin, sameOrigin, async (req, res) => {
	await refreshCategories(true);
	closeNonAdminConnections();
	audit(req, "categories.refresh");
	res.redirect(303, "/admin/settings?ok=categories");
});

app.post("/api/admin/chat/clear", requireAdmin, sameOrigin, (req, res) => {
	clearChat();
	audit(req, "chat.clear");
	res.redirect(303, "/admin/settings?ok=chat_cleared");
});

app.get("/admin/audit", requireStaff, (req, res) => {
	const hidden = req.user.role === "creator" ? [] : [...creatorNameSet()];
	const filters = {
		actor: String(req.query.actor || ""),
		action: String(req.query.action || ""),
		limit: 300,
		excludeActors: hidden,
		excludeTargets: hidden,
	};
	res.set("Cache-Control", "no-store");
	res.type("html").send(
		auditPage({
			user: req.user,
			events: listAudit(filters),
			users: listUsers().filter(
				(u) => req.user.role === "creator" || u.role !== "creator",
			),
			actions: auditActions(),
			filters,
			canManage: isAdminRole(req.user.role),
			notice: req.query.ok === "cleared" ? "Auditoría vaciada." : "",
		}),
	);
});

app.get("/admin/audit.csv", requireAdmin, (req, res) => {
	const hidden = req.user.role === "creator" ? [] : [...creatorNameSet()];
	const filters = {
		actor: String(req.query.actor || ""),
		action: String(req.query.action || ""),
		excludeActors: hidden,
		excludeTargets: hidden,
	};
	audit(req, "audit.export", "", JSON.stringify(filters));
	res.setHeader("Content-Type", "text/csv; charset=utf-8");
	res.setHeader(
		"Content-Disposition",
		`attachment; filename="auditoria-${new Date().toISOString().slice(0, 10)}.csv"`,
	);
	res.send(auditToCsv(filters));
});

app.post("/api/admin/audit/clear", requireAdmin, sameOrigin, (req, res) => {
	clearAudit();
	audit(req, "audit.clear");
	res.redirect(303, "/admin/audit?ok=cleared");
});

async function serviceState(name) {
	try {
		const { stdout } = await execFileAsync("systemctl", ["is-active", name], {
			timeout: 4000,
		});
		return stdout.trim() || "desconocido";
	} catch (err) {
		return String(err.stdout || "").trim() || "desconocido";
	}
}

app.get("/admin/system", requireAdmin, async (req, res) => {
	let disk = { total: 0, used: 0, free: 0 };
	try {
		const stat = fs.statfsSync("/");
		const total = stat.blocks * stat.bsize;
		const free = stat.bfree * stat.bsize;
		disk = { total, used: total - free, free };
	} catch {}
	let funnel = { ok: false, output: "" };
	try {
		const { stdout } = await execFileAsync(
			"/usr/bin/tailscale",
			["funnel", "status"],
			{ timeout: 5000 },
		);
		funnel = { ok: true, output: stdout.trim() };
	} catch (err) {
		funnel = { ok: false, output: String(err.stdout || err.message || "").trim() };
	}
	const stats = {
		uptime: process.uptime(),
		load: os.loadavg(),
		memTotal: os.totalmem(),
		memFree: os.freemem(),
		procRss: process.memoryUsage().rss,
		disk,
		node: process.version,
		version: VERSION,
	};
	const services = {
		webproxy: await serviceState("webproxy"),
		apache2: await serviceState("apache2"),
	};
	const counts = {
		users: listUsers().length,
		sessions: sessionCount(),
		activity: exportActivity().length,
		audit: auditCount(),
	};
	const url = `${req.protocol}://${req.headers.host}/`;
	res.set("Cache-Control", "no-store");
	res.type("html").send(
		systemPage({
			user: req.user,
			stats,
			services,
			funnel,
			counts,
			url,
			backups: listBackups(),
		}),
	);
});

app.post("/api/admin/backup/download", requireAdmin, sameOrigin, async (req, res) => {
	const name = String(req.body.name || "");
	const password = String(req.body.password || "");
	if (!(await verifyUserPassword(req.user.username, password))) {
		return res.status(403).type("text/plain").send("Contraseña incorrecta.");
	}
	const full = backupPath(name);
	if (!full) return res.status(404).type("text/plain").send("Copia no encontrada.");
	audit(req, "backup.download", path.basename(full));
	res.download(full, path.basename(full));
});

app.post("/api/admin/backup/create", requireAdmin, sameOrigin, (req, res) => {
	const info = createBackup("manual");
	audit(req, "backup.create", info.name);
	res.redirect(303, "/admin/system?ok=backup");
});

app.post("/api/admin/backup/restore", requireAdmin, sameOrigin, async (req, res) => {
	const name = String(req.body.name || "");
	const password = String(req.body.password || "");
	const confirm = String(req.body.confirm || "");
	if (confirm !== "RESTAURAR") {
		return res.status(400).type("html").send("Confirmación incorrecta. Escribe RESTAURAR.");
	}
	if (!(await verifyUserPassword(req.user.username, password))) {
		return res.status(403).type("html").send("Contraseña incorrecta.");
	}
	const result = restoreBackup(name);
	if (result.error) return res.status(400).type("html").send("Copia no válida o inexistente.");
	audit(req, "backup.restore", name);
	res
		.status(200)
		.type("html")
		.send("Copia restaurada. Reiniciando el servicio para aplicar los datos…");
	setTimeout(() => process.exit(0), 800);
});

app.post("/api/admin/users", requireAdmin, sameOrigin, (req, res) => {
	const role = String(req.body.role || "");
	if (req.user.role !== "creator" && !canAssignRole(req.user.role, role)) {
		return res.redirect(303, "/admin?error=forbidden");
	}
	const result = createUser(
		req.body.username,
		String(req.body.password || ""),
		role,
	);
	if (result.error) return res.redirect(303, `/admin?error=${result.error}`);
	audit(req, "user.create", result.user.username, `rol: ${result.user.role}`);
	res.redirect(303, "/admin?ok=created");
});

app.post("/api/admin/users/:username/password", requireAdmin, sameOrigin, (req, res) => {
	const target = req.params.username;
	const targetUser = getUser(target);
	if (!targetUser) return res.redirect(303, "/admin?error=notfound");
	const result = setPassword(target, String(req.body.password || ""));
	if (result.error) return res.redirect(303, `/admin?error=${result.error}`);
	audit(req, "user.password", targetUser.username);
	if (targetUser.username.toLowerCase() === req.user.username.toLowerCase()) {
		const revoked = destroyOtherSessions(req.user.username, req.user.token);
		for (const id of revoked) closeSessionConnections(id);
	} else {
		destroySessionsOf(targetUser.username);
		closeUserConnections(targetUser.username);
	}
	res.redirect(303, "/admin?ok=reset");
});

app.post("/api/admin/users/:username/role", requireAdmin, sameOrigin, (req, res) => {
	const target = req.params.username;
	const role = String(req.body.role || "");
	if (req.user.role !== "creator" && !canAssignRole(req.user.role, role)) {
		return res.redirect(303, "/admin?error=forbidden");
	}
	if (
		target.toLowerCase() === req.user.username.toLowerCase() &&
		!isAdminRole(role)
	) {
		return res.redirect(303, "/admin?error=self");
	}
	const result = setRole(target, role);
	if (result.error) return res.redirect(303, `/admin?error=${result.error}`);
	audit(req, "user.role", target, `rol: ${role}`);
	res.redirect(303, "/admin?ok=role");
});

app.post("/api/admin/users/:username/block", requireStaff, sameOrigin, (req, res) => {
	const target = getUser(req.params.username);
	if (!target) return res.redirect(303, "/admin?error=notfound");
	if (target.role === "admin" && !isAdminRole(req.user.role)) {
		return res.redirect(303, "/admin?error=forbidden");
	}
	if (target.username.toLowerCase() === req.user.username.toLowerCase()) {
		return res.redirect(303, "/admin?error=self-block");
	}
	const blocked = String(req.body.blocked) === "1";
	const result = setBlocked(
		target.username,
		blocked,
		String(req.body.message || ""),
	);
	if (result.error) return res.redirect(303, `/admin?error=${result.error}`);
	if (blocked) closeUserConnections(target.username);
	audit(
		req,
		"user.block",
		target.username,
		blocked ? `permanente${req.body.message ? " + mensaje" : ""}` : "desbloqueado",
	);
	res.redirect(303, `/admin?ok=${blocked ? "blocked" : "unblocked"}`);
});

app.post("/api/admin/users/:username/block-until", requireStaff, sameOrigin, (req, res) => {
	const target = getUser(req.params.username);
	if (!target) return res.redirect(303, "/admin?error=notfound");
	if (target.role === "admin" && !isAdminRole(req.user.role)) {
		return res.redirect(303, "/admin?error=forbidden");
	}
	if (target.username.toLowerCase() === req.user.username.toLowerCase()) {
		return res.redirect(303, "/admin?error=self-block");
	}
	const until = String(req.body.until || "").trim();
	const result = setBlockUntil(
		target.username,
		until || null,
		String(req.body.message || ""),
	);
	if (result.error) return res.redirect(303, `/admin?error=${result.error}`);
	if (until) closeUserConnections(target.username);
	audit(req, "user.block_until", target.username, until || "retirado");
	res.redirect(303, `/admin?ok=${until ? "tempblocked" : "tempcleared"}`);
});

app.post("/api/admin/users/:username/notes", requireAdmin, sameOrigin, (req, res) => {
	const target = getUser(req.params.username);
	if (!target) return res.redirect(303, "/admin?error=notfound");
	const result = setNotes(target.username, String(req.body.notes || ""));
	if (result.error) return res.redirect(303, `/admin?error=${result.error}`);
	audit(req, "user.notes", target.username);
	res.redirect(303, "/admin?ok=notes");
});

app.post("/api/admin/users/:username/block-message", requireAdmin, sameOrigin, (req, res) => {
	const target = getUser(req.params.username);
	if (!target) return res.redirect(303, "/admin?error=notfound");
	const result = setBlockMessage(target.username, String(req.body.message || ""));
	if (result.error) return res.redirect(303, `/admin?error=${result.error}`);
	audit(req, "user.block_message", target.username);
	res.redirect(303, "/admin?ok=blockmessage");
});

app.post("/api/admin/users/:username/sites", requireAdmin, sameOrigin, (req, res) => {
	const target = getUser(req.params.username);
	if (!target) return res.redirect(303, "/admin?error=notfound");
	const result = setUserBlockedSites(target.username, String(req.body.sites || ""));
	if (result.error) return res.redirect(303, `/admin?error=${result.error}`);
	closeUserConnections(target.username);
	audit(req, "user.sites", target.username, `${result.blockedSites.length} sitios`);
	res.redirect(303, "/admin?ok=sites");
});

app.post("/api/admin/users/:username/schedule", requireAdmin, sameOrigin, (req, res) => {
	const target = getUser(req.params.username);
	if (!target) return res.redirect(303, "/admin?error=notfound");
	const enabled = String(req.body.enabled) === "1";
	const days = req.body.days === undefined
		? []
		: Array.isArray(req.body.days)
			? req.body.days
			: [req.body.days];
	const result = setUserSchedule(target.username, {
		enabled,
		days,
		start: String(req.body.start || ""),
		end: String(req.body.end || ""),
	});
	if (result.error) return res.redirect(303, `/admin?error=${result.error}`);
	closeUserConnections(target.username);
	audit(req, "user.schedule", target.username, enabled ? `${result.schedule.start}-${result.schedule.end}` : "desactivado");
	res.redirect(303, "/admin?ok=schedule");
});

app.post("/api/admin/users/:username/must-change", requireAdmin, sameOrigin, (req, res) => {
	const target = getUser(req.params.username);
	if (!target) return res.redirect(303, "/admin?error=notfound");
	const value = String(req.body.value) === "1";
	const result = setMustChangePassword(target.username, value);
	if (result.error) return res.redirect(303, `/admin?error=${result.error}`);
	if (value) closeUserConnections(target.username);
	audit(req, "user.must_change", target.username, value ? "activado" : "desactivado");
	res.redirect(303, `/admin?ok=${value ? "mustchange" : "mustchange_off"}`);
});

app.post("/api/admin/users/:username/logout", requireStaff, sameOrigin, (req, res) => {
	const target = getUser(req.params.username);
	if (!target) return res.redirect(303, "/admin?error=notfound");
	if (target.role === "admin" && !isAdminRole(req.user.role)) {
		return res.redirect(303, "/admin?error=forbidden");
	}
	if (target.username.toLowerCase() === req.user.username.toLowerCase()) {
		return res.redirect(303, "/admin?error=self-logout");
	}
	const count = revokeUserSessions(target.username);
	closeUserConnections(target.username);
	audit(req, "user.logout", target.username, `${count} sesiones`);
	res.redirect(303, "/admin?ok=logout");
});

app.post("/api/admin/users/:username/delete", requireAdmin, sameOrigin, (req, res) => {
	const target = req.params.username;
	if (target.toLowerCase() === req.user.username.toLowerCase()) {
		return res.redirect(303, "/admin?error=self");
	}
	const result = deleteUser(target);
	if (result.error) return res.redirect(303, `/admin?error=${result.error}`);
	deleteUserBookmarks(target);
	deleteChatMessagesByUser(target);
	closeUserConnections(target);
	audit(req, "user.delete", target);
	res.redirect(303, "/admin?ok=deleted");
});

/* -------------------------- Scramjet y estáticos -------------------------- */

app.use(
	"/scramjet",
	express.static(nm("scramjet", "dist"), { maxAge: "1h", immutable: true }),
);
app.use(
	"/controller",
	express.static(nm("scramjet-controller", "dist"), { maxAge: "1h", immutable: true }),
);
app.use(
	"/libcurl",
	express.static(nm("libcurl-transport", "dist"), { maxAge: "1h", immutable: true }),
);
app.get("/scramjet-utils.js", (req, res) => {
	res.type("application/javascript").sendFile(nm("scramjet-utils", "dist/scramjet-utils.js"));
});

app.get("/sw.js", (req, res) => {
	res.set("Cache-Control", "no-store, no-cache, must-revalidate");
	res.set("Service-Worker-Allowed", "/");
	res.type("application/javascript").sendFile(path.join(__dirname, "sw.js"));
});

app.use(express.static(path.join(__dirname, "public")));

app.use((req, res) => {
	sendHttpError(req, res, 404, "Página no encontrada", "La dirección no existe o se ha movido.");
});

app.use((err, req, res, next) => {
	console.error("HTTP error:", err?.message || err);
	const status =
		err?.type === "entity.too.large"
			? 413
			: Number(err?.status || err?.statusCode) || 500;
	sendHttpError(
		req,
		res,
		status,
		status === 413 ? "Contenido demasiado grande" : "",
		status === 413 ? "El contenido enviado supera el límite permitido." : "",
	);
});

/* --------------------------------- servidor --------------------------------- */

const server = http.createServer(app);

let lastBackupDay = "";
function scheduledBackup() {
	const settings = getSettings();
	if (!settings.backupEnabled) return;
	const now = new Date();
	if (now.getHours() !== 3) return;
	const day = now.toISOString().slice(0, 10);
	if (lastBackupDay === day) return;
	lastBackupDay = day;
	try {
		createBackup("scheduled");
	} catch (err) {
		console.error("No se pudo crear la copia automática:", err.message);
	}
}
pruneBackups();
setInterval(scheduledBackup, 60 * 60 * 1000).unref();

setInterval(() => {
	const active = new Set(listSessions().map((s) => s.id));
	const tz = getSettings().timezone;
	for (const [id, set] of wispConnections) {
		if (!active.has(id)) {
			closeSessionConnections(id);
			continue;
		}
		let close = false;
		for (const entry of set) {
			const user = getUser(entry.username);
			if (user && !isAdminRole(user.role) && !isWithinSchedule(user, tz)) {
				close = true;
			}
		}
		if (close) closeSessionConnections(id);
	}
}, 60_000).unref();

function shutdown() {
	flushActivity();
	flushAudit();
	flushSessions();
	flushAttempts();
	flushChat();
	flushFriends();
	flushPanic();
	flushSecurity();
	process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

server.on("upgrade", (req, socket, head) => {
	req.ip = clientIp(req);
	if (!req.url || !req.url.startsWith("/wisp/")) {
		socket.destroy();
		return;
	}
	const origin = req.headers.origin;
	if (!origin) {
		socket.destroy();
		return;
	}
	try {
		if (new URL(origin).host !== req.headers.host) {
			socket.destroy();
			return;
		}
	} catch {
		socket.destroy();
		return;
	}
	const session = getSession(req);
	const settings = getSettings();
	const currentUser = session ? getUser(session.username) : null;
	if (
		!session ||
		(settings.quarantineMode && !isAdminRole(session.role)) ||
		(settings.maintenanceMode && !isAdminRole(session.role)) ||
		session.mustChangePassword ||
		(!isAdminRole(session.role) &&
			!isWithinSchedule(currentUser, settings.timezone))
	) {
		if (settings.quarantineMode) {
			if (session) {
				recordQuarantineAttempt(
					req,
					session,
					"wisp",
					"Conexión WebSocket Wisp rechazada",
				);
			} else {
				metric("quarantine_rejected_total");
			}
		}
		socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
		socket.destroy();
		return;
	}
	trackWisp(session.id, session.username, socket);
	metric("wisp_connections_total");
	wisp.routeRequest(req, socket, head, {
		username: session.username,
		isAdmin: () => isAdminRole(getUser(session.username)?.role),
		isHostBlocked: (hostname) => {
			const user = getUser(session.username);
			return checkHostPolicy(user, hostname).blocked;
		},
	});
});

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT) || 3030;
server.listen(PORT, HOST, () => {
	console.log(`Proxy web escuchando en http://${HOST}:${PORT}`);
});
