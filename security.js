import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { normalizeIp, preferredIp } from "./ip.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const FILE = path.join(DATA_DIR, "security.json");
const MAX_ALERTS = 500;
const DEVICE_COOKIE = "pw_device";
const HOST_DEVICE_COOKIE = "__Host-pw_device";
const DEVICE_KEY_FILE = path.join(DATA_DIR, "device.key");
const WINDOW_MS = 10 * 60 * 1000;
const ALERT_THRESHOLD = 8;
const ALERT_COOLDOWN_MS = 2 * 60 * 1000;
const DISMISS_COOLDOWN_MS = 15 * 60 * 1000;
const dismissCooldowns = new Map();
const MAX_ALERT_EVENTS = 200;
const MAX_TRACKER_EVENTS = 500;

let state = { alerts: [], banned: {}, logins: [] };
let saveTimer = null;
let dirty = false;
const trackers = new Map();

const SKIP_PATH =
	/^\/(?:scramjet|controller|libcurl|favicon|page-i18n\.js|chat-notify\.js|chat\.js|chat\.css|global-search\.js|index\.js|index\.css|sw\.js|healthz|robots\.txt|admin\/error-preview|account-icon\.js|monitor\.js|session-guard\.js|password-manager\.(?:js|css)|error-503\.html|invite|avatar)/;

// Endpoints que el propio panel consulta periódicamente. No son navegación
// humana y no deben contar como ráfaga ni como intervalos automatizados.
const ROUTINE_PATH =
	/^(?:\/api\/(?:chat\/(?:unread|channels|read|messages|files|notifications)|me|lang|config|admin\/(?:traffic|monitor))|\/(?:design|pentest|qa|reports))$/;
const ROUTINE_ANY_METHOD =
	/^\/(?:api\/(?:chat\/(?:read|unread|channels)|me|lang|session\/events|admin\/(?:traffic|monitor)))$/;

const BOT_UA =
	/curl|wget|python-requests|python-urllib|aiohttp|httpx|scrapy|headlesschrome|phantomjs|puppeteer|playwright|selenium|go-http-client|okhttp|java\/|node-fetch|axios|bot\b|spider|crawler/i;

const SENSITIVE_KEY = /pass|password|secret|token|authorization|cookie|api[_-]?key|session/i;

function saveNow() {
	if (!dirty) return;
	try {
		fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
		const tmp = `${FILE}.tmp`;
		fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
		fs.renameSync(tmp, FILE);
		dirty = false;
	} catch (err) {
		console.error("No se pudo guardar security.json:", err.message);
	}
}

function scheduleSave() {
	dirty = true;
	if (saveTimer) return;
	saveTimer = setTimeout(() => {
		saveTimer = null;
		saveNow();
	}, 1000);
	saveTimer.unref?.();
}

function normalizeAlertRecord(alert) {
	const ips = new Set();
	for (const value of Array.isArray(alert.ips) ? alert.ips : []) {
		const ip = normalizeIp(value);
		if (ip) ips.add(ip);
	}
	const direct = normalizeIp(alert.ip);
	if (direct) ips.add(direct);
	const list = [...ips];
	return {
		...alert,
		ips: list,
		ip: preferredIp(list) || direct || "",
	};
}

