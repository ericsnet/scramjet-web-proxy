const landing = document.getElementById("landing");
const form = document.getElementById("sj-form");
const address = document.getElementById("sj-address");
const frameForm = document.getElementById("frame-form");
const frameAddress = document.getElementById("frame-address");
const frameWrapper = document.getElementById("sj-frame-wrapper");
const frameElement = document.getElementById("sj-frame");
const frameUrl = document.getElementById("sj-frame-url");
const homeButton = document.getElementById("home-btn");
const error = document.getElementById("sj-error");
const errorCode = document.getElementById("sj-error-code");

let isAdmin = false;
let blockedSites = [];

function isBlockedUrl(url) {
	if (isAdmin) return false;
	let host;
	try {
		host = new URL(url).hostname.toLowerCase();
	} catch {
		return false;
	}
	return blockedSites.some(
		(site) => host === site || host.endsWith(`.${site}`),
	);
}

function showBlocked(url) {
	let host = "";
	try {
		host = new URL(url).hostname;
	} catch {}
	showErrorScreen(
		host ? `Sitio prohibido: ${host}` : "Ese sitio está prohibido.",
		"",
	);
	landing.style.display = "flex";
	frameWrapper.style.display = "none";
}

// Datos de la sesión (usuario y rol) para la barra superior.
fetch("/api/me", { headers: { Accept: "application/json" }, cache: "no-store" })
	.then((r) => (r.ok ? r.json() : null))
	.then((me) => {
		if (!me) return;
		isAdmin = me.role === "admin";
		const bar = document.getElementById("session-bar");
		const who = document.getElementById("session-who");
		const adminLink = document.getElementById("admin-link");
		const avatar = document.getElementById("session-avatar");
		if (avatar) avatar.textContent = me.username.slice(0, 1).toUpperCase();
		if (who) {
			who.textContent = `${me.username} · ${
				me.role === "admin" ? "administrador" : "usuario"
			}`;
		}
		if (adminLink) adminLink.hidden = me.role !== "admin";
		if (bar) bar.hidden = false;
	})
	.catch(() => {});

let controller;
let frame;
let currentUrl = "";

async function init() {
	if (controller) return;
	if (!navigator.serviceWorker) {
		throw new Error("Este navegador no soporta service workers.");
	}

	// El service worker se registra en la raíz para que su scope cubra /~/sj/.
	const registration = await navigator.serviceWorker.register("/sw.js", {
		type: "classic",
		updateViaCache: "none",
	});
	await navigator.serviceWorker.ready;
	const serviceworker =
		navigator.serviceWorker.controller ||
		registration.active ||
		registration.waiting ||
		registration.installing;
	if (!serviceworker) throw new Error("No se pudo activar el service worker.");

	const wispUrl =
		(location.protocol === "https:" ? "wss://" : "ws://") +
		location.host +
		"/wisp/";
	const transport = new LibcurlTransport.LibcurlClient({ wisp: wispUrl });

	controller = new $scramjetController.Controller({
		serviceworker,
		transport,
	});
	await controller.wait();

	const cachePlugin = new $scramjetUtils.HttpCachePlugin();
	const urlWatcher = new $scramjetUtils.UrlWatcherPlugin(handleFrameUrl);
	const catchEscapedLinks = new $scramjetUtils.CatchEscapedLinksPlugin(
		(url) => new URL(`/?goto=${encodeURIComponent(url.href)}`, location.origin),
	);

	frame = controller.createFrame(frameElement, {
		plugins: [cachePlugin, urlWatcher, catchEscapedLinks],
	});
}

function looksLikeUrl(value) {
	return (
		/^https?:\/\//i.test(value) ||
		// Si parece un dominio (tiene punto y no espacios) lo tratamos como URL.
		/^[^\s/]+\.[^\s/]+/.test(value)
	);
}

let searchEngine = "duckduckgo";
const SEARCH_URLS = {
	duckduckgo: "https://duckduckgo.com/?q=",
	google: "https://www.google.com/search?q=",
	bing: "https://www.bing.com/search?q=",
};

function normalize(input) {
	let value = input.trim();
	if (!value) return "";
	if (/^https?:\/\//i.test(value)) return value;
	if (looksLikeUrl(value)) return `https://${value}`;
	const base = SEARCH_URLS[searchEngine] || SEARCH_URLS.duckduckgo;
	return `${base}${encodeURIComponent(value)}`;
}

let lastLogged = "";
function logActivity(url, query = "") {
	if (!url || url === lastLogged) return;
	lastLogged = url;
	fetch("/api/activity", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ url, query }),
		keepalive: true,
	}).catch(() => {});
}

/* ---------------- protección contra URLs proxificadas anidadas ---------------- */

let lastExternal = "";
let lastHost = "";
let recovering = false;
let recoveryCount = 0;
let recoveryWindow = 0;

