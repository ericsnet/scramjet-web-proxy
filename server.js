import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import net from "node:net";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import express from "express";
import { server as wisp, logging as wispLogging, packet as wispPacket } from "@mercuryworkshop/wisp-js/server";

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
	setRoles,
	setBlocked,
	setBlockUntil,
	setBlockMessage,
	setUserGroup,
	setUserGroupRules,
	markGroupOnboarded,
	clearGroupAssignments,
	setNotes,
	setMustChangePassword,
	clearMfa,
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
	clearIpFailures,
	clearAccountIpFailures,
	recordIpFailure,
	recordAccountIpFailure,
	flushSessions,
	flushAttempts,
} from "./auth.js";
import {
	loginPage,
	mfaPage,
	mfaSetupPage,
	mfaRecoveryPage,
	accountPage,
	errorPage,
	adminPage,
	overviewPage,
	activityPage,
	sessionsPage,
	securityPage,
	securityAlertPage,
	trafficPage,
	monitorPage,
	settingsPage,
	auditPage,
	systemPage,
	adminLogsPage,
	reportsPage,
	adminReportDetailPage,
	vaultPage,
	adminReportsPage,
	groupOnboardingPage,
	groupPanelPage,
	specialistWorkspacePage,
	templatesPage,
	schedulesPage,
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
	getActivityById,
	deleteActivity,
	deleteActivityRange,
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
	verifyAudit,
	auditCount,
	exportAudit,
	clearQuarantineAttempts,
	flushAudit,
} from "./audit.js";
import { getSettings, saveSettings, resetSettings } from "./settings.js";
import { listTemplates, addTemplate, deleteTemplate } from "./templates.js";
import { listSchedules, addSchedule, deleteSchedule, activeJob } from "./schedules.js";
import {
	getVault,
	initVault,
	saveEntry as saveVaultEntry,
	deleteEntry as deleteVaultEntry,
	resetVault,
	deleteVault,
} from "./vault.js";
import {
	listReports,
	createReport,
	getReport,
	updateReport,
	deleteReport,
	countOpenReports,
} from "./reports.js";
import {
	mfaStatus,
	enrollmentInfo,
	startEnrollment,
	confirmEnrollment,
	disableMfa,
	verifySecondFactor,
	regenerateRecoveryCodes,
	isMfaEnabled,
} from "./mfa.js";
import {
	listBookmarks,
	addBookmark,
	updateBookmark,
	deleteBookmark,
	deleteUserBookmarks,
	exportBookmarks,
} from "./bookmarks.js";
import {
	listGroups,
	getGroup,
	createGroup,
	updateGroupRules,
	deleteGroup,
} from "./groups.js";
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
import { isAdHost } from "./adblock.js";
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
import {
	isAdminRole,
	isStaffRole,
	isSpecialistRole,
	isReportsRole,
	hasAnyRole,
	normalizeRoleList,
	highestRole,
	canManageRole,
	canAssignRole,
	SPECIALIST_ROLES,
} from "./roles.js";
import {
	securityMiddleware,
	securitySummary,
	listSecurityAlerts,
	listBans,
	banTarget,
	unbanTarget,
	isUserBanned,
	isDeviceBannedFor,
	dismissAlert,
	loginSeenBefore,
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
	listChatPinned,
	searchChat,
	editChatMessage,
	pinChatMessage,
	createGroupChannel,
	syncClassChannels,
	getOrCreateDmChannel,
	saveChatUpload,
	getChatAttachment,
	getChatAttachmentMessage,
	isChannelMember,
	getChatMessage,
	getChatUnread,
	listChatNotifications,
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

const WISP_LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3, none: 4 };
wispLogging.set_level(
	WISP_LOG_LEVELS[String(process.env.WISP_LOG_LEVEL || "error").toLowerCase()] ?? 3,
);
const execFileAsync = promisify(execFile);