function mergeOpenAlerts(alerts) {
	const out = [];
	const byKey = new Map();
	for (const source of alerts) {
		const alert = normalizeAlertRecord(source);
		if (alert.status !== "open") {
			out.push(alert);
			continue;
		}
		const key = alert.device ? `device:${alert.device}` : `ip:${alert.ip}`;
		const existing = byKey.get(key);
		if (!existing) {
			byKey.set(key, alert);
			out.push(alert);
			continue;
		}
		existing.ips = [...new Set([...(existing.ips || []), ...(alert.ips || []), alert.ip].filter(Boolean))];
		existing.ip = preferredIp(existing.ips) || existing.ip;
		existing.score = Math.max(existing.score || 0, alert.score || 0);
		existing.count = (existing.count || 0) + (alert.count || 0);
		existing.firstSeen =
			new Date(alert.firstSeen) < new Date(existing.firstSeen)
				? alert.firstSeen
				: existing.firstSeen;
		if (new Date(alert.lastSeen) > new Date(existing.lastSeen)) {
			existing.lastSeen = alert.lastSeen;
			existing.lastPath = alert.lastPath;
			existing.lastMethod = alert.lastMethod;
			existing.statusCode = alert.statusCode;
			existing.userAgent = alert.userAgent;
		}
		existing.reasons = [...new Set([...(existing.reasons || []), ...(alert.reasons || [])])].slice(0, 12);
		existing.events = [...(existing.events || []), ...(alert.events || [])]
			.sort((a, b) => new Date(a.at) - new Date(b.at))
			.slice(-MAX_ALERT_EVENTS);
		existing.username = existing.username || alert.username || "";
		existing.device = existing.device || alert.device || "";
		existing.bot = !!(existing.bot || alert.bot);
		existing.kind = existing.kind || alert.kind || "";
	}
	return out;
}

function load() {
	try {
		fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
		if (!fs.existsSync(FILE)) return;
		const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
		if (Array.isArray(data.alerts)) {
			state.alerts = mergeOpenAlerts(data.alerts.slice(-MAX_ALERTS));
		}
		if (data.banned && typeof data.banned === "object" && !Array.isArray(data.banned)) {
			state.banned = {};
			for (const [rawKey, entry] of Object.entries(data.banned)) {
				const type = entry?.type || (rawKey.includes(":") ? rawKey.split(":")[0] : "ip");
				const rawValue = entry?.value || (rawKey.includes(":") ? rawKey.slice(rawKey.indexOf(":") + 1) : rawKey);
				const value = type === "ip" ? normalizeIp(rawValue) : rawValue;
				const key = `${type}:${value}`;
				state.banned[key] = { ...entry, type, value };
			}
		}
		if (Array.isArray(data.logins)) {
			state.logins = data.logins
				.filter(
					(entry) =>
						entry &&
						typeof entry.username === "string" &&
						typeof entry.ip === "string" &&
						Number.isFinite(new Date(entry.at).getTime()),
				)
				.map((entry) => ({ ...entry, ip: normalizeIp(entry.ip) }))
				.slice(-3000);
		}
		dirty = true;
		saveNow();
	} catch (err) {
		console.error("No se pudo cargar security.json:", err.message);
		state = { alerts: [], banned: {}, logins: [] };
	}
}

function clientIp(req) {
	return normalizeIp(String(req.ip || req.socket?.remoteAddress || "").slice(0, 64));
}

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

function deviceSecret() {
	if (!fs.existsSync(DEVICE_KEY_FILE)) {
		fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
		fs.writeFileSync(DEVICE_KEY_FILE, crypto.randomBytes(32).toString("hex"), {
			mode: 0o600,
		});
	}
	return fs.readFileSync(DEVICE_KEY_FILE, "utf8").trim();
}

function signDevice(id) {
	return crypto
		.createHmac("sha256", deviceSecret())
		.update(String(id))
		.digest("hex")
		.slice(0, 16);
}

function validDeviceCookie(raw) {
	const [id, signature] = String(raw || "").split(".");
	if (!/^[a-f0-9]{32}$/i.test(id) || !/^[a-f0-9]{16}$/i.test(signature)) {
		return "";
	}
	const expected = signDevice(id);
	try {
		return crypto.timingSafeEqual(
			Buffer.from(signature.toLowerCase()),
			Buffer.from(expected),
		)
			? id
			: "";
	} catch {
		return "";
	}
}

function deviceId(req, res) {
	const secure = !!req.secure;
	const name = secure ? HOST_DEVICE_COOKIE : DEVICE_COOKIE;
	const existing = validDeviceCookie(cookieValue(req, name));
	if (existing) return existing;

	const id = crypto.randomBytes(16).toString("hex");
	if (res) {
		const cookie = `${name}=${id}.${signDevice(id)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure ? "; Secure" : ""}`;
		try {
			res.append("Set-Cookie", cookie);
		} catch {
			res.setHeader("Set-Cookie", cookie);
		}
	}
	return id;
}

