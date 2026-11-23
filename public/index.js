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
const backButton = document.getElementById("back-btn");
const forwardButton = document.getElementById("forward-btn");
const reloadButton = document.getElementById("reload-btn");
const bookmarkButton = document.getElementById("bookmark-btn");
const bookmarkDialog = document.getElementById("bookmark-dialog");
const bookmarkForm = document.getElementById("bookmark-form");
const bookmarkLabel = document.getElementById("bookmark-label");
const bookmarkUrlInput = document.getElementById("bookmark-url");
const bookmarkCancel = document.getElementById("bookmark-cancel");
const favoritesWrap = document.getElementById("favorites-wrap");
const favoritesBox = document.getElementById("favorites");
const suggestions = document.getElementById("url-suggestions");

let currentBookmarks = [];

let isAdmin = false;
let blockedSites = [];
let allowedSites = [];
let myBlockedSites = [];
let accessMode = "blacklist";

function hostMatches(host, list) {
	return list.some((site) => host === site || host.endsWith(`.${site}`));
}

function isBlockedUrl(url) {
	if (isAdmin) return false;
	let host;
	try {
		host = new URL(url).hostname.toLowerCase();
	} catch {
		return false;
	}
	if (accessMode === "allowlist") {
		if (!allowedSites.length) return true;
		if (!hostMatches(host, allowedSites)) return true;
		return false;
	}
	if (hostMatches(host, blockedSites)) return true;
	if (hostMatches(host, myBlockedSites)) return true;
	return false;
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
		myBlockedSites = Array.isArray(me.blockedSites)
			? me.blockedSites.map((s) => String(s).toLowerCase())
			: [];
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

/* ------------------------------ favoritos ------------------------------ */

function renderFavorites() {
	if (!favoritesWrap || !favoritesBox) return;
	favoritesBox.replaceChildren();
	if (!currentBookmarks.length) {
		favoritesWrap.hidden = true;
		return;
	}
	favoritesWrap.hidden = false;
	for (const bookmark of currentBookmarks) {
		const a = document.createElement("a");
		a.href = "#";
		a.dataset.url = bookmark.url;
		a.textContent = bookmark.label;
		favoritesBox.append(a);
	}
}

async function loadBookmarks() {
	try {
		const res = await fetch("/api/bookmarks", { cache: "no-store" });
		if (!res.ok) return;
		const data = await res.json();
		currentBookmarks = Array.isArray(data.bookmarks) ? data.bookmarks : [];
		renderFavorites();
		loadSuggestions();
	} catch {}
}

async function loadSuggestions() {
	if (!suggestions) return;
	const urls = new Set(currentBookmarks.map((b) => b.url));
	try {
		const res = await fetch("/api/history?limit=50", { cache: "no-store" });
		if (res.ok) {
			const data = await res.json();
			for (const item of data.history || []) if (item.url) urls.add(item.url);
		}
	} catch {}
	suggestions.replaceChildren();
	for (const url of urls) {
		const option = document.createElement("option");
		option.value = url;
		suggestions.append(option);
	}
}

function openBookmarkDialog() {
	if (!bookmarkDialog) return;
	const raw = lastExternal || frameAddress.value || address.value;
	let url = raw;
	try {
		url = new URL(raw).href;
	} catch {
		return;
	}
	bookmarkUrlInput.value = url;
	try {
		bookmarkLabel.value = new URL(url).hostname;
	} catch {
		bookmarkLabel.value = "";
	}
	const errorBox = document.getElementById("bookmark-error");
	if (errorBox) errorBox.textContent = "";
	if (typeof bookmarkDialog.showModal === "function") bookmarkDialog.showModal();
}

favoritesBox?.addEventListener("click", (event) => {
	const link = event.target.closest("a[data-url]");
	if (!link) return;
	event.preventDefault();
	navigate(link.dataset.url);
});

bookmarkButton?.addEventListener("click", openBookmarkDialog);
bookmarkCancel?.addEventListener("click", () => bookmarkDialog?.close());
bookmarkForm?.addEventListener("submit", async (event) => {
	event.preventDefault();
	const errorBox = document.getElementById("bookmark-error");
	if (errorBox) errorBox.textContent = "";
	try {
		const res = await fetch("/api/bookmarks", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				label: bookmarkLabel.value,
				url: bookmarkUrlInput.value,
			}),
			});
		if (!res.ok) {
			const data = await res.json().catch(() => ({}));
			const messages = {
				"invalid-url": "La URL no es válida.",
				exists: "Ese favorito ya existe.",
				limit: "Has alcanzado el máximo de favoritos.",
			};
			if (errorBox) errorBox.textContent = messages[data.error] || "No se pudo guardar.";
			return;
		}
		bookmarkDialog?.close();
		await loadBookmarks();
	} catch {
		if (errorBox) errorBox.textContent = "No se pudo guardar.";
	}
});

backButton?.addEventListener("click", () => {
	try {
		frame?.back();
	} catch {}
});
forwardButton?.addEventListener("click", () => {
	try {
		frame?.forward();
	} catch {}
});
reloadButton?.addEventListener("click", () => {
	try {
		frame?.reload();
	} catch {}
});
for (const input of [address, frameAddress]) {
	input?.addEventListener("focus", loadSuggestions);
}

window.addEventListener("keydown", (event) => {
	const typing =
		event.target instanceof HTMLInputElement ||
		event.target instanceof HTMLTextAreaElement ||
		event.target instanceof HTMLSelectElement;
	if (event.altKey && event.key === "ArrowLeft") {
		event.preventDefault();
		try { frame?.back(); } catch {}
	} else if (event.altKey && event.key === "ArrowRight") {
		event.preventDefault();
		try { frame?.forward(); } catch {}
	} else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "r") {
		if (frameWrapper.style.display === "flex") {
			event.preventDefault();
			try { frame?.reload(); } catch {}
		}
	} else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "l") {
		event.preventDefault();
		(frameWrapper.style.display === "flex" ? frameAddress : address).focus();
	} else if (event.key === "/" && !typing) {
		event.preventDefault();
		(frameWrapper.style.display === "flex" ? frameAddress : address).focus();
	}
});

loadBookmarks();

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
		if (Array.isArray(config.allowedSites)) {
			allowedSites = config.allowedSites.map((site) => String(site).toLowerCase());
		}
		if (config.accessMode === "allowlist" || config.accessMode === "blacklist") {
			accessMode = config.accessMode;
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
