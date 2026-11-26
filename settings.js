import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const FILE = path.join(DATA_DIR, "settings.json");

const SEARCH_ENGINES = new Set(["duckduckgo", "google", "bing"]);

export const DEFAULTS = Object.freeze({
	sessionHours: 720,
	maxSessionsPerUser: 5,
	sessionIdleHours: 12,
	maxLoginAttempts: 8,
	loginAttemptsPerMinute: 60,
	lockoutMinutes: 10,
	requireMfaForStaff: false,
	chatEnabled: true,
	chatTitle: "Chat de usuarios",
	chatWelcome: "Escribe un mensaje. Sé respetuoso.",
	chatMaxLength: 500,
	chatMaxMessages: 1000,
	chatRetentionDays: 14,
	chatSlowModeSeconds: 2,
	chatMaxPerMinute: 20,
	chatAllowUserDelete: false,
	chatShowOnline: true,
	chatUploadMaxPerMinute: 6,
	chatUploadMaxTotalMB: 256,
	chatUploadMaxPerUserMB: 50,
	activityEnabled: true,
	activityPerUser: 500,
	activityTotal: 3000,
	proxyBandwidthPerUserKbps: 8000,
	proxyMaxStreamsPerUser: 32,
	proxyMaxConnectionsPerUser: 6,
	proxyWispBufferMB: 4,
	blockAds: true,
	maintenanceMode: false,
	maintenanceMessage:
		"El proxy está en mantenimiento. Vuelve a intentarlo más tarde.",
	quarantineMode: false,
	quarantineMessage:
		"El proxy está temporalmente en cuarentena por seguridad. Inténtalo más tarde.",
	defaultSearchEngine: "duckduckgo",
	landingTitle: "Proxy Web",
	landingSubtitle:
		"Escribe una dirección o busca en la web. El tráfico sale por el servidor del proxy.",
	quickLinks: [
		{ label: "Wikipedia", url: "https://es.wikipedia.org" },
		{ label: "Google", url: "https://www.google.com" },
		{ label: "YouTube", url: "https://www.youtube.com" },
		{ label: "Reddit", url: "https://www.reddit.com" },
		{ label: "Hacker News", url: "https://news.ycombinator.com" },
	],
	allowUserPasswordChange: true,
	blockedSites: [],
	siteMessages: {},
	defaultBlockMessage: "Este sitio está bloqueado.",
	allowlistMessage: "Este sitio no está permitido.",
	categories: [],
	categoryMessages: {
		adult: "Este sitio está bloqueado por contenido para adultos.",
		gambling: "Este sitio está bloqueado por apuestas.",
		social: "Este sitio está bloqueado por redes sociales.",
	},
	language: "es",
	allowedSites: [],
	accessMode: "blacklist",
	timezone: "Europe/Madrid",
	backupEnabled: true,
	backupRetentionDays: 14,
	metricsToken: "",
	allowUserHistoryClear: false,
	proxyAllowStaffBrowsing: false,
	revision: "",
});

const LIMITS = {
	sessionHours: [1, 8760],
	maxSessionsPerUser: [1, 50],
	sessionIdleHours: [1, 720],
	maxLoginAttempts: [3, 20],
	loginAttemptsPerMinute: [5, 100],
	lockoutMinutes: [1, 1440],
	chatMaxLength: [20, 2000],
	chatMaxMessages: [100, 5000],
	chatRetentionDays: [1, 365],
	chatSlowModeSeconds: [0, 300],
	chatMaxPerMinute: [1, 120],
	chatUploadMaxPerMinute: [1, 60],
	chatUploadMaxTotalMB: [16, 4096],
	chatUploadMaxPerUserMB: [8, 1024],
	activityPerUser: [50, 2000],
	activityTotal: [100, 10000],
	proxyBandwidthPerUserKbps: [0, 100000],
	proxyMaxStreamsPerUser: [8, 128],
	proxyMaxConnectionsPerUser: [1, 10],
	proxyWispBufferMB: [1, 32],
};