function proxyInfo(raw) {
	let current = raw;
	let depth = 0;
	for (let i = 0; i < 6; i++) {
		let parsed;
		try {
			parsed = new URL(current);
		} catch {
			break;
		}
		const match = parsed.pathname.match(/\/~\/sj\/[^/]+\/[^/]+\/(.*)$/);
		if (!match) break;
		let inner;
		try {
			inner = decodeURIComponent(match[1]);
		} catch {
			break;
		}
		if (!/^https?:\/\//i.test(inner)) break;
		current = inner;
		depth++;
	}
	return { url: current, depth };
}

function recoverNavigation(url) {
	if (!url || recovering) return;
	const now = Date.now();
	if (now - recoveryWindow > 10_000) {
		recoveryWindow = now;
		recoveryCount = 0;
	}
	if (recoveryCount >= 3) {
		showErrorScreen(
			"No se pudo abrir esta web: el proxy ha detectado una redirección anidada. Prueba con otra web.",
			"",
		);
		landing.style.display = "flex";
		frameWrapper.style.display = "none";
		return;
	}
	recoveryCount++;
	recovering = true;
	setTimeout(() => {
		recovering = false;
	}, 2500);
	navigate(url, { silent: true, log: false }).catch(() => {});
}

function handleFrameUrl(url) {
	currentUrl = url;
	frameUrl.textContent = url;
	frameUrl.title = url;
	if (document.activeElement !== frameAddress) frameAddress.value = url;

	if (recovering) return;

	const info = proxyInfo(url);
	if (info.depth >= 1 && /^https?:\/\//i.test(info.url)) {
		lastExternal = info.url;
		try {
			lastHost = new URL(info.url).host;
		} catch {}
	}

	if (info.depth >= 1 && isBlockedUrl(info.url)) {
		showBlocked(info.url);
		return;
	}

	// Si el proxy se ha anidado (varias capas de /~/sj/), volvemos a la URL real.
	if (info.depth > 1) {
		recoverNavigation(info.url);
		return;
	}

	// Algunas webs acaban navegando a una ruta de nuestro dominio sin proxificar.
	if (!url.includes("/~/sj/") && lastHost) {
		try {
			const parsed = new URL(url);
			if (parsed.origin === location.origin) {
				const pathname = parsed.pathname;
				const known =
					pathname === "/" ||
					pathname.startsWith("/login") ||
					pathname.startsWith("/account") ||
					pathname.startsWith("/admin") ||
					pathname.startsWith("/api/") ||
					pathname.startsWith("/favicon") ||
					pathname.startsWith("/scramjet") ||
					pathname.startsWith("/controller") ||
					pathname.startsWith("/libcurl") ||
					pathname === "/sw.js" ||
					pathname === "/maintenance" ||
					pathname === "/blocked";
				if (!known) {
					recoverNavigation(
						`https://${lastHost}${pathname}${parsed.search}${parsed.hash}`,
					);
				}
			}
		} catch {}
	}
}

function showErrorScreen(message, details) {
	frameWrapper.style.display = "none";
	error.textContent = message;
	errorCode.textContent = details || "";
	landing.style.display = "flex";
}

function hideError() {
	error.textContent = "";
	errorCode.textContent = "";
}

async function navigate(url, { silent = false, log = true } = {}) {
	const rawInput = typeof url === "string" ? url.trim() : "";
	url = normalize(url);
	if (!url) return;
	if (isBlockedUrl(url)) {
		showBlocked(url);
		return;
	}
	const query = rawInput && !looksLikeUrl(rawInput) ? rawInput : "";
	if (log) logActivity(url, query);

	hideError();
	try {
		if (!frame) await init();
		await frame.go(url);
		frameAddress.value = url;
		frameUrl.textContent = url;
		// El título de la pestaña no debe revelar el sitio visitado.
		document.title = "Proxy Web";
		landing.style.display = "none";
		frameWrapper.style.display = "flex";
	} catch (err) {
		if (!silent) showErrorScreen(err.message, err.stack);
	}
}

function goHome() {
	frameWrapper.style.display = "none";
	landing.style.display = "flex";
	document.title = "Proxy Web";
	address.focus();
}

form.addEventListener("submit", (event) => {
	event.preventDefault();
	navigate(address.value);
});

frameForm.addEventListener("submit", (event) => {
	event.preventDefault();
	navigate(frameAddress.value);
});

homeButton.addEventListener("click", goHome);

const quickLinks = document.getElementById("quick-links");
quickLinks?.addEventListener("click", (event) => {
	const link = event.target.closest("a[data-url]");
	if (!link) return;
	event.preventDefault();
	navigate(link.dataset.url);
});

function renderQuickLinks(links) {
	if (!quickLinks || !Array.isArray(links)) return;
	quickLinks.replaceChildren();
	for (const link of links) {
		const a = document.createElement("a");
		a.href = "#";
		a.dataset.url = link.url;
		a.textContent = link.label;
		quickLinks.append(a);
	}
}

function setHeroTitle(title) {
	const element = document.getElementById("hero-title");
	if (!element || !title) return;
	const words = title.trim().split(/\s+/);
	if (words.length < 2) {
		element.textContent = title;
		return;
	}
	element.textContent = `${words.slice(0, -1).join(" ")} `;
	const span = document.createElement("span");
	span.textContent = words.at(-1);
	element.append(span);
}

fetch("/api/config", { cache: "no-store" })
	.then((r) => (r.ok ? r.json() : null))
	.then((config) => {
		if (!config) return;
		if (SEARCH_URLS[config.defaultSearchEngine]) {
			searchEngine = config.defaultSearchEngine;
		}
		if (Array.isArray(config.blockedSites)) {
			blockedSites = config.blockedSites.map((site) => String(site).toLowerCase());
		}
		if (config.landingTitle) setHeroTitle(config.landingTitle);
		const subtitle = document.getElementById("hero-subtitle");
		if (subtitle && config.landingSubtitle) subtitle.textContent = config.landingSubtitle;
		renderQuickLinks(config.quickLinks);
	})
	.catch(() => {});

// Enlaces que se escapan del iframe (target=_blank, etc.) vuelven al proxy.
window.addEventListener("message", (event) => {
	if (event.data?.type === "scramjet-navigate" && event.data.url) {
		navigate(event.data.url);
	}
});

const goto = new URL(location.href).searchParams.get("goto");
if (goto) {
	history.replaceState(null, "", location.pathname);
	navigate(goto).catch((err) => showErrorScreen(err.message, err.stack));
}
