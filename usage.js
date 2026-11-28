import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSettings } from "./settings.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const FILE = path.join(DATA_DIR, "usage.json");

const DAY = 24 * 60 * 60 * 1000;
const HALF_LIFE_DAYS = 7;
const TAU = HALF_LIFE_DAYS * DAY;
const KEEP_DAYS = 90;
const MAX_EVENTS_PER_REQUEST = 40;
const MAX_EVENTS_PER_MINUTE = 240;
const MAX_FEATURES_PER_USER = 120;

// Solo acciones del panel. Nunca contenido, URLs visitadas, texto escrito ni
// nada dentro del iframe del proxy.
export const FEATURES = Object.freeze({
	"nav.home": "Inicio",
	"nav.chat": "Chat",
	"nav.bookmarks": "Favoritos",
	"nav.history": "Historial",
	"nav.vault": "Bóveda",
	"nav.account": "Mi cuenta",
	"nav.invites": "Invitaciones",
	"nav.admin.overview": "Resumen de administración",
	"nav.admin.users": "Usuarios",
	"nav.admin.sessions": "Sesiones",
	"nav.admin.security": "Seguridad",
	"nav.admin.traffic": "Tráfico",
	"nav.admin.monitor": "Vigilancia",
	"nav.admin.activity": "Actividad",
	"nav.admin.audit": "Auditoría",
	"nav.admin.requests": "Solicitudes",
	"nav.admin.reports": "Informes",
	"nav.admin.stats": "Estadísticas",
	"nav.admin.usage": "Uso del panel",
	"nav.admin.settings": "Ajustes",
	"nav.admin.system": "Sistema",
	"nav.admin.logs": "Logs",
	"nav.admin.templates": "Plantillas",
	"nav.admin.schedules": "Programaciones",
	"nav.design": "Herramientas de diseño",
	"nav.pentest": "Herramientas de pentest",
	"nav.qa": "Herramientas de QA",
	"nav.reports": "Mis informes",

	"shell.search": "Búsqueda global",
	"shell.theme": "Cambiar tema",
	"shell.sidebar": "Contraer menú",
	"shell.menu": "Abrir menú",
	"shell.user": "Ir a mi cuenta",
	"shell.logout": "Cerrar sesión",
	"shell.panic": "Botón de pánico",
	"shell.chatfab": "Abrir chat flotante",
	"shell.brand": "Volver al inicio",

	"proxy.navigate": "Navegar a una web",
	"proxy.back": "Atrás",
	"proxy.forward": "Adelante",
	"proxy.reload": "Recargar",
	"proxy.home": "Volver al inicio del proxy",
	"proxy.newtab": "Nueva pestaña",
	"proxy.closetab": "Cerrar pestaña",
	"proxy.switchtab": "Cambiar de pestaña",
	"proxy.bookmark": "Guardar favorito",
	"proxy.vault": "Abrir bóveda desde el proxy",
	"proxy.reader": "Modo lectura",
	"proxy.zoom.in": "Aumentar zoom",
	"proxy.zoom.out": "Reducir zoom",
	"proxy.fullscreen": "Pantalla completa",
	"proxy.quicklink": "Acceso rápido",
	"proxy.recent": "Abrir reciente",
	"proxy.favorite": "Abrir favorito",
	"proxy.retry": "Reintentar navegación",
	"proxy.unblock.request": "Solicitar desbloqueo",

	"chat.send": "Enviar mensaje",
	"chat.channel": "Cambiar de canal",
	"chat.dm.open": "Abrir chat privado",
	"chat.dm.create": "Crear chat privado",
	"chat.group.create": "Crear grupo",
	"chat.search": "Buscar mensajes",
	"chat.details": "Panel de detalles",
	"chat.attach": "Adjuntar archivo",
	"chat.emoji": "Añadir emoji",
	"chat.poll.create": "Crear encuesta",
	"chat.poll.vote": "Votar encuesta",
	"chat.react": "Reaccionar",
	"chat.reply": "Responder",
	"chat.edit": "Editar mensaje",
	"chat.delete": "Borrar mensaje",
	"chat.pin": "Fijar mensaje",
	"chat.jump": "Ir a mensaje",
	"chat.load.older": "Cargar mensajes anteriores",
	"chat.mobile.channel": "Cambiar canal en móvil",
	"chat.friends": "Gestionar amigos",

	"account.password": "Cambiar contraseña",
	"account.mfa.enable": "Activar MFA",
	"account.mfa.disable": "Desactivar MFA",
	"account.mfa.recovery": "Regenerar códigos MFA",
	"account.icon": "Cambiar icono",
	"account.language": "Cambiar idioma",
	"account.sessions.revoke": "Cerrar otra sesión",
	"account.sessions.revoke.others": "Cerrar las demás sesiones",
	"account.usage.optout": "Cambiar analítica de uso",

	"vault.unlock": "Desbloquear bóveda",
	"vault.lock": "Bloquear bóveda",
	"vault.setup": "Crear bóveda",
	"vault.entry.add": "Añadir entrada",
	"vault.entry.edit": "Editar entrada",
	"vault.entry.copy": "Copiar contraseña",
	"vault.entry.delete": "Borrar entrada",
	"vault.search": "Buscar en la bóveda",
	"vault.generate": "Generar contraseña",

	"admin.users.edit": "Editar usuario",
	"admin.users.create": "Crear usuario",
	"admin.users.delete": "Borrar usuario",
	"admin.users.export": "Exportar usuarios",
	"admin.users.import": "Importar usuarios",
	"admin.group.create": "Crear grupo",
	"admin.group.rules": "Normas de grupo",
	"admin.settings.save": "Guardar ajustes",
	"admin.settings.reset": "Restablecer ajustes",
	"admin.backup.create": "Crear copia de seguridad",
	"admin.backup.restore": "Restaurar copia",
	"admin.audit.export": "Exportar auditoría",
	"admin.audit.clear": "Vaciar auditoría",
	"admin.security.ban": "Banear",
	"admin.security.unban": "Desbanear",
	"admin.security.dismiss": "Descartar alerta",
	"admin.reports.update": "Actualizar informe",
	"admin.requests.approve": "Aprobar solicitud",
	"admin.requests.deny": "Denegar solicitud",
	"admin.schedules.add": "Añadir programación",
	"admin.templates.add": "Añadir plantilla",
	"admin.maintenance": "Cambiar mantenimiento",
	"admin.adblock.update": "Actualizar bloqueo",
	"admin.categories.refresh": "Actualizar categorías",
	"admin.chat.clear": "Vaciar chat",
	"admin.monitor.pause": "Pausar vigilancia",
	"admin.traffic.refresh": "Refrescar tráfico",

	"auth.login": "Iniciar sesión",
	"auth.mfa.verify": "Verificar MFA",
	"auth.invite.accept": "Aceptar invitación",
});