function flatten(value, depth = 0, key = "") {
	if (depth > 3 || value === null || value === undefined) return "";
	if (SENSITIVE_KEY.test(key)) return "";
	if (typeof value === "string") return value.slice(0, 500);
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	if (Array.isArray(value)) return value.map((item) => flatten(item, depth + 1, key)).join(" ");
	if (typeof value === "object") {
		return Object.entries(value)
			.map(([childKey, child]) => flatten(child, depth + 1, childKey))
			.join(" ");
	}
	return "";
}

function analyzeText(text) {
	const reasons = [];
	let score = 0;
	const value = String(text || "").slice(0, 4000);
	const lower = value.toLowerCase();

	if (/(?:\.\.\/|%2e%2e|%252e|\.\.\\)/.test(lower)) {
		score += 8;
		reasons.push("Path traversal");
	}
	if (/(?:union\s+select|information_schema|xp_cmdshell|or\s+1\s*=\s*1|sleep\s*\(|benchmark\s*\()/i.test(value)) {
		score += 9;
		reasons.push("Inyección SQL");
	}
	if (/(?:<script\b|onerror\s*=|onload\s*=|javascript\s*:)/i.test(value)) {
		score += 5;
		reasons.push("XSS");
	}
	if (/(?:\$\(|;\s*(?:cat|ls|whoami|id|curl|wget|nc|bash|sh)\b|\|\s*(?:cat|whoami|id|nc)\b)/i.test(value)) {
		score += 8;
		reasons.push("Inyección de comandos");
	}
	if (/\$\{jndi:|\$\{lower:|\$\{env:/.test(lower)) {
		score += 10;
		reasons.push("Exploit Log4Shell");
	}
	if (/%00|\u0000/.test(value)) {
		score += 7;
		reasons.push("Byte nulo");
	}
	if (/(?:127\.0\.0\.1|169\.254\.169\.254|localhost|\[::1\])/i.test(value)) {
		score += 6;
		reasons.push("Destino local/SSRF");
	}
	return { score, reasons };
}

function safePath(req) {
	try {
		const url = new URL(String(req.originalUrl || req.url || ""), "https://local.invalid");
		for (const key of [...url.searchParams.keys()]) {
			if (SENSITIVE_KEY.test(key)) url.searchParams.set(key, "[redactado]");
		}
		return `${url.pathname}${url.search}`.slice(0, 300);
	} catch {
		return String(req.path || "").slice(0, 300);
	}
}

function analyzeRequest(req, res) {
	const url = String(req.originalUrl || req.url || "");
	const pathname = String(req.path || "");
	const reasons = [];
	let score = 0;

	if (/^\/(?:\.env|\.git|\.aws|\.ssh|wp-admin|wp-login|wp-config|phpmyadmin|adminer|server-status|actuator|xmlrpc\.php|vendor\/phpunit)/i.test(pathname)) {
		score += 9;
		reasons.push("Ruta de escaneo");
	}
	if (req.method && !["GET", "HEAD", "POST", "OPTIONS"].includes(req.method)) {
		score += 7;
		reasons.push("Método sospechoso");
	}
	if (url.length > 2000) {
		score += 4;
		reasons.push("URL anormalmente larga");
	}

	const query = (() => {
		try {
			return new URL(url, "https://local.invalid").search.slice(0, 2000);
		} catch {
			return "";
		}
	})();
	const body = flatten(req.body);
	const textResult = analyzeText(`${url} ${query} ${body}`);
	score += textResult.score;
	reasons.push(...textResult.reasons);

	const status = Number(res.statusCode) || 0;
	if (status === 405 || status === 501) {
		score += 3;
		reasons.push("Método no permitido");
	} else if (status === 401 || status === 403) {
		score += 2;
		reasons.push("Acceso no autorizado");
	} else if (status === 404) {
		score += 1;
		reasons.push("Ruta no encontrada");
	}
	const location = String(res.getHeader("Location") || "");
	if (pathname === "/api/login" && /[?&]error=(?:1|password|rate)/.test(location)) {
		score += 3;
		reasons.push("Login fallido");
	}

	return { score, reasons: [...new Set(reasons)] };
}

function behaviorSignals(tracker, now) {
	const recent = tracker.events.filter((event) => now - event.at <= 60_000);
	const lastTen = tracker.events.slice(-12).map((event) => event.at);
	let score = 0;
	const reasons = [];

	if (recent.length >= 60) {
		score += 5;
		reasons.push("Ráfaga de peticiones");
	}
	if (lastTen.length >= 8) {
		const intervals = [];
		for (let i = 1; i < lastTen.length; i++) intervals.push(lastTen[i] - lastTen[i - 1]);
		const mean = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
		const variance =
			intervals.reduce((sum, value) => sum + (value - mean) ** 2, 0) / intervals.length;
		if (Math.sqrt(variance) < 45 && mean < 2000) {
			score += 6;
			reasons.push("Intervalos automatizados");
		}
	}
	const agents = [...tracker.userAgents.keys()];
	if (agents.some((agent) => BOT_UA.test(agent))) {
		score += 5;
		reasons.push("User-Agent de bot");
	}
	if (!agents.length || agents.some((agent) => !/mozilla|webkit|gecko/i.test(agent))) {
		score += 2;
		reasons.push("Navegador no convencional");
	}
	if (tracker.apiPaths.size >= 8 && recent.filter((event) => [401, 403].includes(event.status)).length >= 3) {
		score += 6;
		reasons.push("Enumeración de API");
	}
	const notFound = recent.filter((event) => event.status === 404).length;
	if (notFound >= 8) {
		score += 5;
		reasons.push("Muchos 404");
	}
	return { score, reasons };
}

function alertKind(reasons, bot) {
	const attack = (reasons || []).some((reason) =>
		/^(Ruta de escaneo|Inyección|XSS|Path traversal|Exploit|Byte nulo|Destino local)/.test(
			String(reason),
		),
	);
	return attack ? "hack" : bot ? "bot" : "";
}

function publicEvent(event) {
	return {
		at: event.atIso || new Date(event.at).toISOString(),
		method: String(event.method || "").slice(0, 12),
		path: String(event.path || "").slice(0, 300),
		status: Number(event.status) || 0,
		requestScore: Number(event.score) || 0,
		totalScore: Number(event.total) || 0,
		reasons: Array.isArray(event.reasons) ? event.reasons.slice(0, 10) : [],
		userAgent: String(event.userAgent || "").slice(0, 200),
		device: String(event.device || "").slice(0, 64),
		username: String(event.username || "").slice(0, 32),
		ip: normalizeIp(event.ip),
	};
}

function appendAlertEvent(alert, event) {
	if (event.staff && String(event.path || "").startsWith("/admin")) return;
	const clean = publicEvent(event);
	if (clean.ip) {
		alert.ips = [...new Set([...(alert.ips || [alert.ip]), clean.ip].filter(Boolean))];
		alert.ip = preferredIp(alert.ips) || alert.ip;
	}
	alert.events = [...(alert.events || []), clean].slice(-MAX_ALERT_EVENTS);
	alert.lastSeen = clean.at;
	alert.lastPath = clean.path;
	alert.lastMethod = clean.method;
	alert.statusCode = clean.status;
	alert.reasons = [...new Set([...(alert.reasons || []), ...clean.reasons])].slice(0, 12);
	dirty = true;
	scheduleSave();
}

function upsertAlert(tracker, ip, score, reasons, req, res, bot) {
	const now = Date.now();
	if ((dismissCooldowns.get(ip) || 0) > now) return null;
	const open = state.alerts.find(
		(alert) =>
			alert.status === "open" &&
			((req._deviceId && alert.device === req._deviceId) ||
				alert.ip === ip ||
				(alert.ips || []).includes(ip)),
	);
	if (open) {
		open.score = Math.max(open.score, score);
		open.count += 1;
		open.lastSeen = new Date(now).toISOString();
		open.lastPath = safePath(req);
		open.lastMethod = String(req.method || "").slice(0, 10);
		open.bot = open.bot || bot;
		open.device = open.device || req._deviceId || "";
		open.username = open.username || req.user?.username || "";
		open.ips = [...new Set([...(open.ips || [open.ip]), ip].filter(Boolean))];
		open.ip = preferredIp(open.ips) || open.ip;
		open.reasons = [...new Set([...(open.reasons || []), ...reasons])].slice(0, 12);
		open.kind = alertKind(open.reasons, open.bot) || open.kind || "";
		open.statusCode = Number(res.statusCode) || 0;
		dirty = true;
		scheduleSave();
		return open;
	}

	const alert = {
		id: crypto.randomBytes(8).toString("hex"),
		ip: preferredIp([ip]) || ip,
		ips: [ip].filter(Boolean),
		username: req.user?.username || "",
		score,
		count: 1,
		bot,
		kind: alertKind(reasons, bot),
		device: req._deviceId || "",
		reasons: [...new Set(reasons)].slice(0, 12),
		firstSeen: new Date(now).toISOString(),
		lastSeen: new Date(now).toISOString(),
		lastPath: safePath(req),
		lastMethod: String(req.method || "").slice(0, 10),
		statusCode: Number(res.statusCode) || 0,
		userAgent: String(req.headers["user-agent"] || "").slice(0, 200),
		events: (tracker.events || [])
			.filter((event) => !(event.staff && String(event.path || "").startsWith("/admin")))
			.slice(-MAX_ALERT_EVENTS)
			.map(publicEvent),
		status: "open",
	};
	state.alerts.push(alert);
	if (state.alerts.length > MAX_ALERTS) {
		state.alerts = state.alerts.slice(-MAX_ALERTS);
	}
	tracker.alertId = alert.id;
	tracker.lastAlertAt = now;
	dirty = true;
	scheduleSave();
	return alert;
}

function observe(req, res) {
	const ip = clientIp(req);
	if (!ip) return;
	if (SKIP_PATH.test(req.path || "")) return;
	if (ROUTINE_ANY_METHOD.test(req.path || "")) return;
	if (["GET", "HEAD"].includes(req.method) && ROUTINE_PATH.test(req.path || "")) return;
	const now = Date.now();
	let tracker = trackers.get(ip);
	if (!tracker) {
		tracker = {
			firstSeen: now,
			lastSeen: now,
			events: [],
			apiPaths: new Set(),
			userAgents: new Map(),
			lastAlertAt: 0,
			alertId: "",
		};
		trackers.set(ip, tracker);
	}
	tracker.lastSeen = now;
	const analysis = analyzeRequest(req, res);
	const event = {
		at: now,
		atIso: new Date(now).toISOString(),
		method: String(req.method || "").slice(0, 12),
		path: safePath(req),
		status: Number(res.statusCode) || 0,
		score: analysis.score,
		reasons: analysis.reasons.slice(0, 10),
		userAgent: String(req.headers["user-agent"] || "").slice(0, 200),
		device: req._deviceId || "",
		username: req.user?.username || "",
		ip,
		staff: ["admin", "creator", "moderator"].includes(req.user?.role),
	};
	tracker.events.push(event);
	tracker.events = tracker.events
		.filter((entry) => now - entry.at <= WINDOW_MS)
		.slice(-MAX_TRACKER_EVENTS);
	if ((req.path || "").startsWith("/api/")) tracker.apiPaths.add(req.path);
	const agent = String(req.headers["user-agent"] || "").slice(0, 200);
	tracker.userAgents.set(agent, (tracker.userAgents.get(agent) || 0) + 1);
	while (tracker.userAgents.size > 12) {
		tracker.userAgents.delete(tracker.userAgents.keys().next().value);
	}

	const behavior = behaviorSignals(tracker, now);
	const score = Math.max(
		0,
		tracker.events.reduce((sum, event) => sum + event.score, 0) + behavior.score,
	);
	const reasons = [...new Set([...analysis.reasons, ...behavior.reasons])];
	const bot = behavior.reasons.some((reason) =>
		["Intervalos automatizados", "User-Agent de bot", "Navegador no convencional"].includes(reason),
	);
	event.total = score;
	event.reasons = reasons.slice(0, 10);

	const openAlert = state.alerts.find(
		(alert) => alert.ip === ip && alert.status === "open",
	);
	if (openAlert) appendAlertEvent(openAlert, event);
	if (score >= ALERT_THRESHOLD) {
		upsertAlert(tracker, ip, score, reasons, req, res, bot);
	}
}

function browserName(userAgent) {
	const value = String(userAgent || "");
	if (/SamsungBrowser\//i.test(value)) return "Samsung Internet";
	if (/Edg\//i.test(value)) return "Edge";
	if (/OPR\/|Opera/i.test(value)) return "Opera";
	if (/Firefox\//i.test(value)) return "Firefox";
	if (/CriOS\/|Chrome\//i.test(value)) return "Chrome";
	if (/Safari\//i.test(value)) return "Safari";
	return value ? "otro" : "";
}

export function loginSeenBefore(username, device = "", ip = "") {
	const name = String(username || "").toLowerCase();
	const address = normalizeIp(ip || "");
	const cleanDevice = String(device || "");
	return state.logins.some(
		(entry) =>
			String(entry.username || "").toLowerCase() === name &&
			((cleanDevice && entry.device === cleanDevice) ||
				(address && normalizeIp(entry.ip || "") === address)),
	);
}

export function recordSuccessfulLogin(
	username,
	ip,
	{ exempt = false, device = "", userAgent = "" } = {},
) {
	const name = String(username || "").slice(0, 32);
	const address = normalizeIp(ip);
	if (!name || !net.isIP(address)) return { blocked: false };
	const now = Date.now();
	state.logins.push({
		username: name,
		ip: address,
		device: String(device || "").slice(0, 64),
		browser: browserName(userAgent),
		userAgent: String(userAgent || "").slice(0, 200),
		at: new Date(now).toISOString(),
		exempt: !!exempt,
	});
	state.logins = state.logins
		.filter((entry) => now - new Date(entry.at).getTime() <= 7 * 24 * 60 * 60 * 1000)
		.slice(-3000);
	dirty = true;
	scheduleSave();
	// El bloqueo automático por intercambio de cuentas está desactivado.
	return { blocked: false };
}

export function securityMiddleware(req, res, next) {
	const ip = clientIp(req);
	const device = deviceId(req, res);
	req._deviceId = device;
	const keys = [`ip:${ip}`, `device:${device}`];
	if (keys.some((key) => state.banned[key])) {
		if (req.path.startsWith("/api/")) {
			return res.status(403).json({ error: "banned" });
		}
		return res.status(403).type("text/plain").send("Este dispositivo o dirección está bloqueado.");
	}
	res.once("finish", () => {
		try {
			observe(req, res);
		} catch (err) {
			console.error("Security scanner:", err.message);
		}
	});
	next();
}

export function isBanned(ip) {
	return !!state.banned[`ip:${String(ip || "")}`];
}

export function isDeviceBanned(device) {
	return !!state.banned[`device:${String(device || "")}`];
}

export function isDeviceBannedFor(device, username, ip) {
	if (isDeviceBanned(device)) return true;
	const user = String(username || "").toLowerCase();
	const address = normalizeIp(ip || "");
	if (!user || !address) return false;
	for (const info of Object.values(state.banned)) {
		if (info.type !== "device") continue;
		if (info.username === user && info.ip === address) return true;
	}
	return false;
}

export function isUserBanned(username) {
	return !!state.banned[`user:${String(username || "").toLowerCase()}`];
}

export function banTarget(type, value, { by = "sistema", reason = "", alertId = "", kind = "", ip = "", username = "" } = {}) {
	const targetType = ["ip", "device", "user"].includes(type) ? type : "ip";
	const raw = String(value || "").trim();
	let clean = raw;
	if (targetType === "ip") {
		clean = normalizeIp(raw);
		if (!net.isIP(clean)) return { error: "invalid-ip" };
	}
	if (targetType === "device") {
		if (!/^[a-f0-9]{16,64}$/i.test(raw)) return { error: "invalid-device" };
		clean = raw.toLowerCase();
	}
	if (targetType === "user") {
		clean = raw.toLowerCase();
		if (!/^[a-z0-9._-]{3,32}$/i.test(clean)) return { error: "invalid-user" };
	}
	const key = `${targetType}:${clean}`;
	state.banned[key] = {
		type: targetType,
		value: clean,
		at: new Date().toISOString(),
		by,
		reason: String(reason || "").slice(0, 200),
		alertId: String(alertId || ""),
		kind: kind === "bot" ? "bot" : kind === "hack" ? "hack" : kind === "user" ? "user" : "",
		...(targetType === "device"
			? {
					ip: normalizeIp(ip || ""),
					username: String(username || "").toLowerCase().slice(0, 64),
				}
			: {}),
	};
	dirty = true;
	saveNow();
	return { ok: true, key };
}

export function banIp(ip, options = {}) {
	return banTarget("ip", ip, options);
}

export function banDevice(device, options = {}) {
	return banTarget("device", device, options);
}

export function unbanTarget(key) {
	const value = String(key || "").trim();
	if (!state.banned[value]) return { error: "notfound" };
	delete state.banned[value];
	dirty = true;
	saveNow();
	return { ok: true };
}

export function unbanIp(ip) {
	const raw = normalizeIp(ip);
	if (state.banned[`ip:${raw}`]) return unbanTarget(`ip:${raw}`);
	if (state.banned[raw] && !raw.includes(":")) return unbanTarget(raw);
	return { error: "notfound" };
}

export function listBans() {
	return Object.entries(state.banned)
		.map(([key, info]) => ({ key, ...info }))
		.sort((a, b) => new Date(b.at) - new Date(a.at));
}

export function listSecurityAlerts({ includeDismissed = false, limit = 200 } = {}) {
	return state.alerts
		.filter((alert) => includeDismissed || alert.status === "open")
		.sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen))
		.slice(0, limit)
		.map((alert) => {
			const keys = [
				...new Set([alert.ip, ...(alert.ips || [])].filter(Boolean)).values(),
			].map((value) => `ip:${value}`);
			if (alert.device) keys.push(`device:${alert.device}`);
			if (alert.username) keys.push(`user:${String(alert.username).toLowerCase()}`);
			const bans = keys
				.filter((key) => state.banned[key])
				.map((key) => ({ key, ...state.banned[key] }));
			return { ...alert, banned: bans.length > 0, bans };
		});
}

export function dismissAlert(id) {
	const alert = state.alerts.find((item) => item.id === id);
	if (!alert) return { error: "notfound" };
	alert.status = "dismissed";
	alert.dismissedAt = new Date().toISOString();
	dismissCooldowns.set(alert.ip, Date.now() + DISMISS_COOLDOWN_MS);
	trackers.delete(alert.ip);
	dirty = true;
	saveNow();
	return { ok: true };
}

export function countOpenAlerts() {
	return state.alerts.filter((alert) => alert.status === "open").length;
}

export function securitySummary() {
	const open = state.alerts.filter((alert) => alert.status === "open");
	return {
		open: open.length,
		bots: open.filter((alert) => alert.bot).length,
		banned: Object.keys(state.banned).length,
		last24h: open.filter(
			(alert) => Date.now() - new Date(alert.lastSeen).getTime() < 24 * 60 * 60 * 1000,
		).length,
	};
}

export function flushSecurity() {
	saveNow();
}

load();
setInterval(() => {
	const cutoff = Date.now() - 30 * 60 * 1000;
	for (const [ip, tracker] of trackers) {
		if (tracker.lastSeen < cutoff) trackers.delete(ip);
	}
}, 5 * 60 * 1000).unref();
