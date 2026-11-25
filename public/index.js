const landing = document.getElementById("landing");
const form = document.getElementById("sj-form");
const address = document.getElementById("sj-address");
const frameForm = document.getElementById("frame-form");
const frameAddress = document.getElementById("frame-address");
const frameWrapper = document.getElementById("sj-frame-wrapper");
const frameElement = document.getElementById("sj-frame");
const frameUrl = document.getElementById("sj-frame-url");
const pageProgress = document.getElementById("page-progress");
const frameLoading = document.getElementById("frame-loading");
const fullscreenButton = document.getElementById("fullscreen-btn");
const exitFullscreenButton = document.getElementById("exit-fullscreen-btn");
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
const tabList = document.getElementById("tab-list");
const newTabButton = document.getElementById("new-tab-btn");
const landingTabList = document.getElementById("landing-tab-list");
const landingTabBar = document.getElementById("landing-tab-bar");
const landingNewTabButton = document.getElementById("landing-new-tab-btn");

let tabs = [{ id: 1, url: "", label: "Nueva pestaña" }];
let activeTab = 1;
let nextTabId = 2;
const blockedRequest = document.getElementById("blocked-request");
const blockedHost = document.getElementById("blocked-host");
const blockedReason = document.getElementById("blocked-reason");
const blockedRequestBtn = document.getElementById("blocked-request-btn");
const blockedRequestMsg = document.getElementById("blocked-request-msg");
let blockedUrl = "";

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

function showBlocked(url, message = "") {
	let host = "";
	try {
		host = new URL(url).hostname;
	} catch {}
	showErrorScreen(
		message || (host ? `Sitio prohibido: ${host}` : "Ese sitio está prohibido."),
		"",
	);
	if (blockedHost) blockedHost.textContent = host;
	if (blockedRequest) blockedRequest.hidden = false;
	if (blockedReason) blockedReason.value = "";
	if (blockedRequestMsg) blockedRequestMsg.textContent = "";
	blockedUrl = host;
	landing.style.display = "flex";
	frameWrapper.style.display = "none";
}

async function checkPolicy(url) {
	try {
		const res = await fetch(`/api/navigate-check?url=${encodeURIComponent(url)}`, {
			cache: "no-store",
		});
		if (!res.ok) return null;
		return await res.json();
	} catch {
		return null;
	}
}

// Datos de la sesión (usuario y rol) para la barra superior.
fetch("/api/me", { headers: { Accept: "application/json" }, cache: "no-store" })
	.then((r) => (r.ok ? r.json() : null))
	.then((me) => {
		if (!me) return;
		isAdmin = ["admin", "creator"].includes(me.role);
		myBlockedSites = Array.isArray(me.blockedSites)
			? me.blockedSites.map((s) => String(s).toLowerCase())
			: [];
		const bar = document.getElementById("session-bar");
		const who = document.getElementById("session-who");
		const adminLink = document.getElementById("admin-link");
		const avatar = document.getElementById("session-avatar");
		if (avatar) {
			avatar.textContent = "";
			if (me.icon?.url) {
				const image = document.createElement("img");
				image.src = me.icon.url;
				image.alt = "";
				avatar.appendChild(image);
			} else {
				avatar.textContent = me.username.slice(0, 1).toUpperCase();
			}
		}
		if (who) {
			const roleLabel = me.role === "creator"
				? "creador"
				: me.role === "admin"
					? "administrador"
					: me.role === "moderator"
						? "moderador"
						: "usuario";
			who.textContent = `${me.username} · ${roleLabel}`;
		}
		if (adminLink) adminLink.hidden = !["admin", "creator", "moderator"].includes(me.role);
		if (bar) bar.hidden = false;
	})
	.catch(() => {});

let controller;
let frame;
let currentUrl = "";
let loadingActive = false;
let loadingTimer = null;

function startLoading() {
	loadingActive = true;
	if (pageProgress) pageProgress.hidden = false;
	if (frameLoading) frameLoading.hidden = false;
	if (loadingTimer) clearTimeout(loadingTimer);
	loadingTimer = setTimeout(stopLoading, 15000);
}

function stopLoading() {
	loadingActive = false;
	if (pageProgress) pageProgress.hidden = true;
	if (frameLoading) frameLoading.hidden = true;
	if (loadingTimer) {
		clearTimeout(loadingTimer);
		loadingTimer = null;
	}
}

function pulseProgress() {
	if (loadingActive || !pageProgress) return;
	pageProgress.hidden = false;
	if (loadingTimer) clearTimeout(loadingTimer);
	loadingTimer = setTimeout(() => {
		pageProgress.hidden = true;
		loadingTimer = null;
	}, 650);
}

function setImmersive(value) {
	frameWrapper.classList.toggle("immersive", value);
	if (exitFullscreenButton) exitFullscreenButton.hidden = !value;
	if (fullscreenButton) {
		fullscreenButton.title = value ? "Salir de pantalla completa" : "Pantalla completa";
		fullscreenButton.setAttribute("aria-pressed", value ? "true" : "false");
	}
}