const ZONES = new Set([
	"topbar",
	"sidebar",
	"content",
	"footer",
	"chat",
	"fab",
	"panic",
	"landing",
	"toolbar",
	"frame",
]);

const CONTROLS = new Set([
	"button",
	"link",
	"submit",
	"summary",
	"input",
	"select",
	"textarea",
	"label",
	"option",
	"other",
]);

const PAGES = new Set([
	"/",
	"/chat",
	"/bookmarks",
	"/history",
	"/account",
	"/account/mfa",
	"/vault",
	"/invites",
	"/welcome",
	"/reports",
	"/design",
	"/pentest",
	"/qa",
	"/admin",
	"/admin/overview",
	"/admin/activity",
	"/admin/audit",
	"/admin/groups",
	"/admin/logs",
	"/admin/monitor",
	"/admin/reports",
	"/admin/requests",
	"/admin/schedules",
	"/admin/security",
	"/admin/sessions",
	"/admin/settings",
	"/admin/stats",
	"/admin/system",
	"/admin/templates",
	"/admin/traffic",
	"/admin/usage",
]);

const DURATIONS = new Set(["0-5", "5-30", "30-120", "120+"]);

let db = {
	version: 1,
	since: new Date().toISOString(),
	features: {},
	daily: {},
	roles: {},
	pages: {},
	zones: {},
	controls: {},
	durations: {},
	users: {},
};

let dirty = false;
let timer = null;
let lastPrune = "";
const rate = new Map();

function dayKey(at) {
	return new Date(at).toISOString().slice(0, 10);
}

function load() {
	try {
		if (!fs.existsSync(FILE)) return;
		const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
		db = {
			version: 1,
			since: data.since || new Date().toISOString(),
			features: data.features && typeof data.features === "object" ? data.features : {},
			daily: data.daily && typeof data.daily === "object" ? data.daily : {},
			roles: data.roles && typeof data.roles === "object" ? data.roles : {},
			pages: data.pages && typeof data.pages === "object" ? data.pages : {},
			zones: data.zones && typeof data.zones === "object" ? data.zones : {},
			controls: data.controls && typeof data.controls === "object" ? data.controls : {},
			durations: data.durations && typeof data.durations === "object" ? data.durations : {},
			users: data.users && typeof data.users === "object" ? data.users : {},
		};
		prune();
	} catch {
		db = { ...db, features: {}, daily: {}, roles: {}, pages: {}, zones: {}, controls: {}, durations: {}, users: {} };
	}
}

