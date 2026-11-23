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
	isRateLimited,
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
	recordLoginSuccess,
	listSessions,
	sessionsForUser,
	sessionCount,
	revokeSessionById,
	revokeUserSessions,
	isIpRateLimited,
	recordIpFailure,
	clearIpFailures,
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
} from "./pages.js";
import {
	recordActivity,
	getActivity,
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
	flushAudit,
} from "./audit.js";
import { getSettings, saveSettings, resetSettings } from "./settings.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const nm = (pkg, sub) => path.join(__dirname, "node_modules/@mercuryworkshop", pkg, sub);
const execFileAsync = promisify(execFile);

const app = express();
app.set("trust proxy", true);
app.disable("x-powered-by");
app.use(express.urlencoded({ extended: false, limit: "64kb" }));
app.use(express.json({ limit: "64kb" }));

/* ------------------------------- utilidades ------------------------------- */

function escapeRegExp(value) {
	return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applyWispBlocklist() {
	if (!wisp.options) return;
	const hosts = getSettings().blockedSites || [];
	wisp.options.hostname_blacklist = hosts.length
		? hosts.map(
				(host) => new RegExp(`^(.+\\.)?${escapeRegExp(host)}$`, "i"),
			)
		: null;
}

applyWispBlocklist();

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
	if (settings.maintenanceMode && session.role !== "admin") {
		if (req.path.startsWith("/api/")) {
			return res.status(503).json({ error: "maintenance" });
		}
		return res.redirect(303, "/maintenance");
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
	if (req.user?.role !== "admin") {
		return res.status(403).type("text/plain").send("Solo administradores.");
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
				if (new URL(referer).host === req.headers.host) return next();
			} catch {}
		}
		return res.status(403).type("text/plain").send("Origen requerido.");
	}
	try {
		if (new URL(origin).host !== req.headers.host) {
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
	notfound: "Usuario no encontrado.",
	"last-admin": "Debe quedar al menos un administrador activo.",
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
	});
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