async function enterFullscreen() {
	setImmersive(true);
	try {
		if (!document.fullscreenElement) await frameWrapper.requestFullscreen?.();
	} catch {}
}

async function exitFullscreen() {
	setImmersive(false);
	try {
		if (document.fullscreenElement) await document.exitFullscreen();
	} catch {}
}

fullscreenButton?.addEventListener("click", () => {
	if (frameWrapper.classList.contains("immersive")) exitFullscreen();
	else enterFullscreen();
});
exitFullscreenButton?.addEventListener("click", exitFullscreen);
document.addEventListener("fullscreenchange", () => {
	if (!document.fullscreenElement) setImmersive(false);
});
window.addEventListener("keydown", (event) => {
	if (event.key === "Escape" && frameWrapper.classList.contains("immersive")) {
		exitFullscreen();
	}
});

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

	const urlWatcher = new $scramjetUtils.UrlWatcherPlugin(observeFrameUrl);
	const catchEscapedLinks = new $scramjetUtils.CatchEscapedLinksPlugin(
		(url) =>
			new URL(
				`/?goto=${encodeURIComponent(url.href)}&gid=${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
				location.origin,
			),
	);

	frame = controller.createFrame(frameElement, {
		plugins: [urlWatcher, catchEscapedLinks],
	});
	frameElement.addEventListener("load", stopLoading);
}

setInterval(() => {
	if (!frameElement || document.hidden) return;
	let href = "";
	try {
		href = frameElement.contentWindow?.location?.href || "";
	} catch {
		return;
	}
	if (href) observeFrameUrl(href);
}, 700);

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

function externalUrl(raw) {
	const info = proxyInfo(raw);
	if (info.depth >= 1) return /^https?:\/\//i.test(info.url) ? info.url : "";
	try {
		const parsed = new URL(raw);
		if (parsed.origin === location.origin) return "";
		if (!/^https?:$/.test(parsed.protocol)) return "";
		return parsed.href;
	} catch {
		return "";
	}
}

let lastObservedExternal = "";
function observeFrameUrl(raw) {
	const external = externalUrl(raw) || String(raw || "");
	if (!external || external === lastObservedExternal) return;
	lastObservedExternal = external;
	handleFrameUrl(raw);
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
	pulseProgress();
	const info = proxyInfo(url);
	const external = info.depth <= 1 ? externalUrl(url) : "";
	const display = external || url;
	frameUrl.textContent = display;
	frameUrl.title = display;
	if (document.activeElement !== frameAddress) frameAddress.value = display;

	// Si el proxy se ha anidado (varias capas de /~/sj/), volvemos a la URL real.
	if (info.depth > 1) {
		recoverNavigation(info.url);
		return;
	}
	if (recovering) return;

	if (external) {
		lastExternal = external;
		try {
			lastHost = new URL(external).host;
		} catch {}
		updateActiveTab(external);
		checkPolicy(external).then((policy) => {
			if (policy?.blocked) showBlocked(external, policy.message);
			else logActivity(external);
		});
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
	if (frameWrapper.classList.contains("immersive")) exitFullscreen();
	frameWrapper.style.display = "none";
	error.textContent = message;
	errorCode.textContent = details || "";
	landing.style.display = "flex";
}

function hideError() {
	error.textContent = "";
	errorCode.textContent = "";
	if (blockedRequest) blockedRequest.hidden = true;
	blockedUrl = "";
}

function tabLabel(url) {
	try {
		const parsed = new URL(url);
		const host = parsed.hostname.replace(/^www\./, "");
		let pathname = "";
		try {
			pathname = decodeURIComponent(parsed.pathname);
		} catch {
			pathname = parsed.pathname;
		}
		const parts = pathname.split("/").filter(Boolean).slice(0, 2);
		return parts.length ? `${host}/${parts.join("/")}` : host;
	} catch {
		return "Nueva pestaña";
	}
}

function saveTabs() {
	try {
		localStorage.setItem(
			"pw_tabs",
			JSON.stringify(tabs.map((t) => ({ url: t.url, label: t.label }))),
		);
	} catch {}
}

function renderTabsInto(container) {
	if (!container) return;
	container.replaceChildren();
	for (const tab of tabs) {
		const item = document.createElement("div");
		item.className = `tab${tab.id === activeTab ? " active" : ""}`;
		item.title = tab.url || tab.label;
		const label = document.createElement("span");
		label.textContent = tab.label;
		item.append(label);
		const close = document.createElement("button");
		close.type = "button";
		close.title = "Cerrar pestaña";
		close.textContent = "×";
		close.addEventListener("click", (event) => {
			event.stopPropagation();
			closeTab(tab.id);
		});
		item.append(close);
		item.addEventListener("click", () => switchTab(tab.id));
		container.append(item);
	}
}

function renderTabs() {
	renderTabsInto(tabList);
	renderTabsInto(landingTabList);
	if (landingTabBar) landingTabBar.hidden = tabs.length <= 1;
	saveTabs();
}

function updateActiveTab(url) {
	const tab = tabs.find((t) => t.id === activeTab);
	if (!tab) return;
	tab.url = url;
	tab.label = tabLabel(url);
	renderTabs();
}

async function switchTab(id) {
	const tab = tabs.find((t) => t.id === id);
	if (!tab) return;
	activeTab = id;
	renderTabs();
	hideError();
	if (tab.url) {
		await navigate(tab.url, { silent: true, log: false });
	} else {
		goHome();
	}
}

function createTab() {
	if (tabs.length >= 5) return;
	const tab = { id: nextTabId++, url: "", label: "Nueva pestaña" };
	tabs.push(tab);
	activeTab = tab.id;
	renderTabs();
	hideError();
	address.value = "";
	goHome();
	address.focus();
}

function closeTab(id) {
	const index = tabs.findIndex((t) => t.id === id);
	if (index < 0) return;
	tabs.splice(index, 1);
	if (!tabs.length) {
		tabs.push({ id: nextTabId++, url: "", label: "Nueva pestaña" });
	}
	if (activeTab === id) {
		const next = tabs[Math.max(0, index - 1)];
		switchTab(next.id);
	} else {
		renderTabs();
	}
}

newTabButton?.addEventListener("click", createTab);
landingNewTabButton?.addEventListener("click", createTab);

try {
	const saved = JSON.parse(localStorage.getItem("pw_tabs") || "[]");
	if (Array.isArray(saved) && saved.length) {
		tabs = saved.slice(0, 5).map((t, i) => ({
			id: i + 1,
			url: typeof t.url === "string" ? t.url : "",
			label: t.label || tabLabel(t.url || ""),
		}));
		activeTab = tabs[0].id;
		nextTabId = tabs.length + 1;
	}
} catch {}
renderTabs();

async function navigate(url, { silent = false, log = true } = {}) {
	const rawInput = typeof url === "string" ? url.trim() : "";
	url = normalize(url);
	if (!url) return;
	const policy = await checkPolicy(url);
	if (policy?.blocked) {
		showBlocked(url, policy.message);
		return;
	}
	const query = rawInput && !looksLikeUrl(rawInput) ? rawInput : "";
	if (log) logActivity(url, query);

	hideError();
	startLoading();
	try {
		if (!frame) await init();
		await frame.go(url);
		frameAddress.value = url;
		frameUrl.textContent = url;
		// El título de la pestaña no debe revelar el sitio visitado.
		document.title = "Inici - Classroom";
		updateActiveTab(url);
		landing.style.display = "none";
		frameWrapper.style.display = "flex";
	} catch (err) {
		stopLoading();
		if (!silent) showErrorScreen(err.message, err.stack);
	}
}

function goHome() {
	stopLoading();
	if (frameWrapper.classList.contains("immersive")) exitFullscreen();
	frameWrapper.style.display = "none";
	landing.style.display = "flex";
	document.title = "Inici - Classroom";
	if (address) address.value = "";
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

blockedRequestBtn?.addEventListener("click", async () => {
	if (!blockedUrl) return;
	blockedRequestBtn.disabled = true;
	if (blockedRequestMsg) blockedRequestMsg.textContent = "Enviando…";
	try {
		const res = await fetch("/api/requests", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				host: blockedUrl,
				reason: blockedReason?.value || "",
			}),
		});
		const data = await res.json().catch(() => ({}));
		if (!res.ok) {
			const messages = {
				exists: "Ya hay una solicitud pendiente para ese dominio.",
				"not-blocked": "Ese dominio ya no está bloqueado.",
			};
			if (blockedRequestMsg) {
				blockedRequestMsg.textContent = messages[data.error] || "No se pudo enviar.";
			}
		} else {
			if (blockedRequestMsg) {
				blockedRequestMsg.textContent = "Solicitud enviada al administrador.";
			}
		}
	} catch {
		if (blockedRequestMsg) blockedRequestMsg.textContent = "No se pudo enviar.";
	} finally {
		blockedRequestBtn.disabled = false;
	}
});

backButton?.addEventListener("click", () => {
	startLoading();
	try {
		frame?.back();
	} catch {}
});
forwardButton?.addEventListener("click", () => {
	startLoading();
	try {
		frame?.forward();
	} catch {}
});
reloadButton?.addEventListener("click", () => {
	startLoading();
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

const initialParams = new URL(location.href).searchParams;
const goto = initialParams.get("goto");
const gotoId = initialParams.get("gid") || goto;
if (goto) {
	history.replaceState(null, "", location.pathname);
	let alreadyOpened = false;
	try {
		const seen = JSON.parse(sessionStorage.getItem("pw_consumed_gotos") || "[]");
		alreadyOpened = seen.includes(gotoId);
		if (!alreadyOpened) {
			seen.push(gotoId);
			sessionStorage.setItem(
				"pw_consumed_gotos",
				JSON.stringify(seen.slice(-30)),
			);
		}
	} catch {}
	if (!alreadyOpened) {
		navigate(goto).catch((err) => showErrorScreen(err.message, err.stack));
	}
} else if (address) {
	// Evita que el navegador restaure la última URL y la envíe sin querer.
	address.value = "";
}
