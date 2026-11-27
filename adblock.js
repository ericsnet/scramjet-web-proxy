import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const HOSTS_FILE = path.join(DATA_DIR, "adblock-hosts.txt");
const META_FILE = path.join(DATA_DIR, "adblock-meta.json");
const REFRESH_MS = 7 * 24 * 60 * 60 * 1000;

// Listas reales de hosts. Se descargan y se combinan en data/adblock-hosts.txt.
// StevenBlack: MIT · BlocklistProject: dominio público · AdAway: CC BY 3.0.
const LIST_SOURCES = Object.freeze([
	{
		name: "StevenBlack unified hosts",
		url: "https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts",
	},
	{
		name: "BlocklistProject ads",
		url: "https://raw.githubusercontent.com/blocklistproject/Lists/master/ads.txt",
	},
	{
		name: "AdAway",
		url: "https://raw.githubusercontent.com/AdAway/adaway.github.io/master/hosts.txt",
	},
]);

// APIs/CDN esenciales que nunca deben bloquearse aunque una lista los incluya.
const ALLOW_HOSTS = new Set([
	"google.com",
	"www.google.com",
	"accounts.google.com",
	"apis.google.com",
	"gstatic.com",
	"www.gstatic.com",
	"fonts.gstatic.com",
	"googleapis.com",
	"www.googleapis.com",
	"youtube.com",
	"www.youtube.com",
	"i.ytimg.com",
	"yt3.ggpht.com",
	"googlevideo.com",
	"github.com",
	"raw.githubusercontent.com",
	"githubusercontent.com",
	"githubassets.com",
	"cdn.jsdelivr.net",
	"unpkg.com",
	"cdnjs.cloudflare.com",
	"cloudflare.com",
	"tailscale.com",
	"microsoft.com",
	"login.microsoftonline.com",
	"outlook.office.com",
	"office.com",
	"live.com",
	"apple.com",
	"icloud.com",
	"wikipedia.org",
	"www.wikipedia.org",
	"wikimedia.org",
	"mozilla.org",
]);

// Dominios de publicidad, analítica y sincronización de cookies.
// Se bloquean por host y subdominios; no incluye APIs esenciales como
// googleapis.com, gstatic.com, accounts.google.com ni los CDN de los juegos.
export const AD_HOSTS = Object.freeze([
	"doubleclick.net",
	"googlesyndication.com",
	"googleadservices.com",
	"googletagmanager.com",
	"googletagservices.com",
	"google-analytics.com",
	"adservice.google.com",
	"ogads-pa.clients6.google.com",
	"adtrafficquality.google",
	"amazon-adsystem.com",
	"pubmatic.com",
	"rubiconproject.com",
	"criteo.com",
	"criteo.net",
	"taboola.com",
	"outbrain.com",
	"scorecardresearch.com",
	"quantserve.com",
	"adnxs.com",
	"adsrvr.org",
	"bidswitch.net",
	"casalemedia.com",
	"contextweb.com",
	"spotxchange.com",
	"sharethrough.com",
	"smartadserver.com",
	"sitescout.com",
	"tribalfusion.com",
	"yieldmo.com",
	"richaudience.com",
	"a-mo.net",
	"lkqd.net",
	"ad.gt",
	"everesttech.net",
	"ay.delivery",
	"bidtheatre.com",
	"blismedia.com",
	"company-target.com",
	"adsafeprotected.com",
	"moatads.com",
	"doubleverify.com",
	"confiant.com",
	"hotjar.com",
	"clarity.ms",
	"bat.bing.com",
	"connect.facebook.net",
	"analytics.tiktok.com",
	"ads.tiktok.com",
	"ads-api.tiktok.com",
	"business-api.tiktok.com",
	"t.poki.io",
	// Redes publicitarias y de identidad habituales.
	"adroll.com",
	"adform.net",
	"teads.tv",
	"3lift.com",
	"33across.com",
	"agkn.com",
	"crwdcntrl.net",
	"demdex.net",
	"krxd.net",
	"ml314.com",
	"mathtag.com",
	"omtrdc.net",
	"tapad.com",
	"bluekai.com",
	"exelator.com",
	"rlcdn.com",
	"pippio.com",
	"serving-sys.com",
	"sizmek.com",
	"innovid.com",
	"freewheel.tv",
	"stickyadstv.com",
	"yieldlab.net",
	"smartclip.net",
	"advertising.com",
	"yieldmanager.com",
	"adtech.de",
	"adtechus.com",
	"atwola.com",
	"tacoda.net",
	"revsci.net",
	"nexac.com",
	"aggregateknowledge.com",
	"bkrtx.com",
	"2o7.net",
	// Analítica que no aporta nada a la página.
	"chartbeat.com",
	"parsely.com",
	"hotjar.io",
	"segment.io",
	"mixpanel.com",
	"amplitude.com",
	"googleoptimize.com",
]);

const AD_PATTERNS = [
	/^(?:mon|mcs|starling)[a-z0-9-]*\.tiktokv?\.(?:com|eu)$/i,
];

const AD_HOST_SET = new Set(AD_HOSTS);
const DOMAIN_RE =
	/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/i;