function prune() {
	const cutoff = dayKey(Date.now() - KEEP_DAYS * DAY);
	for (const day of Object.keys(db.daily)) {
		if (day < cutoff) delete db.daily[day];
	}
	const old = Date.now() - KEEP_DAYS * DAY;
	for (const [name, entry] of Object.entries(db.users)) {
		if (!entry || !entry.lastAt) {
			delete db.users[name];
			continue;
		}
		if (new Date(entry.lastAt).getTime() < old) delete db.users[name];
		for (const [key, value] of Object.entries(entry.features || {})) {
			if (!value?.lastAt || new Date(value.lastAt).getTime() < old) {
				delete entry.features[key];
			}
		}
		if (!Object.keys(entry.features || {}).length) delete db.users[name];
	}
}

function saveNow() {
	if (!dirty) return;
	try {
		fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
		const tmp = `${FILE}.tmp`;
		const data = JSON.stringify(db, null, 2);
		fs.writeFileSync(tmp, data, { mode: 0o600 });
		fs.renameSync(tmp, FILE);
		dirty = false;
	} catch {
		// Si el disco falla, se reintenta en el siguiente volcado.
	}
}

function save() {
	dirty = true;
	if (timer) return;
	timer = setTimeout(() => {
		timer = null;
		saveNow();
	}, 1500);
	if (typeof timer.unref === "function") timer.unref();
}

export function flushUsage() {
	if (timer) {
		clearTimeout(timer);
		timer = null;
	}
	saveNow();
}

export function usageEnabled() {
	return getSettings().usageAnalytics !== false;
}

export function usageEnabledFor(user) {
	return usageEnabled() && !user?.usageOptOut;
}

export function pageKey(value) {
	let pathname = String(value || "/");
	try {
		pathname = new URL(pathname, "http://local.invalid").pathname;
	} catch {
		pathname = "/";
	}
	pathname = pathname.replace(/\/+$/, "") || "/";
	if (PAGES.has(pathname)) return pathname;
	if (/^\/admin\/groups\/[^/]+$/.test(pathname)) return "/admin/groups/:id";
	if (/^\/admin\/reports\/[^/]+$/.test(pathname)) return "/admin/reports/:id";
	if (/^\/admin\/security\/alerts\/[^/]+$/.test(pathname)) return "/admin/security/alerts/:id";
	if (/^\/u\/[^/]+$/.test(pathname)) return "/u/:user";
	if (/^\/invite\/[^/]+$/.test(pathname)) return "/invite/:token";
	return "/other";
}

function allowedRate(userId) {
	const now = Date.now();
	const bucket = rate.get(userId);
	if (!bucket || now > bucket.resetAt) {
		rate.set(userId, { count: 0, resetAt: now + 60_000 });
		return true;
	}
	return bucket.count < MAX_EVENTS_PER_MINUTE;
}

function spendRate(userId, amount) {
	const bucket = rate.get(userId);
	if (bucket) bucket.count += amount;
}

function bump(map, key, amount = 1) {
	map[key] = (map[key] || 0) + amount;
}

function scoreFeature(entry, now) {
	const last = entry.lastAt ? new Date(entry.lastAt).getTime() : now;
	const decayed = (entry.score || 0) * Math.exp(-Math.max(0, now - last) / TAU);
	return Math.min(50, decayed + 1);
}

function recordFeature(user, role, key, now) {
	const at = new Date(now).toISOString();
	const total = (db.features[key] ||= { count: 0, lastAt: null });
	total.count += 1;
	total.lastAt = at;

	const day = dayKey(now);
	bump((db.daily[day] ||= {}), key);

	if (!db.roles[role]) db.roles[role] = {};
	bump(db.roles[role], key);

	const name = user?.username;
	if (!name) return;
	const entry = (db.users[name] ||= { firstAt: at, lastAt: at, events: 0, features: {} });
	entry.lastAt = at;
	entry.events = (entry.events || 0) + 1;
	const list = entry.features;
	if (!list[key] && Object.keys(list).length >= MAX_FEATURES_PER_USER) {
		const weakest = Object.entries(list).sort((a, b) => (a[1].score || 0) - (b[1].score || 0))[0];
		if (weakest) delete list[weakest[0]];
	}
	const feature = (list[key] ||= { score: 0, count: 0, lastAt: null });
	feature.score = scoreFeature(feature, now);
	feature.count += 1;
	feature.lastAt = at;
}

