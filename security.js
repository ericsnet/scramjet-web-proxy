import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import net from "node:net";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const FILE = path.join(DATA_DIR, "security.json");
const MAX_ALERTS = 500;
const WINDOW_MS = 10 * 60 * 1000;
const ALERT_THRESHOLD = 8;
const ALERT_COOLDOWN_MS = 2 * 60 * 1000;

let state = { alerts: [], banned: {}, logins: [] };
let saveTimer = null;
let dirty = false;
const trackers = new Map();

const SKIP_PATH =
	/^\/(?:scramjet|controller|libcurl|favicon|page-i18n\.js|chat-notify\.js|chat\.js|index\.js|index\.css|sw\.js|healthz|robots\.txt)/;

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

function load() {
	try {
		fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
		if (!fs.existsSync(FILE)) return;
		const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
		if (Array.isArray(data.alerts)) state.alerts = data.alerts.slice(-MAX_ALERTS);
		if (data.banned && typeof data.banned === "object" && !Array.isArray(data.banned)) {
			state.banned = data.banned;
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
				.slice(-3000);
		}
	} catch (err) {
		console.error("No se pudo cargar security.json:", err.message);
		state = { alerts: [], banned: {}, logins: [] };
	}
}

function clientIp(req) {
	return String(
		req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
			req.socket?.remoteAddress ||
			"",
	).slice(0, 64);
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

	if (recent.length >= 30) {
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

function upsertAlert(tracker, ip, score, reasons, req, res, bot) {
	const now = Date.now();
	const open = state.alerts.find(
		(alert) => alert.ip === ip && alert.status === "open",
	);
	if (open) {
		open.score = Math.max(open.score, score);
		open.count += 1;
		open.lastSeen = new Date(now).toISOString();
		open.lastPath = safePath(req);
		open.lastMethod = String(req.method || "").slice(0, 10);
		open.bot = open.bot || bot;
		open.reasons = [...new Set([...(open.reasons || []), ...reasons])].slice(0, 12);
		open.statusCode = Number(res.statusCode) || 0;
		dirty = true;
		scheduleSave();
		return open;
	}

	const alert = {
		id: crypto.randomBytes(8).toString("hex"),
		ip,
		username: req.user?.username || "",
		score,
		count: 1,
		bot,
		reasons: [...new Set(reasons)].slice(0, 12),
		firstSeen: new Date(now).toISOString(),
		lastSeen: new Date(now).toISOString(),
		lastPath: safePath(req),
		lastMethod: String(req.method || "").slice(0, 10),
		statusCode: Number(res.statusCode) || 0,
		userAgent: String(req.headers["user-agent"] || "").slice(0, 200),
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
	tracker.events.push({
		at: now,
		status: Number(res.statusCode) || 0,
		score: analysis.score,
	});
	tracker.events = tracker.events.filter((event) => now - event.at <= WINDOW_MS);
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
	if (score >= ALERT_THRESHOLD) {
		upsertAlert(tracker, ip, score, reasons, req, res, bot);
	}
}

export function securityMiddleware(req, res, next) {
	const ip = clientIp(req);
	if (ip && state.banned[ip]) {
		if (req.path.startsWith("/api/")) {
			return res.status(403).json({ error: "ip_banned" });
		}
		return res.status(403).type("text/plain").send("Esta dirección IP está bloqueada.");
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

function uniqueRecent(values) {
	return [...new Set(values)];
}

export function recordSuccessfulLogin(username, ip, { exempt = false } = {}) {
	const name = String(username || "").slice(0, 32);
	const address = String(ip || "").trim();
	if (!name || !net.isIP(address)) return { blocked: false };
	const now = Date.now();
	state.logins.push({
		username: name,
		ip: address,
		at: new Date(now).toISOString(),
		exempt: !!exempt,
	});
	state.logins = state.logins
		.filter((entry) => now - new Date(entry.at).getTime() <= 7 * 24 * 60 * 60 * 1000)
		.slice(-3000);
	dirty = true;
	scheduleSave();

	const recent = state.logins.filter(
		(entry) =>
			!entry.exempt &&
			now - new Date(entry.at).getTime() <= 24 * 60 * 60 * 1000,
	);
	const last30 = recent.filter(
		(entry) => now - new Date(entry.at).getTime() <= 30 * 60 * 1000,
	);
	const ipAccounts = uniqueRecent(
		[...last30, ...recent.filter((entry) => entry.ip === address)]
			.filter((entry) => entry.ip === address)
			.map((entry) => entry.username.toLowerCase()),
	);
	const accountIps = uniqueRecent(
		recent
			.filter(
				(entry) =>
					entry.username.toLowerCase() === name.toLowerCase() &&
					now - new Date(entry.at).getTime() <= 24 * 60 * 60 * 1000,
			)
			.map((entry) => entry.ip),
	);
	const ipBurst = uniqueRecent(
		last30.filter((entry) => entry.ip === address).map((entry) => entry.username.toLowerCase()),
	);
	const accountBurst = uniqueRecent(
		last30
			.filter((entry) => entry.username.toLowerCase() === name.toLowerCase())
			.map((entry) => entry.ip),
	);
	let reasons = [];
	if (ipBurst.length >= 3 || ipAccounts.length >= 5) {
		reasons.push("Varias cuentas desde la misma IP");
	}
	if (accountBurst.length >= 4 || accountIps.length >= 8) {
		reasons.push("Misma cuenta desde varias IPs");
	}
	if (!reasons.length) return { blocked: false };

	reasons = [...new Set(reasons)];
	const alert = upsertAlert(
		{ alertId: "", lastAlertAt: 0 },
		address,
		20,
		["Posible intercambio de cuentas", ...reasons],
		{
			originalUrl: "/api/login",
			url: "/api/login",
			path: "/api/login",
			method: "POST",
			headers: { "user-agent": "" },
			user: { username: name },
		},
		{ statusCode: 303 },
		false,
	);
	if (alert) {
		alert.kind = "account_swap";
		alert.blockedAccount = name;
		alert.blockedUntil = new Date(now + 30 * 60 * 1000).toISOString();
		alert.accounts = ipAccounts.slice(0, 12);
		alert.ips = accountIps.slice(0, 12);
		alert.reasons = [
			...new Set([
				...(alert.reasons || []),
				`Cuenta ${name} bloqueada temporalmente`,
			]),
		].slice(0, 12);
		dirty = true;
		saveNow();
	}
	return {
		blocked: !exempt,
		until: new Date(now + 30 * 60 * 1000).toISOString(),
		alert,
		reasons,
	};
}

export function isBanned(ip) {
	return !!state.banned[String(ip || "")];
}

export function banIp(ip, { by = "sistema", reason = "", alertId = "" } = {}) {
	const value = String(ip || "").trim();
	if (!net.isIP(value)) return { error: "invalid-ip" };
	state.banned[value] = {
		at: new Date().toISOString(),
		by,
		reason: String(reason || "").slice(0, 200),
		alertId: String(alertId || ""),
	};
	dirty = true;
	saveNow();
	return { ok: true };
}

export function unbanIp(ip) {
	const value = String(ip || "").trim();
	if (!state.banned[value]) return { error: "notfound" };
	delete state.banned[value];
	dirty = true;
	saveNow();
	return { ok: true };
}

export function listBans() {
	return Object.entries(state.banned)
		.map(([ip, info]) => ({ ip, ...info }))
		.sort((a, b) => new Date(b.at) - new Date(a.at));
}

export function listSecurityAlerts({ includeDismissed = false, limit = 200 } = {}) {
	return state.alerts
		.filter((alert) => includeDismissed || alert.status === "open")
		.sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen))
		.slice(0, limit)
		.map((alert) => ({ ...alert, banned: !!state.banned[alert.ip] }));
}

export function dismissAlert(id) {
	const alert = state.alerts.find((item) => item.id === id);
	if (!alert) return { error: "notfound" };
	alert.status = "dismissed";
	alert.dismissedAt = new Date().toISOString();
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