const IGNORED_HOSTS = new Set([
	"localhost",
	"localhost.localdomain",
	"localhost6",
	"local",
	"localdomain",
	"broadcasthost",
	"ip6-localhost",
	"ip6-loopback",
	"0.0.0.0",
	"127.0.0.1",
	"::1",
]);

function normalizeHost(value) {
	return String(value || "").toLowerCase().replace(/\.$/, "");
}

export function parseHostsText(text) {
	const domains = new Set();
	for (const rawLine of String(text || "").split(/\r?\n/)) {
		const line = rawLine.split("#", 1)[0].trim();
		if (!line) continue;
		const parts = line.split(/\s+/);
		let host = "";
		if (
			parts.length >= 2 &&
			/^(?:0\.0\.0\.0|127\.0\.0\.1|::1?|::)$/i.test(parts[0])
		) {
			host = parts[1];
		} else if (parts.length === 1) {
			host = parts[0];
		}
		host = normalizeHost(host);
		if (!host || IGNORED_HOSTS.has(host)) continue;
		if (!DOMAIN_RE.test(host)) continue;
		domains.add(host);
	}
	return domains;
}

let dynamicHosts = new Set();
let blocklistMeta = { count: 0, updatedAt: null, sources: [] };

function writeAtomic(file, contents) {
	fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
	const tmp = `${file}.tmp`;
	fs.writeFileSync(tmp, contents, { mode: 0o600 });
	fs.renameSync(tmp, file);
}

function loadLocalBlocklist() {
	try {
		if (!fs.existsSync(HOSTS_FILE)) return;
		dynamicHosts = parseHostsText(fs.readFileSync(HOSTS_FILE, "utf8"));
	} catch (err) {
		console.error("No se pudo cargar la lista de bloqueo:", err.message);
		dynamicHosts = new Set();
	}
	try {
		const meta = JSON.parse(fs.readFileSync(META_FILE, "utf8"));
		blocklistMeta = {
			count: dynamicHosts.size,
			updatedAt: meta.updatedAt || null,
			sources: Array.isArray(meta.sources) ? meta.sources : [],
		};
	} catch {
		blocklistMeta = {
			count: dynamicHosts.size,
			updatedAt: null,
			sources: [],
		};
	}
}

loadLocalBlocklist();

export function adblockStats() {
	return {
		count: dynamicHosts.size,
		builtin: AD_HOSTS.length,
		updatedAt: blocklistMeta.updatedAt,
		sources: blocklistMeta.sources,
	};
}

let updateInFlight = null;

export function updateBlocklist({ force = false } = {}) {
	if (updateInFlight) return updateInFlight;
	updateInFlight = updateBlocklistInternal({ force }).finally(() => {
		updateInFlight = null;
	});
	return updateInFlight;
}

async function updateBlocklistInternal({ force = false } = {}) {
	if (
		!force &&
		dynamicHosts.size &&
		blocklistMeta.updatedAt &&
		Date.now() - new Date(blocklistMeta.updatedAt).getTime() < REFRESH_MS
	) {
		return { ok: true, skipped: true, ...adblockStats() };
	}
	const domains = new Set();
	const used = [];
	const failed = [];
	await Promise.all(
		LIST_SOURCES.map(async (source) => {
			try {
				const response = await fetch(source.url, {
					headers: { "User-Agent": "Inici-Classroom-Adblock/1.0" },
					signal: AbortSignal.timeout(30_000),
				});
				if (!response.ok) throw new Error(`HTTP ${response.status}`);
				const parsed = parseHostsText(await response.text());
				if (!parsed.size) throw new Error("lista vacía");
				for (const domain of parsed) domains.add(domain);
				used.push(`${source.name} (${parsed.size})`);
			} catch (err) {
				failed.push(`${source.name}: ${err.message}`);
			}
		}),
	);
	if (!domains.size) {
		return {
			error: "empty",
			detail: failed.join(" | "),
			...adblockStats(),
		};
	}
	const updatedAt = new Date().toISOString();
	writeAtomic(HOSTS_FILE, `${[...domains].join("\n")}\n`);
	writeAtomic(
		META_FILE,
		JSON.stringify({ updatedAt, count: domains.size, sources: used }, null, 2),
	);
	dynamicHosts = domains;
	blocklistMeta = { count: domains.size, updatedAt, sources: used };
	return { ok: true, count: domains.size, updatedAt, sources: used, failed };
}

function inHostSet(host, set) {
	let candidate = host;
	while (candidate) {
		if (set.has(candidate)) return true;
		const dot = candidate.indexOf(".");
		if (dot < 0) break;
		candidate = candidate.slice(dot + 1);
	}
	return false;
}

export function isAdHost(hostname) {
	const host = normalizeHost(hostname);
	if (!host || ALLOW_HOSTS.has(host)) return false;
	// Recorremos las etiquetas del dominio en vez de comparar la lista entera
	// para cada petición: con muchas webs abiertas esto ahorra CPU.
	if (inHostSet(host, AD_HOST_SET) || inHostSet(host, dynamicHosts)) return true;
	return AD_PATTERNS.some((pattern) => pattern.test(host));
}