export function recordUsage({ user, role = "user", page, view = false, events = [] } = {}) {
	if (!usageEnabledFor(user)) return { ok: false, reason: "disabled" };
	const userId = user?.username || "anon";
	if (!allowedRate(userId)) return { ok: false, reason: "rate" };

	const list = Array.isArray(events) ? events.slice(0, MAX_EVENTS_PER_REQUEST) : [];
	const now = Date.now();
	const today = dayKey(now);
	if (lastPrune !== today) {
		lastPrune = today;
		prune();
	}

	if (view) {
		const key = pageKey(page);
		bump(db.pages, key);
	}

	let accepted = 0;
	for (const event of list) {
		if (!event || typeof event !== "object") continue;
		const zone = ZONES.has(event.z) ? event.z : "content";
		const control = CONTROLS.has(event.c) ? event.c : "other";

		if (event.t === "time") {
			const bucket = DURATIONS.has(event.d) ? event.d : "0-5";
			const key = pageKey(page);
			if (!db.durations[key]) db.durations[key] = {};
			bump(db.durations[key], bucket);
			accepted += 1;
			continue;
		}

		if (typeof event.f === "string" && FEATURES[event.f]) {
			recordFeature(user, role, event.f, now);
			accepted += 1;
			continue;
		}

		// Clic sin función conocida: se guarda solo zona y tipo de control.
		bump(db.zones, zone);
		bump(db.controls, control);
		accepted += 1;
	}

	if (accepted || view) {
		spendRate(userId, accepted);
		save();
	}
	return { ok: true, accepted };
}

export function affinityFor(username, limit = 8) {
	const entry = db.users[String(username || "")];
	if (!entry) return [];
	const list = Object.entries(entry.features || {})
		.map(([key, value]) => ({
			key,
			label: FEATURES[key] || key,
			score: Math.round((value.score || 0) * 100) / 100,
			count: value.count || 0,
			lastAt: value.lastAt || null,
		}))
		.filter((item) => item.score > 0)
		.sort((a, b) => b.score - a.score);
	const max = list[0]?.score || 1;
	return list.slice(0, limit).map((item) => ({
		...item,
		percent: Math.max(4, Math.round((item.score / max) * 100)),
	}));
}

export function userUsageEvents(username) {
	return db.users[String(username || "")]?.events || 0;
}

export function usageSnapshot({ days = 30 } = {}) {
	const from = dayKey(Date.now() - (days - 1) * DAY);
	const window = {};
	let actions = 0;
	for (const [day, counts] of Object.entries(db.daily)) {
		if (day < from) continue;
		for (const [key, value] of Object.entries(counts)) {
			window[key] = (window[key] || 0) + value;
			actions += value;
		}
	}

	const features = Object.entries(FEATURES)
		.map(([key, label]) => ({
			key,
			label,
			count: window[key] || 0,
			total: db.features[key]?.count || 0,
			lastAt: db.features[key]?.lastAt || null,
		}))
		.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "es"));

	const users = Object.entries(db.users)
		.map(([username, entry]) => ({
			username,
			events: entry.events || 0,
			lastAt: entry.lastAt || null,
			top: affinityFor(username, 3),
		}))
		.sort((a, b) => b.events - a.events);

	return {
		days,
		since: db.since,
		actions,
		features,
		used: features.filter((f) => f.count > 0),
		unused: features.filter((f) => f.count === 0),
		pages: Object.entries(db.pages)
			.map(([key, count]) => ({ key, count }))
			.sort((a, b) => b.count - a.count),
		zones: Object.entries(db.zones)
			.map(([key, count]) => ({ key, count }))
			.sort((a, b) => b.count - a.count),
		controls: Object.entries(db.controls)
			.map(([key, count]) => ({ key, count }))
			.sort((a, b) => b.count - a.count),
		durations: db.durations,
		roles: db.roles,
		users,
		activeUsers: users.filter((u) => u.lastAt && new Date(u.lastAt).getTime() >= Date.now() - days * DAY).length,
	};
}

export function clearUsage(username = "") {
	const name = String(username || "");
	if (name) {
		delete db.users[name];
	} else {
		db.users = {};
		db.features = {};
		db.daily = {};
		db.roles = {};
		db.pages = {};
		db.zones = {};
		db.controls = {};
		db.durations = {};
		db.since = new Date().toISOString();
	}
	save();
	return { ok: true };
}

load();