let settings = { ...DEFAULTS, quickLinks: DEFAULTS.quickLinks.map((l) => ({ ...l })) };

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function save() {
	fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
	const tmp = `${FILE}.tmp`;
	fs.writeFileSync(tmp, JSON.stringify(settings, null, 2), { mode: 0o600 });
	fs.renameSync(tmp, FILE);
}

function load() {
	fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
	if (!fs.existsSync(FILE)) {
		settings.revision = crypto.randomBytes(8).toString("hex");
		save();
		return;
	}
	try {
		const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
		const result = normalize({ ...DEFAULTS, ...data }, true);
		if (result.settings) {
			settings = result.settings;
			let changed = result.changed;
			if (!settings.revision) {
				settings.revision = crypto.randomBytes(8).toString("hex");
				changed = true;
			}
			if (changed) save();
		}
	} catch (err) {
		console.error("No se pudo cargar settings.json:", err.message);
		settings = clone(DEFAULTS);
		settings.revision = crypto.randomBytes(8).toString("hex");
		save();
	}
}

function toInt(value, fallback) {
	const n = Number.parseInt(String(value), 10);
	return Number.isFinite(n) ? n : fallback;
}

function parseSiteList(input, label) {
	const raw = Array.isArray(input) ? input.join("\n") : String(input || "");
	const lines = raw
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line && !line.startsWith("#"));
	const errors = [];
	const hosts = [];
	const messages = {};
	if (lines.length > 100) {
		return { hosts: [], messages: {}, errors: [`Máximo 100 sitios ${label}.`] };
	}
	for (const line of lines) {
		const [hostPart, ...messageParts] = line.split("|");
		const message = messageParts.join("|").trim().slice(0, 300);
		if (hostPart.length > 200) {
			errors.push(`Sitio demasiado largo: ${hostPart.slice(0, 40)}…`);
			continue;
		}
		const cleaned = hostPart.trim().replace(/^\*\./, "");
		if (!cleaned) continue;
		const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(cleaned)
			? cleaned
			: `https://${cleaned}`;
		let host;
		try {
			host = new URL(candidate).hostname.toLowerCase().replace(/\.$/, "");
		} catch {
			errors.push(`Sitio no válido: ${hostPart.trim()}`);
			continue;
		}
		if (!host || !/^[a-z0-9.-]+$/.test(host) || !host.includes(".")) {
			errors.push(`Sitio no válido: ${hostPart.trim()}`);
			continue;
		}
		hosts.push(host);
		if (message) messages[host] = message;
	}
	return { hosts: [...new Set(hosts)], messages, errors };
}