const app = express();
app.set("trust proxy", "loopback");
app.disable("x-powered-by");
app.use(express.urlencoded({ extended: false, limit: "64kb" }));
app.use(express.json({ limit: "64kb" }));
app.use((req, res, next) => {
	const host = hostName(req);
	if (
		req.path === "/healthz" &&
		["localhost", "127.0.0.1", "[::1]"].includes(host) &&
		!req.headers["x-forwarded-for"] &&
		!req.headers["forwarded"]
	) {
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

const wispUserConnections = new Map();
const wispUserStreams = new Map();
const wispBuckets = new Map();

function wispUserKey(username) {
	return String(username || "anónimo").toLowerCase().slice(0, 64);
}

function effectiveWispLimits(username) {
	const user = getUser(username);
	const group = groupRulesForUser(user);
	const rules = group?.rules || {};
	const settings = getSettings();
	const choose = (override, fallback, min, max) => {
		const value = Number(override) || 0;
		if (!value) return fallback;
		return Math.min(max, Math.max(min, value));
	};
	return {
		bandwidthKbps: choose(
			rules.bandwidthKbps,
			Math.max(0, Number(settings.proxyBandwidthPerUserKbps) || 0),
			256,
			100000,
		),
		maxStreams: choose(
			rules.maxStreams,
			Math.max(8, Number(settings.proxyMaxStreamsPerUser) || 64),
			8,
			128,
		),
		maxConnections: choose(
			rules.maxConnections,
			Math.max(1, Number(settings.proxyMaxConnectionsPerUser) || 6),
			1,
			10,
		),
	};
}

function wispConnectionLimit(username) {
	const max = effectiveWispLimits(username).maxConnections;
	const key = wispUserKey(username);
	return { allowed: (wispUserConnections.get(key) || 0) < max, key, max };
}

function wispStreamLimit(username) {
	const max = effectiveWispLimits(username).maxStreams;
	const key = wispUserKey(username);
	return { allowed: (wispUserStreams.get(key) || 0) < max, key, max };
}

function wispStreamAdd(key) {
	wispUserStreams.set(key, (wispUserStreams.get(key) || 0) + 1);
}

function wispStreamRemove(key) {
	const next = (wispUserStreams.get(key) || 0) - 1;
	if (next > 0) wispUserStreams.set(key, next);
	else wispUserStreams.delete(key);
}

async function throttleWisp(username, bytes, bandwidthKbps = 0) {
	const kbps = Math.max(0, Number(bandwidthKbps) || 0);
	const amount = Math.max(0, Number(bytes) || 0);
	if (!kbps || !amount) return;
	const rate = kbps * 125; // Kbps -> bytes/s
	const burst = Math.max(64 * 1024, rate);
	const key = wispUserKey(username);
	let bucket = wispBuckets.get(key);
	if (!bucket) {
		bucket = { tokens: burst, last: Date.now(), chain: Promise.resolve() };
		wispBuckets.set(key, bucket);
	}
	const task = bucket.chain.then(async () => {
		const now = Date.now();
		const elapsed = Math.max(0, now - bucket.last) / 1000;
		bucket.tokens = Math.min(burst, bucket.tokens + elapsed * rate);
		bucket.last = now;
		if (bucket.tokens >= amount) {
			bucket.tokens -= amount;
			return;
		}
		const waitMs = Math.ceil(((amount - bucket.tokens) / rate) * 1000);
		bucket.tokens = 0;
		bucket.last = now + waitMs;
		await new Promise((resolve) => setTimeout(resolve, waitMs));
	});
	bucket.chain = task.catch(() => {});
	await task;
}

function patchWispStream(stream, limits = null) {
	const socket = stream?.socket;
	if (!socket || socket.__wispRatePatched) return;
	socket.__wispRatePatched = true;
	const username = stream.conn?.username;
	const bandwidthKbps = limits?.bandwidthKbps || 0;
	const recv = typeof socket.recv === "function" ? socket.recv.bind(socket) : null;
	const send = typeof socket.send === "function" ? socket.send.bind(socket) : null;
	if (recv) {
		socket.recv = async (...args) => {
			const data = await recv(...args);
			const bytes = data?.length || data?.byteLength || 0;
			if (bytes) await throttleWisp(username, bytes, bandwidthKbps);
			return data;
		};
	}
	if (send) {
		socket.send = async (data) => {
			const bytes = data?.length || data?.byteLength || 0;
			if (bytes) await throttleWisp(username, bytes, bandwidthKbps);
			return send(data);
		};
	}
}

function instrumentWispTraffic() {
	if (!wisp.ServerConnection?.prototype || !wisp.ServerStream?.prototype) return;
	const connection = wisp.ServerConnection.prototype;
	const stream = wisp.ServerStream.prototype;
	if (connection.__trafficPatched) return;
	connection.__trafficPatched = true;
	const setupConnection = connection.setup;
	connection.setup = function (...args) {
		if (this.ws) {
			const mb = Math.max(
				1,
				Math.min(32, Number(getSettings().proxyWispBufferMB) || 4),
			);
			this.ws.send_buffer_size = mb * 1024 * 1024;
		}
		return setupConnection.apply(this, args);
	};
	const createStream = connection.create_stream;
	connection.create_stream = function (streamId, type, hostname, port) {
		const limits = effectiveWispLimits(this.username);
		const limit = wispStreamLimit(this.username);
		if (!limit.allowed) {
			metric("wisp_streams_throttled_total");
			try {
				this.send_close_packet(streamId, wispPacket.close_reasons.ConnThrottled);
			} catch {}
			return;
		}
		wispStreamAdd(limit.key);
		let result;
		try {
			result = createStream.apply(this, arguments);
		} catch (error) {
			wispStreamRemove(limit.key);
			throw error;
		}
		if (!result) {
			wispStreamRemove(limit.key);
			return result;
		}
		try {
			wispOpen(this, streamId, type, hostname, port);
		} catch {}
		patchWispStream(result, limits);
		return result;
	};
	const closeStream = connection.close_stream;
	connection.close_stream = function (streamId) {
		const key = wispUserKey(this.username);
		const existed = !!this.streams[streamId];
		const result = closeStream.apply(this, arguments);
		if (existed) {
			try {
				wispClose(this, streamId);
			} catch {}
			wispStreamRemove(key);
		}
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
wisp.options.allow_direct_ip = false;
wisp.options.allow_udp_streams = false;
wisp.options.stream_limit_total = 128;
wisp.options.stream_limit_per_host = 64;
wisp.options.dns_ttl = 600;
wisp.options.dns_cache_size = 8192;
wisp.options.port_blacklist = [
	[22, 22],
	[23, 23],
	[25, 25],
	[53, 53],
	[110, 110],
	[135, 135],
	[137, 139],
	[143, 143],
	[445, 445],
	[465, 465],
	[587, 587],
	[993, 993],
	[995, 995],
	[1433, 1433],
	[1521, 1521],
	[2049, 2049],
	[2375, 2375],
	[3306, 3306],
	[3389, 3389],
	[5432, 5432],
	[5900, 5900],
	[6379, 6379],
	[11211, 11211],
	[27017, 27017],
];
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
	if (isDeviceBannedFor(req._deviceId, session.username, clientIp(req))) {
		destroySession(session.token);
		const token = createBlockFlash(
			"Este dispositivo está bloqueado por seguridad. Contacta con un administrador.",
		);
		if (req.path.startsWith("/api/")) {
			return res.status(403).json({ error: "device_banned" });
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
		!isUserScheduleOpen(getUser(session.username), settings.timezone)
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

function requireCreator(req, res, next) {
	if (!req.user || req.user.role !== "creator") {
		return sendHttpError(req, res, 403, "Acceso restringido", "Solo el creador puede acceder a esta sección.");
	}
	next();
}

function requireStaff(req, res, next) {
	if (!req.user || !isStaffRole(req.user.role)) {
		return sendHttpError(req, res, 403, "Acceso restringido", "Solo administradores o moderadores.");
	}
	next();
}

function hasToolAccess(user, tool) {
	return !!user && (hasAnyRole(user.roles || user.role, ["creator"]) || hasAnyRole(user.roles || user.role, [tool]));
}

function requireTool(tool) {
	return (req, res, next) => {
		if (!hasToolAccess(req.user, tool)) {
			return sendHttpError(req, res, 403, "Acceso restringido", "No tienes acceso a esta herramienta.");
		}
		next();
	};
}

function requireReportsAccess(req, res, next) {
	if (!req.user || !isReportsRole(req.user.roles || req.user.role)) {
		return sendHttpError(req, res, 403, "Acceso restringido", "Solo diseño, pentest, QA y administración pueden ver los informes.");
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
	edit_window: "Ya no puedes editar este mensaje. Pídelo a un moderador.",
};

const FRIEND_ERRORS = {
	"invalid-user": "Usuario no válido.",
	"unavailable": "No se pudo completar la solicitud.",
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
		const seen = new Date(session.lastActiveAt || session.lastSeenAt).getTime();
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
			roles: entry.roles,
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
	const ownAndRecent =
		own && Date.now() - new Date(message.at).getTime() <= 15 * 60 * 1000;
	const moderator = isChatModerator(user);
	return {
		...message,
		role: entry.role || "user",
		roles: entry.roles || [entry.role || "user"],
		icon: entry.icon || null,
		canDelete:
			isAdminRole(user?.role) ||
			(!isStaffRole(user?.role) &&
				!!getSettings().chatAllowUserDelete &&
				own),
		canEdit: moderator || ownAndRecent,
		canPin: moderator,
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

const MFA_COOKIE = "__Host-pw_mfa";
const LEGACY_MFA_COOKIE = "pw_mfa";
const MFA_PENDING_MS = 10 * 60 * 1000;
const mfaPending = new Map();

function hashMfaToken(token) {
	return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function mfaCookie(req, token, maxAge = MFA_PENDING_MS / 1000) {
	const secure = !!req.secure;
	const name = secure ? MFA_COOKIE : LEGACY_MFA_COOKIE;
	return `${name}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

function clearMfaCookie(req) {
	const secure = !!req.secure;
	const suffix = secure ? "; Secure" : "";
	return [
		`${MFA_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${suffix}`,
		`${LEGACY_MFA_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${suffix}`,
	];
}

function createMfaPending(req, username, next) {
	const token = crypto.randomBytes(32).toString("hex");
	mfaPending.set(hashMfaToken(token), {
		username,
		next: safeNext(next),
		ip: clientIp(req),
		userAgent: clientUa(req),
		attempts: 0,
		expires: Date.now() + MFA_PENDING_MS,
	});
	return token;
}

function readMfaPending(req) {
	const cookies = {};
	for (const part of String(req.headers.cookie || "").split(";")) {
		const [key, ...rest] = part.trim().split("=");
		if (key) cookies[key] = rest.join("=");
	}
	const token = cookies[MFA_COOKIE] || cookies[LEGACY_MFA_COOKIE];
	if (!token) return null;
	const key = hashMfaToken(token);
	const entry = mfaPending.get(key);
	if (!entry) return null;
	if (entry.expires <= Date.now()) {
		mfaPending.delete(key);
		return null;
	}
	return { token, key, entry };
}

function destroyMfaPending(req) {
	const pending = readMfaPending(req);
	if (pending) mfaPending.delete(pending.key);
	return pending;
}

setInterval(() => {
	const now = Date.now();
	for (const [key, entry] of mfaPending) {
		if (entry.expires <= now) mfaPending.delete(key);
	}
}, 5 * 60 * 1000).unref();

/* ------------------------- conexiones Wisp activas ------------------------- */

const wispConnections = new Map(); // sessionId -> Set<{ username, socket }>
const chatUploadBuckets = new Map(); // username:ip -> [timestamps]
const chatTyping = new Map(); // channelId -> Map(lowerUsername -> { name, at })
const reportBuckets = new Map(); // username -> [timestamps]
const vaultBuckets = new Map(); // username -> [timestamps]

function allowVault(username) {
	const key = String(username || "").toLowerCase();
	const now = Date.now();
	const bucket = (vaultBuckets.get(key) || []).filter((at) => now - at < 60_000);
	if (bucket.length >= 120) {
		vaultBuckets.set(key, bucket);
		return false;
	}
	bucket.push(now);
	vaultBuckets.set(key, bucket);
	return true;
}

function allowReport(username) {
	const key = String(username || "").toLowerCase();
	const now = Date.now();
	const bucket = (reportBuckets.get(key) || []).filter((at) => now - at < 60 * 60 * 1000);
	if (bucket.length >= 10) {
		reportBuckets.set(key, bucket);
		return false;
	}
	bucket.push(now);
	reportBuckets.set(key, bucket);
	return true;
}

function noteChatTyping(channelId, username) {
	const key = String(channelId || "general");
	let map = chatTyping.get(key);
	if (!map) {
		map = new Map();
		chatTyping.set(key, map);
	}
	map.set(String(username || "").toLowerCase(), {
		name: String(username || ""),
		at: Date.now(),
	});
	if (map.size > 500) {
		for (const [name, entry] of map) {
			if (Date.now() - entry.at > 6000) map.delete(name);
		}
	}
}

function typingUsers(channelId, exclude) {
	const map = chatTyping.get(String(channelId || "general"));
	if (!map) return [];
	const lower = String(exclude || "").toLowerCase();
	const now = Date.now();
	const names = [];
	for (const [key, entry] of map) {
		if (now - entry.at > 6000) {
			map.delete(key);
			continue;
		}
		if (key !== lower) names.push(entry.name);
	}
	return names.slice(0, 5);
}

function allowChatUpload(username, ip) {
	const key = `${String(username || "").toLowerCase()}:${ip || ""}`;
	const now = Date.now();
	const max = Math.max(1, Number(getSettings().chatUploadMaxPerMinute) || 6);
	const bucket = (chatUploadBuckets.get(key) || []).filter((at) => now - at < 60_000);
	if (bucket.length >= max) {
		chatUploadBuckets.set(key, bucket);
		return false;
	}
	bucket.push(now);
	chatUploadBuckets.set(key, bucket);
	if (chatUploadBuckets.size > 5000) {
		for (const [entry, values] of chatUploadBuckets) {
			if (!values.some((at) => now - at < 60_000)) chatUploadBuckets.delete(entry);
		}
	}
	return true;
}

function trackWisp(sessionId, username, socket) {
	let set = wispConnections.get(sessionId);
	if (!set) {
		set = new Set();
		wispConnections.set(sessionId, set);
	}
	const entry = { username, socket };
	set.add(entry);
	const key = wispUserKey(username);
	wispUserConnections.set(key, (wispUserConnections.get(key) || 0) + 1);
	socket.on("close", () => {
		set.delete(entry);
		if (!set.size) wispConnections.delete(sessionId);
		const next = (wispUserConnections.get(key) || 0) - 1;
		if (next > 0) wispUserConnections.set(key, next);
		else wispUserConnections.delete(key);
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

const sessionStreams = new Map();

function registerSessionStream(username, sessionId, res) {
	const key = String(username).toLowerCase();
	let set = sessionStreams.get(key);
	if (!set) {
		set = new Set();
		sessionStreams.set(key, set);
	}
	const entry = { key, sessionId, res };
	set.add(entry);
	return entry;
}

function removeSessionStream(entry) {
	const set = sessionStreams.get(entry.key);
	if (!set) return;
	set.delete(entry);
	if (!set.size) sessionStreams.delete(entry.key);
}

function sendSessionEnd(res, reason) {
	try {
		res.write(`event: session-end\ndata: ${JSON.stringify({ reason })}\n\n`);
		res.end();
		return true;
	} catch {
		try {
			res.end();
		} catch {}
		return false;
	}
}

function notifyUserLogout(username, reason = "forced") {
	const key = String(username).toLowerCase();
	const set = sessionStreams.get(key);
	if (!set) return 0;
	let count = 0;
	for (const entry of [...set]) {
		if (sendSessionEnd(entry.res, reason)) count++;
		set.delete(entry);
	}
	sessionStreams.delete(key);
	return count;
}

function notifySessionLogout(sessionId, reason = "revoked") {
	let count = 0;
	for (const [key, set] of [...sessionStreams]) {
		for (const entry of [...set]) {
			if (entry.sessionId !== sessionId) continue;
			if (sendSessionEnd(entry.res, reason)) count++;
			set.delete(entry);
		}
		if (!set.size) sessionStreams.delete(key);
	}
	return count;
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

const scheduledActive = { maintenance: null, quarantine: null };

function applySchedules() {
	for (const type of ["maintenance", "quarantine"]) {
		const job = activeJob(type);
		if (job && scheduledActive[type] !== job.id) {
			const patch =
				type === "maintenance"
					? {
							maintenanceMode: true,
							maintenanceMessage:
								job.message || getSettings().maintenanceMessage,
						}
					: {
							quarantineMode: true,
							quarantineMessage:
								job.message || getSettings().quarantineMessage,
						};
			const result = saveSettings(patch);
			if (!result.error) {
				closeNonAdminConnections();
				scheduledActive[type] = job.id;
				addAudit({
					actor: "sistema",
					action: `${type}.schedule.start`,
					target: job.id,
					detail: `${job.start} → ${job.end}`,
				});
			}
		} else if (!job && scheduledActive[type]) {
			const result = saveSettings(
				type === "maintenance"
					? { maintenanceMode: false }
					: { quarantineMode: false },
			);
			if (!result.error) {
				scheduledActive[type] = null;
				addAudit({
					actor: "sistema",
					action: `${type}.schedule.end`,
					target: "",
					detail: "",
				});
			}
		}
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

function groupForUser(user) {
	return user?.group ? getGroup(user.group) : null;
}

function groupRulesForUser(user) {
	return user?.groupRules === false ? null : groupForUser(user);
}

function isUserScheduleOpen(user, timezone) {
	const group = groupRulesForUser(user);
	const groupSchedule = group?.rules?.schedule || null;
	return (
		isWithinSchedule(user, timezone) &&
		isWithinSchedule({ schedule: groupSchedule }, timezone)
	);
}

function checkHostPolicy(user, hostname) {
	const settings = getSettings();
	const host = String(hostname || "").toLowerCase().replace(/\.$/, "");
	if (!host) return { blocked: false };

	if (settings.blockAds && isAdHost(host)) {
		metric("ads_blocked_total");
		return {
			blocked: true,
			reason: "adblock",
			message: "Anuncio o rastreador bloqueado para acelerar la navegación.",
		};
	}

	if (!user || isAdminRole(user.role)) return { blocked: false };
	const group = groupRulesForUser(user);
	const rules = group?.rules || {};

	if (matchSite(host, user.unblockOverrides)) return { blocked: false };

	if (net.isIP(host) && settings.accessMode !== "allowlist") {
		return {
			blocked: true,
			reason: "direct-ip",
			message: "No se permite navegar directamente por dirección IP.",
		};
	}

	if (settings.accessMode === "allowlist") {
		const allowed = settings.allowedSites || [];
		if (!allowed.length || !matchSite(host, allowed)) {
			return {
				blocked: true,
				reason: "allowlist",
				message: settings.allowlistMessage || "Este sitio no está permitido.",
			};
		}
	}

	if (rules.accessMode === "allowlist") {
		const allowed = rules.allowedSites || [];
		if (!allowed.length || !matchSite(host, allowed)) {
			return {
				blocked: true,
				reason: "group-allowlist",
				message:
					rules.allowlistMessage ||
					"Este sitio no está permitido para tu grupo.",
			};
		}
	}

	const groupMatch = matchSite(host, rules.blockedSites);
	if (groupMatch) {
		return {
			blocked: true,
			reason: "group",
			message:
				(rules.siteMessages || {})[groupMatch] ||
				settings.defaultBlockMessage ||
				"Este sitio está bloqueado para tu grupo.",
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

	if (settings.accessMode === "allowlist") return { blocked: false };

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
	if (!isUserScheduleOpen(user, settings.timezone)) {
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
	mfa: "El código de verificación no es válido o ha caducado. Vuelve a iniciar sesión.",
};

const SESSION_END_NOTICES = {
	forced: "Un administrador ha cerrado tu sesión.",
	revoked: "Un administrador ha cerrado esta sesión.",
	blocked: "Tu cuenta ha sido bloqueada. Contacta con un administrador.",
	banned: "Tu cuenta ha sido bloqueada por seguridad. Contacta con un administrador.",
	deleted: "Tu cuenta ya no está disponible.",
	password: "Un administrador ha cambiado tu contraseña. Vuelve a iniciar sesión.",
	expired: "Tu sesión ha caducado. Vuelve a iniciar sesión.",
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
		const secure = !!req.secure;
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
	"mfa-code": "El código MFA no es válido.",
	mfa: "No se pudo iniciar la activación de MFA.",
	"mfa-enabled": "MFA ya está activada en esta cuenta.",
};

const ADMIN_ERRORS = {
	self: "No puedes eliminarte ni quitarte el rol de administrador a ti mismo.",
	"self-block": "No puedes bloquear tu propia cuenta.",
	"self-logout": "Usa “Salir” para cerrar tu propia sesión.",
	exists: "Ese usuario ya existe.",
	"invalid-user": "Usuario no válido: de 3 a 32 caracteres (letras, números, punto, guion o guion bajo).",
	"invalid-password": "La contraseña debe tener entre 8 y 128 caracteres.",
	"invalid-role": "Rol no válido.",
	"role-conflict": "Un usuario no puede ser moderador y administrador a la vez.",
	"invalid-date": "La fecha de bloqueo no es válida o ya ha pasado.",
	"invalid-schedule": "Horario no válido: elige al menos un día y horas correctas.",
	notfound: "Usuario no encontrado.",
	"last-admin": "Debe quedar al menos un administrador activo.",
	"group-invalid": "El nombre del grupo no es válido (máx. 40 caracteres).",
	"group-exists": "Ya existe un grupo con ese nombre.",
	"group-limit": "Has alcanzado el máximo de grupos.",
	"group-notfound": "Ese grupo ya no existe.",
	"group-forbidden": "No tienes permisos para gestionar ese grupo.",
	"schedule-invalid": "El horario del grupo no es válido.",
	"limit-invalid": "Alguno de los límites del grupo no es válido.",
	"sites-invalid": "Revisa los sitios: hay alguna entrada no válida.",
	"bulk-invalid": "Acción masiva no válida.",
	"bulk-empty": "Selecciona al menos un usuario.",
	"creator-protected": "La cuenta del creador está protegida y no puede modificarse.",
	protected: "La cuenta del creador está protegida y no puede modificarse.",
	forbidden: "No tienes permisos sobre un administrador.",
};

const ADMIN_OK = {
	created: "Usuario creado.",
	deleted: "Usuario eliminado.",
	reset: "Contraseña actualizada.",
	"mfa-reset": "MFA restablecida.",
	role: "Rol actualizado.",
	blocked: "Cuenta bloqueada permanentemente.",
	unblocked: "Cuenta desbloqueada.",
	tempblocked: "Cuenta bloqueada temporalmente.",
	tempcleared: "Bloqueo temporal retirado.",
	logout: "Usuario expulsado: sesiones y pestañas cerradas al instante.",
	"group-created": "Grupo creado.",
	"group-deleted": "Grupo eliminado. Sus usuarios han quedado sin grupo.",
	group: "Grupo del usuario actualizado.",
	rules: "Reglas del grupo guardadas.",
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
			"Canonical: https://raspi-eric.tail41ccf3.ts.net:8443/.well-known/security.txt",
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

app.get("/global-search.js", (req, res) => {
	res.set("Cache-Control", "no-store, no-cache, must-revalidate");
	res.type("application/javascript").sendFile(path.join(__dirname, "public/global-search.js"));
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
	const kicked = String(req.query.kicked || "");
	const notice =
		SESSION_END_NOTICES[kicked] ||
		(kicked ? SESSION_END_NOTICES.forced : "");
	res.set("Cache-Control", "no-store");
	res.type("html").send(
		loginPage({
			next: safeNext(req.query.next),
			error,
			notice,
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

function needsGroupOnboarding(user) {
	return (
		!!user &&
		!isStaffRole(user.role) &&
		!user.group &&
		!user.groupOnboarded &&
		listGroups().length > 0
	);
}

function groupOnboardingRedirect(next) {
	const target = safeNext(next);
	return `/welcome?next=${encodeURIComponent(target === "/welcome" ? "/" : target)}`;
}

app.post("/api/login", sameOrigin, async (req, res) => {
	if (!validCsrf(req)) {
		return sendHttpError(req, res, 403, "Token de seguridad no válido", "Recarga el login e inténtalo de nuevo.");
	}
	const username = normalizeUsername(req.body.username);
	const password = String(req.body.password || "");
	const next = safeNext(req.body.next);
	const settings = getSettings();
	const ip = clientIp(req);

	if (isIpRateLimited(ip) || isAccountIpRateLimited(ip, username)) {
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
		!isUserScheduleOpen(getUser(user.username), settings.timezone)
	) {
		addAudit({
			actor: user.username,
			action: "login.schedule",
			ip,
			userAgent: clientUa(req),
		});
		return res.redirect(303, "/denied?reason=schedule");
	}

	if (isMfaEnabled(user.username)) {
		const token = createMfaPending(req, user.username, next);
		addAudit({
			actor: user.username,
			action: "login.mfa.required",
			ip,
			userAgent: clientUa(req),
		});
		res.setHeader("Set-Cookie", mfaCookie(req, token));
		return res.redirect(303, "/mfa");
	}

	if (!loginSeenBefore(user.username, req._deviceId || "", ip)) {
		addAudit({
			actor: user.username,
			action: "login.new_device",
			detail: "dispositivo o IP nuevos",
			ip,
			userAgent: clientUa(req),
		});
	}

	recordSuccessfulLogin(user.username, ip, {
		exempt: user.role === "creator",
		device: req._deviceId || "",
		userAgent: clientUa(req),
	});

	clearFailedLogins(username);
	clearIpFailures(ip);
	clearAccountIpFailures(ip, username);
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
	res.setHeader("Set-Cookie", [
		sessionCookie(req, session.token, session.expires),
		...clearMfaCookie(req),
	]);
	const freshUser = getUser(user.username);
	res.redirect(
		303,
		needsGroupOnboarding(freshUser) ? groupOnboardingRedirect(next) : next,
	);
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

app.get("/mfa", (req, res) => {
	const session = getSession(req);
	if (session) return res.redirect(303, "/");
	const pending = readMfaPending(req);
	if (!pending) return res.redirect(303, "/login?error=mfa");
	res.set("Cache-Control", "no-store");
	res.type("html").send(
		mfaPage({
			next: pending.entry.next,
			error: req.query.error === "1" ? LOGIN_ERRORS.mfa : "",
			csrf: ensureCsrf(req, res),
		}),
	);
});

app.post("/api/login/mfa", sameOrigin, async (req, res) => {
	if (!validCsrf(req)) {
		return sendHttpError(req, res, 403, "Token de seguridad no válido", "Recarga la página e inténtalo de nuevo.");
	}
	const pending = readMfaPending(req);
	if (!pending) return res.redirect(303, "/login?error=mfa");
	const { entry } = pending;
	if (entry.attempts >= 5) {
		destroyMfaPending(req);
		res.setHeader("Set-Cookie", clearMfaCookie(req));
		return res.redirect(303, "/login?error=mfa");
	}
	const result = verifySecondFactor(entry.username, req.body.code);
	if (result.error) {
		entry.attempts += 1;
		addAudit({
			actor: entry.username,
			action: "login.mfa.fail",
			ip: clientIp(req),
			userAgent: clientUa(req),
		});
		return res.redirect(303, "/mfa?error=1");
	}
	const user = getUser(entry.username);
	if (!user) {
		destroyMfaPending(req);
		res.setHeader("Set-Cookie", clearMfaCookie(req));
		return res.redirect(303, "/login?error=1");
	}
	if (isUserBanned(user.username) || user.blocked) {
		destroyMfaPending(req);
		res.setHeader("Set-Cookie", clearMfaCookie(req));
		return res.redirect(303, "/login?error=blocked");
	}
	const settings = getSettings();
	if (settings.quarantineMode && !isAdminRole(user.role)) {
		destroyMfaPending(req);
		res.setHeader("Set-Cookie", clearMfaCookie(req));
		return res.redirect(303, "/quarantine");
	}
	if (settings.maintenanceMode && !isAdminRole(user.role)) {
		destroyMfaPending(req);
		res.setHeader("Set-Cookie", clearMfaCookie(req));
		return res.redirect(303, `/login?error=maintenance&next=${encodeURIComponent(entry.next)}`);
	}
	if (!isAdminRole(user.role) && !isUserScheduleOpen(getUser(user.username), settings.timezone)) {
		destroyMfaPending(req);
		res.setHeader("Set-Cookie", clearMfaCookie(req));
		return res.redirect(303, "/denied?reason=schedule");
	}

	destroyMfaPending(req);
	const ip = clientIp(req);
	if (!loginSeenBefore(user.username, req._deviceId || "", ip)) {
		addAudit({
			actor: user.username,
			action: "login.new_device",
			detail: "dispositivo o IP nuevos",
			ip,
			userAgent: clientUa(req),
		});
	}
	recordSuccessfulLogin(user.username, ip, {
		exempt: user.role === "creator",
		device: req._deviceId || "",
		userAgent: clientUa(req),
	});
	clearFailedLogins(user.username);
	clearIpFailures(ip);
	clearAccountIpFailures(ip, user.username);
	const session = createSession(user.username, { ip, userAgent: clientUa(req) });
	for (const revokedId of session.revoked || []) closeSessionConnections(revokedId);
	recordLoginSuccess(user.username, ip);
	addAudit({
		actor: user.username,
		action: "login.mfa.success",
		detail: result.method,
		ip,
		userAgent: clientUa(req),
	});
	res.setHeader("Set-Cookie", [
		sessionCookie(req, session.token, session.expires),
		...clearMfaCookie(req),
	]);
	res.redirect(
		303,
		needsGroupOnboarding(user) ? groupOnboardingRedirect(entry.next) : entry.next,
	);
});

/* --------------------------- a partir de aquí, login --------------------------- */

app.use(requireAuth);

app.get("/welcome", (req, res) => {
	const user = getUser(req.user.username);
	if (!needsGroupOnboarding(user)) {
		const target = safeNext(req.query.next);
		return res.redirect(303, target === "/welcome" ? "/" : target);
	}
	res.set("Cache-Control", "no-store");
	res.type("html").send(
		groupOnboardingPage({
			user,
			groups: listGroups(),
			next: safeNext(req.query.next),
			error: req.query.error === "invalid" ? "Ese grupo ya no existe. Elige otro." : "",
		}),
	);
});

app.post("/api/account/group", sameOrigin, (req, res) => {
	const user = getUser(req.user.username);
	if (!user) return res.redirect(303, "/login");
	const target = safeNext(req.body.next);
	const next = target === "/welcome" || target.startsWith("/welcome?") ? "/" : target;
	if (user.groupOnboarded) return res.redirect(303, next);
	if (String(req.body.action || "") === "skip") {
		markGroupOnboarded(user.username);
		audit(req, "group.skip", "");
		return res.redirect(303, next);
	}
	const groupId = String(req.body.group || "").trim();
	const group = groupId ? getGroup(groupId) : null;
	if (!group) {
		return res.redirect(
			303,
			`/welcome?error=invalid&next=${encodeURIComponent(next)}`,
		);
	}
	setUserGroup(user.username, group.id);
	closeUserConnections(user.username);
	syncClassChats();
	audit(req, "group.self", group.name);
	res.redirect(303, next);
});

app.use((req, res, next) => {
	if (
		req.method !== "GET" ||
		req.path === "/welcome" ||
		req.path.startsWith("/api/")
	) {
		return next();
	}
	const accept = String(req.get("accept") || "");
	if (!accept.includes("text/html")) return next();
	const user = getUser(req.user.username);
	if (!needsGroupOnboarding(user)) return next();
	const nextUrl = req.originalUrl || "/";
	return res.redirect(303, `/welcome?next=${encodeURIComponent(nextUrl)}`);
});

app.use((req, res, next) => {
	const settings = getSettings();
	if (!settings.requireMfaForStaff || !isStaffRole(req.user.role)) return next();
	if (isMfaEnabled(req.user.username)) return next();
	const allowed =
		req.path === "/account" ||
		req.path === "/account/mfa" ||
		req.path.startsWith("/api/account/mfa/") ||
		req.path === "/logout" ||
		req.path === "/api/me" ||
		req.path === "/api/session/events" ||
		req.path.startsWith("/api/account/password");
	if (allowed) return next();
	if (req.path.startsWith("/api/")) {
		return res.status(403).json({ error: "mfa_required" });
	}
	return res.redirect(303, "/account?mfa=required");
});

app.param("username", (req, res, next, value) => {
	if (!isStaffRole(req.user?.role)) return next();
	const target = getUser(value);
	if (!target) return next();
	if (target.username.toLowerCase() === String(req.user.username).toLowerCase()) {
		return next();
	}
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

app.get("/api/session/events", (req, res) => {
	res.status(200).set({
		"Content-Type": "text/event-stream; charset=utf-8",
		"Cache-Control": "no-cache, no-store, must-revalidate",
		Connection: "keep-alive",
		"X-Accel-Buffering": "no",
	});
	if (typeof res.flushHeaders === "function") res.flushHeaders();
	res.write("retry: 2000\n\n");
	const entry = registerSessionStream(req.user.username, req.user.id, res);
	res.write(`event: ready\ndata: ${JSON.stringify({ username: req.user.username })}\n\n`);
	const heartbeat = setInterval(() => {
		try {
			res.write(": keep-alive\n\n");
		} catch {}
	}, 25_000);
	if (heartbeat.unref) heartbeat.unref();
	const cleanup = () => {
		clearInterval(heartbeat);
		removeSessionStream(entry);
	};
	req.on("close", cleanup);
	res.on("close", cleanup);
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

app.get("/api/search", (req, res) => {
	const q = String(req.query.q || "").trim().slice(0, 100);
	if (q.length < 2) {
		return res.json({ bookmarks: [], history: [], sections: [] });
	}
	const lower = q.toLowerCase();
	const bookmarks = listBookmarks(req.user.username)
		.filter(
			(entry) =>
				String(entry.label || "").toLowerCase().includes(lower) ||
				String(entry.url || "").toLowerCase().includes(lower),
		)
		.slice(0, 6)
		.map((entry) => ({ label: entry.label, url: entry.url }));
	const history = getActivity({ username: req.user.username, limit: 6, search: q }).map(
		(entry) => ({
			label: entry.query ? `Búsqueda: ${entry.query}` : entry.url,
			url: entry.url || "",
			query: entry.query || "",
			at: entry.at,
		}),
	);
	const sections = [
		["Inicio", "/"],
		["Favoritos", "/bookmarks"],
		["Historial", "/history"],
		["Chat", "/chat"],
		["Mi cuenta", "/account"],
	];
	if (isStaffRole(req.user.role)) {
		sections.push(
			["Resumen de administración", "/admin/overview"],
			["Usuarios", "/admin"],
			["Sesiones", "/admin/sessions"],
			["Actividad", "/admin/activity"],
			["Auditoría", "/admin/audit"],
			["Solicitudes", "/admin/requests"],
			["Estadísticas", "/admin/stats"],
		);
	}
	if (isAdminRole(req.user.role)) {
		sections.push(
			["Seguridad", "/admin/security"],
			["Tráfico", "/admin/traffic"],
			["Vigilancia", "/admin/monitor"],
			["Ajustes", "/admin/settings"],
			["Sistema", "/admin/system"],
		);
	}
	res.set("Cache-Control", "no-store");
	res.json({
		bookmarks,
		history,
		sections: sections
			.filter(([label]) => label.toLowerCase().includes(lower))
			.slice(0, 8)
			.map(([label, href]) => ({ label, href })),
	});
});

app.get("/api/navigate-check", async (req, res) => {
	if (isStaffRole(req.user.role) && !getSettings().proxyAllowStaffBrowsing) {
		return res.status(200).json({
			blocked: true,
			reason: "staff",
			message:
				"La navegación está desactivada para cuentas de administración y moderación. Usa una cuenta de alumno para navegar.",
		});
	}
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
	let pinned = [];
	let readSeq = 0;
	let hasMore = false;
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
			pinned = chatEnriched(result.pinned || [], req.user, roles);
			readSeq = result.readSeq || 0;
			hasMore = !!result.hasMore;
		}
	}
	res.set("Cache-Control", "no-store");
	res.type("html").send(
		chatPage({
			user: req.user,
			settings,
			messages,
			pinned,
			readSeq,
			hasMore,
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
			canDelete: isAdminRole(req.user.role),
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
		return res.status(403).json({
			error: "not_friends",
			message: "Solo puedes abrir un chat privado con amigos.",
		});
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
		return friendRedirect(req, res, "error", "unavailable");
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

app.get("/api/chat/notifications", (req, res) => {
	const settings = getSettings();
	if (!settings.chatEnabled) return res.json({ enabled: false, messages: [], latestSeq: 0, unread: 0 });
	const after = Math.max(0, Number.parseInt(req.query.after, 10) || 0);
	const result = listChatNotifications(req.user.username, { after, limit: 10 });
	res.set("Cache-Control", "no-store");
	res.json({
		enabled: true,
		messages: chatEnriched(result.messages, req.user, chatUserMeta()),
		latestSeq: result.latestSeq,
		unread: result.unread,
		currentUser: req.user.username,
	});
});

app.get("/api/chat/messages", (req, res) => {
	const settings = getSettings();
	if (!settings.chatEnabled) return res.status(403).json({ error: "disabled" });
	const channelId = chatChannelOf(req);
	const after = Math.max(0, Number.parseInt(req.query.after, 10) || 0);
	const before = Math.max(0, Number.parseInt(req.query.before, 10) || 0);
	const result = listChat({
		username: req.user.username,
		channelId,
		after,
		before,
		limit: 200,
	});
	if (result.error) return res.status(403).json({ error: result.error });
	const roles = chatUserMeta();
	const online = settings.chatShowOnline
		? hideCreatorData(req, chatOnlineUsers(), (name) => name)
		: null;
	res.set("Cache-Control", "no-store");
	res.json({
		...result,
		messages: chatEnriched(result.messages, req.user, roles),
		pinned: chatEnriched(result.pinned || [], req.user, roles),
		typing: typingUsers(channelId, req.user.username),
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
		replyTo: String(req.body.reply || ""),
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

app.post("/api/chat/messages/:id/edit", sameOrigin, (req, res) => {
	const channelId = chatChannelOf(req);
	const message = getChatMessage(req.params.id);
	if (!message || !isChannelMember(req.user.username, message.channelId)) {
		return res.status(404).json({ error: "notfound", message: CHAT_ERRORS.notfound });
	}
	const result = editChatMessage(req.user.username, req.params.id, req.body.text, {
		channelId: message.channelId,
		moderator: isChatModerator(req.user),
	});
	if (result.error) {
		const status = result.error === "forbidden" ? 403 : result.error === "notfound" ? 404 : 400;
		return res.status(status).json({
			error: result.error,
			message: CHAT_ERRORS[result.error] || "No se pudo editar el mensaje.",
		});
	}
	audit(req, "chat.edit", result.message.id);
	res.json({ message: enrichChatMessage(result.message, req.user, chatUserMeta()) });
});

app.post("/api/chat/messages/:id/pin", sameOrigin, (req, res) => {
	if (!isChatModerator(req.user)) {
		return res.status(403).json({ error: "forbidden", message: CHAT_ERRORS.forbidden });
	}
	const channelId = chatChannelOf(req);
	const message = getChatMessage(req.params.id);
	if (!message || !isChannelMember(req.user.username, message.channelId)) {
		return res.status(404).json({ error: "notfound", message: CHAT_ERRORS.notfound });
	}
	const pinned = req.path.endsWith("/pin") ? true : false;
	const result = pinChatMessage(req.user.username, req.params.id, channelId, pinned);
	if (result.error) return res.status(400).json({ error: result.error });
	audit(req, pinned ? "chat.pin" : "chat.unpin", result.message.id);
	res.json({
		message: enrichChatMessage(result.message, req.user, chatUserMeta()),
		pinned: chatEnriched(
			listChatPinned(req.user.username, message.channelId).messages || [],
			req.user,
			chatUserMeta(),
		),
	});
});

app.post("/api/chat/messages/:id/unpin", sameOrigin, (req, res) => {
	if (!isChatModerator(req.user)) {
		return res.status(403).json({ error: "forbidden", message: CHAT_ERRORS.forbidden });
	}
	const channelId = chatChannelOf(req);
	const message = getChatMessage(req.params.id);
	if (!message || !isChannelMember(req.user.username, message.channelId)) {
		return res.status(404).json({ error: "notfound", message: CHAT_ERRORS.notfound });
	}
	const result = pinChatMessage(req.user.username, req.params.id, message.channelId, false);
	if (result.error) return res.status(400).json({ error: result.error });
	audit(req, "chat.unpin", result.message.id);
	res.json({
		message: enrichChatMessage(result.message, req.user, chatUserMeta()),
		pinned: chatEnriched(
			listChatPinned(req.user.username, message.channelId).messages || [],
			req.user,
			chatUserMeta(),
		),
	});
});

app.get("/api/chat/search", (req, res) => {
	const query = String(req.query.q || "").slice(0, 100);
	const channelId = String(req.query.channel || "").slice(0, 80);
	const result = searchChat(req.user.username, { query, channelId });
	if (result.error) return res.status(403).json({ error: result.error });
	res.set("Cache-Control", "no-store");
	res.json({
		messages: chatEnriched(result.messages, req.user, chatUserMeta()),
		channels: listChatChannels(req.user.username),
	});
});

app.post("/api/chat/typing", sameOrigin, (req, res) => {
	if (!getSettings().chatEnabled) return res.status(403).json({ error: "disabled" });
	const channelId = chatChannelOf(req);
	if (!isChannelMember(req.user.username, channelId)) {
		return res.status(403).json({ error: "channel" });
	}
	noteChatTyping(channelId, req.user.username);
	res.status(204).end();
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

app.post(
	"/api/chat/upload",
	sameOrigin,
	(req, res, next) => {
		if (!getSettings().chatEnabled) return res.status(403).json({ error: "disabled" });
		if (!allowChatUpload(req.user.username, clientIp(req))) {
			res.set("Retry-After", "60");
			return res.status(429).json({ error: "rate" });
		}
		next();
	},
	express.raw({ type: "application/octet-stream", limit: "6mb" }),
	(req, res) => {
	let fileName = String(req.headers["x-file-name"] || "archivo");
	try {
		fileName = decodeURIComponent(fileName);
	} catch {}
	const result = saveChatUpload(req.user.username, req.body, {
		name: fileName,
		type: req.headers["x-file-type"],
	});
	if (result.error) {
		const status =
			result.error === "too_large" || result.error === "quota" || result.error === "user_quota"
				? 413
				: result.error === "disk"
					? 507
					: 400;
		return res.status(status).json({ error: result.error });
	}
	res.status(201).json({ upload: result.upload });
	},
);

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
	const allowed =
		isAdminRole(req.user.role) ||
		(!isStaffRole(req.user.role) && !!settings.chatAllowUserDelete && own);
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

function bookmarkWantsJson(req) {
	return (
		req.is("application/json") ||
		String(req.get("accept") || "").includes("application/json")
	);
}

app.post("/api/bookmarks", sameOrigin, (req, res) => {
	const wantsJson = bookmarkWantsJson(req);
	const result = addBookmark(req.user.username, {
		label: String(req.body.label || ""),
		url: String(req.body.url || ""),
	});
	if (result.error) {
		if (!wantsJson) return res.redirect(303, `/bookmarks?error=${result.error}`);
		const status = result.error === "invalid-url" ? 400 : 409;
		return res.status(status).json({ error: result.error });
	}
	audit(req, "bookmark.create", result.bookmark.url);
	if (!wantsJson) return res.redirect(303, "/bookmarks?ok=created");
	res.status(201).json({ bookmark: result.bookmark });
});

app.post("/api/bookmarks/:id/update", sameOrigin, (req, res) => {
	const wantsJson = bookmarkWantsJson(req);
	const result = updateBookmark(req.user.username, req.params.id, {
		label: req.body.label === undefined ? undefined : String(req.body.label),
		url: req.body.url === undefined ? undefined : String(req.body.url),
	});
	if (result.error) {
		if (!wantsJson) return res.redirect(303, `/bookmarks?error=${result.error}`);
		return res.status(404).json({ error: result.error });
	}
	audit(req, "bookmark.update", result.bookmark.url);
	if (!wantsJson) return res.redirect(303, "/bookmarks?ok=updated");
	res.json({ bookmark: result.bookmark });
});

app.post("/api/bookmarks/:id/delete", sameOrigin, (req, res) => {
	const wantsJson = bookmarkWantsJson(req);
	const result = deleteBookmark(req.user.username, req.params.id);
	if (result.error) {
		if (!wantsJson) return res.redirect(303, `/bookmarks?error=${result.error}`);
		return res.status(404).json({ error: result.error });
	}
	audit(req, "bookmark.delete", req.params.id);
	if (!wantsJson) return res.redirect(303, "/bookmarks?ok=deleted");
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
						: req.query.ok === "mfa-off"
							? "MFA desactivada."
							: req.query.mfa === "required"
								? "Debes activar la verificación en dos pasos para usar el panel de administración."
								: "";
	const error = ACCOUNT_ERRORS[req.query.error] || "";
	res.set("Cache-Control", "no-store");
	res.type("html").send(
		accountPage({
			user: req.user,
			sessions,
			currentId: req.user.id,
			allowPasswordChange: settings.allowUserPasswordChange || isAdminRole(req.user.role),
			mfa: mfaStatus(req.user.username),
			group: getGroup(getUser(req.user.username)?.group)?.name || "",
			forced: req.user.mustChangePassword || req.query.force === "1",
			notice,
			error,
		}),
	);
});

app.get("/design", requireTool("designer"), (req, res) => {
	res.set("Cache-Control", "no-store");
	res.type("html").send(
		specialistWorkspacePage({
			user: req.user,
			tool: "designer",
			reports: listReports({ username: req.user.username, limit: 5 }),
			notice: req.query.ok === "created" ? "Informe enviado." : "",
			error: req.query.error === "empty" ? "El título y la descripción son obligatorios." : "",
		}),
	);
});

app.get("/pentest", requireTool("pentester"), (req, res) => {
	res.set("Cache-Control", "no-store");
	res.type("html").send(
		specialistWorkspacePage({
			user: req.user,
			tool: "pentester",
			reports: listReports({ username: req.user.username, limit: 5 }),
			security: securitySummary(),
			notice: req.query.ok === "created" ? "Informe enviado." : "",
			error: req.query.error === "empty" ? "El título y la descripción son obligatorios." : "",
		}),
	);
});

app.get("/qa", requireTool("qa"), (req, res) => {
	res.set("Cache-Control", "no-store");
	res.type("html").send(
		specialistWorkspacePage({
			user: req.user,
			tool: "qa",
			reports: listReports({ username: req.user.username, limit: 5 }),
			notice: req.query.ok === "created" ? "Informe enviado." : "",
			error: req.query.error === "empty" ? "El título y la descripción son obligatorios." : "",
		}),
	);
});

app.get("/reports", requireReportsAccess, (req, res) => {
	res.set("Cache-Control", "no-store");
	res.type("html").send(
		reportsPage({
			user: req.user,
			reports: listReports({ username: req.user.username, limit: 100 }),
			browser: String(req.headers["user-agent"] || "").slice(0, 200),
			notice: req.query.ok === "created" ? "Informe enviado. Gracias." : "",
			error:
				req.query.error === "empty"
					? "El título y la descripción son obligatorios."
					: req.query.error === "rate"
						? "Has enviado demasiados informes. Espera un poco."
						: "",
		}),
	);
});

app.post("/api/reports", requireReportsAccess, sameOrigin, (req, res) => {
	if (!allowReport(req.user.username)) {
		return res.redirect(303, "/reports?error=rate");
	}
	const result = createReport(req.user.username, {
		title: req.body.title,
		type: req.body.type,
		severity: req.body.severity,
		area: req.body.area,
		url: req.body.url,
		description: req.body.description,
		steps: req.body.steps,
		expected: req.body.expected,
		actual: req.body.actual,
		browser: req.body.browser,
	});
	if (result.error) return res.redirect(303, `/reports?error=${result.error}`);
	audit(req, "report.create", result.report.id, `${result.report.type}: ${result.report.title}`);
	res.redirect(303, "/reports?ok=created");
});

app.get("/admin/reports", requireCreator, (req, res) => {
	const status = String(req.query.status || "");
	res.set("Cache-Control", "no-store");
	res.type("html").send(
		adminReportsPage({
			user: req.user,
			reports: listReports({ status, limit: 500 }),
			status,
			notice:
				req.query.ok === "updated"
					? "Informe actualizado."
					: req.query.ok === "deleted"
						? "Informe eliminado."
						: "",
			error: req.query.error === "notfound" ? "El informe ya no existe." : "",
		}),
	);
});

app.get("/admin/reports/:id", requireCreator, (req, res) => {
	const report = getReport(req.params.id);
	if (!report) return res.redirect(303, "/admin/reports?error=notfound");
	res.set("Cache-Control", "no-store");
	res.type("html").send(
		adminReportDetailPage({
			user: req.user,
			report,
			notice: req.query.ok === "updated" ? "Informe actualizado." : "",
			error: req.query.error === "notfound" ? "El informe ya no existe." : "",
		}),
	);
});

app.post("/api/admin/reports/:id", requireCreator, sameOrigin, (req, res) => {
	const report = getReport(req.params.id);
	if (!report) return res.redirect(303, "/admin/reports?error=notfound");
	const action = String(req.body.action || "save");
	if (action === "fixed" || action === "dismissed") {
		const result = deleteReport(report.id);
		if (result.error) return res.redirect(303, `/admin/reports?error=${result.error}`);
		audit(
			req,
			action === "fixed" ? "report.fixed" : "report.dismissed",
			report.id,
			`${report.type}: ${report.title}`,
		);
		return res.redirect(303, "/admin/reports?ok=deleted");
	}
	const status =
		action === "triaged"
			? "triaged"
			: action === "in_progress"
				? "in_progress"
				: report.status;
	const result = updateReport(report.id, {
		status,
		adminNote: req.body.note,
		by: req.user.username,
	});
	if (result.error) return res.redirect(303, `/admin/reports/${report.id}?error=${result.error}`);
	audit(req, "report.update", result.report.id, `estado: ${result.report.status}`);
	res.redirect(303, `/admin/reports/${report.id}?ok=updated`);
});

app.get("/vault", (req, res) => {
	res.set("Cache-Control", "no-store");
	res.type("html").send(vaultPage({ user: req.user }));
});

app.use("/api/vault", (req, res, next) => {
	if (!allowVault(req.user.username)) {
		return res.status(429).json({ error: "rate" });
	}
	next();
});

app.get("/api/vault", (req, res) => {
	const vault = getVault(req.user.username);
	res.set("Cache-Control", "no-store");
	res.json(vault || { configured: false, entries: [] });
});

app.post("/api/vault/init", sameOrigin, (req, res) => {
	const result = initVault(req.user.username, {
		salt: req.body.salt,
		checkIv: req.body.checkIv,
		checkCiphertext: req.body.checkCiphertext,
	});
	if (result.error) {
		const status = result.error === "exists" ? 409 : 400;
		return res.status(status).json({ error: result.error });
	}
	audit(req, "vault.init");
	res.status(201).json({ vault: result.vault });
});

app.post("/api/vault/entries", sameOrigin, (req, res) => {
	const result = saveVaultEntry(req.user.username, {
		id: req.body.id,
		iv: req.body.iv,
		ciphertext: req.body.ciphertext,
	});
	if (result.error) {
		const status =
			result.error === "notconfigured"
				? 409
				: result.error === "limit"
					? 409
					: 400;
		return res.status(status).json({ error: result.error });
	}
	audit(req, "vault.entry", result.entry.id, "guardada");
	res.status(201).json({ entry: result.entry });
});

app.post("/api/vault/entries/:id/delete", sameOrigin, (req, res) => {
	const result = deleteVaultEntry(req.user.username, req.params.id);
	if (result.error) {
		return res.status(result.error === "notfound" ? 404 : 409).json({ error: result.error });
	}
	audit(req, "vault.entry", req.params.id, "eliminada");
	res.status(204).end();
});

app.post("/api/vault/reset", sameOrigin, async (req, res) => {
	if (!(await verifyUserPassword(req.user.username, String(req.body.password || "")))) {
		return res.status(403).json({ error: "password" });
	}
	const result = resetVault(req.user.username);
	if (result.error) return res.status(404).json({ error: result.error });
	audit(req, "vault.reset");
	res.json({ ok: true });
});

app.get("/bookmarks", (req, res) => {
	const notices = {
		created: "Favorito guardado.",
		updated: "Favorito actualizado.",
		deleted: "Favorito eliminado.",
	};
	const errors = {
		"invalid-url": "La URL no es válida.",
		exists: "Ese favorito ya existe.",
		limit: "Has alcanzado el máximo de favoritos.",
		notfound: "Ese favorito ya no existe.",
	};
	res.set("Cache-Control", "no-store");
	res.type("html").send(
		bookmarksPage({
			user: req.user,
			bookmarks: listBookmarks(req.user.username),
			notice: notices[String(req.query.ok || "")] || "",
			error: errors[String(req.query.error || "")] || "",
		}),
	);
});

function historyFilters(req) {
	const search = String(req.query.q || "").slice(0, 100);
	const type = ["url", "search"].includes(String(req.query.type)) ? String(req.query.type) : "";
	const fromDate = String(req.query.from || "").slice(0, 10);
	const toDate = String(req.query.to || "").slice(0, 10);
	const from = /^\d{4}-\d{2}-\d{2}$/.test(fromDate)
		? new Date(`${fromDate}T00:00:00`).getTime()
		: 0;
	const to = /^\d{4}-\d{2}-\d{2}$/.test(toDate)
		? new Date(`${toDate}T23:59:59.999`).getTime()
		: 0;
	return { search, type, from: Number.isFinite(from) ? from : 0, to: Number.isFinite(to) ? to : 0, fromDate, toDate };
}

app.get("/history", (req, res) => {
	const settings = getSettings();
	const page = Math.max(1, Number(req.query.page) || 1);
	const limit = 25;
	const filters = historyFilters(req);
	const total = countActivity({ username: req.user.username, ...filters });
	const activity = getActivity({
		username: req.user.username,
		limit,
		offset: (page - 1) * limit,
		...filters,
	});
	res.set("Cache-Control", "no-store");
	res.type("html").send(
		historyPage({
			user: req.user,
			activity,
			total,
			page,
			pages: Math.max(1, Math.ceil(total / limit)),
			...filters,
			canClear: settings.allowUserHistoryClear,
			notice:
				req.query.ok === "cleared"
					? "Historial vaciado."
					: req.query.ok === "range"
						? "Rango del historial eliminado."
						: req.query.ok === "deleted"
							? "Entrada del historial eliminada."
							: "",
			error:
				req.query.error === "range"
					? "El rango de fechas no es válido."
					: req.query.error === "entry"
						? "No se pudo borrar esa entrada."
						: "",
		}),
	);
});

app.get("/history.csv", (req, res) => {
	const filters = historyFilters(req);
	const rows = getActivity({
		username: req.user.username,
		limit: 10000,
		...filters,
	});
	const csvEscape = (value) => {
		let text = String(value ?? "");
		if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
		return `"${text.replaceAll('"', '""')}"`;
	};
	const lines = ["fecha,usuario,busqueda,url"];
	for (const entry of rows) {
		lines.push([entry.at, entry.username, entry.query, entry.url].map(csvEscape).join(","));
	}
	res.setHeader("Content-Type", "text/csv; charset=utf-8");
	res.setHeader(
		"Content-Disposition",
		`attachment; filename="historial-${new Date().toISOString().slice(0, 10)}.csv"`,
	);
	res.send(lines.join("\n"));
});

app.post("/api/account/history/:id/delete", sameOrigin, (req, res) => {
	if (!getSettings().allowUserHistoryClear) {
		return res.status(403).type("text/plain").send("No autorizado.");
	}
	const result = deleteActivity(req.user.username, String(req.params.id || ""));
	const next = safeNext(String(req.body.next || ""));
	let target = "/history?ok=deleted";
	if (next.startsWith("/history")) {
		try {
			const url = new URL(next, "http://local.invalid");
			url.searchParams.set("ok", result.error ? "entry" : "deleted");
			url.searchParams.delete("error");
			target = `${url.pathname}?${url.searchParams.toString()}`;
		} catch {}
	} else if (result.error) {
		target = "/history?error=entry";
	}
	if (!result.error) audit(req, "activity.delete-entry", String(req.params.id || "").slice(0, 64));
	res.redirect(303, target);
});

app.post("/api/account/history/delete-range", sameOrigin, (req, res) => {
	if (!getSettings().allowUserHistoryClear) {
		return res.status(403).type("text/plain").send("No autorizado.");
	}
	const from = new Date(`${String(req.body.from || "").slice(0, 10)}T00:00:00`).getTime();
	const to = new Date(`${String(req.body.to || "").slice(0, 10)}T23:59:59.999`).getTime();
	const result = deleteActivityRange(req.user.username, from, to);
	if (result.error) return res.redirect(303, "/history?error=range");
	audit(req, "activity.delete-range", "", `${req.body.from} → ${req.body.to}`);
	res.redirect(303, "/history?ok=range");
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

app.post("/api/account/mfa/start", sameOrigin, (req, res) => {
	const result = startEnrollment(req.user.username);
	if (result.error) {
		return res.redirect(303, `/account?error=${result.error === "enabled" ? "mfa-enabled" : "mfa"}`);
	}
	audit(req, "mfa.enrollment.start");
	res.redirect(303, "/account/mfa");
});

app.get("/account/mfa", (req, res) => {
	const info = enrollmentInfo(req.user.username);
	if (!info) return res.redirect(303, "/account");
	res.set("Cache-Control", "no-store");
	res.type("html").send(
		mfaSetupPage({
			user: req.user,
			secret: info.secret,
			uri: info.uri,
			error:
				req.query.error === "invalid-code"
					? "El código no es válido. Comprueba la hora del dispositivo e inténtalo de nuevo."
					: "",
		}),
	);
});

app.post("/api/account/mfa/enable", sameOrigin, (req, res) => {
	const result = confirmEnrollment(req.user.username, req.body.code);
	if (result.error) {
		return res.redirect(303, `/account/mfa?error=${result.error}`);
	}
	audit(req, "mfa.enable");
	res.set("Cache-Control", "no-store");
	res.type("html").send(
		mfaRecoveryPage({
			user: req.user,
			codes: result.codes,
			title: "MFA activada",
			message: "Guarda estos códigos de recuperación. No se volverán a mostrar.",
		}),
	);
});

app.post("/api/account/mfa/disable", sameOrigin, async (req, res) => {
	if (!(await verifyUserPassword(req.user.username, String(req.body.current || "")))) {
		return res.redirect(303, "/account?error=current");
	}
	const result = verifySecondFactor(req.user.username, req.body.code);
	if (result.error) return res.redirect(303, "/account?error=mfa-code");
	disableMfa(req.user.username);
	audit(req, "mfa.disable");
	res.redirect(303, "/account?ok=mfa-off");
});

app.post("/api/account/mfa/recovery", sameOrigin, async (req, res) => {
	if (!(await verifyUserPassword(req.user.username, String(req.body.current || "")))) {
		return res.redirect(303, "/account?error=current");
	}
	const result = verifySecondFactor(req.user.username, req.body.code);
	if (result.error) return res.redirect(303, "/account?error=mfa-code");
	const regenerated = regenerateRecoveryCodes(req.user.username);
	audit(req, "mfa.recovery.regenerate");
	res.set("Cache-Control", "no-store");
	res.type("html").send(
		mfaRecoveryPage({
			user: req.user,
			codes: regenerated.codes,
			title: "Nuevos códigos de recuperación",
			message: "Los códigos anteriores ya no funcionan. Guarda estos.",
		}),
	);
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
	if (req.params.id !== req.user.id) notifySessionLogout(session.id, "revoked");
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

function adminOverviewData(req) {
	const settings = getSettings();
	const sessions = hideCreatorData(req, listSessions(), (session) => session.username);
	const users = hideCreatorData(req, listUsers(), (entry) => entry.username);
	const traffic = trafficSnapshot();
	const security = securitySummary();
	const online = new Set(
		sessions
			.filter((session) => Date.now() - new Date(session.lastSeenAt).getTime() < 5 * 60 * 1000)
			.map((session) => String(session.username).toLowerCase()),
	).size;
	const recent = hideCreatorData(
		req,
		listAudit({ limit: 10 }),
		(event) => event.actor,
	);
	return {
		online,
		stats: {
			users: users.length,
			online,
			sessions: sessions.length,
			alerts: security.open || 0,
			requests: countPendingRequests(),
			backups: backupCount(),
			reports: req.user.role === "creator" ? countOpenReports() : undefined,
			requestsPerMinute: traffic.http.lastMinute || 0,
			streams: traffic.wisp.activeStreams || 0,
		},
		actions: [
			{ label: "Vigilancia en vivo", detail: "Ver qué están haciendo ahora", href: "/admin/monitor", icon: "👁" },
			{ label: "Gestionar usuarios", detail: "Roles, bloqueos y permisos", href: "/admin", icon: "👥" },
			{ label: "Revisar seguridad", detail: `${security.open || 0} alertas abiertas`, href: "/admin/security", icon: "🛡" },
			...(req.user.role === "creator"
				? [{ label: "Revisar informes", detail: `${countOpenReports()} informes abiertos`, href: "/admin/reports", icon: "📝" }]
				: []),
			{ label: "Ajustes del proxy", detail: "Chat, acceso, portada y copias", href: "/admin/settings", icon: "⚙" },
		],
		recent,
		status: {
			maintenance: !!settings.maintenanceMode,
			quarantine: !!settings.quarantineMode,
			chat: !!settings.chatEnabled,
			accessMode: settings.accessMode,
		},
	};
}

app.get("/admin/overview", requireAdmin, (req, res) => {
	res.set("Cache-Control", "no-store");
	res.type("html").send(
		overviewPage({ user: req.user, data: adminOverviewData(req) }),
	);
});

app.get("/admin", requireStaff, (req, res) => {
	const error = ADMIN_ERRORS[req.query.error] || "";
	const notice = ADMIN_OK[req.query.ok] || "";
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
			blockTemplates: listTemplates("block"),
			groups: listGroups(),
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
	touchQuarantineView();
	res.set("Cache-Control", "no-store");
	res.type("html").send(
		securityPage({
			user: req.user,
			alerts: listSecurityAlerts({ includeDismissed }),
			bans: listBans(),
			summary: securitySummary(),
			currentIp: clientIp(req),
			currentDevice: req._deviceId || "",
			quarantineAttempts: hideCreatorData(
				req,
				listAudit({ action: "quarantine.attempt", limit: 20 }),
				(e) => e.actor,
			),
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
	const alert =
		type === "device" && req.body.alert
			? listSecurityAlerts({ includeDismissed: true, limit: 1000 }).find(
					(item) => item.id === String(req.body.alert),
				)
			: null;
	const result = banTarget(type, target, {
		by: req.user.username,
		reason: String(req.body.reason || "").slice(0, 200),
		alertId: String(req.body.alert || ""),
		kind: String(req.body.kind || (type === "user" ? "user" : "")),
		ip: type === "device" ? alert?.ip || "" : "",
		username: type === "device" ? alert?.username || "" : "",
	});
	if (result.error) return res.redirect(303, `/admin/security?error=${result.error}`);
	if (type === "user") {
		destroySessionsOf(target);
		closeUserConnections(target);
		notifyUserLogout(target, "banned");
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
				lastActiveAt: session.lastActiveAt || session.lastSeenAt,
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
		if (new Date(session.lastActiveAt || session.lastSeenAt) > new Date(entry.lastActiveAt)) {
			entry.lastActiveAt = session.lastActiveAt || session.lastSeenAt;
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
			online: now - new Date(entry.lastActiveAt).getTime() < 5 * 60 * 1000,
			ips: [...entry.ips].filter(Boolean).slice(0, 4),
			sessions: entry.sessions,
			lastSeenAt: entry.lastSeenAt,
			lastActiveAt: entry.lastActiveAt,
			createdAt: entry.createdAt,
			userAgent: entry.userAgent,
			streams: entry.streams
				.sort((a, b) => b.bytes - a.bytes)
				.slice(0, 8),
			current: current
				? { url: current.url || "", query: current.query || "", at: current.at }
				: null,
		};
	}).sort((a, b) => Number(b.online) - Number(a.online) || new Date(b.lastActiveAt) - new Date(a.lastActiveAt));
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
				? "Usuario expulsado: sesiones y pestañas cerradas al instante."
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
	const notice =
		req.query.ok === "cleared"
			? "Historial vaciado."
			: req.query.ok === "deleted"
				? "Entrada eliminada."
				: "";
	const error =
		req.query.error === "forbidden"
			? "No puedes borrar la actividad del creador."
			: req.query.error === "notfound"
				? "Esa entrada ya no existe."
				: "";
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
			notice,
			error,
		}),
	);
});

app.post("/api/admin/activity/:id/delete", requireAdmin, sameOrigin, (req, res) => {
	const entry = getActivityById(String(req.params.id || ""));
	const wanted = String(req.body.user || "").trim();
	const suffix = wanted ? `&user=${encodeURIComponent(wanted)}` : "";
	if (!entry) return res.redirect(303, `/admin/activity?error=notfound${suffix}`);
	if (getUser(entry.username)?.role === "creator" && req.user.role !== "creator") {
		return res.redirect(303, `/admin/activity?error=forbidden${suffix}`);
	}
	const result = deleteActivity(entry.username, entry.id);
	if (result.error) return res.redirect(303, `/admin/activity?error=notfound${suffix}`);
	audit(req, "activity.delete", entry.username, entry.url || entry.query || entry.id);
	res.redirect(303, `/admin/activity?ok=deleted${suffix}`);
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

app.get("/admin/users.csv", requireAdmin, (req, res) => {
	const csvEscape = (value) => {
		let text = String(value ?? "");
		if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
		return `"${text.replaceAll('"', '""')}"`;
	};
	const users = hideCreatorData(req, listUsers(), (entry) => entry.username);
	const lines = [
		"usuario,roles,rol_principal,grupo,reglas_grupo,bloqueado,bloqueado_hasta,cambio_obligatorio,creado,ultimo_login,idioma",
	];
	for (const entry of users) {
		lines.push(
			[
				entry.username,
				(entry.roles || [entry.role]).join(" "),
				entry.role,
				getGroup(entry.group)?.name || "",
				entry.groupRules === false ? "no" : "si",
				entry.blocked ? "si" : "no",
				entry.blockedUntil || "",
				entry.mustChangePassword ? "si" : "no",
				entry.createdAt || "",
				entry.lastLoginAt || "",
				entry.lang || "",
			]
				.map(csvEscape)
				.join(","),
		);
	}
	audit(req, "users.export", "", "CSV");
	res.setHeader("Content-Type", "text/csv; charset=utf-8");
	res.setHeader(
		"Content-Disposition",
		`attachment; filename="usuarios-${new Date().toISOString().slice(0, 10)}.csv"`,
	);
	res.send(lines.join("\n"));
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

app.post("/api/admin/maintenance", requireAdmin, sameOrigin, (req, res) => {
	const enabled = String(req.body.enabled) === "1";
	const result = saveSettings({ maintenanceMode: enabled });
	if (result.error) return res.status(400).type("text/plain").send(result.error);
	if (enabled) closeNonAdminConnections();
	audit(req, enabled ? "maintenance.enable" : "maintenance.disable");
	res.redirect(303, safeNext(req.body.next || "/admin/overview"));
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

app.get("/admin/schedules", requireAdmin, (req, res) => {
	res.set("Cache-Control", "no-store");
	res.type("html").send(
		schedulesPage({
			user: req.user,
			jobs: listSchedules(),
			notice:
				req.query.ok === "created"
					? "Programación creada."
					: req.query.ok === "deleted"
						? "Programación eliminada."
						: "",
			error:
				req.query.error === "invalid-range"
					? "La fecha de fin debe ser posterior a la de inicio."
					: req.query.error === "limit"
						? "Hay demasiadas programaciones."
						: "",
		}),
	);
});

app.post("/api/admin/schedules", requireAdmin, sameOrigin, (req, res) => {
	const result = addSchedule({
		type: req.body.type,
		start: req.body.start,
		end: req.body.end,
		message: req.body.message,
		by: req.user.username,
	});
	if (result.error) return res.redirect(303, `/admin/schedules?error=${result.error}`);
	audit(
		req,
		`${result.job.type}.schedule.create`,
		result.job.id,
		`${result.job.start} → ${result.job.end}`,
	);
	res.redirect(303, "/admin/schedules?ok=created");
});

app.post("/api/admin/schedules/:id/delete", requireAdmin, sameOrigin, (req, res) => {
	const result = deleteSchedule(req.params.id);
	if (result.error) return res.redirect(303, `/admin/schedules?error=${result.error}`);
	audit(req, "schedule.delete", req.params.id);
	res.redirect(303, "/admin/schedules?ok=deleted");
});

app.get("/admin/templates", requireAdmin, (req, res) => {
	res.set("Cache-Control", "no-store");
	res.type("html").send(
		templatesPage({
			user: req.user,
			blockTemplates: listTemplates("block"),
			notesTemplates: listTemplates("notes"),
			notice: req.query.ok === "created" ? "Plantilla creada." : req.query.ok === "deleted" ? "Plantilla eliminada." : "",
			error: req.query.error === "empty" ? "La etiqueta y el texto son obligatorios." : "",
		}),
	);
});

app.post("/api/admin/templates", requireAdmin, sameOrigin, (req, res) => {
	const kind = req.body.kind === "notes" ? "notes" : "block";
	const result = addTemplate(kind, { label: req.body.label, text: req.body.text });
	if (result.error) return res.redirect(303, `/admin/templates?error=${result.error}`);
	audit(req, "template.create", result.template.label, kind);
	res.redirect(303, "/admin/templates?ok=created");
});

app.post("/api/admin/templates/:id/delete", requireAdmin, sameOrigin, (req, res) => {
	const kind = req.body.kind === "notes" ? "notes" : "block";
	const result = deleteTemplate(kind, req.params.id);
	if (result.error) return res.redirect(303, `/admin/templates?error=${result.error}`);
	audit(req, "template.delete", req.params.id, kind);
	res.redirect(303, "/admin/templates?ok=deleted");
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
		chatUploadMaxPerMinute: req.body.chatUploadMaxPerMinute,
		chatUploadMaxTotalMB: req.body.chatUploadMaxTotalMB,
		chatUploadMaxPerUserMB: req.body.chatUploadMaxPerUserMB,
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
		proxyBandwidthPerUserKbps: req.body.proxyBandwidthPerUserKbps,
		proxyMaxStreamsPerUser: req.body.proxyMaxStreamsPerUser,
		proxyMaxConnectionsPerUser: req.body.proxyMaxConnectionsPerUser,
		proxyWispBufferMB: req.body.proxyWispBufferMB,
		blockAds: req.body.blockAds === "on",
		proxyAllowStaffBrowsing: req.body.proxyAllowStaffBrowsing === "on",
		requireMfaForStaff: req.body.requireMfaForStaff === "on",
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
			integrity: verifyAudit(),
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

app.get("/admin/logs", requireAdmin, async (req, res) => {
	const unit = ["webproxy", "apache2"].includes(String(req.query.unit))
		? String(req.query.unit)
		: "webproxy";
	const lines = Math.min(1000, Math.max(20, Number(req.query.lines) || 200));
	let output = "";
	let error = "";
	try {
		const result = await execFileAsync(
			"journalctl",
			["-u", unit, "-n", String(lines), "--no-pager", "-o", "short-iso"],
			{ timeout: 15000, maxBuffer: 2 * 1024 * 1024 },
		);
		output = result.stdout || "";
	} catch (err) {
		error = "No se pudieron leer los logs: " + (err.message || "error desconocido");
	}
	res.set("Cache-Control", "no-store");
	res.type("html").send(adminLogsPage({ user: req.user, unit, lines, output, error }));
});

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
	const roles = normalizeRoleList(req.body.roles ?? req.body.role);
	if (!roles.length) return res.redirect(303, "/admin?error=invalid-role");
	for (const role of roles) {
		if (!canAssignRole(req.user.role, role)) {
			return res.redirect(303, "/admin?error=forbidden");
		}
	}
	const result = createUser(
		req.body.username,
		String(req.body.password || ""),
		roles,
	);
	if (result.error) return res.redirect(303, `/admin?error=${result.error}`);
	audit(req, "user.create", result.user.username, `roles: ${roles.join(", ")}`);
	res.redirect(303, "/admin?ok=created");
});

app.post("/api/admin/users/import", requireAdmin, sameOrigin, (req, res) => {
	const rows = Array.isArray(req.body.users) ? req.body.users : [];
	if (!rows.length) return res.status(400).json({ error: "empty" });
	if (rows.length > 200) return res.status(400).json({ error: "limit" });
	const created = [];
	const errors = [];
	for (const row of rows) {
		const username = String(row?.username || "").trim();
		const roles = normalizeRoleList(row?.roles ?? row?.role ?? "user");
		const allowed = roles.every((role) => canAssignRole(req.user.role, role));
		if (!allowed) {
			errors.push(`${username || "(sin nombre)"}: no puedes asignar esos roles`);
			continue;
		}
		const provided = String(row?.password || "").trim();
		const password = provided || crypto.randomBytes(9).toString("base64url");
		const result = createUser(username, password, roles);
		if (result.error) {
			errors.push(`${username || "(sin nombre)"}: ${result.error}`);
			continue;
		}
		audit(req, "user.create", result.user.username, `roles: ${roles.join(", ")} (importación)`);
		created.push({
			username: result.user.username,
			role: result.user.role,
			roles,
			password: provided ? "" : password,
		});
	}
	res.json({ created, errors });
});

app.post("/api/admin/users/:username/mfa-reset", requireAdmin, sameOrigin, (req, res) => {
	const target = getUser(req.params.username);
	if (!target) return res.redirect(303, "/admin?error=notfound");
	if (target.role === "creator" && req.user.role !== "creator") {
		return res.redirect(303, "/admin?error=creator-protected");
	}
	if (!canManageRole(req.user.role, target.role) && target.username !== req.user.username) {
		return res.redirect(303, "/admin?error=forbidden");
	}
	clearMfa(target.username);
	audit(req, "mfa.reset", target.username);
	res.redirect(303, "/admin?ok=mfa-reset");
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
		for (const id of revoked) {
			closeSessionConnections(id);
			notifySessionLogout(id, "password");
		}
	} else {
		destroySessionsOf(targetUser.username);
		closeUserConnections(targetUser.username);
		notifyUserLogout(targetUser.username, "password");
	}
	res.redirect(303, "/admin?ok=reset");
});

app.post("/api/admin/groups", requireAdmin, sameOrigin, (req, res) => {
	const result = createGroup(req.body.name, req.user.username);
	if (result.error) return res.redirect(303, `/admin?error=${result.error}`);
	audit(req, "group.create", result.group.name, result.group.id);
	syncClassChats();
	res.redirect(303, "/admin?ok=group-created");
});

app.post("/api/admin/groups/:id/delete", requireAdmin, sameOrigin, (req, res) => {
	const group = getGroup(req.params.id);
	if (!group) return res.redirect(303, "/admin?error=group-notfound");
	const result = deleteGroup(group.id);
	if (result.error) return res.redirect(303, `/admin?error=${result.error}`);
	closeGroupConnections(group.id);
	const cleared = clearGroupAssignments(group.id);
	syncClassChats();
	audit(req, "group.delete", group.name, `${cleared} usuarios sin grupo`);
	res.redirect(303, "/admin?ok=group-deleted");
});

function closeGroupConnections(groupId) {
	let count = 0;
	for (const member of listUsers()) {
		if (member.group !== groupId) continue;
		closeUserConnections(member.username);
		count++;
	}
	return count;
}

function syncClassChats() {
	const users = listUsers();
	syncClassChannels(
		listGroups().map((group) => ({
			id: group.id,
			name: group.name,
			members: users
				.filter((member) => member.group === group.id)
				.map((member) => member.username),
		})),
	);
}

app.get("/admin/groups/:id", requireStaff, (req, res) => {
	const group = getGroup(req.params.id);
	if (!group) return res.redirect(303, "/admin?error=group-notfound");
	let members = listUsers().filter((member) => member.group === group.id);
	if (req.user.role !== "creator") {
		members = members.filter((member) => member.role !== "creator");
	}
	const names = new Set(members.map((member) => member.username.toLowerCase()));
	const sessions = listSessions().filter((session) =>
		names.has(String(session.username || "").toLowerCase()),
	);
	const activity = getActivity({ limit: 1000 })
		.filter((entry) => names.has(String(entry.username || "").toLowerCase()))
		.slice(0, 50);
	const notice =
		req.query.ok === "rules"
			? ADMIN_OK.rules
			: req.query.ok === "bulk"
				? `Acción masiva aplicada a ${Math.max(0, Number(req.query.count) || 0)} usuario(s).`
				: "";
	res.set("Cache-Control", "no-store");
	res.type("html").send(
		groupPanelPage({
			user: req.user,
			group,
			members,
			sessions,
			activity,
			groups: listGroups(),
			canEditRules: isAdminRole(req.user.role),
			notice,
			error: ADMIN_ERRORS[req.query.error] || "",
		}),
	);
});

app.post("/api/admin/groups/:id/rules", requireAdmin, sameOrigin, (req, res) => {
	const group = getGroup(req.params.id);
	if (!group) return res.redirect(303, "/admin?error=group-notfound");
	const result = updateGroupRules(group.id, req.body, req.user.username);
	if (result.error) {
		return res.redirect(303, `/admin/groups/${group.id}?error=${result.error}`);
	}
	const closed = closeGroupConnections(group.id);
	audit(req, "group.rules", group.name, `${closed} conexiones reiniciadas`);
	res.redirect(303, `/admin/groups/${group.id}?ok=rules`);
});

app.post("/api/admin/groups/:id/bulk", requireStaff, sameOrigin, (req, res) => {
	const group = getGroup(req.params.id);
	if (!group) return res.redirect(303, "/admin?error=group-notfound");
	const action = String(req.body.action || "");
	if (!["assign", "remove", "rules-on", "rules-off", "block", "unblock", "kick"].includes(action)) {
		return res.redirect(303, `/admin/groups/${group.id}?error=bulk-invalid`);
	}
	const names = [
		...new Set(
			(Array.isArray(req.body.usernames)
				? req.body.usernames
				: req.body.usernames
					? [req.body.usernames]
					: []
			)
				.map((name) => String(name || "").trim())
				.filter(Boolean),
		),
	].slice(0, 200);
	if (!names.length) {
		return res.redirect(303, `/admin/groups/${group.id}?error=bulk-empty`);
	}
	const targetGroup =
		action === "assign" ? getGroup(String(req.body.group || "")) : null;
	if (action === "assign" && !targetGroup) {
		return res.redirect(303, `/admin/groups/${group.id}?error=group-notfound`);
	}
	let applied = 0;
	let skipped = 0;
	for (const name of names) {
		const target = getUser(name);
		if (
			!target ||
			target.role === "creator" ||
			target.username.toLowerCase() === req.user.username.toLowerCase() ||
			!canManageRole(req.user.role, target.role)
		) {
			skipped++;
			continue;
		}
		if (action === "assign") {
			const result = setUserGroup(target.username, targetGroup.id);
			if (result.error) {
				skipped++;
				continue;
			}
			closeUserConnections(target.username);
		} else if (action === "remove") {
			const result = setUserGroup(target.username, "");
			if (result.error) {
				skipped++;
				continue;
			}
			closeUserConnections(target.username);
		} else if (action === "rules-on" || action === "rules-off") {
			const result = setUserGroupRules(target.username, action === "rules-on");
			if (result.error) {
				skipped++;
				continue;
			}
			closeUserConnections(target.username);
		} else if (action === "block") {
			const result = setBlocked(target.username, true, target.blockMessage || "");
			if (result.error) {
				skipped++;
				continue;
			}
			closeUserConnections(target.username);
			notifyUserLogout(target.username, "blocked");
		} else if (action === "unblock") {
			const result = setBlocked(target.username, false, "");
			if (result.error) {
				skipped++;
				continue;
			}
		} else if (action === "kick") {
			revokeUserSessions(target.username);
			closeUserConnections(target.username);
			notifyUserLogout(target.username, "forced");
		}
		applied++;
	}
	if (action === "assign" || action === "remove") syncClassChats();
	audit(
		req,
		"group.bulk",
		group.name,
		`${action}: ${applied} aplicados, ${skipped} omitidos`,
	);
	res.redirect(303, `/admin/groups/${group.id}?ok=bulk&count=${applied}`);
});

app.post("/api/admin/users/:username/group", requireStaff, sameOrigin, (req, res) => {
	const target = getUser(req.params.username);
	if (!target) return res.redirect(303, "/admin?error=notfound");
	if (!canManageRole(req.user.role, target.role)) {
		return res.redirect(303, "/admin?error=group-forbidden");
	}
	const groupId = String(req.body.group || "").trim();
	const group = groupId ? getGroup(groupId) : null;
	if (groupId && !group) return res.redirect(303, "/admin?error=group-notfound");
	const result = setUserGroup(target.username, group?.id || "");
	if (result.error) return res.redirect(303, `/admin?error=${result.error}`);
	const applyGroupRules =
		req.body.groupRules === undefined && req.body.groupRulesPresent !== "1"
			? target.groupRules !== false
			: ["on", "1", "true"].includes(String(req.body.groupRules));
	setUserGroupRules(target.username, applyGroupRules);
	closeUserConnections(target.username);
	syncClassChats();
	audit(
		req,
		"user.group",
		target.username,
		`${group ? group.name : "sin grupo"} · reglas ${applyGroupRules ? "activadas" : "desactivadas"}`,
	);
	res.redirect(303, "/admin?ok=group");
});

app.post("/api/admin/users/:username/role", requireAdmin, sameOrigin, (req, res) => {
	const target = req.params.username;
	const roles = normalizeRoleList(req.body.roles ?? req.body.role);
	if (!roles.length) return res.redirect(303, "/admin?error=invalid-role");
	for (const role of roles) {
		if (!canAssignRole(req.user.role, role)) {
			return res.redirect(303, "/admin?error=forbidden");
		}
	}
	if (
		target.toLowerCase() === req.user.username.toLowerCase() &&
		!isAdminRole(highestRole(roles))
	) {
		return res.redirect(303, "/admin?error=self");
	}
	const result = setRoles(target, roles);
	if (result.error) return res.redirect(303, `/admin?error=${result.error}`);
	audit(req, "user.role", target, `roles: ${roles.join(", ")}`);
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
	if (blocked) {
		closeUserConnections(target.username);
		notifyUserLogout(target.username, "blocked");
	}
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
	if (until) {
		closeUserConnections(target.username);
		notifyUserLogout(target.username, "blocked");
	}
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
	if (target.role === "creator" && req.user.role !== "creator") {
		return res.redirect(303, "/admin?error=forbidden");
	}
	if (target.role === "admin" && !isAdminRole(req.user.role)) {
		return res.redirect(303, "/admin?error=forbidden");
	}
	if (target.username.toLowerCase() === req.user.username.toLowerCase()) {
		return res.redirect(303, "/admin?error=self-logout");
	}
	const count = revokeUserSessions(target.username);
	closeUserConnections(target.username);
	const notified = notifyUserLogout(target.username, "forced");
	audit(req, "user.logout", target.username, `${count} sesiones, ${notified} pestañas`);
	if (String(req.get("accept") || "").includes("application/json")) {
		return res.json({ ok: true, count, notified });
	}
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
	deleteVault(target);
	closeUserConnections(target);
	notifyUserLogout(target, "deleted");
	syncClassChats();
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

app.get(["/", "/index.html"], (req, res, next) => {
	if (isStaffRole(req.user.role) && !getSettings().proxyAllowStaffBrowsing) {
		return res.status(403).set("Cache-Control", "no-store").type("html").send(
			blockedPage({
				title: "Navegación restringida",
				message:
					"Por seguridad, las cuentas de administración y moderación no pueden navegar por webs de terceros. Cierra sesión y entra con una cuenta de alumno para usar el proxy.",
				user: req.user,
			}),
		);
	}
	next();
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
applySchedules();
setInterval(applySchedules, 30_000).unref();
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
			if (user && !isAdminRole(user.role) && !isUserScheduleOpen(user, tz)) {
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
		(isStaffRole(session.role) && !settings.proxyAllowStaffBrowsing) ||
		(settings.quarantineMode && !isAdminRole(session.role)) ||
		(settings.maintenanceMode && !isAdminRole(session.role)) ||
		session.mustChangePassword ||
		(!isAdminRole(session.role) &&
			!isUserScheduleOpen(currentUser, settings.timezone))
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
	const connectionLimit = wispConnectionLimit(session.username);
	if (!connectionLimit.allowed) {
		metric("wisp_connections_throttled_total");
		socket.write("HTTP/1.1 503 Service Unavailable\r\nRetry-After: 5\r\nConnection: close\r\n\r\n");
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

syncClassChats();

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT) || 3030;
server.listen(PORT, HOST, () => {
	console.log(`Proxy web escuchando en http://${HOST}:${PORT}`);
});
