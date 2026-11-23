import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const FILE = path.join(DATA_DIR, "settings.json");

const SEARCH_ENGINES = new Set(["duckduckgo", "google", "bing"]);

export const DEFAULTS = Object.freeze({
	sessionHours: 720,
	maxSessionsPerUser: 5,
	maxLoginAttempts: 8,
	lockoutMinutes: 10,
	activityEnabled: true,
	activityPerUser: 500,
	activityTotal: 3000,
	maintenanceMode: false,
	maintenanceMessage:
		"El proxy está en mantenimiento. Vuelve a intentarlo más tarde.",
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
});

const LIMITS = {
	sessionHours: [1, 8760],
	maxSessionsPerUser: [1, 50],
	maxLoginAttempts: [3, 20],
	lockoutMinutes: [1, 1440],
	activityPerUser: [50, 2000],
	activityTotal: [100, 10000],
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
		save();
		return;
	}
	try {
		const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
		const result = normalize({ ...DEFAULTS, ...data }, true);
		if (result.settings) {
			settings = result.settings;
			if (result.changed) save();
		}
	} catch (err) {
		console.error("No se pudo cargar settings.json:", err.message);
		settings = clone(DEFAULTS);
		save();
	}
}

function toInt(value, fallback) {
	const n = Number.parseInt(String(value), 10);
	return Number.isFinite(n) ? n : fallback;
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
	if (input.allowUserPasswordChange !== undefined) {
		next.allowUserPasswordChange =
			input.allowUserPasswordChange === true ||
			input.allowUserPasswordChange === "1" ||
			input.allowUserPasswordChange === "on";
	}

	if (input.blockedSites !== undefined) {
		const raw = Array.isArray(input.blockedSites)
			? input.blockedSites.join("\n")
			: String(input.blockedSites);
		const lines = raw
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter((line) => line && !line.startsWith("#"));
		if (lines.length > 100) {
			errors.push("Máximo 100 sitios prohibidos.");
		} else {
			const hosts = [];
			for (const line of lines) {
				if (line.length > 200) {
					errors.push(`Sitio demasiado largo: ${line.slice(0, 40)}…`);
					continue;
				}
				const cleaned = line.replace(/^\*\./, "");
				const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(cleaned)
					? cleaned
					: `https://${cleaned}`;
				let host;
				try {
					host = new URL(candidate).hostname.toLowerCase().replace(/\.$/, "");
				} catch {
					errors.push(`Sitio no válido: ${line}`);
					continue;
				}
				if (!host || !/^[a-z0-9.-]+$/.test(host) || !host.includes(".")) {
					errors.push(`Sitio no válido: ${line}`);
					continue;
				}
				hosts.push(host);
			}
			if (!errors.length) next.blockedSites = [...new Set(hosts)];
		}
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
	const result = normalize(input || {});
	if (result.errors) return { errors: result.errors, error: result.errors[0] };
	if (result.changed) {
		settings = result.settings;
		save();
	}
	return { settings: getSettings() };
}

export function resetSettings() {
	settings = clone(DEFAULTS);
	save();
	return getSettings();
}

load();