function normalize(input, silent = false) {
	const next = clone(settings);
	const errors = [];

	for (const [key, [min, max]] of Object.entries(LIMITS)) {
		if (input[key] === undefined) continue;
		const n = toInt(input[key], NaN);
		if (!Number.isFinite(n) || n < min || n > max) {
			errors.push(`${key}: debe estar entre ${min} y ${max}`);
			continue;
		}
		next[key] = n;
	}

	if (input.activityEnabled !== undefined) {
		next.activityEnabled = input.activityEnabled === true || input.activityEnabled === "1" || input.activityEnabled === "on";
	}
	if (input.maintenanceMode !== undefined) {
		next.maintenanceMode = input.maintenanceMode === true || input.maintenanceMode === "1" || input.maintenanceMode === "on";
	}
	if (input.quarantineMode !== undefined) {
		next.quarantineMode =
			input.quarantineMode === true ||
			input.quarantineMode === "1" ||
			input.quarantineMode === "on";
	}
	if (input.quarantineMessage !== undefined) {
		const value = String(input.quarantineMessage).trim();
		if (value.length > 300) errors.push("El mensaje de cuarentena es demasiado largo (máx. 300).");
		else next.quarantineMessage = value || DEFAULTS.quarantineMessage;
	}
	if (input.allowUserPasswordChange !== undefined) {
		next.allowUserPasswordChange =
			input.allowUserPasswordChange === true ||
			input.allowUserPasswordChange === "1" ||
			input.allowUserPasswordChange === "on";
	}
	if (input.proxyAllowStaffBrowsing !== undefined) {
		next.proxyAllowStaffBrowsing =
			input.proxyAllowStaffBrowsing === true ||
			input.proxyAllowStaffBrowsing === "1" ||
			input.proxyAllowStaffBrowsing === "on";
	}
	if (input.blockAds !== undefined) {
		next.blockAds =
			input.blockAds === true ||
			input.blockAds === "1" ||
			input.blockAds === "on";
	}
	if (input.requireMfaForStaff !== undefined) {
		next.requireMfaForStaff =
			input.requireMfaForStaff === true ||
			input.requireMfaForStaff === "1" ||
			input.requireMfaForStaff === "on";
	}

	if (input.chatEnabled !== undefined) {
		next.chatEnabled =
			input.chatEnabled === true || input.chatEnabled === "1" || input.chatEnabled === "on";
	}
	if (input.chatAllowUserDelete !== undefined) {
		next.chatAllowUserDelete =
			input.chatAllowUserDelete === true ||
			input.chatAllowUserDelete === "1" ||
			input.chatAllowUserDelete === "on";
	}
	if (input.chatShowOnline !== undefined) {
		next.chatShowOnline =
			input.chatShowOnline === true ||
			input.chatShowOnline === "1" ||
			input.chatShowOnline === "on";
	}
	if (input.chatTitle !== undefined) {
		const value = String(input.chatTitle).trim();
		if (!value) errors.push("El título del chat no puede estar vacío.");
		else if (value.length > 60) errors.push("El título del chat es demasiado largo (máx. 60).");
		else next.chatTitle = value;
	}
	if (input.chatWelcome !== undefined) {
		const value = String(input.chatWelcome).trim();
		if (value.length > 200) errors.push("El mensaje de bienvenida es demasiado largo (máx. 200).");
		else next.chatWelcome = value;
	}

	if (input.blockedSites !== undefined) {
		const result = parseSiteList(input.blockedSites, "prohibidos");
		if (result.errors.length) errors.push(...result.errors);
		else {
			next.blockedSites = result.hosts;
			next.siteMessages = result.messages;
		}
	}
	if (input.allowedSites !== undefined) {
		const result = parseSiteList(input.allowedSites, "permitidos");
		if (result.errors.length) errors.push(...result.errors);
		else next.allowedSites = result.hosts;
	}
	if (input.categories !== undefined) {
		const allowed = ["adult", "gambling", "social"];
		const value = Array.isArray(input.categories)
			? input.categories
			: input.categories
				? [input.categories]
				: [];
		const selected = value.filter((c) => allowed.includes(c));
		if (selected.length !== value.length) errors.push("Categoría no válida.");
		else next.categories = [...new Set(selected)];
	}
	if (input.language !== undefined) {
		const value = String(input.language);
		if (!["es", "en", "ca"].includes(value)) errors.push("Idioma no válido.");
		else next.language = value;
	}
	if (input.defaultBlockMessage !== undefined) {
		const value = String(input.defaultBlockMessage).trim().slice(0, 300);
		if (!value) errors.push("El mensaje de bloqueo no puede estar vacío.");
		else next.defaultBlockMessage = value;
	}
	if (input.allowlistMessage !== undefined) {
		const value = String(input.allowlistMessage).trim().slice(0, 300);
		if (!value) errors.push("El mensaje de lista blanca no puede estar vacío.");
		else next.allowlistMessage = value;
	}
	if (input.categoryMessages !== undefined && typeof input.categoryMessages === "object") {
		for (const key of ["adult", "gambling", "social"]) {
			if (input.categoryMessages[key] !== undefined) {
				const value = String(input.categoryMessages[key]).trim().slice(0, 300);
				if (value) next.categoryMessages[key] = value;
			}
		}
	}
	if (input.accessMode !== undefined) {
		const value = String(input.accessMode);
		if (!["blacklist", "allowlist"].includes(value)) errors.push("Modo de acceso no válido.");
		else next.accessMode = value;
	}
	if (input.timezone !== undefined) {
		const value = String(input.timezone).trim();
		try {
			new Intl.DateTimeFormat("en-GB", { timeZone: value }).format(new Date());
			next.timezone = value;
		} catch {
			errors.push("Zona horaria no válida.");
		}
	}
	if (input.backupEnabled !== undefined) {
		next.backupEnabled =
			input.backupEnabled === true ||
			input.backupEnabled === "1" ||
			input.backupEnabled === "on";
	}
	if (input.backupRetentionDays !== undefined) {
		const n = toInt(input.backupRetentionDays, NaN);
		if (!Number.isFinite(n) || n < 1 || n > 90) errors.push("Retención de copias: entre 1 y 90 días.");
		else next.backupRetentionDays = n;
	}
	if (input.metricsToken !== undefined) {
		const value = String(input.metricsToken).trim();
		if (value.length > 64 || (value && !/^[A-Za-z0-9._-]+$/.test(value))) {
			errors.push("Token de métricas no válido (máx. 64, letras/números/._-).");
		} else {
			next.metricsToken = value;
		}
	}
	if (input.allowUserHistoryClear !== undefined) {
		next.allowUserHistoryClear =
			input.allowUserHistoryClear === true ||
			input.allowUserHistoryClear === "1" ||
			input.allowUserHistoryClear === "on";
	}

	if (input.maintenanceMessage !== undefined) {
		const value = String(input.maintenanceMessage).trim();
		if (value.length > 300) errors.push("El mensaje de mantenimiento es demasiado largo (máx. 300).");
		else next.maintenanceMessage = value || DEFAULTS.maintenanceMessage;
	}

	if (input.defaultSearchEngine !== undefined) {
		const value = String(input.defaultSearchEngine);
		if (!SEARCH_ENGINES.has(value)) errors.push("Buscador no válido.");
		else next.defaultSearchEngine = value;
	}

	if (input.landingTitle !== undefined) {
		const value = String(input.landingTitle).trim();
		if (!value || value.length > 60) errors.push("El título debe tener entre 1 y 60 caracteres.");
		else next.landingTitle = value;
	}

	if (input.landingSubtitle !== undefined) {
		const value = String(input.landingSubtitle).trim();
		if (value.length > 200) errors.push("El subtítulo no puede superar 200 caracteres.");
		else next.landingSubtitle = value;
	}

	if (input.quickLinks !== undefined) {
		if (!Array.isArray(input.quickLinks)) {
			errors.push("Los enlaces rápidos no son válidos.");
		} else if (input.quickLinks.length > 8) {
			errors.push("Máximo 8 enlaces rápidos.");
		} else {
			const links = [];
			for (const link of input.quickLinks) {
				const label = String(link.label || "").trim();
				const url = String(link.url || "").trim();
				const icon = String(link.icon || "").trim().slice(0, 4);
				let parsed;
				try {
					parsed = new URL(url);
				} catch {
					errors.push(`Enlace no válido: ${label || url}`);
					continue;
				}
				if (!/^https?:$/.test(parsed.protocol)) {
					errors.push(`Solo se permiten enlaces http(s): ${label || url}`);
					continue;
				}
				if (!label || label.length > 40) {
					errors.push("Cada enlace necesita un nombre de 1 a 40 caracteres.");
					continue;
				}
				links.push({ label, url: parsed.href, icon });
			}
			if (!errors.length) next.quickLinks = links;
		}
	}

	if (errors.length && !silent) return { errors, error: errors[0] };
	if (errors.length && silent) {
		next.quickLinks = clone(DEFAULTS.quickLinks);
	}
	return { settings: next, changed: JSON.stringify(next) !== JSON.stringify(settings) };
}

export function getSettings() {
	return clone(settings);
}

export function saveSettings(input) {
	const data = input || {};
	if (
		data.revision !== undefined &&
		String(data.revision) !== String(settings.revision)
	) {
		return {
			stale: true,
			error: "Los ajustes han cambiado desde otra pestaña o sesión.",
			settings: getSettings(),
		};
	}
	const result = normalize(data);
	if (result.errors) return { errors: result.errors, error: result.errors[0] };
	if (result.changed) {
		settings = {
			...result.settings,
			revision: crypto.randomBytes(8).toString("hex"),
		};
		save();
	}
	return { settings: getSettings() };
}

export function resetSettings() {
	settings = clone(DEFAULTS);
	settings.revision = crypto.randomBytes(8).toString("hex");
	save();
	return getSettings();
}

load();
