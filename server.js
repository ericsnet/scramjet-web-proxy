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
	recordIpFailure,
	flushSessions,
} from "./auth.js";
import {
	loginPage,
	accountPage,
	adminPage,
	activityPage,
	sessionsPage,
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
} from "./pages.js";
import {
	recordActivity,
	getActivity,
	countActivity,
	activityCounts,
	clearActivity,
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
import { isPrivateDestination } from "./net-guard.js";
import QRCode from "qrcode";
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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
app.set("trust proxy", true);
app.disable("x-powered-by");
app.use(express.urlencoded({ extended: false, limit: "64kb" }));
app.use(express.json({ limit: "64kb" }));
app.use((req, res, next) => {
	metric("requests_total");
	next();
});

/* ------------------------------- utilidades ------------------------------- */

function escapeRegExp(value) {
	return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applyWispBlocklist() {
	if (!wisp.options) return;
	// El bloqueo se decide por conexión para respetar listas por usuario,
	// categorías y excepciones aprobadas.
	wisp.options.hostname_whitelist = null;
	wisp.options.hostname_blacklist = null;
}

applyWispBlocklist();
initCategories().then(() => {
	if ((getSettings().categories || []).length) {
		return refreshCategories(false);
	}
}).catch((err) => console.error("Categorías:", err.message));

function clientIp(req) {	return String(
		req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
			req.socket?.remoteAddress ||
			"",
	).slice(0, 64);
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

function requireAuth(req, res, next) {
	const session = getSession(req);
	if (!session) {
		if (req.path.startsWith("/api/")) {
			return res.status(401).json({ error: "unauthorized" });
		}
		const nextUrl = encodeURIComponent(req.originalUrl || "/");
		return res.redirect(303, `/login?next=${nextUrl}`);
	}

	const settings = getSettings();
	if (settings.quarantineMode && session.role !== "admin") {
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
	if (settings.maintenanceMode && session.role !== "admin") {
		if (req.path.startsWith("/api/")) {
			return res.status(503).json({ error: "maintenance" });
		}
		return res.redirect(303, "/maintenance");
	}

	if (
		session.role !== "admin" &&
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
	if (!req.user || req.user.role !== "admin") {
		return res.status(403).type("text/plain").send("Solo administradores.");
	}
	next();
}

function requireStaff(req, res, next) {
	if (!req.user || !["admin", "moderator"].includes(req.user.role)) {
		return res.status(403).type("text/plain").send("Solo administradores o moderadores.");
	}
	next();
}

// Protección CSRF: exige Origin válido en peticiones que cambian estado.
function sameOrigin(req, res, next) {
	const site = req.headers["sec-fetch-site"];
	if (site && site !== "same-origin" && site !== "none") {
		return res.status(403).type("text/plain").send("Origen no válido.");
	}
	const origin = req.headers.origin;
	if (!origin) {
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
		return res.status(403).type("text/plain").send("Origen requerido.");
	}
	try {
		const parsed = new URL(origin);
		const local =
			parsed.protocol === "http:" &&
			["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
		if (parsed.protocol !== "https:" && !local) {
			return res.status(403).type("text/plain").send("Origen no válido.");
		}
		if (parsed.host !== req.headers.host) {
			return res.status(403).type("text/plain").send("Origen no válido.");
		}
	} catch {
		return res.status(403).type("text/plain").send("Origen no válido.");
	}
	next();
}

// Para descargas GET: bloquea navegación cruzada si el navegador lo indica.
function sameSiteRequest(req, res, next) {
	const site = req.headers["sec-fetch-site"];
	if (site && site !== "same-origin" && site !== "none") {
		return res.status(403).type("text/plain").send("Origen no válido.");
	}
	const referer = req.headers.referer;
	if (referer) {
		try {
			if (new URL(referer).host !== req.headers.host) {
				return res.status(403).type("text/plain").send("Origen no válido.");
			}
		} catch {
			return res.status(403).type("text/plain").send("Origen no válido.");
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
			if (!user || user.role !== "admin" || user.effectivelyBlocked) keep = false;
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
	if (!user || user.role === "admin") return { blocked: false };
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
	if (!user || user.role === "admin") return { blocked: false };
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
	rate: "Demasiados intentos fallidos. Espera unos minutos.",
	blocked: "Esta cuenta está bloqueada. Contacta con el administrador.",
	temporary: "Esta cuenta está bloqueada temporalmente. Contacta con el administrador.",
	maintenance: "El proxy está en mantenimiento. Solo los administradores pueden entrar.",
};

const ACCOUNT_ERRORS = {
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
};

/* --------------------------- rutas públicas --------------------------- */

app.get("/healthz", (req, res) => res.type("text/plain").send("ok"));

app.get("/robots.txt", (req, res) => {
	res.type("text/plain").send("User-agent: *\nDisallow: /\n");
});

app.get("/favicon.svg", (req, res) => {
	res.set("Cache-Control", "public, max-age=86400");
	res.type("image/svg+xml").sendFile(path.join(__dirname, "public/favicon.svg"));
});

app.get("/favicon.ico", (req, res) => res.redirect(302, "/favicon.svg"));

app.get("/page-i18n.js", (req, res) => {
	res.set("Cache-Control", "public, max-age=3600");
	res.type("application/javascript").sendFile(path.join(__dirname, "public/page-i18n.js"));
});

app.get("/api/config", (req, res) => {
	const settings = getSettings();
	res.set("Cache-Control", "no-store");
	res.json({
		landingTitle: settings.landingTitle,
		landingSubtitle: settings.landingSubtitle,
		quickLinks: settings.quickLinks,
		defaultSearchEngine: settings.defaultSearchEngine,
		maintenanceMode: settings.maintenanceMode,
		maintenanceMessage: settings.maintenanceMessage,
		blockedSites: settings.blockedSites || [],
		allowedSites: settings.allowedSites || [],
		accessMode: settings.accessMode,
	});
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
		if (settings.maintenanceMode && session.role !== "admin") {
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
		}),
	);
});

app.get("/quarantine", (req, res) => {
	const settings = getSettings();
	const session = getSession(req);
	if (session?.role === "admin") return res.redirect(303, "/");
	res.status(503).set("Cache-Control", "no-store").type("html").send(
		quarantinePage({ settings, user: session || null }),
	);
});

app.get("/maintenance", (req, res) => {
	const settings = getSettings();
	const session = getSession(req);
	if (session?.role === "admin") return res.redirect(303, "/");
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
	if (session?.role === "admin") return res.redirect(303, "/");
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

app.post("/api/login", sameOrigin, (req, res) => {
	const username = normalizeUsername(req.body.username);
	const password = String(req.body.password || "");
	const next = safeNext(req.body.next);
	const settings = getSettings();
	const ip = clientIp(req);

	if (isIpRateLimited(ip)) {
		metric("logins_failed_total");
		addAudit({
			actor: username || "desconocido",
			action: "login.rate",
			ip,
			userAgent: clientUa(req),
		});
		return res.redirect(303, `/login?error=rate&next=${encodeURIComponent(next)}`);
	}

	const user = verifyLogin(username, password);
	if (!user) {
		recordFailedLogin(username);
		recordIpFailure(ip);
		metric("logins_failed_total");
		addAudit({
			actor: username || "desconocido",
			action: "login.fail",
			ip,
			userAgent: clientUa(req),
		});
		return res.redirect(303, `/login?error=1&next=${encodeURIComponent(next)}`);
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
	if (settings.quarantineMode && user.role !== "admin") {
		addAudit({
			actor: user.username,
			action: "login.quarantine",
			ip,
			userAgent: clientUa(req),
		});
		return res.redirect(303, "/quarantine");
	}
	if (settings.maintenanceMode && user.role !== "admin") {
		addAudit({
			actor: user.username,
			action: "login.maintenance",
			ip,
			userAgent: clientUa(req),
		});
		return res.redirect(303, `/login?error=maintenance&next=${encodeURIComponent(next)}`);
	}
	if (
		user.role !== "admin" &&
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

app.get("/api/me", (req, res) => {
	const user = getUser(req.user.username);
	res.set("Cache-Control", "no-store");
	res.json({
		username: req.user.username,
		role: req.user.role,
		mustChangePassword: req.user.mustChangePassword,
		blockedSites: user?.blockedSites || [],
		schedule: user?.schedule || null,
	});
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
				: "";
	const error = ACCOUNT_ERRORS[req.query.error] || "";
	res.set("Cache-Control", "no-store");
	res.type("html").send(
		accountPage({
			user: req.user,
			sessions,
			currentId: req.user.id,
			allowPasswordChange: settings.allowUserPasswordChange || req.user.role === "admin",
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

app.post("/api/account/password", sameOrigin, (req, res) => {
	const settings = getSettings();
	if (
		!settings.allowUserPasswordChange &&
		req.user.role !== "admin" &&
		!req.user.mustChangePassword
	) {
		return res.redirect(303, "/account?error=disabled");
	}
	const current = String(req.body.current || "");
	const password = String(req.body.password || "");
	const confirm = String(req.body.confirm || "");

	if (!verifyUserPassword(req.user.username, current)) {
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

app.get("/api/qr", async (req, res) => {
	let value = String(req.query.url || "").trim();
	if (!value) {
		try {
			value = fs.readFileSync(path.join(__dirname, "data/public-url.txt"), "utf8").trim();
		} catch {}
	}
	if (!value) value = `${req.protocol}://${req.headers.host}/`;
	try {
		const parsed = new URL(value);
		if (!/^https?:$/.test(parsed.protocol)) throw new Error("bad");
		const svg = await QRCode.toString(parsed.href, {
			type: "svg",
			margin: 1,
			width: 240,
			color: { dark: "#0b0f14", light: "#ffffff" },
		});
		res.type("image/svg+xml").set("Cache-Control", "no-store").send(svg);
	} catch {
		res.status(400).type("text/plain").send("URL no válida");
	}
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
	res.set("Cache-Control", "no-store");
	res.type("html").send(
		adminPage({
			user: req.user,
			users: listUsers(),
			counts: activityCounts(),
			canManage: req.user.role === "admin",
			quarantine: getSettings().quarantineMode,
			quarantineAttempts: listAudit({
				action: "quarantine.attempt",
				limit: 20,
			}),
			error,
			notice,
		}),
	);
});

app.get("/admin/requests", requireStaff, (req, res) => {
	const status = ["pending", "approved", "denied"].includes(String(req.query.status))
		? String(req.query.status)
		: "pending";
	res.set("Cache-Control", "no-store");
	res.type("html").send(
		requestsPage({
			user: req.user,
			requests: listRequests({ status }),
			status,
			canManage: req.user.role === "admin" || req.user.role === "moderator",
		}),
	);
});

app.post("/api/admin/requests/:id/approve", requireStaff, sameOrigin, (req, res) => {
	const request = listRequests().find((r) => r.id === req.params.id);
	if (!request) return res.redirect(303, "/admin/requests?error=notfound");
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
	resolveRequest(request.id, "denied", req.user.username);
	audit(req, "request.deny", request.username, request.host);
	res.redirect(303, "/admin/requests?status=pending");
});

app.get("/admin/sessions", requireStaff, (req, res) => {
	const users = listUsers();
	const wanted = String(req.query.user || "");
	const filter = users.some(
		(u) => u.username.toLowerCase() === wanted.toLowerCase(),
	)
		? wanted
		: "";
	const sessions = listSessions().filter(
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
	if (targetUser?.role === "admin" && req.user.role !== "admin") {
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
	const users = listUsers();
	const wanted = String(req.query.user || "");
	const filter = users.some(
		(u) => u.username.toLowerCase() === wanted.toLowerCase(),
	)
		? wanted
		: "";
	const notice = req.query.ok === "cleared" ? "Historial vaciado." : "";
	const settings = getSettings();
	res.set("Cache-Control", "no-store");
	res.type("html").send(
		activityPage({
			user: req.user,
			users,
			counts: activityCounts(),
			activity: getActivity({ username: filter, limit: 500 }),
			filter,
			notice,
			retention: settings.activityPerUser,
			activityEnabled: settings.activityEnabled,
			canManage: req.user.role === "admin",
		}),
	);
});

app.post("/api/admin/activity/clear", requireAdmin, sameOrigin, (req, res) => {
	const wanted = String(req.body.user || "").trim();
	const target = wanted ? getUser(wanted) : null;
	clearActivity(target ? target.username : "");
	audit(req, "activity.clear", target ? target.username : "", target ? "historial del usuario" : "todo el historial");
	const suffix = target ? `&user=${encodeURIComponent(target.username)}` : "";
	res.redirect(303, `/admin/activity?ok=cleared${suffix}`);
});

app.get("/admin/activity.csv", requireAdmin, sameSiteRequest, (req, res) => {
	const wanted = String(req.query.user || "").trim();
	const target = wanted ? getUser(wanted) : null;
	const rows = getActivity({
		username: target ? target.username : "",
		limit: 10000,
	});
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
	const activity = exportActivity();
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
	for (const event of exportAudit()) {
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
		lockoutMinutes: req.body.lockoutMinutes,
		activityEnabled: req.body.activityEnabled === "on",
		activityPerUser: req.body.activityPerUser,
		activityTotal: req.body.activityTotal,
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

app.get("/admin/audit", requireStaff, (req, res) => {
	const filters = {
		actor: String(req.query.actor || ""),
		action: String(req.query.action || ""),
		limit: 300,
	};
	res.set("Cache-Control", "no-store");
	res.type("html").send(
		auditPage({
			user: req.user,
			events: listAudit(filters),
			users: listUsers(),
			actions: auditActions(),
			filters,
			canManage: req.user.role === "admin",
			notice: req.query.ok === "cleared" ? "Auditoría vaciada." : "",
		}),
	);
});

app.get("/admin/audit.csv", requireAdmin, (req, res) => {
	const filters = {
		actor: String(req.query.actor || ""),
		action: String(req.query.action || ""),
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

app.get("/admin/backup.json", requireAdmin, (req, res) => {
	audit(req, "backup.download");
	const usersFile = JSON.parse(
		fs.readFileSync(path.join(__dirname, "data/users.json"), "utf8"),
	);
	const backup = {
		version: 1,
		exportedAt: new Date().toISOString(),
		users: usersFile.users || {},
		activity: exportActivity(),
		settings: getSettings(),
		audit: exportAudit(),
		bookmarks: exportBookmarks(),
		requests: exportRequests(),
	};
	res.setHeader("Content-Type", "application/json; charset=utf-8");
	res.setHeader(
		"Content-Disposition",
		`attachment; filename="proxy-backup-${new Date().toISOString().slice(0, 10)}.json"`,
	);
	res.send(JSON.stringify(backup, null, 2));
});

app.post("/api/admin/backup/create", requireAdmin, sameOrigin, (req, res) => {
	const info = createBackup("manual");
	audit(req, "backup.create", info.name);
	res.redirect(303, "/admin/system?ok=backup");
});

app.get("/admin/backup/download/:name", requireAdmin, sameSiteRequest, (req, res) => {
	const full = backupPath(req.params.name);
	if (!full) return res.status(404).type("text/plain").send("Copia no encontrada.");
	audit(req, "backup.download", req.params.name);
	res.download(full, path.basename(full));
});

app.post("/api/admin/backup/restore", requireAdmin, sameOrigin, (req, res) => {
	const name = String(req.body.name || "");
	const password = String(req.body.password || "");
	const confirm = String(req.body.confirm || "");
	if (confirm !== "RESTAURAR") {
		return res.status(400).type("html").send("Confirmación incorrecta. Escribe RESTAURAR.");
	}
	if (!verifyUserPassword(req.user.username, password)) {
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
	const result = createUser(
		req.body.username,
		String(req.body.password || ""),
		req.body.role,
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
	const role = req.body.role;
	if (
		target.toLowerCase() === req.user.username.toLowerCase() &&
		role !== "admin"
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
	if (target.role === "admin" && req.user.role !== "admin") {
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
	if (target.role === "admin" && req.user.role !== "admin") {
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
	if (target.role === "admin" && req.user.role !== "admin") {
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
			if (user && user.role !== "admin" && !isWithinSchedule(user, tz)) {
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
	process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

server.on("upgrade", (req, socket, head) => {
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
		(settings.quarantineMode && session.role !== "admin") ||
		(settings.maintenanceMode && session.role !== "admin") ||
		session.mustChangePassword ||
		(session.role !== "admin" &&
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
		isAdmin: () => getUser(session.username)?.role === "admin",
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