app.post("/api/login", sameOrigin, (req, res) => {
	const username = String(req.body.username || "").trim();
	const password = String(req.body.password || "");
	const next = safeNext(req.body.next);
	const settings = getSettings();
	const ip = clientIp(req);

	if (isRateLimited(username) || isIpRateLimited(ip)) {
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
		addAudit({
			actor: username || "desconocido",
			action: "login.fail",
			ip,
			userAgent: clientUa(req),
		});
		return res.redirect(303, `/login?error=1&next=${encodeURIComponent(next)}`);
	}
	if (user.blocked) {
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
	if (settings.maintenanceMode && user.role !== "admin") {
		addAudit({
			actor: user.username,
			action: "login.maintenance",
			ip,
			userAgent: clientUa(req),
		});
		return res.redirect(303, `/login?error=maintenance&next=${encodeURIComponent(next)}`);
	}

	clearFailedLogins(username);
	clearIpFailures(ip);
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
	res.set("Cache-Control", "no-store");
	res.json({
		username: req.user.username,
		role: req.user.role,
		mustChangePassword: req.user.mustChangePassword,
	});
});

app.post("/api/activity", sameOrigin, (req, res) => {
	recordActivity(req.user.username, {
		url: typeof req.body.url === "string" ? req.body.url : "",
		query: typeof req.body.query === "string" ? req.body.query : "",
	});
	res.status(204).end();
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

/* ------------------------------ administración ------------------------------ */

app.get("/admin", requireAdmin, (req, res) => {
	const error = ADMIN_ERRORS[req.query.error] || "";
	const notice = ADMIN_OK[req.query.ok] || "";
	res.set("Cache-Control", "no-store");
	res.type("html").send(
		adminPage({
			user: req.user,
			users: listUsers(),
			counts: activityCounts(),
			error,
			notice,
		}),
	);
});

app.get("/admin/sessions", requireAdmin, (req, res) => {
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

app.post("/api/admin/sessions/:id/revoke", requireAdmin, sameOrigin, (req, res) => {
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

app.get("/admin/activity", requireAdmin, (req, res) => {
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

app.get("/admin/settings", requireAdmin, (req, res) => {
	const notice = ADMIN_OK[req.query.ok] || "";
	const error = req.query.error ? String(req.query.error) : "";
	res.set("Cache-Control", "no-store");
	res.type("html").send(
		settingsPage({ user: req.user, settings: getSettings(), notice, error }),
	);
});

app.post("/api/admin/settings", requireAdmin, sameOrigin, (req, res) => {
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
	const oldBlocked = JSON.stringify(getSettings().blockedSites || []);
	const payload = {
		sessionHours: req.body.sessionHours,
		maxSessionsPerUser: req.body.maxSessionsPerUser,
		maxLoginAttempts: req.body.maxLoginAttempts,
		lockoutMinutes: req.body.lockoutMinutes,
		activityEnabled: req.body.activityEnabled === "on",
		activityPerUser: req.body.activityPerUser,
		activityTotal: req.body.activityTotal,
		maintenanceMode: req.body.maintenanceMode === "on",
		maintenanceMessage: req.body.maintenanceMessage,
		defaultSearchEngine: req.body.defaultSearchEngine,
		landingTitle: req.body.landingTitle,
		landingSubtitle: req.body.landingSubtitle,
		quickLinks,
		allowUserPasswordChange: req.body.allowUserPasswordChange === "on",
		blockedSites: req.body.blockedSites,
	};
	const result = saveSettings(payload);
	if (result.error) {
		return res.status(400).type("html").send(
			settingsPage({
				user: req.user,
				settings: getSettings(),
				error: result.error,
			}),
		);
	}
	if (result.settings?.maintenanceMode && !wasMaintenance) {
		closeNonAdminConnections();
	}
	applyWispBlocklist();
	if (JSON.stringify(result.settings?.blockedSites || []) !== oldBlocked) {
		closeNonAdminConnections();
	}
	trimActivity();
	audit(req, "settings.save");
	res.redirect(303, "/admin/settings?ok=saved");
});

app.post("/api/admin/settings/reset", requireAdmin, sameOrigin, (req, res) => {
	const oldBlocked = JSON.stringify(getSettings().blockedSites || []);
	resetSettings();
	applyWispBlocklist();
	if (JSON.stringify(getSettings().blockedSites || []) !== oldBlocked) {
		closeNonAdminConnections();
	}
	trimActivity();
	audit(req, "settings.reset");
	res.redirect(303, "/admin/settings?ok=reset_settings");
});

app.get("/admin/audit", requireAdmin, (req, res) => {
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
		systemPage({ user: req.user, stats, services, funnel, counts, url }),
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
	};
	res.setHeader("Content-Type", "application/json; charset=utf-8");
	res.setHeader(
		"Content-Disposition",
		`attachment; filename="proxy-backup-${new Date().toISOString().slice(0, 10)}.json"`,
	);
	res.send(JSON.stringify(backup, null, 2));
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

app.post("/api/admin/users/:username/block", requireAdmin, sameOrigin, (req, res) => {
	const target = getUser(req.params.username);
	if (!target) return res.redirect(303, "/admin?error=notfound");
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

app.post("/api/admin/users/:username/block-until", requireAdmin, sameOrigin, (req, res) => {
	const target = getUser(req.params.username);
	if (!target) return res.redirect(303, "/admin?error=notfound");
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

app.post("/api/admin/users/:username/logout", requireAdmin, sameOrigin, (req, res) => {
	const target = getUser(req.params.username);
	if (!target) return res.redirect(303, "/admin?error=notfound");
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

setInterval(() => {
	const active = new Set(listSessions().map((s) => s.id));
	for (const id of wispConnections.keys()) {
		if (!active.has(id)) closeSessionConnections(id);
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
	if (
		!session ||
		(settings.maintenanceMode && session.role !== "admin") ||
		session.mustChangePassword
	) {
		socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
		socket.destroy();
		return;
	}
	trackWisp(session.id, session.username, socket);
	wisp.routeRequest(req, socket, head, {
		username: session.username,
		isAdmin: () => getUser(session.username)?.role === "admin",
	});
});

server.listen(3030, "127.0.0.1", () => {
	console.log("Proxy web escuchando en http://127.0.0.1:3030");
});
