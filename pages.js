import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { countOpenAlerts } from "./security.js";
import { adblockStats } from "./adblock.js";
import {
	canAssignRole,
	canCreateInvites,
	canManageRole,
	isAdminRole,
	isReportsRole,
	isStaffRole,
} from "./roles.js";

export function esc(value) {
	return String(value ?? "")
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}


const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSET_DIR = path.join(__dirname, "public");
const assetCache = new Map();

function asset(file) {
	const clean = String(file || "").replace(/^\/+/, "");
	let version = assetCache.get(clean);
	if (!version) {
		try {
			version = Math.floor(fs.statSync(path.join(ASSET_DIR, clean)).mtimeMs).toString(36);
		} catch {
			version = "1";
		}
		assetCache.set(clean, version);
	}
	return `/${clean}?v=${version}`;
}

const THEME_HEAD = `<script>
(() => {
	try {
		const saved = document.cookie.match(/(?:^|; )pw_theme=(dark|light)/);
		const value = saved ? saved[1] : localStorage.getItem("pw-theme");
		if (value === "light" || value === "dark") document.documentElement.dataset.theme = value;
		if (localStorage.getItem("pw-sidebar-collapsed") === "1") {
			document.documentElement.classList.add("sidebar-collapsed");
		}
	} catch {}
})();
</script>
<script src="/theme.js" defer></script>`;

const LOGO = `<svg viewBox="0 0 64 64" aria-hidden="true">
  <rect width="64" height="64" rx="16" fill="#12110f"/>
  <path d="M14 19c7-3 13-2 18 2v26c-5-4-11-5-18-2z" fill="#8fb6f0"/>
  <path d="M50 19c-7-3-13-2-18 2v26c5-4 11-5 18-2z" fill="#a8c7f5"/>
  <path d="M32 21v26" stroke="#12110f" stroke-width="3"/>
  <path d="M18 25c4-1 8-1 11 1" stroke="#12110f" stroke-width="2" stroke-linecap="round" opacity=".55"/>
  <path d="M46 25c-4-1-8-1-11 1" stroke="#12110f" stroke-width="2" stroke-linecap="round" opacity=".55"/>
</svg>`;

const ICON = {
	chat: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.4 8.9 8.9 0 0 1-3.6-.8L3 21l1.9-5.2A8.4 8.4 0 1 1 21 11.5Z"/></svg>`,
	pin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4h6l-1 5 3 3v2H7v-2l3-3-1-5Z"/><path d="M12 14v7"/></svg>`,
	smile: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0"/><path d="M9 9h.01M15 9h.01"/></svg>`,
	reply: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 17 4 12l5-5"/><path d="M4 12h9a7 7 0 0 1 7 7"/></svg>`,
	edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`,
	trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m6 6 1 14h10l1-14"/></svg>`,
	poll: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></svg>`,
	users: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
	user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>`,
	plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`,
};

const ERROR_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 2 21h20Z"/><path d="M12 9v5M12 18h.01"/></svg>`;
const ERROR_ICONS = {
	401: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" aria-hidden="true"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>`,
	403: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 4.5 6v6c0 4.6 3.2 7.6 7.5 9 4.3-1.4 7.5-4.4 7.5-9V6Z"/></svg>`,
	404: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m15 9-2 4-4 2 2-4Z"/></svg>`,
	408: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
	413: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h16v16H4Z"/><path d="M4 14h4l2 2h4l2-2h4"/></svg>`,
	418: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" aria-hidden="true"><path d="M4 9h13v6a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3Z"/><path d="M17 10h2a2 2 0 0 1 0 4h-2"/><path d="M7 3v2M11 3v2"/></svg>`,
	421: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>`,
	429: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
	451: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v18M5 7h14M7 7l-3 6h6ZM17 7l-3 6h6Z"/></svg>`,
	500: ERROR_ICON,
	501: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14 6 4 4-8 8H6v-4Z"/><path d="m12 8 4 4"/></svg>`,
	502: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" aria-hidden="true"><path d="M9 7V3M15 7V3M7 7h10v5a5 5 0 0 1-10 0Z"/><path d="M12 17v4"/></svg>`,
	503: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" aria-hidden="true"><rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7h.01M7 16h.01"/></svg>`,
	504: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" aria-hidden="true"><path d="M4 12a8 8 0 0 1 16 0"/><path d="M7 12a5 5 0 0 1 10 0"/><path d="M10 12a2 2 0 0 1 4 0"/><path d="M12 12v6"/></svg>`,
};
function errorFamily(code) {
	if (code === 401) return "Autenticación";
	if (code === 403) return "Permisos";
	if (code === 404) return "Página";
	if (code === 408 || code === 429 || code === 504) return "Tiempo";
	if (code >= 500) return "Servidor";
	return "Solicitud";
}

const NAV_ICON = {
	home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/></svg>`,
	chat: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.4 8.9 8.9 0 0 1-3.6-.8L3 21l1.9-5.2A8.4 8.4 0 1 1 21 11.5Z"/></svg>`,
	star: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.7 5.5 6 .9-4.3 4.2 1 6-5.4-2.8L6.6 19.6l1-6L3.3 9.4l6-.9Z"/></svg>`,
	clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
	lock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>`,
	user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>`,
	mail: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>`,
	grid: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
	users: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
	monitor: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>`,
	shield: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 4.5 6v6c0 4.6 3.2 7.6 7.5 9 4.3-1.4 7.5-4.4 7.5-9V6Z"/></svg>`,
	activity: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h4l2-7 4 14 2-7h6"/></svg>`,
	eye: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></svg>`,
	list: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/></svg>`,
	file: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v5h5"/></svg>`,
	inbox: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h16v16H4Z"/><path d="M4 14h4l2 2h4l2-2h4"/></svg>`,
	flag: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M5 21V4"/><path d="M5 4h12l-2 5 2 5H5"/></svg>`,
	chart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M4 20V4"/><path d="M4 20h16"/><path d="M8 16v-5M13 16V7M18 16v-8"/></svg>`,
	settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="8" cy="18" r="2"/></svg>`,
	cpu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/></svg>`,
	terminal: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 7 5 5-5 5"/><path d="M12 19h8"/></svg>`,
	layers: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5Z"/><path d="m3 13 9 5 9-5"/></svg>`,
	calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>`,
	pen: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`,
	check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 12 5 5L20 6"/></svg>`,
};


function avatarColor(name) {
	let hash = 0;
	for (const char of String(name || "?")) hash = (hash * 31 + char.charCodeAt(0)) % 360;
	return `hsl(${hash} 42% 32%)`;
}

function userAvatar(name, icon, className = "user-avatar", role = "user") {
	const initial = esc(String(name || "?").slice(0, 1).toUpperCase());
	const requested = Array.isArray(role)
		? role.find((value) => value && value !== "user") || "user"
		: role;
	const roleKey = ["user", "designer", "pentester", "qa", "moderator", "admin", "creator"].includes(
		String(requested || ""),
	)
		? String(requested)
		: "user";
	const image = icon?.url
		? `<img src="${esc(icon.url)}" alt="" loading="lazy">`
		: initial;
	return `<span class="${esc(className)}" data-role="${roleKey}" style="background:var(--role-${roleKey})">${image}</span>`;
}

function profileLink(name, className = "profile-link", label = name) {
	return `<a class="${esc(className)}" href="/u/${encodeURIComponent(name)}" onclick="event.stopPropagation()">${esc(label)}</a>`;
}

function groupAvatar(name, className = "group-avatar") {
	const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
	const initial = esc(
		(
			parts.length > 1
				? parts.slice(0, 2).map((part) => part[0]).join("")
				: String(name || "?").slice(0, 2)
		).toUpperCase(),
	);
	return `<span class="${esc(className)}" style="background:${avatarColor(name)}">${initial}</span>`;
}

function shell(title, body, { topbar = "", chatFab = true, wide = false, full = false, head = "", user = null } = {}) {
	const bodyClass = `app-body${topbar ? "" : " auth-shell"}${full ? " layout-chat chat-body" : ""}`;
	return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#070b12">
<title>Inici - Classroom</title>
<link rel="icon" type="image/png" href="/favicon.png">
${THEME_HEAD}
<link rel="preload" href="/fonts/ibm-plex-sans-var.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${asset("css/tokens.css")}">
<link rel="stylesheet" href="${asset("css/base.css")}">
<link rel="stylesheet" href="${asset("css/app.css")}">
${head}
<script src="/page-i18n.js" defer></script>
${topbar ? '<script src="/session-guard.js" defer></script>' : ""}
<script src="/global-search.js?v=3" defer></script>
</head>
<body class="${bodyClass}">
<div id="page-progress" class="page-progress" hidden><i></i></div>
${topbar}
${full
  ? `<main class="wrap full">${body}</main>`
  : `<div class="app-frame">
${topbar ? appSidebar(user) : ""}
<div class="app-content">
<main class="wrap${wide ? " wide" : ""}">${body}</main>
<footer class="app-footer">Proxy Web</footer>
</div>
</div>`}
${topbar ? '<button type="button" class="nav-backdrop" id="nav-backdrop" aria-label="Cerrar menú" tabindex="-1"></button>' : ""}
${topbar ? '<form method="post" action="/api/panic" class="panic-button-form"><button class="panic-button" type="submit" title="Redirigir este dispositivo a Classroom durante 5 minutos">Pánico</button></form>' : ""}
${topbar && chatFab ? `<a class="chat-fab" href="/chat" aria-label="Abrir chat" title="Abrir chat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.4 8.9 8.9 0 0 1-3.6-.8L3 21l1.9-5.2A8.4 8.4 0 1 1 21 11.5Z"/></svg></a><script src="${asset("chat-notify.js")}" defer></script>` : ""}
<script>
(() => {
  const bar = document.getElementById("page-progress");
  if (bar) {
    let timer = null;
    const show = () => {
      bar.hidden = false;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { bar.hidden = true; timer = null; }, 15000);
    };
    const hide = () => { bar.hidden = true; if (timer) { clearTimeout(timer); timer = null; } };
    window.addEventListener("pageshow", hide);
    document.addEventListener("submit", (event) => {
      if (!(event.target instanceof HTMLFormElement)) return;
      const action = event.target.getAttribute("action") || "";
      if (action.includes("/backup/download")) return;
      show();
    }, true);
    document.addEventListener("click", (event) => {
      const link = event.target.closest && event.target.closest("a[href]");
      if (!link) return;
      if (link.target && link.target !== "_self") return;
      if (link.hasAttribute("download")) return;
      const href = link.getAttribute("href") || "";
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
      if (href.endsWith(".csv") || href.includes("/api/admin/backup/download")) return;
      try { if (new URL(link.href, location.href).origin === location.origin) show(); } catch {}
    }, true);
  }

  const toggle = document.getElementById("nav-toggle");
  const backdrop = document.getElementById("nav-backdrop");
  const setNav = (open) => {
    document.body.classList.toggle("nav-open", open);
    if (toggle) toggle.setAttribute("aria-expanded", open ? "true" : "false");
  };
  toggle?.addEventListener("click", () => setNav(!document.body.classList.contains("nav-open")));
  backdrop?.addEventListener("click", () => setNav(false));
  document.getElementById("app-sidebar-close")?.addEventListener("click", () => setNav(false));

  const sidebarToggle = document.getElementById("sidebar-toggle");
  const applySidebar = (collapsed) => {
    document.documentElement.classList.toggle("sidebar-collapsed", collapsed);
    if (sidebarToggle) {
      sidebarToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
      sidebarToggle.setAttribute("aria-label", collapsed ? "Expandir menú lateral" : "Contraer menú lateral");
      sidebarToggle.title = collapsed ? "Expandir menú lateral" : "Contraer menú lateral";
    }
    try { localStorage.setItem("pw-sidebar-collapsed", collapsed ? "1" : "0"); } catch {}
  };
  applySidebar(document.documentElement.classList.contains("sidebar-collapsed"));
  sidebarToggle?.addEventListener("click", () => {
    applySidebar(!document.documentElement.classList.contains("sidebar-collapsed"));
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setNav(false);
  });

  const path = location.pathname;
  document.querySelectorAll(".app-nav a").forEach((link) => {
    const target = new URL(link.href, location.href).pathname;
    if (target === path) link.classList.add("active");
    else link.classList.remove("active");
  });
})();
</script>
</body>
</html>`;
}

function navLink(href, label, icon = "•") {
	return `<a href="${href}" data-nav="${href}" title="${esc(label)}"><span class="app-nav-icon" aria-hidden="true">${icon}</span><span>${esc(label)}</span></a>`;
}

function appSidebar(user) {
	if (!user) return "";
	const roles = Array.isArray(user.roles) && user.roles.length ? user.roles : [user.role];
	const isAdmin = roles.some((role) => ["admin", "creator"].includes(role));
	const isStaff = roles.some((role) => ["admin", "creator", "moderator"].includes(role));
	const isCreator = roles.includes("creator");
	const alertCount = isAdmin ? countOpenAlerts() : 0;
	const principal = [
		navLink("/", "Inicio", NAV_ICON.home),
		navLink("/chat", "Chat", NAV_ICON.chat),
		navLink("/bookmarks", "Favoritos", NAV_ICON.star),
		navLink("/history", "Historial", NAV_ICON.clock),
		navLink("/vault", "Bóveda", NAV_ICON.lock),
		navLink("/account", "Mi cuenta", NAV_ICON.user),
	];
	if (canCreateInvites(user)) principal.push(navLink("/invites", "Invitaciones", NAV_ICON.mail));
	const admin = [];
	if (isAdmin) {
		admin.push(navLink("/admin/overview", "Resumen", NAV_ICON.grid));
	}
	if (isStaff) {
		admin.push(navLink("/admin", "Usuarios", NAV_ICON.users));
		admin.push(navLink("/admin/sessions", "Sesiones", NAV_ICON.monitor));
	}
	if (isAdmin) {
		admin.push(navLink("/admin/security", `Seguridad${alertCount ? ` (${alertCount})` : ""}`, NAV_ICON.shield));
		admin.push(navLink("/admin/traffic", "Tráfico", NAV_ICON.activity));
		admin.push(navLink("/admin/monitor", "Vigilancia", NAV_ICON.eye));
	}
	if (isStaff) {
		admin.push(navLink("/admin/activity", "Actividad", NAV_ICON.list));
		admin.push(navLink("/admin/audit", "Auditoría", NAV_ICON.file));
		admin.push(navLink("/admin/requests", "Solicitudes", NAV_ICON.inbox));
	}
	if (isAdmin) admin.push(navLink("/admin/reports", "Informes", NAV_ICON.flag));
	if (isStaff) admin.push(navLink("/admin/stats", "Estadísticas", NAV_ICON.chart));

	const system = [];
	if (isAdmin) {
		system.push(navLink("/admin/settings", "Ajustes", NAV_ICON.settings));
		system.push(navLink("/admin/system", "Sistema", NAV_ICON.cpu));
		system.push(navLink("/admin/logs", "Logs", NAV_ICON.terminal));
		system.push(navLink("/admin/templates", "Plantillas", NAV_ICON.layers));
		system.push(navLink("/admin/schedules", "Programaciones", NAV_ICON.calendar));
	}

	const tools = [];
	if (isCreator) {
		tools.push(navLink("/design", "Herramientas", NAV_ICON.pen));
	} else {
		if (roles.includes("designer")) tools.push(navLink("/design", "Diseño", NAV_ICON.pen));
		if (roles.includes("pentester")) tools.push(navLink("/pentest", "Pentest", NAV_ICON.terminal));
		if (roles.includes("qa")) tools.push(navLink("/qa", "QA", NAV_ICON.check));
		if (roles.some((role) => ["designer", "pentester", "qa"].includes(role))) {
			tools.push(navLink("/reports", "Mis informes", NAV_ICON.flag));
		}
	}

	const section = (label, links) =>
		links.length
			? `<nav class="app-nav" aria-label="${esc(label)}"><p class="app-nav-label">${esc(label)}</p>${links.join("")}</nav>`
			: "";
	return `<aside class="app-sidebar" id="app-sidebar">
  <div class="chat-sidebar-head">
    <div class="chat-sidebar-brand"><span class="chat-sidebar-mark">◉</span><div><strong>Navegación</strong><small>Proxy Web</small></div></div>
    <button type="button" class="chat-sidebar-close" id="app-sidebar-close" aria-label="Cerrar menú">×</button>
  </div>
  ${section("Principal", principal)}
  ${section("Administración", admin)}
  ${section("Sistema", system)}
  ${section("Herramientas", tools)}
</aside>`;
}

function topbar(user) {
	const roles = Array.isArray(user?.roles) && user.roles.length ? user.roles : [user?.role];
	const roleNames = roles.map(roleLabel);
	const roleText = `${roleNames.slice(0, 2).join(" + ")}${roleNames.length > 2 ? ` +${roleNames.length - 2}` : ""}`;
	const avatar = user ? userAvatar(user.username, user.icon, "topbar-avatar", user.role) : "";
	return `<header class="topbar">
  <button type="button" class="nav-toggle" id="nav-toggle" aria-label="Abrir menú" aria-expanded="false" aria-controls="app-sidebar">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
  </button>
  <a class="brand" href="/" aria-label="Proxy Web">
    <span class="brand-logo">${LOGO}</span>
    <span class="brand-name">Proxy <em>Web</em></span>
  </a>
  <button type="button" class="icon-btn sidebar-toggle" id="sidebar-toggle" aria-label="Contraer menú lateral" aria-expanded="true" title="Contraer menú lateral">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/><path d="m14 9-3 3 3 3"/></svg>
  </button>
  <button type="button" class="topbar-search" data-global-search aria-label="Buscar en la aplicación">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
    <span>Buscar favoritos, historial, secciones…</span>
    <kbd>Ctrl K</kbd>
  </button>
  <div class="topbar-actions">
    <button type="button" class="icon-btn theme-toggle" data-theme-toggle aria-label="Cambiar tema" title="Cambiar tema">
      <svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"/></svg>
      <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
    </button>
    <a class="topbar-user" href="/account" title="Mi cuenta">
      ${avatar}
      <span class="who"><strong>${esc(user?.username || "")}</strong><small>${esc(roleText)}</small></span>
    </a>
    <form method="post" action="/logout" class="inline-form">
      <button class="icon-btn" type="submit" title="Cerrar sesión" aria-label="Cerrar sesión">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>
      </button>
    </form>
  </div>
</header>`;
}

function roleLabel(role) {
	if (role === "creator") return "creador";
	if (role === "admin") return "administrador";
	if (role === "moderator") return "moderador";
	if (role === "designer") return "diseñador gráfico";
	if (role === "pentester") return "pentester";
	if (role === "qa") return "QA / bugs";
	return "usuario";
}

function roleBadges(roles, fallback = "user") {
	const list = Array.isArray(roles) && roles.length ? roles : [fallback];
	return list
		.map((role) => `<span class="badge role-${esc(role)}">${esc(roleLabel(role))}</span>`)
		.join(" ");
}

const ROLE_META = {
	user: { icon: "", desc: "Navegación, chat y cuenta" },
	moderator: { icon: "", desc: "Moderación y consulta" },
	designer: { icon: "", desc: "Interfaz y sistema visual" },
	pentester: { icon: "", desc: "Seguridad y pentest" },
	qa: { icon: "", desc: "Pruebas y bugs" },
	admin: { icon: "", desc: "Gestión completa" },
	creator: { icon: "", desc: "Cuenta propietaria" },
};

function toolTabs(active, user) {
	const roles = Array.isArray(user?.roles) && user.roles.length ? user.roles : [user?.role];
	const privileged = roles.includes("creator");
	const tools = [];
	if (privileged || roles.includes("designer")) tools.push(["designer", "/design", "Diseño"]);
	if (privileged || roles.includes("pentester")) tools.push(["pentester", "/pentest", "Pentest"]);
	if (privileged || roles.includes("qa")) tools.push(["qa", "/qa", "QA"]);
	if (isReportsRole(roles)) tools.push(["reports", "/reports", "Informes"]);
	if (!tools.length) return "";
	return `<nav class="tabs tool-tabs">${tools
		.map(
			([key, href, label]) =>
				`<a href="${href}"${key === active ? ' class="active"' : ""}>${label}</a>`,
		)
		.join("")}</nav>`;
}

function roleOption(role, checked = false) {
	const meta = ROLE_META[role] || { icon: "•", desc: "" };
	return `<label class="role-option${checked ? " selected" : ""}">
  <input type="checkbox" name="roles" value="${esc(role)}"${checked ? " checked" : ""}>
  ${meta.icon ? `<span class="role-option-icon">${esc(meta.icon)}</span>` : ""}
  <span class="role-option-text"><strong>${esc(roleLabel(role))}</strong><small>${esc(meta.desc)}</small></span>
</label>`;
}

const ADMIN_TABS = [
	["overview", "/admin/overview", "Resumen"],
	["users", "/admin", "Usuarios"],
	["sessions", "/admin/sessions", "Sesiones"],
	["security", "/admin/security", "Seguridad"],
	["traffic", "/admin/traffic", "Tráfico"],
	["monitor", "/admin/monitor", "Vigilancia"],
	["activity", "/admin/activity", "Actividad"],
	["audit", "/admin/audit", "Auditoría"],
	["requests", "/admin/requests", "Solicitudes"],
	["reports", "/admin/reports", "Informes"],
	["stats", "/admin/stats", "Estadísticas"],
	["settings", "/admin/settings", "Ajustes"],
	["system", "/admin/system", "Sistema"],
];

function adminTabs(active, role = "admin") {
	const visible = ["admin", "creator"].includes(role)
		? ADMIN_TABS.filter(([key]) => role === "creator" || key !== "reports")
		: ADMIN_TABS.filter(([key]) => !["overview", "settings", "system", "security", "traffic", "monitor", "reports"].includes(key));
	const separators = new Set(["security", "activity", "settings"]);
	const links = visible
		.map(
			([key, href, label]) =>
				`${separators.has(key) ? '<span class="tab-sep" aria-hidden="true"></span>' : ""}<a href="${href}"${key === active ? ' class="active"' : ""}>${label}</a>`,
		)
		.join("");
	return `<nav class="tabs">${links}</nav>`;
}

function fmtAudioTime(seconds) {
	const total = Math.max(0, Math.round(Number(seconds) || 0));
	const minutes = Math.floor(total / 60);
	const rest = total % 60;
	return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function attachmentLabel(attachment) {
	const type = String(attachment?.type || "");
	if (type.startsWith("audio/")) return "Audio";
	if (type.startsWith("image/")) return "Imagen";
	if (attachment) return "Archivo";
	return "Adjunto";
}

function audioPlayerMarkup(attachment) {
	const duration = Math.max(0, Math.round(Number(attachment?.duration) || 0));
	const waveform = Array.isArray(attachment?.waveform) ? attachment.waveform.join(",") : "";
	const name = attachment?.name || "audio";
	return `<div class="chat-audio" data-audio data-duration="${duration}" data-waveform="${esc(waveform)}">
      <button type="button" class="chat-audio-play" data-audio-play aria-label="Reproducir audio">
        <svg class="icon-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
        <svg class="icon-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>
      </button>
      <div class="chat-audio-body">
        <div class="chat-audio-wave" data-audio-wave role="slider" tabindex="0" aria-label="Posición del audio" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"></div>
        <div class="chat-audio-meta"><span class="chat-audio-time"><span data-audio-time>0:00</span> / <span data-audio-total>${fmtAudioTime(duration)}</span></span><span class="chat-audio-name" title="${esc(name)}">${esc(name)}</span></div>
      </div>
      <audio data-audio-el preload="metadata" src="/api/chat/files/${esc(attachment.id)}"></audio>
    </div>`;
}

function fmtBytes(bytes) {
	const n = Number(bytes) || 0;
	if (n < 1024) return `${n} B`;
	const units = ["KB", "MB", "GB", "TB"];
	let value = n / 1024;
	let i = 0;
	while (value >= 1024 && i < units.length - 1) {
		value /= 1024;
		i++;
	}
	return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[i]}`;
}

function fmtDuration(seconds) {
	const s = Math.max(0, Math.floor(Number(seconds) || 0));
	const days = Math.floor(s / 86400);
	const hours = Math.floor((s % 86400) / 3600);
	const mins = Math.floor((s % 3600) / 60);
	if (days) return `${days} d ${hours} h`;
	if (hours) return `${hours} h ${mins} min`;
	return `${mins} min`;
}

function toLocalInput(iso) {
	if (!iso) return "";
	try {
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return "";
		const pad = (n) => String(n).padStart(2, "0");
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
			d.getHours(),
		)}:${pad(d.getMinutes())}`;
	} catch {
		return "";
	}
}

export function loginPage({ next = "/", error = "", notice = "", maintenance = "", csrf = "" } = {}) {
	const body = `<div class="card login-card">
  <div class="login-logo">${LOGO}</div>
  <h1>Proxy <span style="color:var(--accent)">Web</span></h1>
  <p class="muted">Acceso privado. Identifícate para usar el proxy.</p>
  ${notice ? `<p class="msg ok">${esc(notice)}</p>` : ""}
  ${maintenance ? `<p class="warn">${esc(maintenance)}</p>` : ""}
  <form method="post" action="/api/login">
    <input type="hidden" name="next" value="${esc(next)}">
    <input type="hidden" name="csrf" value="${esc(csrf)}">
    <label for="username">Usuario</label>
    <input id="username" name="username" autocomplete="username" required autofocus>
    <label for="password">Contraseña</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required>
    <button class="primary" type="submit">Entrar</button>
  </form>
  ${error ? `<p class="msg error">${esc(error)}</p>` : ""}
</div>`;
	return shell("Inici - Classroom", body);
}

export function invitePage({
	token = "",
	csrf = "",
	groups = [],
	error = "",
	values = {},
} = {}) {
	const options = groups
		.map(
			(group) =>
				`<option value="${esc(group.id)}"${values.group === group.id ? " selected" : ""}>${esc(group.name)}</option>`,
		)
		.join("");
	const noGroups = !groups.length;
	const body = `<div class="card invite-card">
  <div class="login-logo">${LOGO}</div>
  <h1>Crear cuenta</h1>
  <p class="muted">Te han invitado a Inici - Classroom. Elige tu usuario, contraseña y grupo de clase.</p>
  ${error ? `<p class="msg error">${esc(error)}</p>` : ""}
  ${
		noGroups
			? '<p class="warn">No hay grupos disponibles. Pide a un administrador que cree uno antes de usar la invitación.</p>'
			: ""
	}
  <form id="invite-form" method="post" action="/api/invite/accept">
    <input type="hidden" name="token" value="${esc(token)}">
    <input type="hidden" name="csrf" value="${esc(csrf)}">
    <label for="invite-username">Usuario</label>
    <input id="invite-username" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="32" value="${esc(values.username || "")}" required autofocus>
    <label for="invite-password">Contraseña</label>
    <input id="invite-password" name="password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required>
    <label for="invite-confirm">Repetir contraseña</label>
    <input id="invite-confirm" name="confirm" type="password" autocomplete="new-password" minlength="8" maxlength="128" required>
    <label for="invite-group">Grupo de clase</label>
    <select id="invite-group" name="group" required${noGroups ? " disabled" : ""}>
      <option value="">Elige tu grupo…</option>
      ${options}
    </select>
    <div class="invite-avatar-row">
      <img id="invite-avatar-preview" class="invite-avatar-preview" alt="">
      <div>
        <label for="invite-avatar">Foto de perfil (opcional)</label>
        <input id="invite-avatar" type="file" accept="image/png,image/jpeg,image/webp">
        <div id="invite-avatar-msg" class="hint">PNG, JPG o WebP · máximo 2 MB</div>
      </div>
    </div>
    <button class="primary" type="submit" id="invite-submit"${noGroups ? " disabled" : ""}>Crear cuenta</button>
  </form>
  <p class="hint">La cuenta se creará con rol de usuario normal. El navegador puede ofrecerte guardar el usuario y la contraseña.</p>
</div>
<script src="/invite.js?v=1" defer></script>`;
	return shell("Crear cuenta · Proxy Web", body, { chatFab: false });
}

export function invitesPage({
	user,
	invites = [],
	newLink = "",
	notice = "",
	error = "",
} = {}) {
	const statusLabel = {
		active: "Activa",
		used: "Usada",
		expired: "Caducada",
		revoked: "Revocada",
	};
	const rows = invites
		.map((invite) => {
			const status = invite.status || "invalid";
			const used = invite.usedBy?.length
				? ` · usada por ${invite.usedBy.map((name) => esc(name)).join(", ")}`
				: "";
			return `<div class="invite-row">
  <div class="invite-row-main">
    <strong>Invitación <span class="invite-status ${esc(status)}">${esc(statusLabel[status] || "No válida")}</span></strong>
    <small>creada ${esc(fmtDate(invite.createdAt))} · caduca ${esc(fmtDate(invite.expiresAt))} · ${invite.uses}/${invite.maxUses} usos${used}</small>
  </div>
  ${
		status === "active"
			? `<form method="post" action="/api/invites/${encodeURIComponent(invite.id)}/revoke">
    <button class="small danger" type="submit">Revocar</button>
  </form>`
			: ""
	}
</div>`;
		})
		.join("");
	const linkBox = newLink
		? `<div class="invite-link-box">
  <label for="invite-new-link">Enlace recién creado: cópialo ahora, no se volverá a mostrar</label>
  <div class="invite-link-row">
    <input id="invite-new-link" value="${esc(newLink)}" readonly>
    <button class="small" type="button" data-copy-invite>Copiar</button>
  </div>
</div>`
		: "";
	const body = `<div class="card invite-card">
  <h1>Invitaciones</h1>
  <p class="muted">Crea un enlace para que otra persona se registre. El enlace es de un solo uso y caduca en 7 días.</p>
  ${notice ? `<p class="msg ok">${esc(notice)}</p>` : ""}
  ${error ? `<p class="msg error">${esc(error)}</p>` : ""}
  <form method="post" action="/api/invites">
    <button class="primary" type="submit">Crear enlace de invitación</button>
  </form>
  ${linkBox}
  <h2>Mis invitaciones</h2>
  <div class="invite-list">${rows || '<p class="muted">Todavía no has creado ninguna invitación.</p>'}</div>
  <p class="hint">Solo pueden crear invitaciones las cuentas que no tengan el rol de usuario.</p>
</div>
<script>
document.querySelector("[data-copy-invite]")?.addEventListener("click", async () => {
  const input = document.getElementById("invite-new-link");
  if (!input) return;
  try {
    await navigator.clipboard.writeText(input.value);
    const button = document.querySelector("[data-copy-invite]");
    if (button) button.textContent = "Copiado";
  } catch {
    input.select();
    document.execCommand("copy");
  }
});
</script>`;
	return shell("Invitaciones · Proxy Web", body, {
		user, topbar: topbar(user),
		chatFab: false,
	});
}

export function mfaPage({ next = "/", error = "", csrf = "" } = {}) {
	const body = `<div class="card login-card">
  <div class="login-logo">${LOGO}</div>
  <h1>Verificación en dos pasos</h1>
  <p class="muted">Introduce el código de 6 dígitos de tu app de autenticación o uno de tus códigos de recuperación.</p>
  <form method="post" action="/api/login/mfa">
    <input type="hidden" name="next" value="${esc(next)}">
    <input type="hidden" name="csrf" value="${esc(csrf)}">
    <label for="mfa-code">Código</label>
    <input id="mfa-code" name="code" inputmode="text" autocomplete="one-time-code" placeholder="123456 o ABCD-EFGH" required autofocus>
    <button class="primary" type="submit">Verificar</button>
  </form>
  ${error ? `<p class="msg error">${esc(error)}</p>` : ""}
  <p class="hint"><a href="/login">Volver a iniciar sesión</a></p>
</div>`;
	return shell("Verificación · Proxy Web", body);
}

export function mfaSetupPage({ user, secret = "", uri = "", error = "" } = {}) {
	const body = `
<div class="card" style="max-width:620px;margin:0 auto">
  <h1>Activar MFA</h1>
  <p class="muted">Añade esta cuenta a tu app de autenticación. Puedes escanear el enlace o introducir la clave manualmente.</p>
  <label for="mfa-secret">Clave secreta</label>
  <input id="mfa-secret" value="${esc(secret)}" readonly onclick="this.select()">
  <p class="hint">En la app: “Añadir cuenta” → “Introducir clave de configuración”. Tipo: basado en tiempo. Dígitos: 6. Periodo: 30 s.</p>
  <p class="hint"><a href="${esc(uri)}">Abrir en la app de autenticación</a></p>
  ${error ? `<p class="msg error">${esc(error)}</p>` : ""}
  <form method="post" action="/api/account/mfa/enable">
    <label for="mfa-confirm">Código de 6 dígitos que muestra la app</label>
    <input id="mfa-confirm" name="code" inputmode="numeric" autocomplete="one-time-code" placeholder="123456" required>
    <button class="primary" type="submit">Confirmar y activar</button>
  </form>
  <p class="hint"><a href="/account">Cancelar</a></p>
</div>`;
	return shell("Activar MFA · Proxy Web", body, { user, topbar: topbar(user) });
}

export function mfaRecoveryPage({ user, codes = [], title = "Códigos de recuperación", message = "" } = {}) {
	const body = `
<div class="card" style="max-width:620px;margin:0 auto">
  <h1>${esc(title)}</h1>
  <p class="muted">${esc(message)}</p>
  <pre class="panel" style="font-size:16px;line-height:1.7">${esc(codes.join("\n"))}</pre>
  <p class="hint">Cada código se puede usar una sola vez. Guárdalos en un lugar seguro y sin conexión.</p>
  <a class="small primary-small" href="/account">He guardado los códigos</a>
</div>`;
	return shell("Códigos de recuperación · Proxy Web", body, { user, topbar: topbar(user) });
}

const HTTP_ERRORS = {
	400: ["Solicitud no válida", "La petición no tiene el formato esperado."],
	401: ["Necesitas iniciar sesión", "Tu sesión no es válida o ha caducado."],
	403: ["Acceso restringido", "No tienes permisos para ver este contenido."],
	404: ["Página no encontrada", "La dirección no existe o se ha movido."],
	405: ["Método no permitido", "Esta acción no está permitida en esta ruta."],
	408: ["Tiempo de espera agotado", "La petición tardó demasiado. Inténtalo de nuevo."],
	413: ["Contenido demasiado grande", "El archivo o formulario supera el límite permitido."],
	418: ["Soy una tetera", "El servidor está haciendo café, no té."],
	421: ["Destino no válido", "El dominio usado para acceder no está permitido."],
	429: ["Demasiadas peticiones", "Has hecho demasiadas solicitudes en poco tiempo."],
	451: ["Contenido no disponible", "Este contenido no está disponible por motivos legales."],
	500: ["Error interno", "Algo falló en el servidor. Ya se está revisando."],
	501: ["Aún no implementado", "Esta función todavía no está disponible."],
	502: ["Pasarela incorrecta", "Un servicio intermedio devolvió una respuesta no válida."],
	503: ["Servicio no disponible", "El servicio está temporalmente fuera de línea."],
	504: ["Pasarela sin respuesta", "El servicio tardó demasiado en responder."],
};

export function errorPage({
	status = 500,
	title = "",
	message = "",
	user = null,
	previewCodes = null,
} = {}) {
	const code = Number(status) || 500;
	const info = HTTP_ERRORS[code] || ["Error del servidor", "No se pudo completar la operación."];
	const heading = title || info[0];
	const detail = message || info[1];
	const preview = Array.isArray(previewCodes) && previewCodes.length
		? `<div class="error-preview">
  <span>Vista previa</span>
  ${previewCodes.map((item) => `<a class="${item === code ? "active" : ""}" href="/admin/error-preview?code=${item}">${item}</a>`).join("")}
</div>`
		: "";
	const body = `<div class="error-screen">
  <div class="error-card" role="alert">
    <div class="error-top">
      <div class="error-orbit" aria-hidden="true">${ERROR_ICONS[code] || ERROR_ICON}</div>
      <span class="error-family">${esc(errorFamily(code))}</span>
    </div>
    <div class="error-code">${esc(code)}</div>
    <h1>${esc(heading)}</h1>
    <p>${esc(detail)}</p>
    <div class="error-actions">
      <a class="small primary-small" href="${user ? "/" : "/login"}">${user ? "Volver al inicio" : "Iniciar sesión"}</a>
      ${user ? '<a class="small" href="/account">Mi cuenta</a>' : '<a class="small" href="/">Ir al inicio</a>'}
      ${code >= 500 ? '<button class="small" type="button" onclick="location.reload()">Reintentar</button>' : ""}
      <button class="small" type="button" onclick="if (history.length > 1) history.back(); else location.href='/'">Volver atrás</button>
    </div>
    ${code >= 500 ? '<p class="hint">Si el problema continúa, contacta con el administrador.</p>' : ""}
    ${preview}
  </div>
</div>`;
	return shell(`${code} · ${heading}`, body, { user, topbar: user ? topbar(user) : "", chatFab: false });
}

export function groupPanelPage({
	user,
	group,
	members = [],
	sessions = [],
	activity = [],
	groups = [],
	canEditRules = false,
	notice = "",
	error = "",
} = {}) {
	const rules = group?.rules || {};
	const now = Date.now();
	const dayLabels = [
		[0, "D"],
		[1, "L"],
		[2, "M"],
		[3, "X"],
		[4, "J"],
		[5, "V"],
		[6, "S"],
	];
	const sessionStats = new Map();
	for (const session of sessions) {
		const key = String(session.username || "").toLowerCase();
		const current = sessionStats.get(key) || { count: 0, lastActiveAt: null, ip: "" };
		current.count += 1;
		if (
			!current.lastActiveAt ||
			new Date(session.lastActiveAt || session.lastSeenAt) > new Date(current.lastActiveAt)
		) {
			current.lastActiveAt = session.lastActiveAt || session.lastSeenAt;
			current.ip = session.ip || "";
		}
		sessionStats.set(key, current);
	}
	const latest = new Map();
	for (const entry of activity) {
		const key = String(entry.username || "").toLowerCase();
		if (!latest.has(key)) latest.set(key, entry);
	}
	const onlineCount = members.filter((member) => {
		const stats = sessionStats.get(member.username.toLowerCase());
		return (
			stats?.lastActiveAt &&
			now - new Date(stats.lastActiveAt).getTime() < 5 * 60 * 1000
		);
	}).length;
	const schedule = rules.schedule?.enabled
		? rules.schedule
		: { enabled: false, days: [1, 2, 3, 4, 5], start: "08:00", end: "20:00" };
	const accessLabel =
		rules.accessMode === "allowlist"
			? `Lista blanca del grupo (${(rules.allowedSites || []).length})`
			: rules.accessMode === "blacklist"
				? `Lista negra del grupo (${(rules.blockedSites || []).length})`
				: "Hereda las reglas globales";
	const scheduleLabel = schedule.enabled
		? `${schedule.days.map((day) => dayLabels.find(([value]) => value === day)?.[1] || "?").join("")} · ${schedule.start}-${schedule.end}`
		: "Sin horario propio";
	const limitParts = [];
	if (rules.bandwidthKbps > 0) limitParts.push(`${rules.bandwidthKbps} Kbps`);
	if (rules.maxStreams > 0) limitParts.push(`${rules.maxStreams} streams`);
	if (rules.maxConnections > 0) limitParts.push(`${rules.maxConnections} conexiones`);
	const limitLabel = limitParts.length ? limitParts.join(" · ") : "Hereda los límites globales";
	const blockedText = (rules.blockedSites || [])
		.map((host) =>
			rules.siteMessages?.[host] ? `${host} | ${rules.siteMessages[host]}` : host,
		)
		.join("\n");
	const memberRows = members
		.map((member) => {
			const key = member.username.toLowerCase();
			const stats = sessionStats.get(key);
			const current = latest.get(key);
			const online =
				stats?.lastActiveAt &&
				now - new Date(stats.lastActiveAt).getTime() < 5 * 60 * 1000;
			const manageable =
				member.username.toLowerCase() !== user.username.toLowerCase() &&
				canManageRole(user.role, member.role);
			return `<tr>
  <td><input type="checkbox" name="usernames" value="${esc(member.username)}" form="group-bulk" data-bulk${manageable ? "" : " disabled"} title="${manageable ? "Seleccionar" : "Sin permisos para gestionar esta cuenta"}"></td>
  <td><strong>${profileLink(member.username)}</strong> ${roleBadges(member.roles, member.role)}</td>
  <td><span class="badge ${online ? "monitor-online" : "monitor-offline"}">${online ? "en línea" : "inactivo"}</span> <span class="badge${member.groupRules === false ? "" : " group"}" title="Reglas del grupo">${member.groupRules === false ? "reglas off" : "reglas on"}</span></td>
  <td class="muted">${stats ? `${stats.count} sesión${stats.count === 1 ? "" : "es"}` : "0 sesiones"}</td>
  <td class="mono">${current ? esc(current.url || "Solo búsqueda") : "—"}</td>
  <td><a class="small" href="/admin/activity?user=${encodeURIComponent(member.username)}">Ver actividad</a></td>
</tr>`;
		})
		.join("");
	const body = `
${adminTabs("users", user.role)}
<div class="card" style="margin-bottom:22px">
  <div class="section-title-row">
    <div class="account-head" style="margin:0">
      ${groupAvatar(group.name, "group-avatar group-panel-avatar")}
      <div>
        <h1>${esc(group.name)}</h1>
        <p class="muted">Panel del grupo de clase. Revisa sus reglas, miembros y actividad.</p>
      </div>
    </div>
    <a class="small" href="/admin">Volver a usuarios</a>
  </div>
  <div class="stats">
    <div class="stat"><div class="k">Miembros</div><div class="v">${members.length}</div></div>
    <div class="stat"><div class="k">En línea</div><div class="v">${onlineCount}</div></div>
    <div class="stat"><div class="k">Sesiones</div><div class="v">${sessions.length}</div></div>
    <div class="stat"><div class="k">Sitios bloqueados</div><div class="v">${(rules.blockedSites || []).length}</div></div>
  </div>
  <div class="settings-status">
    <span class="badge group">${esc(accessLabel)}</span>
    <span class="badge">${esc(scheduleLabel)}</span>
    <span class="badge">${esc(limitLabel)}</span>
  </div>
</div>

<div class="card" style="margin-bottom:22px" id="rules">
  <div class="section-title-row">
    <h2>Reglas del grupo</h2>
    ${canEditRules ? '<span class="hint">Solo administradores y creador</span>' : ""}
  </div>
  ${
		canEditRules
			? `<details>
    <summary class="muted" style="cursor:pointer">Editar reglas</summary>
    <form method="post" action="/api/admin/groups/${encodeURIComponent(group.id)}/rules" style="margin-top:14px">
      <div class="grid">
        <div>
          <label for="group-access">Modo de sitios</label>
          <select id="group-access" name="accessMode">
            <option value=""${rules.accessMode === "" ? " selected" : ""}>Heredar reglas globales</option>
            <option value="blacklist"${rules.accessMode === "blacklist" ? " selected" : ""}>Lista negra del grupo</option>
            <option value="allowlist"${rules.accessMode === "allowlist" ? " selected" : ""}>Lista blanca del grupo</option>
          </select>
        </div>
        <div>
          <label for="group-allow-message">Mensaje de lista blanca</label>
          <input id="group-allow-message" name="allowlistMessage" maxlength="300" value="${esc(rules.allowlistMessage || "")}" placeholder="Este sitio no está permitido para tu grupo.">
        </div>
      </div>
      <div class="field-grid">
        <div>
          <label for="group-blocked">Sitios bloqueados del grupo</label>
          <textarea id="group-blocked" name="blockedSites" placeholder="ejemplo.com | No permitido">${esc(blockedText)}</textarea>
        </div>
        <div>
          <label for="group-allowed">Sitios permitidos (lista blanca)</label>
          <textarea id="group-allowed" name="allowedSites" placeholder="classroom.google.com&#10;wikipedia.org">${esc((rules.allowedSites || []).join("\n"))}</textarea>
        </div>
      </div>
      <label class="check"><input type="checkbox" name="scheduleEnabled"${schedule.enabled ? " checked" : ""}> Activar horario del grupo</label>
      <div class="days">${dayLabels
				.map(
					([value, label]) =>
						`<label class="day"><input type="checkbox" name="days" value="${value}"${schedule.days?.includes(value) ? " checked" : ""}> ${label}</label>`,
				)
				.join("")}</div>
      <div class="field-grid">
        <div><label for="group-start">Desde</label><input id="group-start" type="time" name="start" value="${esc(schedule.start)}"></div>
        <div><label for="group-end">Hasta</label><input id="group-end" type="time" name="end" value="${esc(schedule.end)}"></div>
      </div>
      <div class="field-grid">
        <div><label for="group-bandwidth">Ancho de banda (Kbps, 0 = heredar)</label><input id="group-bandwidth" name="bandwidthKbps" type="number" min="0" max="100000" step="250" value="${esc(rules.bandwidthKbps || 0)}"></div>
        <div><label for="group-streams">Streams (0 = heredar)</label><input id="group-streams" name="maxStreams" type="number" min="0" max="128" value="${esc(rules.maxStreams || 0)}"></div>
        <div><label for="group-connections">Conexiones Wisp (0 = heredar)</label><input id="group-connections" name="maxConnections" type="number" min="0" max="10" value="${esc(rules.maxConnections || 0)}"></div>
      </div>
      <p class="hint">Si activas la lista blanca sin añadir sitios, el grupo no podrá navegar. Los límites a 0 heredan el valor global.</p>
      <button class="primary" type="submit" style="margin-top:12px">Guardar reglas del grupo</button>
    </form>
  </details>`
			: '<p class="hint">Solo administradores y creador pueden editar las reglas de este grupo.</p>'
	}
  ${notice ? `<p class="msg ok" style="margin-top:12px">${esc(notice)}</p>` : ""}
  ${error ? `<p class="msg error" style="margin-top:12px">${esc(error)}</p>` : ""}
</div>

<div class="card">
  <h2>Miembros (${members.length})</h2>
  <form id="group-bulk" method="post" action="/api/admin/groups/${encodeURIComponent(group.id)}/bulk" onsubmit="return confirm('¿Aplicar esta acción a los usuarios seleccionados?')">
    <div class="filter" style="margin-bottom:12px">
      <select name="action" aria-label="Acción masiva">
        <option value="assign">Asignar a otro grupo</option>
        <option value="remove">Quitar del grupo</option>
        <option value="rules-on">Activar reglas del grupo</option>
        <option value="rules-off">Desactivar reglas del grupo</option>
        <option value="block">Bloquear</option>
        <option value="unblock">Desbloquear</option>
        <option value="kick">Echar / cerrar sesiones</option>
      </select>
      <select name="group" aria-label="Grupo de destino">
        ${groups.map((item) => `<option value="${esc(item.id)}"${item.id === group.id ? " selected" : ""}>${esc(item.name)}</option>`).join("")}
      </select>
      <button class="small danger" type="submit">Aplicar a seleccionados</button>
      <button class="small" type="button" onclick="document.querySelectorAll('[data-bulk]:not(:disabled)').forEach(c=>c.checked=true)">Seleccionar todos</button>
    </div>
  </form>
  ${
		members.length
			? `<div class="scroll"><table>
    <thead><tr><th></th><th>Usuario</th><th>Estado</th><th>Sesiones</th><th>Última web</th><th></th></tr></thead>
    <tbody>${memberRows}</tbody>
  </table></div>`
			: '<p class="empty">Este grupo no tiene miembros.</p>'
	}
</div>
<script>
(() => {
  if (location.hash === "#rules") document.querySelector("#rules details")?.setAttribute("open", "");
})();
</script>`;
	return shell(`Grupo ${group.name} · Administración`, body, {
		user, topbar: topbar(user),
		wide: true,
	});
}

export function groupOnboardingPage({
	user,
	groups = [],
	next = "/",
	error = "",
} = {}) {
	const choices = groups
		.map(
			(group) => `<label class="group-choice">
  <input type="radio" name="group" value="${esc(group.id)}" required>
  ${groupAvatar(group.name, "group-avatar group-choice-avatar")}
  <span><strong>${esc(group.name)}</strong><small>Grupo de clase</small></span>
</label>`,
		)
		.join("");
	const body = `<div class="card" style="max-width:720px;margin:0 auto">
  <div class="account-head">
    ${userAvatar(user.username, user.icon, "account-avatar", user.role)}
    <div>
      <h1>¿Cuál es tu grupo?</h1>
      <p class="muted">Hola, <strong>${esc(user.username)}</strong>. Elige tu clase y curso para que tu profesor pueda organizarte.</p>
    </div>
  </div>
  <p class="muted">Solo lo preguntamos la primera vez. Si no encuentras tu grupo, pide a un profesor que lo cree.</p>
  ${error ? `<p class="msg error">${esc(error)}</p>` : ""}
  <form method="post" action="/api/account/group">
    <input type="hidden" name="next" value="${esc(next)}">
    ${
			groups.length
				? `<div class="group-choice-grid">${choices}</div>
    <div class="actions">
      <button class="primary" type="submit">Guardar mi grupo</button>
      <button class="small" type="submit" name="action" value="skip" formnovalidate>Ahora no</button>
    </div>`
				: `<p class="warn">Todavía no hay grupos creados. Puedes continuar y un administrador te asignará uno más tarde.</p>
    <div class="actions">
      <button class="primary" type="submit" name="action" value="skip">Continuar</button>
    </div>`
		}
  </form>
  <p class="hint">Si te equivocas, un moderador o administrador puede cambiarte de grupo.</p>
</div>`;
	return shell("Elige tu grupo · Proxy Web", body, {
		user, topbar: topbar(user),
		chatFab: false,
	});
}

export function profilePage({
	user,
	target,
	groupName = "",
	online = false,
	isSelf = false,
} = {}) {
	const roles = Array.isArray(target.roles) && target.roles.length ? target.roles : [target.role];
	const roleNames = roles.map((role) => roleLabel(role)).join(" · ");
	const body = `<div class="card profile-card">
  <div class="profile-head">
    ${userAvatar(target.username, target.icon, "profile-avatar", target.role)}
    <div>
      <h1>${esc(target.username)}</h1>
      <p class="profile-subtitle">${isSelf ? "Tu perfil público" : "Perfil de usuario"}</p>
      <div class="profile-badges">${roleBadges(roles, target.role)}${groupName ? `<span class="badge group">${esc(groupName)}</span>` : ""}</div>
    </div>
  </div>
  <div class="profile-grid">
    <div class="profile-item"><span>Usuario</span><strong>${esc(target.username)}</strong></div>
    <div class="profile-item"><span>Roles</span><strong>${esc(roleNames)}</strong></div>
    <div class="profile-item"><span>Grupo</span><strong>${esc(groupName || "Sin grupo")}</strong></div>
    <div class="profile-item"><span>Estado</span><strong><span class="profile-presence${online ? "" : " offline"}">${online ? "En línea" : "Desconectado"}</span></strong></div>
    <div class="profile-item"><span>Miembro desde</span><strong>${esc(fmtDate(target.createdAt))}</strong></div>
  </div>
  <div class="profile-actions">
    ${isSelf ? '<a class="small primary-small" href="/account">Editar mi perfil</a>' : ""}
    <a class="small" href="/chat">Ir al chat</a>
    <a class="small" href="/">Volver al inicio</a>
  </div>
</div>`;
	return shell(`Perfil de ${target.username} · Proxy Web`, body, {
		user, topbar: topbar(user),
		chatFab: false,
	});
}

export function accountPage({
	user,
	sessions = [],
	currentId = "",
	allowPasswordChange = true,
	mfa = {},
	group = "",
	forced = false,
	notice = "",
	error = "",
} = {}) {
	const sessionItems = sessions
		.map((s) => {
			const current = s.id === currentId;
			return `<li>
  <div class="info">
    <span class="badge${current ? " current" : ""}">${current ? "esta sesión" : "sesión"}</span>
    <div class="meta">
      <span>${esc(s.ip || "IP desconocida")}</span>
      <span>${esc((s.userAgent || "navegador desconocido").slice(0, 80))}</span>
      <span>desde ${esc(fmtDate(s.createdAt))}</span>
      <span>último acceso ${esc(fmtDate(s.lastSeenAt))}</span>
    </div>
  </div>
  ${
		current
			? ""
			: `<form method="post" action="/api/account/sessions/${encodeURIComponent(s.id)}/revoke">
      <button class="small danger" type="submit">Cerrar</button>
    </form>`
	}
</li>`;
		})
		.join("");

	const body = `
${
	forced
		? '<p class="msg error" style="margin-top:0">Debes cambiar tu contraseña antes de seguir usando el proxy.</p>'
		: ""
}
<div class="card" style="max-width:620px;margin:0 auto">
  <div class="account-head">
    ${userAvatar(user.username, user.icon, "account-avatar", user.role)}
    <div>
      <h1>Mi cuenta</h1>
      <p class="muted">
        Usuario <strong>${esc(user.username)}</strong> ·
        ${roleLabel(user.role)}
        ${group ? `<span class="badge group">${esc(group)}</span>` : ""}
      </p>
    </div>
  </div>
  <p class="muted">
    <a href="/bookmarks">Favoritos</a> · <a href="/history">Historial</a> · <a href="/vault">Bóveda de contraseñas</a>${canCreateInvites(user) ? ' · <a href="/invites">Invitaciones</a>' : ""} · <a href="/u/${encodeURIComponent(user.username)}">Ver mi perfil</a>
  </p>
  ${
		allowPasswordChange || forced
			? `<h2>Cambiar contraseña</h2>
  <form method="post" action="/api/account/password">
    <label for="current">Contraseña actual</label>
    <input id="current" name="current" type="password" autocomplete="current-password" required>
    <div class="grid">
      <div>
        <label for="password">Nueva contraseña</label>
        <input id="password" name="password" type="password" autocomplete="new-password" minlength="8" required>
      </div>
      <div>
        <label for="confirm">Repetir nueva contraseña</label>
        <input id="confirm" name="confirm" type="password" autocomplete="new-password" minlength="8" required>
      </div>
    </div>
    <button class="primary" type="submit">Guardar nueva contraseña</button>
  </form>
  <p class="hint">Mínimo 8 caracteres. Al cambiarla se cierran las demás sesiones de tu usuario.</p>`
			: '<p class="warn">El administrador ha desactivado el cambio de contraseña.</p>'
	}
  <h2>Verificación en dos pasos (MFA)</h2>
  ${
		mfa.enabled
			? `<p class="msg ok">MFA activada. Códigos de recuperación disponibles: ${esc(mfa.recoveryRemaining ?? 0)}.</p>
  <div class="grid">
    <form method="post" action="/api/account/mfa/recovery">
      <label for="mfa-recovery-current">Contraseña actual</label>
      <input id="mfa-recovery-current" name="current" type="password" autocomplete="current-password" required>
      <label for="mfa-recovery-code">Código actual de 6 dígitos</label>
      <input id="mfa-recovery-code" name="code" inputmode="numeric" autocomplete="one-time-code" placeholder="123456" required>
      <button class="small" type="submit">Regenerar códigos de recuperación</button>
    </form>
    <form method="post" action="/api/account/mfa/disable" onsubmit="return confirm('¿Desactivar la verificación en dos pasos?')">
      <label for="mfa-off-current">Contraseña actual</label>
      <input id="mfa-off-current" name="current" type="password" autocomplete="current-password" required>
      <label for="mfa-off-code">Código actual de 6 dígitos</label>
      <input id="mfa-off-code" name="code" inputmode="numeric" autocomplete="one-time-code" placeholder="123456" required>
      <button class="small danger" type="submit">Desactivar MFA</button>
    </form>
  </div>`
			: `<p class="muted">Añade un segundo factor con una app de autenticación (Google Authenticator, Aegis, 1Password, etc.). No depende de ningún servicio externo.</p>
  <form method="post" action="/api/account/mfa/start">
    <button class="primary" type="submit">Activar MFA</button>
  </form>`
	}
  <p class="hint">El administrador puede ver las direcciones y búsquedas que realices con el proxy.</p>
  ${notice ? `<p class="msg ok">${esc(notice)}</p>` : ""}
  ${error ? `<p class="msg error">${esc(error)}</p>` : ""}
</div>

<div class="card" style="max-width:620px;margin:18px auto 0">
  <h2>Icono de perfil</h2>
  <div class="account-icon-row">
    ${userAvatar(user.username, user.icon, "account-avatar", user.role)}
    <div class="account-icon-actions">
      <button type="button" class="small primary-small" id="account-icon-pick">Subir icono</button>
      <input id="account-icon-file" type="file" accept="image/png,image/jpeg,image/webp" hidden>
      ${user.icon ? `<form method="post" action="/api/account/icon/delete"><button class="small danger" type="submit">Quitar icono</button></form>` : ""}
    </div>
  </div>
  <p class="hint" style="margin-top:10px">PNG, JPG o WebP · máximo 2 MB. Se mostrará en el chat, en tu cuenta y en la lista de usuarios.</p>
  <p class="msg" id="account-icon-msg" role="status"></p>
</div>
<script src="/account-icon.js" defer></script>

<div class="card" style="max-width:620px;margin:18px auto 0">
  <h2>Idioma</h2>
  <form method="post" action="/api/account/language" class="actions">
    <input type="hidden" name="next" value="/account">
    <select name="lang" style="width:auto" aria-label="Idioma">
      <option value=""${!user.lang ? " selected" : ""}>Por defecto</option>
      <option value="es"${user.lang === "es" ? " selected" : ""}>Español</option>
      <option value="en"${user.lang === "en" ? " selected" : ""}>English</option>
      <option value="ca"${user.lang === "ca" ? " selected" : ""}>Català</option>
    </select>
    <button class="small" type="submit">Guardar idioma</button>
  </form>
</div>

<div class="card" style="max-width:620px;margin:18px auto 0">
  <h2>Sesiones activas</h2>
  <p class="muted">Estos son los navegadores con sesión iniciada en tu cuenta.</p>
  <form method="post" action="/api/account/sessions/revoke-others" onsubmit="return confirm('¿Cerrar todas las demás sesiones?')" style="margin-bottom:12px">
    <button class="small" type="submit">Cerrar todas las demás</button>
  </form>
  <ul class="session-list">${sessionItems || '<li class="empty">No hay sesiones activas.</li>'}</ul>
</div>`;
	return shell("Mi cuenta · Proxy Web", body, { user, topbar: topbar(user) });
}

function fmtDate(at) {
	try {
		return new Date(at).toLocaleString("es-ES", {
			dateStyle: "short",
			timeStyle: "medium",
			timeZone: "Europe/Madrid",
		});
	} catch {
		return String(at || "");
	}
}

function fmtChatDate(at, timezone = "Europe/Madrid") {
	try {
		return new Date(at).toLocaleString("es-ES", {
			dateStyle: "short",
			timeStyle: "short",
			timeZone: timezone,
		});
	} catch {
		return String(at || "");
	}
}

export function bookmarksPage({ user, bookmarks = [], notice = "", error = "" } = {}) {
	const rows = bookmarks
		.map(
			(b) => `<div class="user">
  <div class="user-head">
    <strong>${esc(b.label)}</strong>
    <span class="meta">${esc(fmtDate(b.createdAt))}</span>
  </div>
  <form method="post" action="/api/bookmarks/${encodeURIComponent(b.id)}/update" class="actions" style="margin-bottom:8px">
    <input name="label" value="${esc(b.label)}" maxlength="60" aria-label="Nombre">
    <input name="url" value="${esc(b.url)}" aria-label="URL">
    <button class="small" type="submit">Guardar</button>
  </form>
  <div class="actions">
    <a class="small" href="/?goto=${encodeURIComponent(b.url)}">Abrir</a>
    <form method="post" action="/api/bookmarks/${encodeURIComponent(b.id)}/delete" onsubmit="return confirm('¿Eliminar este favorito?')">
      <button class="small danger" type="submit">Eliminar</button>
    </form>
  </div>
</div>`,
		)
		.join("");

	const body = `
<div class="card">
  <h1>Favoritos</h1>
  <p class="muted">Tus enlaces guardados. Aparecen también en la portada.</p>
  <form method="post" action="/api/bookmarks" class="grid">
    <div>
      <label for="bm-label">Nombre</label>
      <input id="bm-label" name="label" maxlength="60" placeholder="Mi favorito">
    </div>
    <div>
      <label for="bm-url">URL</label>
      <input id="bm-url" name="url" placeholder="https://ejemplo.com">
    </div>
    <button class="primary" type="submit" style="grid-column:1/-1">Añadir favorito</button>
  </form>
  ${notice ? `<p class="msg ok">${esc(notice)}</p>` : ""}
  ${error ? `<p class="msg error">${esc(error)}</p>` : ""}
</div>
<div class="card">
  <h2>Favoritos (${bookmarks.length})</h2>
  ${rows || '<p class="empty">Todavía no tienes favoritos.</p>'}
</div>`;
	return shell("Favoritos · Proxy Web", body, { user, topbar: topbar(user) });
}

export function historyPage({
	user,
	activity = [],
	total = 0,
	page = 1,
	pages = 1,
	search = "",
	type = "",
	fromDate = "",
	toDate = "",
	canClear = false,
	notice = "",
	error = "",
} = {}) {
	const params = new URLSearchParams();
	if (search) params.set("q", search);
	if (type) params.set("type", type);
	if (fromDate) params.set("from", fromDate);
	if (toDate) params.set("to", toDate);
	const filterQuery = params.toString();
	const pageQuery = filterQuery ? `&${filterQuery}` : "";
	const csvQuery = filterQuery ? `?${filterQuery}` : "";
	const returnParams = new URLSearchParams(params);
	if (page > 1) returnParams.set("page", String(page));
	const returnTo = `/history${returnParams.size ? `?${returnParams.toString()}` : ""}`;
	const items = activity
		.map((e) => {
			const remove =
				canClear && e.id
					? `<form method="post" action="/api/account/history/${encodeURIComponent(e.id)}/delete" class="entry-delete" onsubmit="return confirm('¿Borrar esta entrada del historial?')">
      <input type="hidden" name="next" value="${esc(returnTo)}">
      <button class="small danger" type="submit" title="Borrar esta entrada">Borrar</button>
    </form>`
					: "";
			return `<li>
  <span class="when">${esc(fmtDate(e.at))}</span>
  <span class="what">
    ${e.query ? `<span class="query">Búsqueda: ${esc(e.query)}</span>` : ""}
    ${e.url ? `<span class="url">${esc(e.url)}</span>` : ""}
  </span>
  ${remove}
</li>`;
		})
		.join("");
	const hasFilters = Boolean(search || type || fromDate || toDate);
	const body = `
<div class="card">
  <h1>Mi historial</h1>
  <p class="muted">Direcciones y búsquedas que has introducido. Total: ${esc(total)}.</p>
  <form method="get" action="/history" class="filter" style="flex-wrap:wrap">
    <input name="q" value="${esc(search)}" placeholder="Buscar en el historial" aria-label="Buscar">
    <label class="muted" for="history-from" style="font-size:12px">Desde</label>
    <input id="history-from" name="from" type="date" value="${esc(fromDate)}" aria-label="Desde">
    <label class="muted" for="history-to" style="font-size:12px">Hasta</label>
    <input id="history-to" name="to" type="date" value="${esc(toDate)}" aria-label="Hasta">
    <select name="type" aria-label="Tipo">
      <option value=""${type ? "" : " selected"}>Todo</option>
      <option value="url"${type === "url" ? " selected" : ""}>Solo webs</option>
      <option value="search"${type === "search" ? " selected" : ""}>Solo búsquedas</option>
    </select>
    <button class="small" type="submit">Filtrar</button>
    ${hasFilters ? '<a href="/history">Quitar filtros</a>' : ""}
  </form>
  <div class="filter" style="margin-bottom:16px">
    <a class="small" href="/history.csv${csvQuery}">Exportar CSV</a>
    ${canClear ? `<form method="post" action="/api/account/history/clear" onsubmit="return confirm('¿Vaciar todo tu historial?')" style="display:inline">
      <button class="small danger" type="submit">Vaciar historial</button>
    </form>` : ""}
  </div>
  ${
		canClear
			? `<details class="card" style="margin-bottom:16px;background:rgba(255,255,255,.015)">
    <summary class="muted" style="cursor:pointer">Borrar solo un rango de fechas</summary>
    <form method="post" action="/api/account/history/delete-range" class="filter" style="margin-top:12px;flex-wrap:wrap" onsubmit="return confirm('¿Borrar el historial de ese rango?')">
      <label class="muted" for="delete-from" style="font-size:12px">Desde</label>
      <input id="delete-from" name="from" type="date" value="${esc(fromDate)}" required>
      <label class="muted" for="delete-to" style="font-size:12px">Hasta</label>
      <input id="delete-to" name="to" type="date" value="${esc(toDate)}" required>
      <button class="small danger" type="submit">Borrar rango</button>
    </form>
  </details>`
			: ""
	}
  ${notice ? `<p class="msg ok">${esc(notice)}</p>` : ""}
  ${error ? `<p class="msg error">${esc(error)}</p>` : ""}
  ${items ? `<ul class="activity">${items}</ul>` : '<p class="empty">No hay resultados.</p>'}
  ${
		pages > 1
			? `<div class="filter" style="margin-top:16px">
    ${page > 1 ? `<a class="small" href="/history?page=${page - 1}${pageQuery}">Anterior</a>` : ""}
    <span class="muted">Página ${page} de ${pages}</span>
    ${page < pages ? `<a class="small" href="/history?page=${page + 1}${pageQuery}">Siguiente</a>` : ""}
  </div>`
			: ""
	}
</div>`;
	return shell("Historial · Proxy Web", body, { user, topbar: topbar(user) });
}

export function chatPage({
	user,
	settings,
	messages = [],
	pinned = [],
	readSeq = 0,
	readSeqs = {},
	hasMore = false,
	latestSeq = 0,
	revision = 0,
	online = 0,
	onlineUsers = [],
	channels = [],
	currentChannel = "general",
	users = [],
	friends = [],
	incomingRequests = [],
	outgoingRequests = [],
	requestableUsers = [],
	canModerate = false,
	canDelete = false,
	notice = "",
	error = "",
} = {}) {
	const current = String(user?.username || "");
	const enabled = !!settings.chatEnabled;
	const chatDisplayTitle =
		settings.chatTitle === "Chat de usuarios" ? "Chat" : settings.chatTitle || "Chat";
	const allowDelete = !!settings.chatAllowUserDelete;
	const userByName = new Map();
	for (const entry of users) {
		userByName.set(String(entry.username).toLowerCase(), entry);
	}
	if (user) userByName.set(String(user.username).toLowerCase(), user);
	const canAddAnyone = user?.role === "creator";
	const dmCandidates = canAddAnyone ? users : friends;
	const returnTo =
		currentChannel === "general"
			? "/chat"
			: `/chat?channel=${encodeURIComponent(currentChannel)}`;
	const entryFor = (name) =>
		userByName.get(String(name).toLowerCase()) || { username: name };
	const incomingEntries = incomingRequests.map(entryFor);
	const outgoingEntries = outgoingRequests.map(entryFor);
	const pendingCount = incomingEntries.length;
	const channelIcon = (channel) =>
		channel.type === "public"
			? "#"
			: channel.type === "class"
				? "C"
				: channel.type === "group"
					? "G"
					: channel.name.slice(0, 1).toUpperCase();
	const onlineSet = new Set(
		(Array.isArray(onlineUsers) ? onlineUsers : []).map((name) =>
			String(name).toLowerCase(),
		),
	);
	const channelPresence = (channel) => {
		if (!settings.chatShowOnline) return "";
		if (channel.type === "public") {
			return `${onlineSet.size} en línea`;
		}
		if (channel.type === "group" || channel.type === "class") {
			const count = (channel.members || []).filter((member) =>
				onlineSet.has(String(member).toLowerCase()),
			).length;
			return `${count} en línea`;
		}
		return onlineSet.has(String(channel.presenceName || channel.name).toLowerCase())
			? "en línea"
			: "desconectado";
	};
	const channelItems = channels
		.map(
			(channel) => `<button type="button" class="chat-channel-item${channel.id === currentChannel ? " active" : ""}" data-channel-id="${esc(channel.id)}">
  <span class="chat-channel-avatar">${esc(channelIcon(channel))}</span>
  <span class="chat-channel-text"><strong>${esc(channel.name)}</strong><small>${channel.type === "public" ? "Canal público" : channel.type === "class" ? "Grupo de clase" : channel.type === "group" ? "Grupo" : "Privado"}${channelPresence(channel) ? ` · <span class="chat-channel-presence">${esc(channelPresence(channel))}</span>` : ""}</small></span>
  ${channel.unread ? `<span class="chat-unread">${channel.unread > 99 ? "99+" : channel.unread}</span>` : ""}
</button>`,
		)
		.join("");
	const currentInfo = channels.find((channel) => channel.id === currentChannel) || channels[0] || { name: "General", type: "public" };
	const channelMeta =
		currentInfo.type === "public"
			? "Canal público"
			: currentInfo.type === "class"
				? `Grupo de clase · ${currentInfo.members?.length || 0} miembros`
				: currentInfo.type === "group"
					? `Grupo · ${currentInfo.members?.length || 0} miembros`
					: "Chat privado";
	const currentAliasTarget =
		currentInfo.type === "dm"
			? currentInfo.aliasTarget ||
				(currentInfo.members || []).find(
					(member) => String(member).toLowerCase() !== current.toLowerCase(),
				) ||
				""
			: "";
	const channelOptions = channels
		.map(
			(channel) =>
				`<option value="${esc(channel.id)}"${channel.id === currentChannel ? " selected" : ""}>${esc(channel.name)}${channel.unread ? ` (${channel.unread})` : ""}</option>`,
		)
		.join("");
	const dmResults = dmCandidates
		.map((entry) => `<button type="button" class="friend-result dm-result" data-dm-user="${esc(entry.username)}" data-dm-name="${esc(entry.username.toLowerCase())}">
      ${userAvatar(entry.username, entry.icon, "chat-member-avatar", entry.role)}
      <span class="friend-name">${esc(entry.username)}</span>
      <span class="badge">Privado</span>
    </button>`)
		.join("");
	const memberOptions = dmCandidates
		.map(
			(entry) => `<label class="chat-member-option" data-member-name="${esc(entry.username.toLowerCase())}">
      <input type="checkbox" name="members" value="${esc(entry.username)}">
      ${userAvatar(entry.username, entry.icon, "chat-member-avatar", entry.role)}
      <span>${esc(entry.username)}</span>
    </label>`,
		)
		.join("");
	const friendResults = requestableUsers
		.map((entry) => `<form method="post" action="/api/friends/request" class="friend-result" data-friend-name="${esc(entry.username.toLowerCase())}">
      <input type="hidden" name="username" value="${esc(entry.username)}">
      <input type="hidden" name="next" value="${esc(returnTo)}">
      ${userAvatar(entry.username, entry.icon, "chat-member-avatar", entry.role)}
      <span class="friend-name">${profileLink(entry.username)}</span>
      <button class="small primary-small" type="submit">Enviar solicitud</button>
    </form>`)
		.join("");
	const friendRows = friends
		.map((entry) => `<div class="friend-row">
      ${userAvatar(entry.username, entry.icon, "chat-member-avatar", entry.role)}
      <span class="friend-name">${profileLink(entry.username)}</span>
      <form method="post" action="/api/friends/remove"><input type="hidden" name="username" value="${esc(entry.username)}"><input type="hidden" name="next" value="${esc(returnTo)}"><button class="small danger" type="submit">Quitar</button></form>
    </div>`)
		.join("");
	const incomingRows = incomingEntries
		.map((entry) => `<div class="friend-row">
      ${userAvatar(entry.username, entry.icon, "chat-member-avatar", entry.role)}
      <span class="friend-name">${profileLink(entry.username)}</span>
      <div class="actions">
        <form method="post" action="/api/friends/accept"><input type="hidden" name="username" value="${esc(entry.username)}"><input type="hidden" name="next" value="${esc(returnTo)}"><button class="small primary-small" type="submit">Aceptar</button></form>
        <form method="post" action="/api/friends/reject"><input type="hidden" name="username" value="${esc(entry.username)}"><input type="hidden" name="next" value="${esc(returnTo)}"><button class="small danger" type="submit">Rechazar</button></form>
      </div>
    </div>`)
		.join("");
	const outgoingRows = outgoingEntries
		.map((entry) => `<div class="friend-row">
      ${userAvatar(entry.username, entry.icon, "chat-member-avatar", entry.role)}
      <span class="friend-name">${profileLink(entry.username)}</span>
      <span class="badge">pendiente</span>
      <form method="post" action="/api/friends/cancel"><input type="hidden" name="username" value="${esc(entry.username)}"><input type="hidden" name="next" value="${esc(returnTo)}"><button class="small" type="submit">Cancelar</button></form>
    </div>`)
		.join("");
	const reactionSet = ["👍", "❤️", "😂", "😮", "😢", "🔥"];
	const formatText = (text) =>
		esc(text).replace(
			/@([A-Za-z0-9._-]{3,32})/g,
			(_match, name) => `<span class="chat-mention">@${esc(name)}</span>`,
		);
	const roleBadge = (role, roles = []) => {
		const list = (Array.isArray(roles) && roles.length ? roles : [role]).filter(
			(value) => value && value !== "user",
		);
		return list
			.map((value) => `<span class="badge role-${esc(value)}">${esc(roleLabel(value))}</span>`)
			.join(" ");
	};
	const seenText = (seen) => {
		if (!seen) return "";
		if (seen.total === 1) return seen.all ? "Visto" : "No visto";
		return seen.count ? `Visto por ${seen.count}` : "No visto";
	};

	const rows = messages
		.map((m, index) => {
			const role = String(m.role || "user");
			const own = String(m.username).toLowerCase() === current.toLowerCase();
			const previous = messages[index - 1];
			const grouped =
				!!previous &&
				String(previous.username).toLowerCase() === String(m.username).toLowerCase() &&
				new Date(m.at).getTime() - new Date(previous.at).getTime() < 5 * 60 * 1000;
			const canDeleteMessage =
				enabled &&
				(canDelete || (!isStaffRole(user?.role) && allowDelete && own));
			const attachment = m.attachment
				? m.attachment.type?.startsWith("image/")
					? `<a class="chat-attachment" href="/api/chat/files/${esc(m.attachment.id)}" target="_blank" rel="noopener"><img src="/api/chat/files/${esc(m.attachment.id)}" alt="${esc(m.attachment.name)}" loading="lazy"></a>`
					: m.attachment.type?.startsWith("audio/")
						? audioPlayerMarkup(m.attachment)
						: `<a class="chat-attachment file" href="/api/chat/files/${esc(m.attachment.id)}" target="_blank" rel="noopener">${esc(m.attachment.name)} · ${esc(fmtBytes(m.attachment.size))}</a>`
				: "";
			const poll = m.poll
				? `<div class="chat-poll">${(m.poll.options || [])
						.map((option, index) => {
							const mine = option.votes?.some(
								(vote) => String(vote).toLowerCase() === current.toLowerCase(),
							);
							return `<button type="button" class="chat-poll-option${mine ? " mine" : ""}" data-chat-vote="${index}"><span>${esc(option.text)}</span><b>${option.votes?.length || 0}</b></button>`;
						})
						.join("")}</div>`
				: "";
			const reactions =
				Object.entries(m.reactions || {})
					.filter(([, votes]) => votes?.length)
					.map(
						([emoji, votes]) =>
							`<button type="button" class="chat-reaction${votes.some((v) => String(v).toLowerCase() === current.toLowerCase()) ? " mine" : ""}" data-chat-reaction="${esc(emoji)}">${esc(emoji)} ${votes.length}</button>`,
					)
					.join("");
			const picker = `<details class="chat-reaction-menu"><summary title="Reaccionar" aria-label="Reaccionar">${ICON.smile}</summary><div class="chat-reaction-picker">${reactionSet
				.map(
					(emoji) =>
						`<button type="button" data-chat-react="${esc(emoji)}" aria-label="Reaccionar con ${esc(emoji)}">${esc(emoji)}</button>`,
				)
				.join("")}</div></details>`;
			const replyQuote = m.replyTo
				? `<div class="chat-reply-quote"><strong>@${profileLink(m.replyTo.username, "profile-link", m.replyTo.displayName || m.replyTo.username)}</strong><span>${esc((m.replyTo.text || "").slice(0, 140) || attachmentLabel(m.replyTo.attachment))}</span></div>`
				: "";
			const edited = m.editedAt
				? `<span class="chat-edited" title="Editado ${esc(fmtDate(m.editedAt))}">editado</span>`
				: "";
			const seen = m.seen
				? `<span class="chat-seen${m.seen.all ? "" : " unseen"}">${esc(seenText(m.seen))}</span>`
				: "";
			const pinBadge = m.pinned ? `<span class="chat-pin-badge" title="Mensaje fijado">${ICON.pin}</span>` : "";
			const tools = `<div class="chat-msg-tools">
        <button type="button" class="chat-tool" data-chat-reply="${esc(m.id)}" title="Responder" aria-label="Responder">${ICON.reply}</button>
        ${m.canEdit ? `<button type="button" class="chat-tool" data-chat-edit="${esc(m.id)}" title="Editar" aria-label="Editar">${ICON.edit}</button>` : ""}
        ${m.canPin ? `<button type="button" class="chat-tool" data-chat-pin="${esc(m.id)}" data-pinned="${m.pinned ? "1" : "0"}" title="${m.pinned ? "Desfijar" : "Fijar"}" aria-label="${m.pinned ? "Desfijar" : "Fijar"}">${ICON.pin}</button>` : ""}
        ${canDeleteMessage ? `<button type="button" class="chat-tool danger" data-chat-delete="${esc(m.id)}" title="Eliminar" aria-label="Eliminar">${ICON.trash}</button>` : ""}
      </div>`;
			return `<article class="chat-message${own ? " own" : ""}${grouped ? " grouped" : ""}${m.pinned ? " pinned" : ""}" data-chat-message data-chat-id="${esc(m.id)}" data-chat-seq="${esc(m.seq)}">
  ${own ? "" : grouped ? '<span class="chat-msg-avatar-spacer"></span>' : userAvatar(m.displayName || m.username, m.icon, "chat-msg-avatar", m.role)}
  <div class="chat-bubble">
    ${replyQuote}
    <div class="chat-meta">
      ${own || grouped ? "" : `<a class="chat-author profile-link" href="/u/${encodeURIComponent(m.username)}">${esc(m.displayName || m.username)}</a>`}
      ${grouped ? "" : roleBadge(role, m.roles)}
      ${pinBadge}
      <time datetime="${esc(m.at)}">${esc(fmtChatDate(m.at, settings.timezone))}</time>
      ${edited}
      ${seen}
    </div>
    ${m.text ? `<p class="chat-text">${formatText(m.text)}</p>` : ""}
    ${attachment}
    ${poll}
    <div class="chat-reactions">${reactions}${picker}</div>
    ${tools}
  </div>
</article>`;
		})
		.join("");

	const pinnedHtml = pinned.length
		? pinned
				.slice(0, 3)
				.map(
					(message) =>
						`<button type="button" class="chat-pin-chip" data-chat-jump="${esc(message.id)}" title="${esc(message.text || "")}">${ICON.pin}<strong>${esc(message.displayName || message.username)}</strong><small>${esc((message.text || "").slice(0, 80) || attachmentLabel(message.attachment))}</small></button>`,
				)
				.join("")
		: "";
	const detailNames = (Array.isArray(currentInfo.members) && currentInfo.members.length
		? currentInfo.members
		: currentInfo.type === "public"
			? onlineUsers
			: [current]
	)
		.map((name) => String(name || ""))
		.filter(Boolean);
	const detailSeen = new Set();
	const detailMembersHtml = detailNames
		.filter((name) => {
			const key = name.toLowerCase();
			if (detailSeen.has(key)) return false;
			detailSeen.add(key);
			return true;
		})
		.map((name) => {
			const entry = entryFor(name);
			const online = onlineSet.has(String(name).toLowerCase());
			return `<div class="chat-member-row">${userAvatar(entry.username, entry.icon, "chat-member-avatar", entry.role)}<span>${esc(entry.username)}</span><span class="presence-dot${online ? " online" : ""}" title="${online ? "En línea" : "Desconectado"}"></span></div>`;
		})
		.join("");
	const detailPinsHtml = pinned.length
		? pinned
				.map(
					(message) =>
						`<button type="button" class="chat-detail-pin" data-chat-jump="${esc(message.id)}"><strong>${esc(message.displayName || message.username)}</strong><span>${esc((message.text || "").slice(0, 140) || attachmentLabel(message.attachment))}</span></button>`,
				)
				.join("")
		: '<p class="chat-detail-empty">No hay mensajes fijados en este canal.</p>';
	const body = enabled ? `
<div class="chat-app details-hidden" data-show-online="${settings.chatShowOnline ? "1" : "0"}">
  <button type="button" class="chat-backdrop" id="chat-backdrop" aria-label="Cerrar panel" tabindex="-1"></button>
  <aside class="chat-sidebar">
    <div class="chat-sidebar-head">
      <div class="chat-sidebar-brand"><span class="chat-sidebar-mark">${ICON.chat}</span><div><strong>${esc(chatDisplayTitle)}</strong><small>Canales y mensajes</small></div></div>
      <button type="button" class="chat-sidebar-close" id="chat-sidebar-close" aria-label="Cerrar canales">×</button>
    </div>
    <div class="chat-sidebar-label">Conversaciones</div>
    <div class="chat-channel-list" id="chat-channel-list">${channelItems}</div>
  </aside>
  <section class="chat-main">
    <header class="chat-header">
      <div class="chat-header-info">
        <span class="chat-channel-avatar large">${esc(channelIcon(currentInfo))}</span>
        <div>
          <h1 id="chat-channel-name">${esc(currentInfo.name)}</h1>
          <p><span id="chat-channel-meta">${esc(channelMeta)}</span></p>
        </div>
      </div>
      <select id="chat-mobile-channel" class="chat-mobile-channel" aria-label="Canal">${channelOptions}</select>
      <div class="chat-header-actions">
        <button class="chat-action chat-sidebar-open-btn" type="button" id="chat-sidebar-open" title="Canales" aria-label="Abrir canales">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg><span>Canales</span>
        </button>
        <button class="chat-action" type="button" id="chat-alias-open" title="Poner un apodo privado"${currentInfo.type === "dm" ? "" : " hidden"}>
          ${ICON.edit}<span>Apodo</span>
        </button>
        <button class="chat-action" type="button" id="chat-search-open" title="Buscar mensajes">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><span>Buscar</span>
        </button>
        <button class="chat-action" type="button" id="chat-friends" title="Amigos">
          ${ICON.users}<span>Amigos</span>${pendingCount ? `<b class="friend-badge">${pendingCount}</b>` : ""}
        </button>
        <details class="chat-new-menu">
          <summary class="chat-action chat-new-trigger" title="Crear">${ICON.plus}<span>Nuevo</span></summary>
          <div class="chat-new-list">
            <button type="button" id="chat-new-dm">${ICON.user}<span>Chat privado</span></button>
            <button type="button" id="chat-new-group">${ICON.users}<span>Grupo</span></button>
            <button type="button" id="chat-new-poll">${ICON.poll}<span>Encuesta</span></button>
          </div>
        </details>
        <button class="chat-action chat-details-open-btn" type="button" id="chat-details-open" title="Detalles del canal" aria-label="Abrir detalles del canal">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg><span>Detalles</span>
        </button>
        <a class="chat-action chat-exit" href="/" title="Salir del chat" aria-label="Salir del chat">×</a>
      </div>
    </header>
    ${notice ? `<p class="msg ok">${esc(notice)}</p>` : ""}
    ${error ? `<p class="msg error">${esc(error)}</p>` : ""}
    <p class="msg error" id="chat-error" hidden></p>
    <div class="chat-pinned-bar" id="chat-pinned-bar"${pinned.length ? "" : " hidden"}>
      <span class="chat-pinned-label">${ICON.pin}Fijados</span>
      <div class="chat-pinned-list" id="chat-pinned-list">${pinnedHtml}</div>
    </div>
    <button type="button" class="chat-load-older" id="chat-load-older"${hasMore ? "" : " hidden"}>Mensajes anteriores</button>
    <div class="chat-messages" id="chat-messages"
      data-channel="${esc(currentChannel)}"
      data-last-seq="${esc(latestSeq)}"
      data-read-seq="${esc(readSeq)}"
      data-read-seqs="${esc(JSON.stringify(readSeqs))}"
      data-has-more="${hasMore ? "1" : "0"}"
      data-revision="${esc(revision)}"
      data-current-user="${esc(current)}"
      data-max-length="${esc(settings.chatMaxLength)}"
      data-can-moderate="${canModerate ? "1" : "0"}"
      data-allow-delete="${allowDelete ? "1" : "0"}">
      ${rows || '<div class="chat-empty"><span class="chat-empty-icon">${ICON.chat}</span><strong>Todavía no hay mensajes</strong><span>Escribe el primero en este canal.</span></div>'}
    </div>
    <div class="chat-typing" id="chat-typing" hidden></div>
    <div class="chat-context-bar" id="chat-context" hidden>
      <span class="chat-context-label" id="chat-context-label"></span>
      <span class="chat-context-text" id="chat-context-text"></span>
      <button type="button" class="chat-context-cancel" id="chat-context-cancel" aria-label="Cancelar">×</button>
    </div>
    <div class="chat-upload-progress" id="chat-upload-progress" hidden><span id="chat-upload-bar"></span></div>
    <div class="chat-recorder" id="chat-recorder" hidden>
      <span class="chat-rec-dot"></span>
      <span class="chat-rec-time" id="chat-rec-time">0:00</span>
      <div class="chat-rec-wave" id="chat-rec-wave" aria-hidden="true"></div>
      <div class="chat-rec-preview" id="chat-rec-preview" hidden></div>
      <button type="button" class="chat-rec-btn" id="chat-rec-stop">Detener</button>
      <button type="button" class="chat-rec-btn primary" id="chat-rec-send" hidden>Enviar audio</button>
      <button type="button" class="chat-rec-btn danger" id="chat-rec-cancel">Descartar</button>
    </div>
    <form method="post" action="/api/chat/messages" class="chat-composer" id="chat-form" autocomplete="off">
      <input type="hidden" name="channel" id="chat-channel-hidden" value="${esc(currentChannel)}">
      <label class="chat-attach" for="chat-file" title="Adjuntar archivo" aria-label="Adjuntar archivo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
      </label>
      <input id="chat-file" type="file" accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain,audio/*" hidden>
      <button type="button" class="chat-mic" id="chat-mic" title="Grabar audio" aria-label="Grabar audio">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v1a7 7 0 0 0 14 0v-1"/><path d="M12 18v4"/><path d="M8 22h8"/></svg>
      </button>
      <div class="chat-compose-input">
        <textarea id="chat-input" name="text" maxlength="${esc(settings.chatMaxLength)}" rows="1" placeholder="Mensaje" aria-label="Mensaje"></textarea>
        <div class="chat-compose-meta"><span id="chat-file-name" class="muted"></span><span class="chat-counter"><span id="chat-counter">0</span>/${esc(settings.chatMaxLength)}</span></div>
      </div>
      <button class="chat-send" type="submit" id="chat-send" title="Enviar" aria-label="Enviar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
      </button>
    </form>
  </section>
  <aside class="chat-details" id="chat-details" aria-label="Detalles del canal">
    <div class="chat-details-head"><strong>Detalles</strong><button type="button" class="chat-details-close" id="chat-details-close" aria-label="Cerrar detalles">×</button></div>
    <div class="chat-details-tabs" role="tablist">
      <button type="button" class="chat-details-tab active" data-details-tab="members" role="tab" aria-selected="true">Miembros (${detailNames.length})</button>
      <button type="button" class="chat-details-tab" data-details-tab="pinned" role="tab" aria-selected="false">Fijados (${pinned.length})</button>
    </div>
    <div class="chat-details-panel active" data-details-panel="members">
      <p class="chat-detail-title">En este canal</p>
      ${detailMembersHtml || '<p class="chat-detail-empty">No hay miembros visibles.</p>'}
    </div>
    <div class="chat-details-panel" data-details-panel="pinned">
      <p class="chat-detail-title">Mensajes fijados</p>
      ${detailPinsHtml}
    </div>
  </aside>
</div>
<dialog id="chat-dm-dialog" class="chat-dialog">
  <form method="dialog">
    <button type="button" class="dialog-x" data-close-dialog aria-label="Cerrar">×</button>
    <h2>Nuevo chat privado</h2>
    <p class="muted">Solo vosotros podréis leer este canal. Solo aparecen tus amigos.</p>
    ${dmResults ? `<div class="friend-search-box">
      <input id="chat-dm-search" type="search" placeholder="Escribe el nombre de la persona…" autocomplete="off" aria-label="Buscar amigo">
      <p class="muted" id="chat-dm-hint">Escribe un nombre para buscar.</p>
      <div id="chat-dm-results" class="friend-results" hidden>${dmResults}</div>
      <p class="muted" id="chat-dm-empty" hidden>No hay amigos que coincidan.</p>
    </div>` : '<p class="muted">No tienes amigos todavía. Añádelos desde el botón Amigos.</p>'}
    <div class="dialog-actions">
      <button class="small" type="button" data-close-dialog>Cancelar</button>
    </div>
  </form>
</dialog>
<dialog id="chat-group-dialog" class="chat-dialog">
  <form method="dialog">
    <button type="button" class="dialog-x" data-close-dialog aria-label="Cerrar">×</button>
    <h2>Nuevo grupo</h2>
    <p class="muted">Elige un nombre y los miembros del grupo.</p>
    <label for="chat-group-name">Nombre</label>
    <input id="chat-group-name" maxlength="40" placeholder="Equipo, amigos…">
    <label for="chat-group-search">Miembros</label>
    <input id="chat-group-search" class="chat-member-search" type="search" placeholder="Buscar usuario…" autocomplete="off">
    <div id="chat-group-members" class="chat-member-picker">${memberOptions || '<span class="muted">Añade amigos para crear un grupo.</span>'}</div>
    <p class="muted" id="chat-group-empty" hidden style="padding:8px 4px">No hay usuarios que coincidan.</p>
    <div class="dialog-actions">
      <button class="small" type="button" data-close-dialog>Cancelar</button>
      <button class="small primary-small" type="button" id="chat-group-create">Crear grupo</button>
    </div>
  </form>
</dialog>
<dialog id="chat-poll-dialog" class="chat-dialog">
  <form method="dialog">
    <button type="button" class="dialog-x" data-close-dialog aria-label="Cerrar">×</button>
    <h2>Nueva encuesta</h2>
    <p class="muted">Añade una pregunta y entre 2 y 6 opciones.</p>
    <label for="chat-poll-question">Pregunta</label>
    <input id="chat-poll-question" maxlength="120" placeholder="¿Qué opción prefieres?">
    <label for="chat-poll-options">Opciones (una por línea)</label>
    <textarea id="chat-poll-options" rows="4" placeholder="Opción 1&#10;Opción 2"></textarea>
    <div class="dialog-actions">
      <button class="small" type="button" data-close-dialog>Cancelar</button>
      <button class="small primary-small" type="button" id="chat-poll-create">Crear encuesta</button>
    </div>
  </form>
</dialog>
<dialog id="chat-alias-dialog" class="chat-dialog">
  <form method="dialog">
    <button type="button" class="dialog-x" data-close-dialog aria-label="Cerrar">×</button>
    <h2>Apodo privado</h2>
    <p class="muted">Solo tú verás este nombre. No cambia el nombre real de la otra persona ni cómo te ve ella a ti.</p>
    <label for="chat-alias-input">Apodo para ${esc(currentAliasTarget || currentInfo.name)}</label>
    <input id="chat-alias-input" maxlength="32" value="${esc(currentInfo.alias || "")}" placeholder="Escribe un apodo…" autocomplete="off">
    <input type="hidden" id="chat-alias-target" value="${esc(currentAliasTarget)}">
    <div class="dialog-actions">
      <button class="small" type="button" id="chat-alias-clear">Quitar apodo</button>
      <button class="small primary-small" type="button" id="chat-alias-save">Guardar apodo</button>
    </div>
  </form>
</dialog>
<dialog id="chat-friends-dialog" class="chat-dialog friend-dialog">
  <button type="button" class="dialog-x" data-close-dialog aria-label="Cerrar">×</button>
    <h2>Amigos</h2>
    <p class="muted">Para hablar en privado o crear grupos primero debes ser amigo.</p>
    <h3>Solicitudes recibidas (${incomingEntries.length})</h3>
    <div class="friend-list">${incomingRows || '<p class="muted">No tienes solicitudes pendientes.</p>'}</div>
    <h3>Amigos (${friends.length})</h3>
    <div class="friend-list">${friendRows || '<p class="muted">Todavía no tienes amigos.</p>'}</div>
    <h3>Añadir amigo</h3>
    ${friendResults ? `<div class="friend-search-box">
      <input id="friend-search" type="search" placeholder="Escribe el nombre de la persona…" autocomplete="off" aria-label="Buscar persona">
      <p class="muted" id="friend-search-hint">Escribe un nombre para buscar.</p>
      <div id="friend-results" class="friend-results" hidden>${friendResults}</div>
      <p class="muted" id="friend-search-empty" hidden>No hay usuarios que coincidan.</p>
    </div>` : '<p class="muted">No hay usuarios disponibles para enviar solicitud.</p>'}
    <h3>Solicitudes enviadas (${outgoingEntries.length})</h3>
    <div class="friend-list">${outgoingRows || '<p class="muted">No tienes solicitudes enviadas.</p>'}</div>
</dialog>
<dialog id="chat-search-dialog" class="chat-dialog chat-search-dialog">
  <form method="dialog">
    <button type="button" class="dialog-x" data-close-dialog aria-label="Cerrar">×</button>
    <h2>Buscar mensajes</h2>
    <p class="muted">Busca en todos tus canales o solo en el actual.</p>
    <div class="chat-search-row">
      <input id="chat-search-input" type="search" placeholder="Texto o usuario…" autocomplete="off" aria-label="Buscar mensajes">
      <label class="check"><input type="checkbox" id="chat-search-current"> Solo este canal</label>
    </div>
    <div id="chat-search-results" class="chat-search-results"></div>
  </form>
</dialog>
<script src="${asset("chat.js")}" defer></script>` : `
<div class="card">
  <div class="chat-disabled">
    <p class="muted">El chat está desactivado por la administración.</p>
    ${["admin", "creator"].includes(user?.role) ? '<a class="small" href="/admin/settings">Activar en Ajustes</a>' : '<a class="small" href="/">Volver al proxy</a>'}
  </div>
</div>`;
	return shell(`${chatDisplayTitle} · Proxy Web`, body, {
		user, topbar: topbar(user),
		chatFab: false,
		wide: true,
		full: true,
		head: `<link rel="stylesheet" href="${asset("css/chat.css")}">`,
	});
}

export function statsPage({
	user,
	topHosts = [],
	byUser = [],
	failed = [],
	categories = {},
} = {}) {
	const hostRows = topHosts
		.map(([host, count]) => `<tr><td class="mono">${esc(host)}</td><td>${count}</td></tr>`)
		.join("");
	const userRows = byUser
		.map(([name, count]) => `<tr><td>${esc(name)}</td><td>${count}</td></tr>`)
		.join("");
	const failRows = failed
		.map(([name, count]) => `<tr><td>${esc(name)}</td><td>${count}</td></tr>`)
		.join("");
	const categoryRows = Object.entries(categories)
		.map(
			([name, info]) =>
				`<tr><td>${esc(name)}</td><td>${info.count || 0}</td><td class="mono">${esc(info.updatedAt ? fmtDate(info.updatedAt) : "sin datos")}</td></tr>`,
		)
		.join("");
	return shell(
		"Estadísticas · Administración",
		`${adminTabs("stats", user.role)}
<div class="card">
  <h1>Estadísticas</h1>
  <p class="muted">Resumen simple basado en actividad y auditoría.</p>
  <div class="grid">
    <div>
      <h2>Dominios más visitados</h2>
      ${hostRows ? `<table><tbody>${hostRows}</tbody></table>` : '<p class="empty">Sin datos.</p>'}
    </div>
    <div>
      <h2>Actividad por usuario</h2>
      ${userRows ? `<table><tbody>${userRows}</tbody></table>` : '<p class="empty">Sin datos.</p>'}
    </div>
  </div>
  <div class="grid" style="margin-top:20px">
    <div>
      <h2>Logins fallidos/bloqueados</h2>
      ${failRows ? `<table><tbody>${failRows}</tbody></table>` : '<p class="empty">Sin datos.</p>'}
    </div>
    <div>
      <h2>Categorías</h2>
      <table><tbody>${categoryRows}</tbody></table>
    </div>
  </div>
</div>`,
		{ user, topbar: topbar(user) },
	);
}

export function requestsPage({
	user,
	requests = [],
	status = "pending",
	canManage = false,
} = {}) {
	const rows = requests
		.map(
			(r) => `<tr>
  <td><strong>${esc(r.username)}</strong></td>
  <td class="mono">${esc(r.host)}</td>
  <td>${esc(r.reason || "—")}</td>
  <td class="mono">${esc(fmtDate(r.createdAt))}</td>
  <td><span class="badge${r.status === "pending" ? " blocked" : ""}">${esc(r.status)}</span></td>
  <td>${
		r.status === "pending" && canManage
			? `<div class="actions">
      <form method="post" action="/api/admin/requests/${encodeURIComponent(r.id)}/approve"><button class="small" type="submit">Aprobar</button></form>
      <form method="post" action="/api/admin/requests/${encodeURIComponent(r.id)}/deny"><button class="small danger" type="submit">Denegar</button></form>
    </div>`
			: ""
	}</td>
</tr>`,
		)
		.join("");
	return shell(
		"Solicitudes · Administración",
		`${adminTabs("requests", user.role)}
<div class="card">
  <h1>Solicitudes de desbloqueo</h1>
  <p class="muted">Peticiones de usuarios para acceder a dominios bloqueados. Al aprobar se crea una excepción solo para ese usuario.</p>
  <div class="filter">
    <a class="small${status === "pending" ? " active" : ""}" href="/admin/requests?status=pending">Pendientes</a>
    <a class="small" href="/admin/requests?status=approved">Aprobadas</a>
    <a class="small" href="/admin/requests?status=denied">Denegadas</a>
  </div>
  ${
		rows
			? `<div class="scroll"><table>
    <thead><tr><th>Usuario</th><th>Dominio</th><th>Motivo</th><th>Fecha</th><th>Estado</th><th></th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`
			: '<p class="empty">No hay solicitudes.</p>'
	}
</div>`,
		{ user, topbar: topbar(user) },
	);
}

export function adminPage({
	user,
	users,
	counts = {},
	canManage = false,
	blockTemplates = [],
	groups = [],
	notice = "",
	error = "",
} = {}) {
	const groupMap = new Map(groups.map((group) => [group.id, group]));
	const groupCounts = new Map();
	for (const entry of users) {
		if (entry.group && groupMap.has(entry.group)) {
			groupCounts.set(entry.group, (groupCounts.get(entry.group) || 0) + 1);
		}
	}
	const groupBadge = (id) => {
		const group = groupMap.get(String(id || ""));
		return group ? `<span class="badge group">${esc(group.name)}</span>` : "";
	};
	const groupOptions = (selected) =>
		`<option value="">Sin grupo</option>${groups
			.map(
				(group) =>
					`<option value="${esc(group.id)}"${selected === group.id ? " selected" : ""}>${esc(group.name)}</option>`,
			)
			.join("")}`;
	const assignableRoles = ["user", "moderator", "designer", "pentester", "qa", "admin"].filter(
		(role) => canAssignRole(user.role, role),
	);
	const dayLabels = [
		[0, "D"],
		[1, "L"],
		[2, "M"],
		[3, "X"],
		[4, "J"],
		[5, "V"],
		[6, "S"],
	];
	const cards = users
		.map((u) => {
			const self = u.username.toLowerCase() === user.username.toLowerCase();
			const visits = counts[u.username] || 0;
			const tempBlocked = !!u.blockedUntil;
			const manageable = u.role !== "creator" && canManageRole(user.role, u.role);
			if (u.role === "creator" || !manageable) {
				const isCreator = u.role === "creator";
				const wrapper = `user admin-user${isCreator ? " protected-user" : " readonly-user"}${self ? " self-user" : ""}`;
				const reason = isCreator
					? "Cuenta protegida · solo el creador puede usar su cuenta"
					: self
						? "Tu cuenta se gestiona desde Mi cuenta"
						: u.role === "admin"
							? "Solo el creador puede gestionar administradores"
							: "Sin permisos para gestionar esta cuenta";
				const creatorGroupForm =
					isCreator && self
						? `<div class="user-body" style="padding-top:14px">
  <form method="post" action="/api/admin/users/${encodeURIComponent(u.username)}/group" class="user-group-form" style="margin-bottom:0">
    <label for="group-${esc(u.username)}">Grupo de clase</label>
    <select id="group-${esc(u.username)}" name="group">${groupOptions(u.group)}</select>
    <input type="hidden" name="groupRulesPresent" value="1">
    <label class="check" style="margin:0"><input type="checkbox" name="groupRules" value="1"${u.groupRules === false ? "" : " checked"}> Aplicar reglas del grupo</label>
    <button class="small" type="submit">Guardar grupo</button>
  </form>
</div>`
						: "";
				const summaryMain = `<span class="user-summary-main">
      ${userAvatar(u.username, u.icon, "user-avatar", u.role)}
      <strong class="user-name">${profileLink(u.username)}</strong>
      ${roleBadges(u.roles, u.role)}
      ${groupBadge(u.group)}
      ${u.group && u.groupRules === false ? '<span class="badge">reglas de grupo off</span>' : ""}
      ${self ? '<span class="badge">tú</span>' : ""}
    </span>`;
				const summaryMeta = `<span class="user-summary-meta">${self ? '<a class="small" href="/account">Mi cuenta</a>' : ""}${esc(reason)}</span>`;
				if (creatorGroupForm) {
					return `<details class="${wrapper} creator-summary">
  <summary class="user-summary">
    ${summaryMain}
    ${summaryMeta}
    <span class="user-chevron" aria-hidden="true">▾</span>
  </summary>
  ${creatorGroupForm}
</details>`;
				}
				return `<div class="${wrapper}">
  <div class="user-summary">
    ${summaryMain}
    ${summaryMeta}
  </div>
</div>`;
			}
			const schedule = u.schedule || { enabled: false, days: [1, 2, 3, 4, 5], start: "08:00", end: "20:00" };
			const dayChecks = dayLabels
				.map(
					([value, label]) =>
						`<label class="day"><input type="checkbox" name="days" value="${value}"${
							schedule.days?.includes(value) ? " checked" : ""
						}> ${label}</label>`,
				)
				.join("");
			const currentRoles = Array.isArray(u.roles) && u.roles.length ? u.roles : [u.role];
			const roleForm = `<form method="post" action="/api/admin/users/${encodeURIComponent(u.username)}/role" class="role-form">
        <fieldset class="role-picker">
          <legend>Roles de ${esc(u.username)}</legend>
          ${assignableRoles.map((role) => roleOption(role, currentRoles.includes(role))).join("")}
        </fieldset>
        <p class="hint">Moderador y administrador sustituyen al rol de usuario y son excluyentes entre sí.</p>
        <button class="small" type="submit">Guardar roles</button>
      </form>`;
			const blockForm = `<form method="post" action="/api/admin/users/${encodeURIComponent(u.username)}/block">
        <input type="hidden" name="blocked" value="${u.blocked ? "0" : "1"}">
        ${
					u.blocked
						? ""
						: `<input name="message" value="${esc(u.blockMessage || "")}" placeholder="Mensaje al bloquear (opcional)" aria-label="Mensaje de bloqueo">`
				}
        <button class="small${u.blocked ? "" : " danger"}" type="submit"${
					self ? " disabled title='No puedes bloquear tu propia cuenta'" : ""
				}>${u.blocked ? "Quitar bloqueo" : "Bloquear"}</button>
      </form>`;
			const tempForm = `<form method="post" action="/api/admin/users/${encodeURIComponent(u.username)}/block-until">
        <input type="datetime-local" name="until" value="${esc(toLocalInput(u.blockedUntil))}" required aria-label="Bloquear hasta">
        <input name="message" value="${esc(u.blockMessage || "")}" placeholder="Mensaje (opcional)" aria-label="Mensaje de bloqueo temporal">
        <button class="small" type="submit"${self ? " disabled" : ""}>Bloquear hasta</button>
      </form>${
				tempBlocked
					? `<form method="post" action="/api/admin/users/${encodeURIComponent(u.username)}/block-until">
        <input type="hidden" name="until" value="">
        <button class="small" type="submit">Quitar temporal</button>
      </form>`
					: ""
			}`;
			const deleteForm = `<form method="post" action="/api/admin/users/${encodeURIComponent(u.username)}/delete"
        onsubmit="return confirm('¿Eliminar el usuario ${esc(u.username)}?')">
        <button class="small danger" type="submit"${
					self ? " disabled title='No puedes eliminarte a ti mismo'" : ""
				}>Eliminar</button>
      </form>`;
			const mustChangeForm = `<form method="post" action="/api/admin/users/${encodeURIComponent(u.username)}/must-change">
        <input type="hidden" name="value" value="${u.mustChangePassword ? "0" : "1"}">
        <button class="small" type="submit">${u.mustChangePassword ? "Quitar cambio obligatorio" : "Exigir cambio de contraseña"}</button>
      </form>`;
			const details = canManage
				? `<div class="user-extra">
    <div class="actions">
      <form method="post" action="/api/admin/users/${encodeURIComponent(u.username)}/password">
        <input name="password" type="password" placeholder="Nueva contraseña" minlength="8" required aria-label="Nueva contraseña de ${esc(u.username)}">
        <button class="small" type="submit">Cambiar contraseña</button>
      </form>
      ${roleForm}
      ${mustChangeForm}
      ${u.mfaEnabled ? `<form method="post" action="/api/admin/users/${encodeURIComponent(u.username)}/mfa-reset" onsubmit="return confirm('¿Resetear la MFA de este usuario?')"><button class="small danger" type="submit">Resetear MFA</button></form>` : ""}
      ${tempForm}
      ${deleteForm}
    </div>
    <form method="post" action="/api/admin/users/${encodeURIComponent(u.username)}/block-message" style="margin-top:12px">
      <label for="blockmsg-${esc(u.username)}">Mensaje de bloqueo</label>
      ${blockTemplates.length ? `<select aria-label="Plantilla de bloqueo" onchange="document.getElementById('blockmsg-${esc(u.username)}').value=this.value;this.selectedIndex=0">
        <option value="">Usar plantilla…</option>
        ${blockTemplates.map((template) => `<option value="${esc(template.text)}">${esc(template.label)}</option>`).join("")}
      </select>` : ""}
      <textarea id="blockmsg-${esc(u.username)}" name="message" maxlength="500" placeholder="Se mostrará al usuario cuando intente entrar bloqueado">${esc(u.blockMessage || "")}</textarea>
      <div class="actions" style="margin-top:8px">
        <button class="small" type="submit">Guardar mensaje</button>
        <a class="small" href="/admin/templates">Gestionar plantillas</a>
      </div>
    </form>
    <form method="post" action="/api/admin/users/${encodeURIComponent(u.username)}/sites" style="margin-top:12px">
      <label for="sites-${esc(u.username)}">Sitios prohibidos de este usuario</label>
      <textarea id="sites-${esc(u.username)}" name="sites" placeholder="ejemplo.com | No permitido&#10;otro-sitio.org">${esc(
					(u.blockedSites || [])
						.map((h) =>
							u.siteMessages?.[h] ? `${h} | ${u.siteMessages[h]}` : h,
						)
						.join("\n"),
				)}</textarea>
      <button class="small" type="submit" style="margin-top:8px">Guardar sitios</button>
    </form>
    <form method="post" action="/api/admin/users/${encodeURIComponent(u.username)}/schedule" style="margin-top:12px">
      <label class="check"><input type="checkbox" name="enabled" value="1"${schedule.enabled ? " checked" : ""}> Activar horario de acceso</label>
      <div class="days">${dayChecks}</div>
      <div class="field-grid">
        <div><label for="start-${esc(u.username)}">Desde</label><input id="start-${esc(u.username)}" type="time" name="start" value="${esc(schedule.start)}" required></div>
        <div><label for="end-${esc(u.username)}">Hasta</label><input id="end-${esc(u.username)}" type="time" name="end" value="${esc(schedule.end)}" required></div>
      </div>
      <button class="small" type="submit" style="margin-top:8px">Guardar horario</button>
    </form>
    <form method="post" action="/api/admin/users/${encodeURIComponent(u.username)}/notes" style="margin-top:12px">
      <label for="notes-${esc(u.username)}">Notas internas</label>
      <textarea id="notes-${esc(u.username)}" name="notes" maxlength="500" placeholder="Solo visibles para administradores">${esc(u.notes || "")}</textarea>
      <button class="small" type="submit" style="margin-top:8px">Guardar notas</button>
    </form>
  </div>`
				: "";
			return `<details class="user admin-user">
  <summary class="user-summary">
    <span class="user-summary-main">
      ${userAvatar(u.username, u.icon, "user-avatar", u.role)}
      <strong class="user-name">${profileLink(u.username)}</strong>
      ${roleBadges(u.roles, u.role)}
      ${groupBadge(u.group)}
      ${u.group && u.groupRules === false ? '<span class="badge">reglas de grupo off</span>' : ""}
      ${u.blocked ? '<span class="badge blocked">bloqueado</span>' : ""}
      ${tempBlocked ? `<span class="badge blocked">hasta ${esc(fmtDate(u.blockedUntil))}</span>` : ""}
      ${u.mustChangePassword ? '<span class="badge">cambio obligatorio</span>' : ""}
      ${self ? '<span class="badge">tú</span>' : ""}
    </span>
    <span class="user-summary-meta">
      <span><b>${visits}</b> visitas</span>
      <span><b>${u.sessionCount || 0}</b> sesiones</span>
      <span><b>${u.loginCount || 0}</b> logins</span>
      <span>${u.lastSeenAt ? `visto ${esc(fmtDate(u.lastSeenAt))}` : "sin actividad"}</span>
    </span>
    <span class="user-chevron" aria-hidden="true">▾</span>
  </summary>
  <div class="user-body">
  <div class="user-stats">
    <span>creado ${esc((u.createdAt || "").slice(0, 10))}</span>
    <span>último login ${esc(u.lastLoginAt ? fmtDate(u.lastLoginAt) : "nunca")}</span>
    <span>última actividad ${esc(u.lastSeenAt ? fmtDate(u.lastSeenAt) : "—")}</span>
  </div>
  <form method="post" action="/api/admin/users/${encodeURIComponent(u.username)}/group" class="user-group-form">
    <label for="group-${esc(u.username)}">Grupo de ${esc(u.username)}</label>
    <select id="group-${esc(u.username)}" name="group">${groupOptions(u.group)}</select>
    <input type="hidden" name="groupRulesPresent" value="1">
    <label class="check" style="margin:0"><input type="checkbox" name="groupRules" value="1"${u.groupRules === false ? "" : " checked"}> Aplicar reglas del grupo</label>
    <button class="small" type="submit">Guardar grupo</button>
  </form>
  <div class="actions">
    <a class="small" href="/admin/activity?user=${encodeURIComponent(u.username)}">Ver actividad</a>
    <a class="small" href="/admin/sessions?user=${encodeURIComponent(u.username)}">Ver sesiones</a>
    <form method="post" action="/api/admin/users/${encodeURIComponent(u.username)}/logout" onsubmit="return confirm('¿Echar a ${esc(u.username)} ahora? Se cerrarán todas sus sesiones y pestañas inmediatamente.')">
      <button class="small danger" type="submit"${
				self
					? " disabled title='Usa Salir para cerrar tu propia sesión'"
					: u.sessionCount
						? " title='Cierra sus sesiones y pestañas al instante'"
						: " disabled title='Sin sesiones activas'"
			}>Echar ahora</button>
    </form>
    ${blockForm}
  </div>
  ${details}
  </div>
</details>`;
		})
		.join("\n");

	const visibleUsers =
		user.role === "creator" ? users : users.filter((entry) => entry.role !== "creator");
	const visibleGroupIds = new Set(groups.map((group) => group.id));
	const rolesOf = (member) =>
		Array.isArray(member.roles) && member.roles.length ? member.roles : [member.role];
	const roleMembers = (role) => {
		const names = visibleUsers
			.filter((member) => rolesOf(member).includes(role))
			.map((member) => member.username);
		return `<span class="role-members${names.length ? "" : " empty"}">${
			names.length ? names.map((name) => profileLink(name)).join(" · ") : "Sin usuarios"
		}</span>`;
	};

	const body = `
${adminTabs("users", user.role)}
<div class="card" style="margin-bottom:22px">
  <h2>Escala de privilegios</h2>
  <ol class="role-scale">
    <li class="role-user"><strong>Usuario</strong><span>Navegación, chat, favoritos, historial propio y cuenta.</span>${roleMembers("user")}</li>
    <li class="role-designer"><strong>Diseñador gráfico</strong><span>Herramientas de diseño, sistema visual, revisión de interfaz e informes de problemas visuales.</span>${roleMembers("designer")}</li>
    <li class="role-pentester"><strong>Pentester</strong><span>Checklist de seguridad, resumen de exposición e informes de vulnerabilidades. Sin acceso a datos de administración.</span>${roleMembers("pentester")}</li>
    <li class="role-qa"><strong>QA / bugs</strong><span>Casos de prueba, entorno del navegador e informes de fallos con pasos para reproducirlos.</span>${roleMembers("qa")}</li>
    <li class="role-moderator"><strong>Moderador</strong><span>Consulta usuarios, actividad, sesiones, auditoría y solicitudes; puede bloquear o cerrar sesión solo a usuarios.</span>${roleMembers("moderator")}</li>
    <li class="role-admin"><strong>Administrador</strong><span>Gestiona usuarios y moderadores, ajustes, seguridad y copias; no puede gestionar a otros administradores ni al creador.</span>${roleMembers("admin")}</li>
    <li class="role-creator"><strong>Creador</strong><span>Acceso total y cuenta protegida. <b>Único</b> que puede crear, ascender, degradar, resetear o eliminar administradores.</span>${roleMembers("creator")}</li>
  </ol>
  <p class="hint">Tu rol actual: <strong>${esc(roleLabel(user.role))}</strong>.</p>
</div>
<div class="card" style="margin-bottom:22px">
  <h2>Grupos (${groups.length})</h2>
  <p class="muted">Organiza a los usuarios por clase o equipo. Los moderadores pueden asignar usuarios a grupos existentes; solo administradores y creador pueden crear o eliminar grupos.</p>
  ${
		canManage
			? `<form method="post" action="/api/admin/groups" class="actions" style="margin-bottom:4px">
    <input name="name" maxlength="40" placeholder="Nombre del grupo (ej. 1A)" aria-label="Nombre del grupo" required>
    <button class="small primary-small" type="submit">Crear grupo</button>
  </form>`
			: '<p class="hint">Solo administradores y el creador pueden crear grupos.</p>'
	}
  ${
		groups.length
			? `<div class="groups-grid">${groups
					.map(
						(group) => `<div class="group-card">
      ${groupAvatar(group.name)}
      <strong>${esc(group.name)}</strong>
      <small>${groupCounts.get(group.id) || 0} usuario${groupCounts.get(group.id) === 1 ? "" : "s"}</small>
      <div class="group-card-actions">
        <a class="small" href="/admin/groups/${encodeURIComponent(group.id)}">Abrir panel</a>
        ${canManage ? `<a class="small" href="/admin/groups/${encodeURIComponent(group.id)}#rules">Reglas</a>` : ""}
        ${
				canManage
					? `<form method="post" action="/api/admin/groups/${encodeURIComponent(group.id)}/delete" onsubmit="return confirm('¿Eliminar el grupo ${esc(group.name)}? Sus usuarios quedarán sin grupo.')">
        <button class="small danger" type="submit">Eliminar</button>
      </form>`
					: ""
			}
      </div>
    </div>`,
					)
					.join("")}</div>`
			: '<p class="empty">Todavía no hay grupos.</p>'
	}
</div>
<div class="card">
  <h1>Usuarios</h1>
  <p class="muted">
    ${canManage ? "Gestiona usuarios, contraseñas, roles, bloqueos, sitios y horarios." : "Puedes consultar usuarios, actividad y sesiones, y bloquear cuentas."}
    <a href="/admin/activity">Ver toda la actividad</a>.
    ${canManage ? '<a href="/admin/users.csv">Exportar usuarios CSV</a>.' : ""}
  </p>
  ${
		canManage
			? `<h2>Crear usuario</h2>
  <form method="post" action="/api/admin/users">
    <div class="grid">
      <div>
        <label for="new-user">Usuario</label>
        <input id="new-user" name="username" pattern="[A-Za-z0-9._-]{3,32}" title="3-32 caracteres: letras, números, punto, guion o guion bajo" required>
      </div>
      <div>
        <label for="new-pass">Contraseña</label>
        <div class="pw-row">
          <input id="new-pass" name="password" type="password" minlength="8" required>
          <button class="small" type="button" onclick="genPass()">Generar</button>
        </div>
      </div>
    </div>
    <fieldset class="role-picker">
      <legend>Roles (puedes elegir varios)</legend>
      ${assignableRoles.map((role) => roleOption(role, role === "user")).join("")}
    </fieldset>
        <p class="hint">Moderador y administrador sustituyen al rol de usuario y son excluyentes entre sí.</p>
    <button class="primary" type="submit">Crear usuario</button>
  </form>
  <p class="hint">Las contraseñas se guardan con hash scrypt: no se pueden ver, solo cambiar.</p>
  <details class="card" style="margin-top:16px;background:rgba(255,255,255,.015)">
    <summary class="muted" style="cursor:pointer">Importar usuarios desde CSV</summary>
    <p class="hint">Columnas: usuario, roles, contraseña. Los roles se separan con <code>|</code> (ej.: user|designer|pentester). Son opcionales; si faltan, se usa usuario y se genera una contraseña temporal.</p>
    <input id="users-import-file" type="file" accept=".csv,text/csv">
    <button id="users-import-run" class="small" type="button" style="margin-top:10px">Importar CSV</button>
    <pre id="users-import-result" class="panel" style="display:none;white-space:pre-wrap;margin-top:12px"></pre>
    <script src="/admin-users-import.js" defer></script>
  </details>`
			: ""
	}
  ${notice ? `<p class="msg ok">${esc(notice)}</p>` : ""}
  ${error ? `<p class="msg error">${esc(error)}</p>` : ""}
</div>

<div class="card">
  <h2>Usuarios (${users.length})</h2>
  <p class="muted">Tarjetas de usuario. Pulsa una para desplegar toda su información y sus acciones.</p>
  <div class="users-grid">${cards}</div>
</div>
<script>
function genPass() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*-_";
  const values = new Uint32Array(16);
  crypto.getRandomValues(values);
  const input = document.getElementById("new-pass");
  if (!input) return;
  input.value = [...values].map((n) => chars[n % chars.length]).join("");
  input.type = "text";
  input.focus();
  input.select();
}
</script>
<script src="/role-picker.js" defer></script>`;
	return shell("Usuarios · Administración", body, { user, topbar: topbar(user), wide: true });
}

export function activityPage({
	user,
	users,
	counts = {},
	activity = [],
	filter = "",
	notice = "",
	retention = 500,
	activityEnabled = true,
	canManage = false,
	error = "",
} = {}) {
	const options = users
		.map(
			(u) =>
				`<option value="${esc(u.username)}"${filter.toLowerCase() === u.username.toLowerCase() ? " selected" : ""}>${esc(
					u.username,
				)}${u.blocked ? " (bloqueado)" : ""} · ${counts[u.username] || 0}</option>`,
		)
		.join("");

	const items = activity
		.map((e) => {
			const remove =
				canManage && e.id
					? `<form method="post" action="/api/admin/activity/${encodeURIComponent(e.id)}/delete" class="entry-delete" onsubmit="return confirm('¿Borrar esta entrada de la actividad?')">
      <input type="hidden" name="user" value="${esc(filter)}">
      <button class="small danger" type="submit" title="Borrar esta entrada">Borrar</button>
    </form>`
					: "";
			return `<li>
  <span class="when">${esc(fmtDate(e.at))}</span>
  ${filter ? "" : `<span class="who">${esc(e.username)}</span>`}
  <span class="what">
    ${e.query ? `<span class="query">Búsqueda: ${esc(e.query)}</span>` : ""}
    ${e.url ? `<span class="url">${esc(e.url)}</span>` : ""}
  </span>
  ${remove}
</li>`;
		})
		.join("\n");

	const body = `
${adminTabs("activity", user.role)}
<div class="card">
  <h1>Actividad</h1>
  <p class="muted">
    Direcciones y búsquedas introducidas por cada usuario. Se guardan las últimas
    ${esc(retention)} por usuario. Las redirecciones internas de las webs no se registran.
  </p>
  ${!activityEnabled ? '<p class="warn">El registro de actividad está desactivado en Ajustes.</p>' : ""}
  <form method="get" action="/admin/activity" class="filter">
    <select name="user" aria-label="Filtrar por usuario">
      <option value="">Todos los usuarios</option>
      ${options}
    </select>
    <button class="small" type="submit">Filtrar</button>
    <a href="/admin/activity">Quitar filtro</a>
    ${canManage ? `<a class="small" href="/admin/activity.csv${filter ? `?user=${encodeURIComponent(filter)}` : ""}" style="margin-left:auto">Exportar CSV</a>` : ""}
  </form>
  ${canManage ? `<form method="post" action="/api/admin/activity/clear" class="filter"
    onsubmit="return confirm('¿Vaciar ${filter ? `el historial de ${esc(filter)}` : "todo el historial"}?')">
    <input type="hidden" name="user" value="${esc(filter)}">
    <button class="small danger" type="submit">Vaciar ${filter ? `historial de ${esc(filter)}` : "todo el historial"}</button>
  </form>` : ""}
  ${notice ? `<p class="msg ok">${esc(notice)}</p>` : ""}
  ${error ? `<p class="msg error">${esc(error)}</p>` : ""}
  ${
		items
			? `<ul class="activity">${items}</ul>`
			: '<p class="empty">Todavía no hay actividad registrada.</p>'
	}
</div>`;
	return shell("Actividad · Administración", body, { user, topbar: topbar(user) });
}

export function sessionsPage({
	user,
	users = [],
	sessions = [],
	filter = "",
	currentId = "",
	notice = "",
	error = "",
} = {}) {
	const options = users
		.map(
			(u) =>
				`<option value="${esc(u.username)}"${filter.toLowerCase() === u.username.toLowerCase() ? " selected" : ""}>${esc(u.username)}</option>`,
		)
		.join("");
	const rows = sessions
		.map(
			(s) => `<tr>
  <td><strong>${esc(s.username)}</strong>${s.id === currentId ? ' <span class="badge current">actual</span>' : ""}</td>
  <td class="mono">${esc(s.ip || "—")}</td>
  <td>${esc((s.userAgent || "—").slice(0, 70))}</td>
  <td class="mono">${esc(fmtDate(s.createdAt))}</td>
  <td class="mono">${esc(fmtDate(s.lastSeenAt))}</td>
  <td>${
		s.id === currentId
			? ""
			: `<form method="post" action="/api/admin/sessions/${encodeURIComponent(s.id)}/revoke">
      <button class="small danger" type="submit">Cerrar</button>
    </form>`
	}</td>
</tr>`,
		)
		.join("");

	const body = `
${adminTabs("sessions", user.role)}
<div class="card">
  <h1>Sesiones activas</h1>
  <p class="muted">Sesiones iniciadas ahora mismo. Se pierden al reiniciar el servicio.</p>
  <form method="get" action="/admin/sessions" class="filter">
    <select name="user" aria-label="Filtrar por usuario">
      <option value="">Todos los usuarios</option>
      ${options}
    </select>
    <button class="small" type="submit">Filtrar</button>
    <a href="/admin/sessions">Quitar filtro</a>
  </form>
  ${notice ? `<p class="msg ok">${esc(notice)}</p>` : ""}
  ${error ? `<p class="msg error">${esc(error)}</p>` : ""}
  ${
		rows
			? `<div class="scroll"><table>
    <thead><tr><th>Usuario</th><th>IP</th><th>Navegador</th><th>Creada</th><th>Último acceso</th><th></th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`
			: '<p class="empty">No hay sesiones activas.</p>'
	}
</div>`;
	return shell("Sesiones · Administración", body, { user, topbar: topbar(user) });
}

export function securityPage({
	user,
	alerts = [],
	bans = [],
	summary = {},
	currentIp = "",
	currentDevice = "",
	quarantineAttempts = [],
	includeDismissed = false,
	notice = "",
	error = "",
} = {}) {
	const alertRows = alerts
		.map((a) => {
			const reasons = (a.reasons || [])
				.map((reason) => `<span class="badge">${esc(reason)}</span>`)
				.join(" ");
			const attack = (a.reasons || []).some((reason) =>
				/^(Ruta de escaneo|Inyección|XSS|Path traversal|Exploit|Byte nulo|Destino local)/.test(
					String(reason),
				),
			);
			const kind =
				a.kind === "bot"
					? "bot"
					: a.kind === "hack"
						? "hacking"
						: attack
							? "hacking"
							: a.bot
								? "bot"
								: "alerta";
			const badge = `<span class="badge ${kind === "bot" ? "bot" : "blocked"}">${kind}</span>`;
			const botExtra = a.bot && kind === "hacking" ? ' <span class="badge bot">bot</span>' : "";
			return `<tr>
  <td>${badge}${botExtra}<br><span class="mono">${esc(fmtDate(a.lastSeen))}</span></td>
  <td><strong class="mono">${esc(a.ip)}</strong>${a.banned ? '<br><span class="badge blocked">bloqueado</span>' : ""}<br><span class="muted">${esc(a.username || "sin sesión")}</span>${a.device ? `<br><span class="mono" title="ID de dispositivo">${esc(a.device.slice(0, 10))}…</span>` : ""}</td>
  <td><strong>${esc(a.score)}</strong><br><span class="muted">${esc(a.count)} eventos</span></td>
  <td>${reasons || "—"}</td>
  <td class="mono">${esc(a.lastMethod || "")} ${esc(a.lastPath || "")}<br><span class="muted">${esc(a.userAgent || "sin user-agent")}</span></td>
  <td><div class="actions">
    <a class="small" href="/admin/security/alerts/${encodeURIComponent(a.id)}">Ver movimientos${Array.isArray(a.events) && a.events.length ? ` (${a.events.length})` : ""}</a>
    ${
			a.status === "open"
				? `<form method="post" action="/api/admin/security/dismiss">
      <input type="hidden" name="id" value="${esc(a.id)}">
      <button class="small" type="submit">Descartar</button>
    </form>`
				: '<span class="muted">descartada</span>'
		}
    ${(() => {
			const currentBans = a.bans || [];
			const has = (type) => currentBans.some((b) => b.type === type);
			const kindValue = kind === "bot" ? "bot" : "hack";
			const forms = [];
			if (a.device && !has("device")) {
				forms.push(`<form method="post" action="/api/admin/security/ban" onsubmit="return confirm('¿Bloquear este dispositivo/navegador? Solo se bloqueará este navegador, no toda la IP.')">
          <input type="hidden" name="type" value="device">
          <input type="hidden" name="target" value="${esc(a.device)}">
          <input type="hidden" name="alert" value="${esc(a.id)}">
          <input type="hidden" name="kind" value="${kindValue}">
          <button class="small danger" type="submit"${a.device === currentDevice ? " disabled" : ""}>Banear dispositivo</button>
        </form>`);
			}
			if (a.username && !has("user")) {
				forms.push(`<form method="post" action="/api/admin/security/ban" onsubmit="return confirm('¿Bloquear esta cuenta? Se cerrarán sus sesiones y no podrá iniciar sesión hasta desbanearla.')">
          <input type="hidden" name="type" value="user">
          <input type="hidden" name="target" value="${esc(a.username)}">
          <input type="hidden" name="alert" value="${esc(a.id)}">
          <input type="hidden" name="kind" value="user">
          <button class="small danger" type="submit">Banear usuario</button>
        </form>`);
			}
			if (!has("ip")) {
				forms.push(`<form method="post" action="/api/admin/security/ban" onsubmit="return confirm('¿Banear la IP completa? Afectará a todos los dispositivos de esa conexión, incluida tu casa si comparten IP.')">
          <input type="hidden" name="type" value="ip">
          <input type="hidden" name="target" value="${esc(a.ip)}">
          <input type="hidden" name="alert" value="${esc(a.id)}">
          <input type="hidden" name="kind" value="${kindValue}">
          <button class="small danger" type="submit"${a.ip === currentIp ? " disabled" : ""}>Banear IP</button>
        </form>`);
			}
			for (const ban of currentBans) {
				forms.push(`<form method="post" action="/api/admin/security/unban">
          <input type="hidden" name="key" value="${esc(ban.key)}">
          <button class="small" type="submit">Desbanear ${ban.type === "device" ? "dispositivo" : ban.type === "user" ? "usuario" : "IP"}</button>
        </form>`);
			}
			return forms.join("");
		})()}
  </div></td>
</tr>`;
		})
		.join("");
	const banRows = bans
		.map(
			(b) => `<tr>
  <td class="mono">${esc(b.value || b.key)}</td>
  <td><span class="badge ${b.type === "device" ? "admin" : "blocked"}">${b.type === "device" ? "dispositivo" : b.type === "user" ? "usuario" : "IP"}</span></td>
  <td><span class="badge ${b.kind === "bot" ? "bot" : "blocked"}">${b.kind === "bot" ? "bot" : b.kind === "hack" ? "hacking" : "manual"}</span></td>
  <td>${esc(b.by || "—")}</td>
  <td>${esc(b.reason || "—")}</td>
  <td class="mono">${esc(fmtDate(b.at))}</td>
  <td><form method="post" action="/api/admin/security/unban" onsubmit="return confirm('¿Quitar este bloqueo?')">
    <input type="hidden" name="key" value="${esc(b.key)}">
    <button class="small" type="submit">Desbanear</button>
  </form></td>
</tr>`,
		)
		.join("");
	const quarantineRows = quarantineAttempts
		.map(
			(e) => `<tr><td class="mono">${esc(fmtDate(e.at))}</td><td><strong>${esc(e.actor)}</strong></td><td class="mono">${esc(e.target || "—")}</td><td>${esc(e.detail || "")}</td><td class="mono">${esc(e.ip || "—")}</td><td>${esc((e.userAgent || "").slice(0, 50))}</td></tr>`,
		)
		.join("");
	const body = `
${adminTabs("security", user.role)}
<div class="stats">
  <div class="stat"><div class="k">Alertas abiertas</div><div class="v">${esc(summary.open || 0)}</div></div>
  <div class="stat"><div class="k">Bots detectados</div><div class="v">${esc(summary.bots || 0)}</div></div>
  <div class="stat"><div class="k">Bloqueos activos</div><div class="v">${esc(summary.banned || 0)}</div></div>
  <div class="stat"><div class="k">Últimas 24 h</div><div class="v">${esc(summary.last24h || 0)}</div></div>
</div>
<div class="card">
  <h1>Escáner de seguridad</h1>
  <p class="muted">
    El escáner observa peticiones y comportamiento: rutas de escaneo, intentos de inyección, accesos no autorizados,
    enumeración de API, ráfagas, intervalos automatizados y user-agents de bot. No bloquea automáticamente.
    Puedes bloquear un <strong>dispositivo/navegador</strong>, una <strong>cuenta</strong> o una <strong>IP completa</strong>;
    la IP afecta a todos los dispositivos de esa conexión.
  </p>
  <div class="filter">
    <a class="small${includeDismissed ? "" : " active"}" href="/admin/security">Abiertas</a>
    <a class="small${includeDismissed ? " active" : ""}" href="/admin/security?all=1">Todas</a>
  </div>
  ${notice ? `<p class="msg ok">${esc(notice)}</p>` : ""}
  ${error ? `<p class="msg error">${esc(error)}</p>` : ""}
  ${
		alertRows
			? `<div class="scroll"><table>
    <thead><tr><th>Detección</th><th>IP / usuario</th><th>Puntuación</th><th>Motivos</th><th>Última petición</th><th>Acciones</th></tr></thead>
    <tbody>${alertRows}</tbody>
  </table></div>`
			: '<p class="empty">No hay alertas de seguridad.</p>'
	}
</div>
<div class="card">
  <h2>Bloqueos activos (${bans.length})</h2>
  ${banRows ? `<div class="scroll"><table><thead><tr><th>Objetivo</th><th>Tipo</th><th>Categoría</th><th>Por</th><th>Motivo</th><th>Fecha</th><th></th></tr></thead><tbody>${banRows}</tbody></table></div>` : '<p class="empty">No hay bloqueos activos.</p>'}
</div>
<div class="card">
  <h2>Intentos durante la cuarentena</h2>
  <p class="muted">Peticiones rechazadas mientras la cuarentena estaba activa. Se muestran las últimas 20 y se limpian automáticamente tras 10 minutos desde la primera vista.</p>
  ${quarantineRows ? `<div class="scroll"><table><thead><tr><th>Fecha</th><th>Usuario</th><th>Destino</th><th>Detalle</th><th>IP</th><th>Navegador</th></tr></thead><tbody>${quarantineRows}</tbody></table></div>` : '<p class="empty">No hay intentos registrados.</p>'}
</div>`;
	return shell("Seguridad · Administración", body, { user, topbar: topbar(user) });
}

export function securityAlertPage({ user, alert } = {}) {
	const events = Array.isArray(alert?.events) ? [...alert.events].reverse() : [];
	const reasons = Array.isArray(alert?.reasons) ? alert.reasons : [];
	const kind = alert?.kind === "bot" || alert?.bot
		? "bot"
		: alert?.kind === "hack"
			? "hacking"
			: "alerta";
	const reasonCounts = new Map();
	for (const event of events) {
		for (const reason of event.reasons || []) {
			reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
		}
	}
	const reasonSummary = [...reasonCounts.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, 12)
		.map(([reason, count]) => `<span class="badge">${esc(reason)} · ${count}</span>`)
		.join(" ");
	const rows = events
		.map(
			(event) => `<tr>
  <td class="mono">${esc(fmtDate(event.at))}</td>
  <td><span class="badge status-${Math.floor((Number(event.status) || 0) / 100)}xx">${esc(event.status)}</span></td>
  <td class="mono"><strong>${esc(event.method || "")}</strong> ${esc(event.path || "")}</td>
  <td><strong>${esc(event.totalScore || event.requestScore || 0)}</strong></td>
  <td>${(event.reasons || []).map((reason) => `<span class="badge">${esc(reason)}</span>`).join(" ") || "—"}</td>
  <td class="mono">${esc(event.userAgent || "sin user-agent")}${event.device ? `<br><span class="muted">${esc(event.device.slice(0, 12))}…</span>` : ""}${event.username ? `<br><span class="muted">${esc(event.username)}</span>` : ""}</td>
</tr>`,
		)
		.join("");
	const body = `
${adminTabs("security", user.role)}
<div class="card">
  <div class="actions" style="justify-content:space-between;align-items:flex-start">
    <div>
      <h1>Movimientos de la alerta</h1>
      <p class="muted">${esc(alert?.ip || "IP desconocida")} · ${esc(alert?.username || "sin sesión")} · ${esc(alert?.firstSeen ? fmtDate(alert.firstSeen) : "—")} → ${esc(alert?.lastSeen ? fmtDate(alert.lastSeen) : "—")}</p>
    </div>
    <a class="small" href="/admin/security">Volver al escáner</a>
  </div>
  <div class="filter" style="margin-top:12px"><span class="badge ${kind === "bot" ? "bot" : "blocked"}">${kind}</span><span class="badge">${esc(alert?.score || 0)} puntos</span><span class="badge">${events.length} movimientos</span>${alert?.status === "open" ? '<span class="badge blocked">abierta</span>' : '<span class="badge">descartada</span>'}</div>
  ${reasonSummary ? `<p class="muted" style="margin-top:12px">Motivos más repetidos:</p><div class="actions">${reasonSummary}</div>` : ""}
  ${alert?.status === "open" ? `<form method="post" action="/api/admin/security/dismiss" style="margin-top:14px"><input type="hidden" name="id" value="${esc(alert.id)}"><button class="small" type="submit">Descartar alerta</button></form>` : ""}
</div>
<div class="card">
  <h2>Peticiones registradas (${events.length})</h2>
  ${rows ? `<div class="scroll"><table><thead><tr><th>Hora</th><th>Estado</th><th>Petición</th><th>Riesgo</th><th>Motivos</th><th>Navegador / dispositivo</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="empty">Todavía no hay movimientos detallados para esta alerta.</p>'}
  ${reasons.length ? `<p class="hint">Motivos agregados: ${reasons.map((reason) => `<span class="badge">${esc(reason)}</span>`).join(" ")}</p>` : ""}
</div>`;
	return shell("Movimientos · Seguridad", body, { user, topbar: topbar(user), wide: true });
}

export function trafficPage({
	user,
	snapshot = {},
	sessions = 0,
	security = {},
} = {}) {
	const http = snapshot.http || {};
	const wisp = snapshot.wisp || {};
	const recent = http.recent || [];
	const hostRows = (wisp.hosts || []).slice(0, 15).map((h) => `<tr>
  <td class="mono">${esc(h.host)}</td><td>${esc(h.active)}</td><td>${esc(h.opened)}</td>
  <td>${esc(fmtBytes(h.bytesOut || 0))}</td><td>${esc((h.users || []).slice(0, 3).join(", ") || "—")}</td>
</tr>`).join("");
	const requestRows = recent.slice(0, 20).map((r) => `<tr>
  <td class="mono">${esc((r.at || "").slice(11, 19))}</td>
  <td><span class="badge status-${Math.floor((r.status || 0) / 100)}xx">${esc(r.status)}</span></td>
  <td class="mono">${esc(r.method)} ${esc(r.path)}</td>
  <td>${esc(r.ms)} ms</td>
  <td>${esc(r.user || r.ip || "—")}</td>
</tr>`).join("");
	const streamRows = (wisp.streams || []).slice(0, 20).map((stream) => `<tr>
  <td class="mono">${esc(stream.host)}:${esc(stream.port)}</td>
  <td>${esc(stream.type)}</td><td>${esc(stream.username || "—")}</td>
  <td>${esc(fmtBytes((stream.bytesIn || 0) + (stream.bytesOut || 0)))}</td>
</tr>`).join("");
	const body = `
${adminTabs("traffic", user.role)}
<div class="traffic-head">
  <div><h1>Tráfico en tiempo real</h1><p class="muted">Peticiones HTTP, actividad Wisp, destinos y usuarios conectados.</p></div>
  <span class="traffic-live" id="traffic-live"><i></i> En directo</span>
</div>
<div class="stats">
  <div class="stat"><div class="k">Peticiones por segundo</div><div class="v" id="traffic-rps">${esc(http.requestsPerSecond || 0)}</div></div>
  <div class="stat"><div class="k">Último minuto</div><div class="v" id="traffic-minute">${esc(http.lastMinute || 0)}</div></div>
  <div class="stat"><div class="k">Usuarios activos</div><div class="v" id="traffic-users">${esc(http.activeUsers || 0)}</div></div>
  <div class="stat"><div class="k">Sesiones</div><div class="v" id="traffic-sessions">${esc(sessions || 0)}</div></div>
  <div class="stat"><div class="k">Streams Wisp</div><div class="v" id="traffic-streams-count">${esc(wisp.activeStreams || 0)}</div></div>
  <div class="stat"><div class="k">Tráfico Wisp</div><div class="v" id="traffic-bytes">${esc(fmtBytes((wisp.bytesIn || 0) + (wisp.bytesOut || 0)))}</div></div>
  <div class="stat"><div class="k">Alertas seguridad</div><div class="v" id="traffic-alerts">${esc(security.open || 0)}</div></div>
</div>
<div class="grid traffic-visuals">
  <div class="card">
    <h2>Actividad HTTP</h2>
    <div class="traffic-sparkline" id="traffic-sparkline" aria-label="Actividad de peticiones"></div>
    <div class="traffic-legend"><span><i class="dot-ok"></i>Peticiones por segundo</span><span id="traffic-spark-max">máx. —</span></div>
  </div>
  <div class="card">
    <h2>Estados HTTP</h2>
    <div class="traffic-bars" id="traffic-status-bars">${["2xx", "3xx", "4xx", "5xx"].map((code) => {
			const count = http.statusCounts?.[code] || 0;
			const total = Object.values(http.statusCounts || {}).reduce((sum, n) => sum + n, 0) || 1;
			return `<div class="traffic-bar-row"><span>${code}</span><div class="traffic-bar"><i class="bar-${code}" style="width:${Math.round((count / total) * 100)}%"></i></div><b>${count}</b></div>`;
		}).join("")}</div>
    <h2 style="margin-top:20px">Rutas más usadas</h2>
    <div class="traffic-bars" id="traffic-top-paths">${(http.topPaths || []).slice(0, 6).map((item) => {
			const max = http.topPaths?.[0]?.count || 1;
			return `<div class="traffic-bar-row"><span class="mono">${esc(item.path)}</span><div class="traffic-bar"><i class="bar-path" style="width:${Math.round((item.count / max) * 100)}%"></i></div><b>${item.count}</b></div>`;
		}).join("") || '<p class="empty">Sin datos todavía.</p>'}</div>
  </div>
</div>
<div class="grid">
  <div class="card">
    <h2>Peticiones HTTP recientes <small>últimas 20</small></h2>
    <div class="scroll"><table><thead><tr><th>Hora</th><th>Estado</th><th>Ruta</th><th>Duración</th><th>Usuario / IP</th></tr></thead><tbody id="traffic-requests">${requestRows || '<tr><td colspan="5" class="empty">Esperando tráfico…</td></tr>'}</tbody></table></div>
  </div>
  <div class="card">
    <h2>Destinos Wisp</h2>
    <div class="scroll"><table><thead><tr><th>Destino</th><th>Activos</th><th>Abiertos</th><th>Descarga</th><th>Usuarios</th></tr></thead><tbody id="traffic-hosts">${hostRows || '<tr><td colspan="5" class="empty">Sin conexiones Wisp.</td></tr>'}</tbody></table></div>
  </div>
</div>
<div class="card">
  <h2>Streams activos</h2>
  <div class="scroll"><table><thead><tr><th>Destino</th><th>Tipo</th><th>Usuario</th><th>Tráfico</th></tr></thead><tbody id="traffic-active-streams">${streamRows || '<tr><td colspan="4" class="empty">Sin streams activos.</td></tr>'}</tbody></table></div>
  <p class="hint" id="traffic-updated">Actualizado: ${esc(fmtDate(snapshot.generatedAt || new Date().toISOString()))}</p>
</div>
<script src="/traffic.js" defer></script>`;
	return shell("Tráfico · Administración", body, { user, topbar: topbar(user) });
}

export function overviewPage({ user, data = {} } = {}) {
	const stats = data.stats || {};
	const actions = data.actions || [];
	const recent = data.recent || [];
	const status = data.status || {};
	const statCards = [
		["Usuarios", stats.users, "/admin"],
		["En línea", stats.online, "/admin/monitor"],
		["Sesiones", stats.sessions, "/admin/sessions"],
		["Alertas abiertas", stats.alerts, "/admin/security"],
		["Solicitudes", stats.requests, "/admin/requests?status=pending"],
		["Copias", stats.backups, "/admin/system"],
		["Informes", stats.reports, "/admin/reports"],
		["Peticiones/min", stats.requestsPerMinute, "/admin/traffic"],
		["Streams Wisp", stats.streams, "/admin/traffic"],
	]
		.filter(([, value]) => value !== undefined)
		.map(
			([label, value, href]) => `<a class="overview-stat" href="${href}"><span>${esc(label)}</span><strong>${esc(value ?? 0)}</strong></a>`,
		)
		.join("");
	const actionCards = actions
		.map(
			(action) => `<a class="overview-action${action.danger ? " danger" : ""}" href="${esc(action.href)}"><span><strong>${esc(action.label)}</strong><small>${esc(action.detail || "")}</small></span></a>`,
		)
		.join("");
	const controlCards = `
<form method="post" action="/api/admin/maintenance" class="overview-action-form">
  <input type="hidden" name="enabled" value="${status.maintenance ? "0" : "1"}">
  <input type="hidden" name="next" value="/admin/overview">
  <button class="overview-action${status.maintenance ? " danger" : ""}" type="submit"><span><strong>${status.maintenance ? "Desactivar mantenimiento" : "Activar mantenimiento"}</strong><small>${status.maintenance ? "Los usuarios ya pueden entrar" : "Solo administradores podrán entrar"}</small></span></button>
</form>
<form method="post" action="/api/admin/quarantine" class="overview-action-form">
  <input type="hidden" name="enabled" value="${status.quarantine ? "0" : "1"}">
  <input type="hidden" name="next" value="/admin/overview">
  <button class="overview-action${status.quarantine ? " danger" : ""}" type="submit"><span><strong>${status.quarantine ? "Desactivar cuarentena" : "Activar cuarentena"}</strong><small>${status.quarantine ? "Volver a permitir conexiones" : "Cortar conexiones y bloquear webs"}</small></span></button>
</form>`;
	const recentRows = recent
		.map(
			(event) => `<tr><td class="mono">${esc(fmtDate(event.at))}</td><td><strong>${esc(event.actor || "sistema")}</strong></td><td>${esc(event.action || "")}</td><td>${esc(event.target || "—")}</td></tr>`,
		)
		.join("");
	const statusBadges = [
		[status.maintenance ? "Mantenimiento activo" : "Sin mantenimiento", status.maintenance ? "blocked" : ""],
		[status.quarantine ? "Cuarentena activa" : "Sin cuarentena", status.quarantine ? "blocked" : ""],
		[status.chat ? "Chat activo" : "Chat desactivado", status.chat ? "" : "blocked"],
		[status.accessMode === "allowlist" ? "Lista blanca" : "Lista negra", ""],
	]
		.map(([label, tone]) => `<span class="badge ${tone}">${esc(label)}</span>`)
		.join(" ");
	const body = `
${adminTabs("overview", user.role)}
<div class="overview-hero">
  <div>
    <span class="overview-kicker">Panel de control</span>
    <h1>Resumen</h1>
    <p class="muted">Estado rápido del proxy, usuarios y seguridad.</p>
    <div class="settings-status">${statusBadges}</div>
  </div>
  <span class="traffic-live"><i></i> ${data.online ? "En directo" : "Sistema activo"}</span>
</div>
<div class="overview-stats">${statCards}</div>
<div class="grid overview-lower">
  <div class="card">
    <div class="section-title-row"><h2>Acciones rápidas</h2></div>
    <div class="overview-actions">${actionCards}${controlCards}</div>
  </div>
  <div class="card">
    <div class="section-title-row"><h2>Últimos movimientos</h2><a class="small" href="/admin/audit">Ver auditoría</a></div>
    ${recentRows ? `<div class="scroll"><table><thead><tr><th>Hora</th><th>Actor</th><th>Acción</th><th>Objetivo</th></tr></thead><tbody>${recentRows}</tbody></table></div>` : '<p class="empty">Sin movimientos recientes.</p>'}
  </div>
</div>`;
	return shell("Resumen · Administración", body, { user, topbar: topbar(user), wide: true });
}

export function monitorPage({ user, snapshot = {} } = {}) {
	const users = Array.isArray(snapshot.users) ? snapshot.users : [];
	const recent = Array.isArray(snapshot.recent) ? snapshot.recent : [];
	const stats = snapshot.stats || {};
	const userCard = (entry) => {
		const current = entry.current;
		const canKick = String(entry.username).toLowerCase() !== String(user.username).toLowerCase();
		const streams = (entry.streams || [])
			.map((stream) => `<span class="monitor-stream" title="${esc(stream.host)}:${esc(stream.port)}">${esc(stream.host)}:${esc(stream.port)}</span>`)
			.join("");
		return `<div class="monitor-user">
  <div class="monitor-user-head">
    ${userAvatar(entry.username, entry.icon, "user-avatar", entry.role)}
    <div class="monitor-user-title">
      <strong>${profileLink(entry.username)}</strong>
      <span class="badge role-${esc(entry.role)}">${esc(roleLabel(entry.role))}</span>
      <span class="badge ${entry.online ? "monitor-online" : "monitor-offline"}">${entry.online ? "en línea" : "inactivo"}</span>
    </div>
    <span class="monitor-time" title="Última actividad">${esc(fmtDate(entry.lastActiveAt || entry.lastSeenAt))}</span>
  </div>
  <div class="monitor-current">
    <span class="monitor-label">Última web</span>
    ${current
		? `<span class="monitor-url" title="${esc(current.url || current.query)}">${esc(current.url || "Solo búsqueda")}</span>${current.query ? `<span class="monitor-query">Búsqueda: ${esc(current.query)}</span>` : ""}`
		: '<span class="monitor-url">Sin navegación registrada</span>'}
  </div>
  <div class="monitor-meta"><span>${esc((entry.ips || []).join(" · ") || "IP desconocida")}</span><span>${esc(entry.sessions)} sesión${entry.sessions === 1 ? "" : "es"}</span><span title="${esc(entry.userAgent || "")}">${esc((entry.userAgent || "").slice(0, 60))}</span></div>
  ${streams ? `<div class="monitor-streams">${streams}</div>` : ""}
  <div class="monitor-actions">
    <a class="small" href="/admin/activity?user=${encodeURIComponent(entry.username)}">Ver historial</a>
    ${canKick ? `<button class="small danger" type="button" data-kick="${esc(entry.username)}" title="Cierra sus sesiones y pestañas al instante">Echar ahora</button>` : ""}
  </div>
</div>`;
	};
	const recentRow = (entry) => `<tr>
  <td class="mono">${esc(fmtDate(entry.at))}</td>
  <td><strong>${esc(entry.username)}</strong></td>
  <td class="mono">${esc(entry.url || "—")}${entry.query ? `<br><span class="muted">Búsqueda: ${esc(entry.query)}</span>` : ""}</td>
</tr>`;
	const body = `
${adminTabs("monitor", user.role)}
<div class="card">
  <div class="traffic-head">
    <div><h1>Vigilancia</h1><p class="muted">Quién está usando el proxy ahora y qué está haciendo. Se actualiza automáticamente.</p></div>
    <span class="traffic-live"><i></i> En directo</span>
  </div>
  <div class="stats">
    <div class="stat"><div class="k">Usuarios en línea</div><div class="v" id="monitor-online">${esc(stats.online || 0)}</div></div>
    <div class="stat"><div class="k">Sesiones activas</div><div class="v" id="monitor-sessions">${esc(stats.sessions || 0)}</div></div>
    <div class="stat"><div class="k">Streams Wisp</div><div class="v" id="monitor-streams">${esc(stats.streams || 0)}</div></div>
    <div class="stat"><div class="k">Actividad 24 h</div><div class="v" id="monitor-recent">${esc(stats.recent || 0)}</div></div>
  </div>
  <h2>Usuarios con sesión <small id="monitor-user-count">${users.length}</small></h2>
  <div class="monitor-grid" id="monitor-users" data-current-user="${esc(user.username)}">${users.map(userCard).join("") || '<p class="empty">No hay sesiones activas.</p>'}</div>
</div>
<div class="card">
  <h2>Actividad reciente</h2>
  <p class="muted">Últimas URLs y búsquedas registradas. El historial completo está en <a href="/admin/activity">Actividad</a>.</p>
  <div class="scroll"><table class="monitor-recent"><thead><tr><th>Hora</th><th>Usuario</th><th>Web / búsqueda</th></tr></thead><tbody id="monitor-recent-body">${recent.map(recentRow).join("") || '<tr><td colspan="3" class="empty">Sin actividad reciente.</td></tr>'}</tbody></table></div>
  <p class="hint" id="monitor-updated">Actualizado: ${esc(fmtDate(snapshot.generatedAt || new Date().toISOString()))}</p>
</div>
<script src="/monitor.js?v=20261126a" defer></script>`;
	return shell("Vigilancia · Administración", body, { user, topbar: topbar(user), wide: true });
}

export function settingsPage({
	user,
	settings,
	notice = "",
	error = "",
	adblock = adblockStats(),
} = {}) {
	const linkRows = settings.quickLinks
		.map(
			(link) => `<div class="link-row">
  <input name="linkLabel" value="${esc(link.label)}" maxlength="40" placeholder="Nombre" aria-label="Nombre">
  <input name="linkUrl" value="${esc(link.url)}" placeholder="https://…" aria-label="URL">
  <button class="small danger" type="button" onclick="this.parentElement.remove()">Quitar</button>
</div>`,
		)
		.join("");

	const body = `
${adminTabs("settings")}
<form method="post" action="/api/admin/settings" autocomplete="off">
<input type="hidden" name="revision" value="${esc(settings.revision || "")}">
<div class="card">
  <h1>Ajustes</h1>
  <p class="muted">Los cambios se aplican sin reiniciar la aplicación.</p>
  <p class="hint">Se guardan al pulsar “Guardar ajustes” o con <kbd>Ctrl</kbd> + <kbd>S</kbd>. Si otra pestaña ha cambiado los ajustes, se mostrará un aviso en vez de sobrescribirlos.</p>

  <div class="settings-toolbar">
    <label class="settings-search"><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg></span><input id="settings-search" type="search" placeholder="Buscar ajuste: chat, sesiones, bloqueo…" aria-label="Buscar ajuste"></label>
    <span class="settings-dirty" id="settings-dirty" aria-live="polite">Sin cambios</span>
    <button class="primary" type="submit">Guardar ajustes</button>
  </div>
  <div class="settings-jump">
    <a href="#settings-security">Seguridad</a>
    <a href="#settings-performance">Rendimiento</a>
    <a href="#settings-activity">Actividad</a>
    <a href="#settings-chat">Chat</a>
    <a href="#settings-maintenance">Mantenimiento</a>
    <a href="#settings-quarantine">Cuarentena</a>
    <a href="#settings-sites">Sitios</a>
    <a href="#settings-language">Idioma</a>
    <a href="#settings-backups">Copias</a>
    <a href="#settings-landing">Portada</a>
  </div>
  <div class="settings-status">
    <span class="badge">Sesión: ${esc(settings.sessionHours)} h</span>
    <span class="badge">Inactividad: ${esc(settings.sessionIdleHours || 12)} h</span>
    <span class="badge">${settings.chatEnabled ? "Chat activo" : "Chat desactivado"}</span>
    <span class="badge">${settings.maintenanceMode ? "Mantenimiento activo" : "Sin mantenimiento"}</span>
    <span class="badge">${settings.accessMode === "allowlist" ? "Lista blanca" : "Lista negra"}</span>
    <span class="badge">${settings.backupEnabled ? "Copias activas" : "Copias desactivadas"}</span>
  </div>
  <p class="empty" id="settings-empty" hidden>No hay ajustes que coincidan con la búsqueda.</p>

  <div class="section settings-block" id="settings-security" data-settings-search="seguridad sesiones login contraseña inactividad bloqueo zona horaria intentos">
    <h3>Seguridad y sesiones</h3>
    <div class="field-grid">
      <div>
        <label for="sessionHours">Duración de sesión (horas)</label>
        <input id="sessionHours" name="sessionHours" type="number" min="1" max="8760" value="${settings.sessionHours}" required>
      </div>
      <div>
        <label for="maxSessionsPerUser">Máximo de sesiones por usuario (admins exentos)</label>
        <input id="maxSessionsPerUser" name="maxSessionsPerUser" type="number" min="1" max="50" value="${settings.maxSessionsPerUser}" required>
      </div>
      <div>
        <label for="sessionIdleHours">Cierre por inactividad (horas)</label>
        <input id="sessionIdleHours" name="sessionIdleHours" type="number" min="1" max="720" value="${settings.sessionIdleHours || 12}" required>
      </div>
      <div>
        <label for="loginAttemptsPerMinute">Intentos de login por minuto y IP</label>
        <input id="loginAttemptsPerMinute" name="loginAttemptsPerMinute" type="number" min="5" max="100" value="${settings.loginAttemptsPerMinute || 20}" required>
      </div>
      <div>
        <label for="maxLoginAttempts">Intentos fallidos por usuario (referencia)</label>
        <input id="maxLoginAttempts" name="maxLoginAttempts" type="number" min="3" max="20" value="${settings.maxLoginAttempts}" required>
      </div>
      <div>
        <label for="lockoutMinutes">Minutos de bloqueo por intentos</label>
        <input id="lockoutMinutes" name="lockoutMinutes" type="number" min="1" max="1440" value="${settings.lockoutMinutes}" required>
      </div>
      <div>
        <label for="timezone">Zona horaria</label>
        <input id="timezone" name="timezone" value="${esc(settings.timezone || "Europe/Madrid")}" placeholder="Europe/Madrid" required>
      </div>
    </div>
    <label class="check"><input type="checkbox" name="allowUserPasswordChange"${settings.allowUserPasswordChange ? " checked" : ""}> Permitir que los usuarios cambien su contraseña (los admins siempre pueden)</label>
    <label class="check"><input type="checkbox" name="requireMfaForStaff"${settings.requireMfaForStaff ? " checked" : ""}> Exigir verificación en dos pasos (MFA) a administradores y moderadores</label>
    <p class="hint">Actívalo después de configurar tu propia MFA. Si te quedas fuera, usa <code>npm run mfa:reset -- usuario</code>.</p>
  </div>

  <div class="section settings-block" id="settings-activity" data-settings-search="actividad historial navegación usuarios límites">
    <h3>Actividad</h3>
    <label class="check"><input type="checkbox" name="activityEnabled"${settings.activityEnabled ? " checked" : ""}> Registrar actividad de navegación</label>
    <label class="check"><input type="checkbox" name="allowUserHistoryClear"${settings.allowUserHistoryClear ? " checked" : ""}> Permitir que los usuarios vacíen su propio historial</label>
    <div class="field-grid">
      <div>
        <label for="activityPerUser">Máximo por usuario</label>
        <input id="activityPerUser" name="activityPerUser" type="number" min="50" max="2000" value="${settings.activityPerUser}" required>
      </div>
      <div>
        <label for="activityTotal">Máximo total</label>
        <input id="activityTotal" name="activityTotal" type="number" min="100" max="10000" value="${settings.activityTotal}" required>
      </div>
    </div>
  </div>

  <div class="section settings-block" id="settings-performance" data-settings-search="rendimiento ancho banda wisp streams conexiones buffer latencia juegos">
    <h3>Rendimiento del proxy</h3>
    <div class="field-grid">
      <div>
        <label for="proxyBandwidthPerUserKbps">Ancho de banda por usuario (Kbps, 0 = sin límite)</label>
        <input id="proxyBandwidthPerUserKbps" name="proxyBandwidthPerUserKbps" type="number" min="0" max="100000" step="250" value="${esc(settings.proxyBandwidthPerUserKbps ?? 8000)}" required>
      </div>
      <div>
        <label for="proxyMaxStreamsPerUser">Máximo de streams por usuario</label>
        <input id="proxyMaxStreamsPerUser" name="proxyMaxStreamsPerUser" type="number" min="8" max="128" value="${esc(settings.proxyMaxStreamsPerUser ?? 64)}" required>
      </div>
      <div>
        <label for="proxyMaxConnectionsPerUser">Conexiones Wisp simultáneas por usuario</label>
        <input id="proxyMaxConnectionsPerUser" name="proxyMaxConnectionsPerUser" type="number" min="1" max="10" value="${esc(settings.proxyMaxConnectionsPerUser ?? 6)}" required>
      </div>
      <div>
        <label for="proxyWispBufferMB">Búfer de descarga por conexión (MB)</label>
        <input id="proxyWispBufferMB" name="proxyWispBufferMB" type="number" min="1" max="32" value="${esc(settings.proxyWispBufferMB ?? 4)}" required>
      </div>
    </div>
    <label class="check"><input type="checkbox" name="blockAds"${settings.blockAds ? " checked" : ""}> Bloquear anuncios y rastreadores (mejora Poki y webs con mucha publicidad)</label>
    <p class="hint">El límite de ancho de banda es por usuario y suma subida y bajada; 8000 Kbps ≈ 8 Mbps. Un stream es una conexión de red de la web (imágenes, vídeo, juegos…). Si hay muchos usuarios, baja el ancho de banda o los streams antes que el búfer.</p>
    <p class="hint">Lista real de bloqueo: <b>${esc(adblock.count || 0)}</b> dominios${adblock.updatedAt ? ` · actualizada ${esc(fmtDate(adblock.updatedAt))}` : " · pendiente de descargar"}.</p>
    <form method="post" action="/api/admin/adblock/update" style="margin-top:8px">
      <button class="small" type="submit">Actualizar lista de anuncios</button>
    </form>
  </div>

  <div class="section settings-block" id="settings-chat" data-settings-search="chat mensajes usuarios grupos privados retención adjuntos">
    <h3>Chat</h3>
    <label class="check"><input type="checkbox" name="chatEnabled"${settings.chatEnabled ? " checked" : ""}> Activar el chat entre usuarios</label>
    <label class="check"><input type="checkbox" name="chatShowOnline"${settings.chatShowOnline ? " checked" : ""}> Mostrar cuántos usuarios están conectados</label>
    <label class="check"><input type="checkbox" name="chatAllowUserDelete"${settings.chatAllowUserDelete ? " checked" : ""}> Permitir que cada usuario borre sus propios mensajes</label>
    <div class="field-grid">
      <div>
        <label for="chatTitle">Título visible</label>
        <input id="chatTitle" name="chatTitle" value="${esc(settings.chatTitle || "")}" maxlength="60" required>
      </div>
      <div>
        <label for="chatMaxLength">Longitud máxima por mensaje</label>
        <input id="chatMaxLength" name="chatMaxLength" type="number" min="20" max="2000" value="${settings.chatMaxLength}" required>
      </div>
      <div>
        <label for="chatSlowModeSeconds">Espera entre mensajes (segundos)</label>
        <input id="chatSlowModeSeconds" name="chatSlowModeSeconds" type="number" min="0" max="300" value="${settings.chatSlowModeSeconds}" required>
      </div>
      <div>
        <label for="chatMaxPerMinute">Máximo de mensajes por minuto</label>
        <input id="chatMaxPerMinute" name="chatMaxPerMinute" type="number" min="1" max="120" value="${settings.chatMaxPerMinute}" required>
      </div>
      <div>
        <label for="chatMaxMessages">Mensajes guardados (máximo)</label>
        <input id="chatMaxMessages" name="chatMaxMessages" type="number" min="100" max="5000" value="${settings.chatMaxMessages}" required>
      </div>
      <div>
        <label for="chatRetentionDays">Días de retención</label>
        <input id="chatRetentionDays" name="chatRetentionDays" type="number" min="1" max="365" value="${settings.chatRetentionDays}" required>
      </div>
      <div>
        <label for="chatUploadMaxPerMinute">Subidas por minuto</label>
        <input id="chatUploadMaxPerMinute" name="chatUploadMaxPerMinute" type="number" min="1" max="60" value="${settings.chatUploadMaxPerMinute}" required>
      </div>
      <div>
        <label for="chatUploadMaxTotalMB">Almacenamiento total de adjuntos (MB)</label>
        <input id="chatUploadMaxTotalMB" name="chatUploadMaxTotalMB" type="number" min="16" max="4096" value="${settings.chatUploadMaxTotalMB}" required>
      </div>
      <div>
        <label for="chatUploadMaxPerUserMB">Almacenamiento por usuario (MB)</label>
        <input id="chatUploadMaxPerUserMB" name="chatUploadMaxPerUserMB" type="number" min="8" max="1024" value="${settings.chatUploadMaxPerUserMB}" required>
      </div>
    </div>
    <label for="chatWelcome">Mensaje de bienvenida</label>
    <textarea id="chatWelcome" name="chatWelcome" maxlength="200" style="min-height:60px">${esc(settings.chatWelcome || "")}</textarea>
    <p class="hint">Los mensajes son texto plano: no se interpreta HTML ni Markdown. Los administradores y moderadores pueden borrar cualquier mensaje desde el chat.</p>
    <button class="small danger" type="submit" formaction="/api/admin/chat/clear" formmethod="post" onclick="return confirm('¿Vaciar todo el chat? Esta acción no se puede deshacer.')">Vaciar chat</button>
  </div>

  <div class="section settings-block" id="settings-maintenance" data-settings-search="mantenimiento aviso acceso administradores">
    <h3>Mantenimiento</h3>
    <label class="check"><input type="checkbox" name="maintenanceMode"${settings.maintenanceMode ? " checked" : ""}> Activar modo mantenimiento (solo administradores)</label>
    <label for="maintenanceMessage">Mensaje para los usuarios</label>
    <textarea id="maintenanceMessage" name="maintenanceMessage" maxlength="300" style="min-height:60px">${esc(settings.maintenanceMessage)}</textarea>
  </div>

  <div class="section settings-block" id="settings-quarantine" data-settings-search="cuarentena seguridad bloqueo conexiones">
    <h3>Cuarentena</h3>
    <label class="check"><input type="checkbox" name="quarantineMode"${settings.quarantineMode ? " checked" : ""}> Activar cuarentena (solo administradores)</label>
    <label for="quarantineMessage">Mensaje para los usuarios</label>
    <textarea id="quarantineMessage" name="quarantineMessage" maxlength="300" style="min-height:60px">${esc(settings.quarantineMessage || "")}</textarea>
    <p class="hint">Al activarla se rechazan nuevas peticiones de webs y se cierran las conexiones abiertas de usuarios.</p>
    <p class="hint"><a class="small" href="/admin/schedules">Programar mantenimiento y cuarentena</a></p>
  </div>

  <div class="section settings-block" id="settings-sites" data-settings-search="sitios dominios permitidos prohibidos lista negra blanca categorías adultos apuestas social">
    <h3>Sitios y modo de acceso</h3>
    <label class="check"><input type="checkbox" name="proxyAllowStaffBrowsing"${settings.proxyAllowStaffBrowsing ? " checked" : ""}> Permitir que administradores y moderadores naveguen por webs de terceros (no recomendado)</label>
    <p class="hint">Por seguridad, las cuentas de gestión no navegan por el proxy. Si lo activas, una web maliciosa podría intentar actuar con los permisos de esa cuenta.</p>
    <label for="accessMode">Modo</label>
    <select id="accessMode" name="accessMode">
      <option value="blacklist"${settings.accessMode === "blacklist" ? " selected" : ""}>Lista negra: se permite todo salvo los prohibidos</option>
      <option value="allowlist"${settings.accessMode === "allowlist" ? " selected" : ""}>Lista blanca: solo se permiten los listados</option>
    </select>
    <label for="allowedSites">Dominios permitidos (uno por línea)</label>
    <textarea id="allowedSites" name="allowedSites" style="min-height:100px" placeholder="ejemplo.com&#10;otro-sitio.org">${esc((settings.allowedSites || []).join("\n"))}</textarea>
    <label for="blockedSites">Dominios prohibidos (uno por línea, opcional: dominio | mensaje)</label>
    <textarea id="blockedSites" name="blockedSites" style="min-height:120px" placeholder="ejemplo.com | No permitido&#10;otro-sitio.org">${esc(
			(settings.blockedSites || [])
				.map((h) =>
					settings.siteMessages?.[h] ? `${h} | ${settings.siteMessages[h]}` : h,
				)
				.join("\n"),
		)}</textarea>
    <div class="field-grid">
      <div>
        <label for="defaultBlockMessage">Mensaje de bloqueo por defecto</label>
        <input id="defaultBlockMessage" name="defaultBlockMessage" value="${esc(settings.defaultBlockMessage || "")}" maxlength="300">
      </div>
      <div>
        <label for="allowlistMessage">Mensaje de lista blanca</label>
        <input id="allowlistMessage" name="allowlistMessage" value="${esc(settings.allowlistMessage || "")}" maxlength="300">
      </div>
    </div>
    <h3 style="margin-top:24px">Categorías</h3>
    <label class="check"><input type="checkbox" name="categories" value="adult"${settings.categories?.includes("adult") ? " checked" : ""}> Adultos</label>
    <label class="check"><input type="checkbox" name="categories" value="gambling"${settings.categories?.includes("gambling") ? " checked" : ""}> Apuestas</label>
    <label class="check"><input type="checkbox" name="categories" value="social"${settings.categories?.includes("social") ? " checked" : ""}> Redes sociales</label>
    <div class="field-grid">
      <div><label for="categoryMessageAdult">Mensaje adultos</label><input id="categoryMessageAdult" name="categoryMessageAdult" value="${esc(settings.categoryMessages?.adult || "")}" maxlength="300"></div>
      <div><label for="categoryMessageGambling">Mensaje apuestas</label><input id="categoryMessageGambling" name="categoryMessageGambling" value="${esc(settings.categoryMessages?.gambling || "")}" maxlength="300"></div>
    </div>
    <label for="categoryMessageSocial">Mensaje redes sociales</label>
    <input id="categoryMessageSocial" name="categoryMessageSocial" value="${esc(settings.categoryMessages?.social || "")}" maxlength="300">
    <button class="small" type="submit" formaction="/api/admin/categories/refresh" formmethod="post" style="margin-top:10px">Actualizar listas ahora</button>
    <p class="hint">Se bloquea el dominio completo y sus subdominios. En modo lista blanca, la lista de prohibidos y las categorías se ignoran. Los administradores pueden acceder.</p>
  </div>

  <div class="section settings-block" id="settings-language" data-settings-search="idioma español inglés catalán language">
    <h3>Idioma de la interfaz</h3>
    <label for="language">Idioma por defecto</label>
    <select id="language" name="language">
      <option value="es"${settings.language === "es" ? " selected" : ""}>Español</option>
      <option value="en"${settings.language === "en" ? " selected" : ""}>English</option>
      <option value="ca"${settings.language === "ca" ? " selected" : ""}>Català</option>
    </select>
  </div>

  <div class="section settings-block" id="settings-backups" data-settings-search="copias backup métricas token retención">
    <h3>Copias y métricas</h3>
    <label class="check"><input type="checkbox" name="backupEnabled"${settings.backupEnabled ? " checked" : ""}> Copia automática diaria (sobre las 03:00)</label>
    <div class="field-grid">
      <div>
        <label for="backupRetentionDays">Días de retención</label>
        <input id="backupRetentionDays" name="backupRetentionDays" type="number" min="1" max="90" value="${settings.backupRetentionDays}" required>
      </div>
      <div>
        <label for="metricsToken">Token de /metrics (vacío = desactivado)</label>
        <input id="metricsToken" name="metricsToken" value="${esc(settings.metricsToken || "")}" maxlength="64">
      </div>
    </div>
  </div>

  <div class="section settings-block" id="settings-landing" data-settings-search="portada título subtítulo buscador enlaces rápidos favoritos">
    <h3>Portada y búsqueda</h3>
    <div class="field-grid">
      <div>
        <label for="landingTitle">Título</label>
        <input id="landingTitle" name="landingTitle" value="${esc(settings.landingTitle)}" maxlength="60" required>
      </div>
      <div>
        <label for="defaultSearchEngine">Buscador por defecto</label>
        <select id="defaultSearchEngine" name="defaultSearchEngine">
          <option value="duckduckgo"${settings.defaultSearchEngine === "duckduckgo" ? " selected" : ""}>DuckDuckGo</option>
          <option value="google"${settings.defaultSearchEngine === "google" ? " selected" : ""}>Google</option>
          <option value="bing"${settings.defaultSearchEngine === "bing" ? " selected" : ""}>Bing</option>
        </select>
      </div>
    </div>
    <label for="landingSubtitle">Subtítulo</label>
    <textarea id="landingSubtitle" name="landingSubtitle" maxlength="200" style="min-height:60px">${esc(settings.landingSubtitle)}</textarea>
    <label>Enlaces rápidos (máximo 8)</label>
    <div id="links-editor">${linkRows}</div>
    <button class="small" type="button" onclick="addLink()">Añadir enlace</button>
  </div>

  ${notice ? `<p class="msg ok">${esc(notice)}</p>` : ""}
  ${error ? `<p class="msg error">${esc(error)}</p>` : ""}
  <div class="settings-final-actions">
    <button class="primary" type="submit">Guardar ajustes</button>
    <span class="settings-dirty" id="settings-dirty-bottom" aria-live="polite">Sin cambios</span>
  </div>
</div>
</form>

<div class="card">
  <h2>Restablecer</h2>
  <p class="muted">Vuelve a los valores de fábrica. No afecta a usuarios ni contraseñas.</p>
  <form method="post" action="/api/admin/settings/reset" onsubmit="return confirm('¿Restablecer todos los ajustes?')">
    <button class="small danger" type="submit">Restablecer ajustes</button>
  </form>
</div>
<script>
function addLink() {
  const row = document.createElement("div");
  row.className = "link-row";
  row.innerHTML = '<input name="linkLabel" maxlength="40" placeholder="Nombre" aria-label="Nombre">' +
    '<input name="linkUrl" placeholder="https://…" aria-label="URL">' +
    '<button class="small danger" type="button">Quitar</button>';
  row.querySelector("button").addEventListener("click", () => row.remove());
  document.getElementById("links-editor").appendChild(row);
}
const settingsForm = document.querySelector('form[action="/api/admin/settings"]');
if (settingsForm) settingsForm.reset();
if (settingsForm) {
  const search = document.getElementById("settings-search");
  const blocks = [...document.querySelectorAll(".settings-block")];
  const empty = document.getElementById("settings-empty");
  const dirtyLabels = [
    document.getElementById("settings-dirty"),
    document.getElementById("settings-dirty-bottom"),
  ].filter(Boolean);
  let dirty = false;
  const updateDirty = (value) => {
    dirty = value;
    for (const label of dirtyLabels) {
      label.textContent = dirty ? "Cambios sin guardar" : "Sin cambios";
      label.classList.toggle("dirty", dirty);
    }
  };
  settingsForm.addEventListener("input", (event) => {
    if (event.target.id !== "settings-search") updateDirty(true);
  });
  settingsForm.addEventListener("change", (event) => {
    if (event.target.id !== "settings-search") updateDirty(true);
  });
  settingsForm.addEventListener("submit", () => updateDirty(false));
  if (search) {
    search.addEventListener("keydown", (event) => {
      if (event.key === "Enter") event.preventDefault();
    });
    search.addEventListener("input", () => {
      const query = search.value.trim().toLowerCase();
      let visible = 0;
      for (const block of blocks) {
        const haystack = ((block.dataset.settingsSearch || "") + " " + block.textContent).toLowerCase();
        const matches = !query || haystack.includes(query);
        block.hidden = !matches;
        if (matches) visible += 1;
      }
      if (empty) empty.hidden = visible > 0;
    });
  }
  window.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      settingsForm.requestSubmit();
    }
  });
  window.addEventListener("beforeunload", (event) => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = "";
  });
}
</script>`;
	return shell("Ajustes · Administración", body, { user, topbar: topbar(user), wide: true });
}

export function auditPage({
	user,
	events = [],
	users = [],
	actions = [],
	filters = {},
	canManage = false,
	integrity = { ok: true, count: 0 },
	notice = "",
} = {}) {
	const actorOptions = users
		.map(
			(u) =>
				`<option value="${esc(u.username)}"${filters.actor?.toLowerCase() === u.username.toLowerCase() ? " selected" : ""}>${esc(u.username)}</option>`,
		)
		.join("");
	const actionOptions = actions
		.map(
			(a) =>
				`<option value="${esc(a)}"${filters.action === a ? " selected" : ""}>${esc(a)}</option>`,
		)
		.join("");
	const query = new URLSearchParams();
	if (filters.actor) query.set("actor", filters.actor);
	if (filters.action) query.set("action", filters.action);
	const csvQuery = query.toString() ? `?${query}` : "";

	const rows = events
		.map(
			(e) => `<tr>
  <td class="mono">${esc(fmtDate(e.at))}</td>
  <td><strong>${esc(e.actor)}</strong></td>
  <td class="mono">${esc(e.action)}</td>
  <td>${esc(e.target || "—")}</td>
  <td>${esc(e.detail || "")}</td>
  <td class="mono">${esc(e.ip || "—")}</td>
  <td>${esc((e.userAgent || "").slice(0, 60))}</td>
</tr>`,
		)
		.join("");

	const body = `
${adminTabs("audit", user.role)}
<div class="card">
  <h1>Auditoría</h1>
  <p class="muted">Registro de accesos y acciones de administración. Últimos 300 eventos filtrados.</p>
  ${integrity.ok ? `<p class="msg ok">Cadena de integridad verificada (${esc(integrity.count)} eventos).</p>` : `<p class="msg error">La cadena de auditoría está rota en el evento ${esc(integrity.index)}. Revisa si alguien ha modificado <code>data/audit.json</code>. Si hiciste una limpieza manual, ejecuta <code>npm run audit:rebuild</code>.</p>`}
  <form method="get" action="/admin/audit" class="filter">
    <select name="actor" aria-label="Filtrar por usuario">
      <option value="">Todos los usuarios</option>
      ${actorOptions}
    </select>
    <select name="action" aria-label="Filtrar por acción">
      <option value="">Todas las acciones</option>
      ${actionOptions}
    </select>
    <button class="small" type="submit">Filtrar</button>
    <a href="/admin/audit">Quitar filtros</a>
    ${canManage ? `<a class="small" href="/admin/audit.csv${csvQuery}" style="margin-left:auto">Exportar CSV</a>` : ""}
  </form>
  ${canManage ? `<form method="post" action="/api/admin/audit/clear" class="filter" onsubmit="return confirm('¿Vaciar toda la auditoría?')">
    <button class="small danger" type="submit">Vaciar auditoría</button>
  </form>` : ""}
  ${notice ? `<p class="msg ok">${esc(notice)}</p>` : ""}
  ${
		rows
			? `<div class="scroll"><table>
    <thead><tr><th>Fecha</th><th>Actor</th><th>Acción</th><th>Objetivo</th><th>Detalle</th><th>IP</th><th>Navegador</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`
			: '<p class="empty">No hay eventos para estos filtros.</p>'
	}
</div>`;
	return shell("Auditoría · Administración", body, { user, topbar: topbar(user) });
}

export function systemPage({
	user,
	stats,
	services = {},
	funnel = {},
	counts = {},
	url = "",
	backups = [],
} = {}) {
	const serviceRow = (name, state) =>
		`<tr><td><strong>${esc(name)}</strong></td><td><span class="badge${state === "active" ? " current" : " blocked"}">${esc(state)}</span></td></tr>`;
	const diskPercent = stats.disk.total
		? Math.round((stats.disk.used / stats.disk.total) * 100)
		: 0;

	const body = `
${adminTabs("system")}
<div class="card">
  <h1>Sistema</h1>
  <p class="muted">Estado del servidor y del proxy.</p>
  <div class="stats">
    <div class="stat"><div class="k">Uptime</div><div class="v">${esc(fmtDuration(stats.uptime))}</div></div>
    <div class="stat"><div class="k">Memoria del proceso</div><div class="v">${esc(fmtBytes(stats.procRss))}</div></div>
    <div class="stat"><div class="k">Memoria libre</div><div class="v">${esc(fmtBytes(stats.memFree))} <small>/ ${esc(fmtBytes(stats.memTotal))}</small></div></div>
    <div class="stat"><div class="k">Carga</div><div class="v">${stats.load.map((n) => n.toFixed(2)).join(" · ")}</div></div>
    <div class="stat"><div class="k">Disco</div><div class="v">${diskPercent}% <small>${esc(fmtBytes(stats.disk.free))} libres</small></div></div>
    <div class="stat"><div class="k">Node</div><div class="v">${esc(stats.node)}</div></div>
    <div class="stat"><div class="k">Proxy</div><div class="v">${esc(stats.version || "?")}</div></div>
  </div>
  <div class="grid">
    <div>
      <h2>Servicios</h2>
      <table><tbody>${serviceRow("webproxy", services.webproxy || "desconocido")}${serviceRow("apache2", services.apache2 || "desconocido")}</tbody></table>
    </div>
    <div>
      <h2>Datos</h2>
      <div class="stats" style="grid-template-columns:1fr 1fr">
        <div class="stat"><div class="k">Usuarios</div><div class="v">${counts.users || 0}</div></div>
        <div class="stat"><div class="k">Sesiones</div><div class="v">${counts.sessions || 0}</div></div>
        <div class="stat"><div class="k">Actividad</div><div class="v">${counts.activity || 0}</div></div>
        <div class="stat"><div class="k">Auditoría</div><div class="v">${counts.audit || 0}</div></div>
      </div>
    </div>
  </div>
  <div class="actions" style="margin:18px 0">
    <a class="small" href="/admin/logs">Ver logs del sistema</a>
  </div>
  <h2>Tailscale Funnel</h2>
  <p class="muted">URL pública: <a href="${esc(url)}">${esc(url)}</a></p>
  <pre class="panel">${esc(funnel.output || "Sin información")}</pre>
  <h2>Copias de seguridad</h2>
  <p class="muted">Cifradas con AES-256-GCM. No incluyen hashes de contraseña, notas, IPs, mensajes de bloqueo ni historial/chat. Al restaurar se conservan las contraseñas actuales de las cuentas existentes.</p>
  <div class="actions" style="margin-bottom:14px">
    <form method="post" action="/api/admin/backup/create">
      <button class="small" type="submit">Crear copia ahora</button>
    </form>
  </div>
  ${
		backups.length
			? `<div class="scroll"><table>
    <thead><tr><th>Archivo</th><th>Fecha</th><th>Tamaño</th><th></th></tr></thead>
    <tbody>${backups
			.map(
				(b) => `<tr>
      <td class="mono">${esc(b.name)}</td>
      <td class="mono">${esc(fmtDate(b.createdAt))}</td>
      <td>${esc(fmtBytes(b.size))}</td>
      <td><span class="muted">cifrada</span></td>
    </tr>`,
			)
			.join("")}</tbody>
  </table></div>
  <form method="post" action="/api/admin/backup/download" class="actions" style="margin-top:16px"
    onsubmit="return confirm('¿Descargar esta copia cifrada?')">
    <select name="name" required aria-label="Copia a descargar">
      ${backups.map((b) => `<option value="${esc(b.name)}">${esc(b.name)}</option>`).join("")}
    </select>
    <input name="password" type="password" placeholder="Tu contraseña" required aria-label="Contraseña para descargar">
    <button class="small" type="submit">Descargar cifrada</button>
  </form>
  <form method="post" action="/api/admin/backup/restore" style="margin-top:16px"
    onsubmit="return confirm('¿Restaurar esta copia? Se sobrescribirán los datos actuales.')">
    <label for="restore-name">Restaurar copia</label>
    <select id="restore-name" name="name" required>
      ${backups.map((b) => `<option value="${esc(b.name)}">${esc(b.name)}</option>`).join("")}
    </select>
    <div class="field-grid">
      <div><label for="restore-pass">Tu contraseña</label><input id="restore-pass" name="password" type="password" required></div>
      <div><label for="restore-confirm">Escribe RESTAURAR</label><input id="restore-confirm" name="confirm" required></div>
    </div>
    <button class="small danger" type="submit" style="margin-top:10px">Restaurar y reiniciar</button>
  </form>`
			: '<p class="empty">Todavía no hay copias guardadas.</p>'
	}
</div>`;
	return shell("Sistema · Administración", body, { user, topbar: topbar(user) });
}


const REPORT_TYPE_LABELS = {
	bug: "Bug funcional",
	security: "Seguridad",
	design: "Diseño / interfaz",
};
const REPORT_SEVERITY_LABELS = {
	low: "Baja",
	medium: "Media",
	high: "Alta",
	critical: "Crítica",
};
const REPORT_STATUS_LABELS = {
	open: "Abierto",
	triaged: "Triado",
	in_progress: "En curso",
	fixed: "Corregido",
	dismissed: "Descartado",
};

function reportStatusBadge(status) {
	return `<span class="badge report-status-${esc(status)}">${esc(REPORT_STATUS_LABELS[status] || status)}</span>`;
}

function reportForm(user, browser = "") {
	return `<div class="card report-form-card">
  <h2>Nuevo informe</h2>
  <p class="muted">Cuéntanos qué falla y dónde. Cuanto más concreto, más rápido se puede arreglar.</p>
  <form method="post" action="/api/reports">
    <div class="field-grid">
      <div>
        <label for="report-title">Título</label>
        <input id="report-title" name="title" maxlength="140" required placeholder="Ej.: El botón de enviar no responde en móvil">
      </div>
      <div>
        <label for="report-type">Tipo</label>
        <select id="report-type" name="type">
          <option value="bug">Bug funcional</option>
          <option value="security">Seguridad</option>
          <option value="design">Diseño / interfaz</option>
        </select>
      </div>
      <div>
        <label for="report-severity">Gravedad</label>
        <select id="report-severity" name="severity">
          <option value="low">Baja</option>
          <option value="medium" selected>Media</option>
          <option value="high">Alta</option>
          <option value="critical">Crítica</option>
        </select>
      </div>
      <div>
        <label for="report-area">Zona o página</label>
        <input id="report-area" name="area" maxlength="120" placeholder="Ej.: /chat, /admin/settings, /login">
      </div>
    </div>
    <label for="report-url">URL exacta (opcional)</label>
    <input id="report-url" name="url" maxlength="500" placeholder="https://…">
    <label for="report-description">Qué falla</label>
    <textarea id="report-description" name="description" maxlength="4000" required placeholder="Describe el problema…"></textarea>
    <label for="report-steps">Pasos para reproducirlo</label>
    <textarea id="report-steps" name="steps" maxlength="4000" placeholder="1. Entra en…&#10;2. Pulsa…&#10;3. Ocurre…"></textarea>
    <div class="field-grid">
      <div>
        <label for="report-expected">Resultado esperado</label>
        <textarea id="report-expected" name="expected" maxlength="1000"></textarea>
      </div>
      <div>
        <label for="report-actual">Resultado real</label>
        <textarea id="report-actual" name="actual" maxlength="1000"></textarea>
      </div>
    </div>
    <label for="report-browser">Navegador / dispositivo</label>
    <input id="report-browser" name="browser" maxlength="200" value="${esc(browser)}">
    <button class="primary" type="submit">Enviar informe</button>
  </form>
</div>`;
}

function reportTable(reports, { admin = false } = {}) {
	if (!reports.length) return '<p class="empty">Todavía no hay informes.</p>';
	const rows = reports
		.map(
			(report) => `<tr>
  <td class="mono">${esc(fmtDate(report.createdAt))}</td>
  ${admin ? `<td><strong>${esc(report.createdBy)}</strong></td>` : ""}
  <td><span class="badge report-type-${esc(report.type)}">${esc(REPORT_TYPE_LABELS[report.type] || report.type)}</span></td>
  <td><span class="badge report-severity-${esc(report.severity)}">${esc(REPORT_SEVERITY_LABELS[report.severity] || report.severity)}</span></td>
  <td>${esc(report.area || "—")}</td>
  <td>
    <details class="report-detail">
      <summary>${esc(report.title)}</summary>
      <div class="report-detail-body">
        <p><strong>Qué falla:</strong> ${esc(report.description)}</p>
        ${report.steps ? `<p><strong>Pasos:</strong> ${esc(report.steps)}</p>` : ""}
        ${report.expected ? `<p><strong>Esperado:</strong> ${esc(report.expected)}</p>` : ""}
        ${report.actual ? `<p><strong>Real:</strong> ${esc(report.actual)}</p>` : ""}
        ${report.url ? `<p><strong>URL:</strong> <span class="mono">${esc(report.url)}</span></p>` : ""}
        ${report.browser ? `<p><strong>Navegador:</strong> ${esc(report.browser)}</p>` : ""}
        ${report.adminNote ? `<p><strong>Nota del equipo:</strong> ${esc(report.adminNote)}</p>` : ""}
      </div>
    </details>
  </td>
  <td>${reportStatusBadge(report.status)}</td>
  ${admin ? `<td><a class="small" href="/admin/reports/${encodeURIComponent(report.id)}">Abrir ficha</a></td>` : ""}
</tr>`,
		)
		.join("");
	return `<div class="scroll"><table>
    <thead><tr><th>Fecha</th>${admin ? "<th>Reportero</th>" : ""}<th>Tipo</th><th>Gravedad</th><th>Zona</th><th>Informe</th><th>Estado</th>${admin ? "<th></th>" : ""}</tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

export function reportsPage({ user, reports = [], notice = "", error = "", browser = "" } = {}) {
	const body = `
${toolTabs("reports", user)}
<div class="card">
  <h1>Informes de fallos</h1>
  <p class="muted">Sección común para diseño, pentest y QA. Puedes enviar un informe y seguir su estado.</p>
  ${notice ? `<p class="msg ok">${esc(notice)}</p>` : ""}
  ${error ? `<p class="msg error">${esc(error)}</p>` : ""}
</div>
${reportForm(user, browser)}
<div class="card">
  <h2>Mis informes</h2>
  ${reportTable(reports)}
</div>`;
	return shell("Informes · Proxy Web", body, { user, topbar: topbar(user) });
}

export function adminReportsPage({ user, reports = [], status = "", notice = "", error = "" } = {}) {
	const body = `
${adminTabs("reports", user.role)}
<div class="card">
  <h1>Informes</h1>
  <p class="muted">Informes enviados por diseño, pentest y QA. Revisa, comenta y cambia el estado.</p>
  <div class="filter">
    <a class="small${status === "" ? " active" : ""}" href="/admin/reports">Todos</a>
    ${Object.entries(REPORT_STATUS_LABELS).map(([value, label]) => `<a class="small${status === value ? " active" : ""}" href="/admin/reports?status=${value}">${label}</a>`).join("")}
  </div>
  ${notice ? `<p class="msg ok">${esc(notice)}</p>` : ""}
  ${error ? `<p class="msg error">${esc(error)}</p>` : ""}
  ${reportTable(reports, { admin: true })}
</div>`;
	return shell("Informes · Administración", body, { user, topbar: topbar(user) });
}

export function adminReportDetailPage({ user, report, notice = "", error = "" } = {}) {
	const body = `
${adminTabs("reports", user.role)}
<div class="card report-detail-card">
  <p><a class="small" href="/admin/reports">← Volver a informes</a></p>
  <div class="report-detail-head">
    <div>
      <h1>${esc(report.title)}</h1>
      <p class="muted">Enviado por <strong>${esc(report.createdBy)}</strong> · ${esc(fmtDate(report.createdAt))}${report.updatedAt ? ` · actualizado ${esc(fmtDate(report.updatedAt))}` : ""}</p>
      <div class="actions">
        <span class="badge report-type-${esc(report.type)}">${esc(REPORT_TYPE_LABELS[report.type] || report.type)}</span>
        <span class="badge report-severity-${esc(report.severity)}">${esc(REPORT_SEVERITY_LABELS[report.severity] || report.severity)}</span>
        ${reportStatusBadge(report.status)}
      </div>
    </div>
    <span class="report-detail-id mono">#${esc(report.id)}</span>
  </div>
  ${notice ? `<p class="msg ok">${esc(notice)}</p>` : ""}
  ${error ? `<p class="msg error">${esc(error)}</p>` : ""}
  <div class="report-detail-grid">
    <section>
      <h2>Zona / página</h2>
      <p>${esc(report.area || "—")}</p>
      ${report.url ? `<p class="mono">${esc(report.url)}</p>` : ""}
    </section>
    <section>
      <h2>Navegador / dispositivo</h2>
      <p>${esc(report.browser || "—")}</p>
    </section>
  </div>
  <h2>Qué falla</h2>
  <p class="report-long-text">${esc(report.description)}</p>
  ${report.steps ? `<h2>Pasos para reproducirlo</h2><p class="report-long-text">${esc(report.steps)}</p>` : ""}
  <div class="report-detail-grid">
    <section><h2>Resultado esperado</h2><p class="report-long-text">${esc(report.expected || "—")}</p></section>
    <section><h2>Resultado real</h2><p class="report-long-text">${esc(report.actual || "—")}</p></section>
  </div>
  <h2>Gestión</h2>
  <form method="post" action="/api/admin/reports/${encodeURIComponent(report.id)}" class="report-management">
    <label for="report-admin-note">Nota interna</label>
    <textarea id="report-admin-note" name="note" maxlength="2000" placeholder="Qué se ha hecho, quién lo revisa, etc.">${esc(report.adminNote || "")}</textarea>
    <div class="actions">
      <button class="small" type="submit" name="action" value="save">Guardar nota</button>
      <button class="small" type="submit" name="action" value="triaged">Marcar triado</button>
      <button class="small" type="submit" name="action" value="in_progress">Marcar en curso</button>
      <button class="small" type="submit" name="action" value="fixed" onclick="return confirm('¿Marcar como corregido? El informe se eliminará.')">Corregido y eliminar</button>
      <button class="small danger" type="submit" name="action" value="dismissed" onclick="return confirm('¿Descartar el informe? Se eliminará.')">Descartar y eliminar</button>
    </div>
  </form>
</div>`;
	return shell(`Informe · ${report.title}`, body, { user, topbar: topbar(user), wide: true });
}

const TOOL_CONFIG = {
	designer: {
		path: "/design",
		title: "Diseño gráfico",
		intro: "Herramientas para revisar la interfaz, el sistema visual y reportar problemas de diseño.",
		checklist: [
			"Contraste legible en tema oscuro y en móvil.",
			"Estados hover, focus, activo y deshabilitado en botones y enlaces.",
			"Espaciados consistentes entre tarjetas, formularios y tablas.",
			"Tipografía: jerarquía, tamaños y saltos de línea.",
			"Responsive: 390 px, 768 px y 1440 px.",
			"Iconos alineados y con texto alternativo.",
			"Modales, diálogos y menús: apertura, cierre y foco.",
		],
	},
	pentester: {
		path: "/pentest",
		title: "Pentest",
		intro: "Checklist y resumen de exposición. Sin acceso a datos sensibles de administración.",
		checklist: [
			"Autenticación: login, logout, MFA y recuperación.",
			"Sesiones: expiración, revocación y cookies.",
			"Roles: usuario, moderador, admin, creador y especialistas.",
			"CSRF, Origin y Sec-Fetch-Site en formularios y APIs.",
			"SSRF, IPs privadas, redirecciones y cabeceras Host.",
			"Subidas: tipo real, tamaño, cuota y nombre de archivo.",
			"Rate limits en login, chat, subidas e informes.",
			"Cabeceras: CSP, HSTS, XFO, nosniff.",
		],
	},
	qa: {
		path: "/qa",
		title: "QA / bugs",
		intro: "Casos de prueba y entorno para reproducir fallos con pasos claros.",
		checklist: [
			"Login, logout y cambio de contraseña.",
			"Navegación por el proxy y webs con vídeo/audio.",
			"Favoritos, historial, búsqueda y pestañas.",
			"Chat: enviar, responder, editar, fijar, buscar y adjuntar.",
			"Panel de administración: usuarios, ajustes, sesiones y copias.",
			"Móvil: teclado, scroll, modales y botones.",
			"Idiomas: español, inglés y catalán.",
			"Errores esperados: 403, 404, 429 y mantenimiento.",
		],
	},
};

export function specialistWorkspacePage({
	user,
	tool = "qa",
	reports = [],
	security = {},
	notice = "",
	error = "",
} = {}) {
	const config = TOOL_CONFIG[tool] || TOOL_CONFIG.qa;
	const checklist = config.checklist
		.map((item) => `<li>${esc(item)}</li>`)
		.join("");
	const stats =
		tool === "pentester"
			? `<div class="stats">
    <div class="stat"><div class="k">Alertas abiertas</div><div class="v">${esc(security.open || 0)}</div></div>
    <div class="stat"><div class="k">Bots detectados</div><div class="v">${esc(security.bots || 0)}</div></div>
    <div class="stat"><div class="k">Bloqueos activos</div><div class="v">${esc(security.banned || 0)}</div></div>
    <div class="stat"><div class="k">Últimas 24 h</div><div class="v">${esc(security.last24h || 0)}</div></div>
  </div>`
			: "";
	const designSwatches =
		tool === "designer"
			? `<div class="design-swatches">
    ${[
			["Fondo", "#161513"],
			["Superficie", "#1c1a18"],
			["Borde", "#3a3733"],
			["Texto", "#efe9de"],
			["Muted", "#9b948a"],
			["Acento", "#8fb6f0"],
			["Éxito", "#5aa87a"],
			["Error", "#e88b8b"],
		]
			.map(([name, color]) => `<div class="design-swatch"><span style="background:${color}"></span><strong>${esc(name)}</strong><small>${esc(color)}</small></div>`)
			.join("")}
  </div>
  <h2 style="margin-top:22px">Componentes</h2>
  <div class="actions" style="align-items:center">
    <button class="small primary-small" type="button">Botón primario</button>
    <button class="small" type="button">Botón secundario</button>
    <span class="badge">Badge</span>
    <span class="badge role-designer">Diseño</span>
    <span class="badge report-status-open">Abierto</span>
  </div>`
			: "";
	let toolPanel = "";
	let toolScript = "";
	if (tool === "designer") {
		toolPanel = `<div class="grid tool-tools">
  <div class="card">
    <h2>Comprobador de contraste</h2>
    <p class="muted">Calcula el contraste WCAG entre texto y fondo.</p>
    <div class="tool-inline">
      <label>Texto <input type="color" id="design-fg" value="#efe9de"></label>
      <label>Fondo <input type="color" id="design-bg" value="#161513"></label>
    </div>
    <div class="contrast-preview" id="design-contrast-preview">Texto de ejemplo</div>
    <p class="tool-result" id="design-contrast-result"></p>
  </div>
  <div class="card">
    <h2>Paleta a partir de un color</h2>
    <div class="tool-inline">
      <label>Color base <input type="color" id="design-palette-base" value="#8fb6f0"></label>
      <button class="small" type="button" id="design-palette-copy">Copiar CSS</button>
    </div>
    <div class="design-swatches" id="design-palette"></div>
    <pre class="tool-output" id="design-palette-css"></pre>
  </div>
</div>`;
		toolScript = '<script src="/design-tools.js" defer></script>';
	} else if (tool === "pentester") {
		toolPanel = `<div class="grid tool-tools">
  <div class="card">
    <h2>Analizador de cabeceras</h2>
    <p class="muted">Pega las cabeceras de una respuesta HTTP y revisa las protecciones.</p>
    <textarea id="pentest-headers" style="min-height:130px" placeholder="HTTP/1.1 200 OK&#10;content-type: text/html&#10;strict-transport-security: max-age=..."></textarea>
    <button class="small primary-small" type="button" id="pentest-headers-btn">Analizar cabeceras</button>
    <pre class="tool-output" id="pentest-headers-result"></pre>
  </div>
  <div class="card">
    <h2>Inspector JWT</h2>
    <p class="muted">Decodifica header y payload. No verifica la firma.</p>
    <textarea id="pentest-jwt" style="min-height:130px" placeholder="eyJhbGciOi..."></textarea>
    <button class="small primary-small" type="button" id="pentest-jwt-btn">Decodificar JWT</button>
    <pre class="tool-output" id="pentest-jwt-result"></pre>
  </div>
</div>
<div class="grid tool-tools">
  <div class="card">
    <h2>Analizador de URL</h2>
    <div class="tool-inline">
      <input id="pentest-url" placeholder="https://ejemplo.com/ruta?x=1">
      <button class="small" type="button" id="pentest-url-btn">Analizar</button>
    </div>
    <ul class="tool-output" id="pentest-url-result"></ul>
  </div>
  <div class="card">
    <h2>Hash y codificación</h2>
    <textarea id="pentest-hash-input" style="min-height:80px" placeholder="Texto…"></textarea>
    <div class="tool-inline">
      <select id="pentest-hash-alg">
        <option value="SHA-256">SHA-256</option>
        <option value="SHA-1">SHA-1</option>
        <option value="SHA-512">SHA-512</option>
      </select>
      <button class="small" type="button" id="pentest-hash-btn">Calcular</button>
      <button class="small" type="button" id="pentest-b64-btn">Base64</button>
    </div>
    <pre class="tool-output" id="pentest-hash-result"></pre>
  </div>
</div>`;
		toolScript = '<script src="/pentest-tools.js" defer></script>';
	} else if (tool === "qa") {
		toolPanel = `<div class="grid tool-tools">
  <div class="card">
    <h2>Banco de pruebas</h2>
    <p class="muted">Marca cada caso como pendiente, pasa, falla o bloqueado. Se guarda en este navegador.</p>
    <div id="qa-tests" class="qa-tests"></div>
    <form id="qa-add-form" class="tool-inline">
      <input id="qa-new-title" maxlength="120" placeholder="Nuevo caso de prueba…">
      <button class="small" type="submit">Añadir caso</button>
    </form>
    <div class="actions">
      <button class="small" type="button" id="qa-reset">Restablecer banco</button>
      <button class="small" type="button" id="qa-export">Exportar JSON</button>
    </div>
  </div>
  <div class="card">
    <h2>Entorno de prueba</h2>
    <pre class="tool-output" id="qa-env"></pre>
    <button class="small" type="button" id="qa-copy-env">Copiar entorno</button>
  </div>
</div>`;
		toolScript = '<script src="/qa-tools.js" defer></script>';
	}
	const body = `
${toolTabs(tool, user)}
<div class="card">
  <h1>${esc(config.title)}</h1>
  <p class="muted">${esc(config.intro)}</p>
  ${notice ? `<p class="msg ok">${esc(notice)}</p>` : ""}
  ${error ? `<p class="msg error">${esc(error)}</p>` : ""}
  <div class="actions">
    <a class="small primary-small" href="/reports">Enviar informe</a>
    <a class="small" href="/reports">Ver mis informes</a>
  </div>
</div>
${stats}
${designSwatches ? `<div class="card">${designSwatches}</div>` : ""}
${toolPanel}
<div class="grid">
  <div class="card">
    <h2>Checklist</h2>
    <ul class="tool-checklist">${checklist}</ul>
  </div>
  <div class="card">
    <h2>Últimos informes</h2>
    ${reportTable(reports.slice(0, 5))}
  </div>
</div>
${toolScript}`;
	return shell(`${config.title} · Herramientas`, body, { user, topbar: topbar(user), wide: true });
}

export function vaultPage({ user } = {}) {
	const body = `
<div class="card vault-shell" id="vault-app">
  <div class="vault-head">
    <div>
      <h1>Bóveda de contraseñas</h1>
      <p class="muted">Cifrada en tu navegador con AES-GCM. La contraseña maestra no se envía al servidor y no se guarda.</p>
    </div>
    <span class="vault-badge">Privada</span>
  </div>
  <p class="vault-warning">Si olvidas la contraseña maestra, no se puede recuperar. El servidor solo guarda datos cifrados.</p>
  <p class="muted" id="vault-loading">Cargando bóveda…</p>

  <section id="vault-setup" hidden>
    <h2>Crear bóveda</h2>
    <p class="muted">Elige una contraseña maestra larga y distinta de la de tu cuenta.</p>
    <div class="field-grid">
      <div>
        <label for="vault-new-password">Contraseña maestra</label>
        <input id="vault-new-password" type="password" minlength="12" autocomplete="new-password" placeholder="Mínimo 12 caracteres">
      </div>
      <div>
        <label for="vault-confirm-password">Repetir contraseña maestra</label>
        <input id="vault-confirm-password" type="password" minlength="12" autocomplete="new-password">
      </div>
    </div>
    <button class="primary" type="button" id="vault-setup-btn">Crear bóveda</button>
    <p class="msg error" id="vault-setup-error" hidden></p>
  </section>

  <section id="vault-unlock" hidden>
    <h2>Desbloquear</h2>
    <p class="muted">Introduce tu contraseña maestra para descifrar las entradas en este navegador.</p>
    <label for="vault-unlock-password">Contraseña maestra</label>
    <input id="vault-unlock-password" type="password" autocomplete="current-password" placeholder="Contraseña maestra">
    <button class="primary" type="button" id="vault-unlock-btn">Desbloquear</button>
    <p class="msg error" id="vault-unlock-error" hidden></p>
    <p class="hint"><a href="#" id="vault-reset-link">He olvidado la contraseña maestra</a></p>
  </section>

  <section id="vault-content" hidden>
    <div class="vault-toolbar">
      <input id="vault-search" type="search" placeholder="Buscar por título, usuario o web…" aria-label="Buscar en la bóveda">
      <button class="small primary-small" type="button" id="vault-add-btn">＋ Añadir</button>
      <button class="small" type="button" id="vault-lock-btn">Bloquear</button>
    </div>
    <div id="vault-list" class="vault-list"></div>
    <p class="empty" id="vault-empty" hidden>No hay entradas todavía. Añade la primera.</p>
  </section>
</div>

<dialog id="vault-dialog" class="chat-dialog vault-dialog">
  <form method="dialog">
    <button type="button" class="dialog-x" data-vault-close aria-label="Cerrar">×</button>
    <h2 id="vault-dialog-title">Nueva contraseña</h2>
    <input type="hidden" id="vault-entry-id">
    <div class="field-grid">
      <div>
        <label for="vault-entry-title">Título</label>
        <input id="vault-entry-title" maxlength="100" placeholder="Ej.: Correo personal" required>
      </div>
      <div>
        <label for="vault-entry-category">Categoría</label>
        <select id="vault-entry-category">
          <option value="general">General</option>
          <option value="email">Correo</option>
          <option value="social">Redes sociales</option>
          <option value="banking">Banca</option>
          <option value="work">Trabajo</option>
          <option value="other">Otra</option>
        </select>
      </div>
      <div>
        <label for="vault-entry-username">Usuario</label>
        <input id="vault-entry-username" maxlength="200" autocomplete="off">
      </div>
      <div>
        <label for="vault-entry-url">Web</label>
        <input id="vault-entry-url" maxlength="500" placeholder="https://…">
      </div>
    </div>
    <label for="vault-entry-password">Contraseña</label>
    <div class="vault-password-row">
      <input id="vault-entry-password" type="password" maxlength="500" autocomplete="new-password">
      <button class="small" type="button" id="vault-toggle-password">Ver</button>
      <button class="small" type="button" id="vault-generate-password">Generar</button>
    </div>
    <label for="vault-entry-notes">Notas</label>
    <textarea id="vault-entry-notes" maxlength="4000" style="min-height:70px"></textarea>
    <p class="msg error" id="vault-dialog-error" hidden></p>
    <div class="dialog-actions">
      <button class="small" type="button" data-vault-close>Cancelar</button>
      <button class="small primary-small" type="button" id="vault-save-entry">Guardar</button>
    </div>
  </form>
</dialog>
<p class="vault-toast" id="vault-toast" hidden></p>
<script src="/vault.js" defer></script>`;
	return shell("Bóveda · Proxy Web", body, {
		user, topbar: topbar(user),
		head: `<link rel="stylesheet" href="${asset("css/vault.css")}">`,
	});
}

export function adminLogsPage({ user, unit = "webproxy", lines = 200, output = "", error = "" } = {}) {
	const body = `
${adminTabs("system", user.role)}
<div class="card">
  <h1>Logs del sistema</h1>
  <p class="muted">Últimas líneas del servicio seleccionado. Solo lectura.</p>
  <form method="get" action="/admin/logs" class="filter">
    <select name="unit" aria-label="Servicio">
      <option value="webproxy"${unit === "webproxy" ? " selected" : ""}>webproxy</option>
      <option value="apache2"${unit === "apache2" ? " selected" : ""}>apache2</option>
    </select>
    <select name="lines" aria-label="Líneas">
      ${[100, 200, 500, 1000].map((n) => `<option value="${n}"${Number(lines) === n ? " selected" : ""}>${n} líneas</option>`).join("")}
    </select>
    <button class="small" type="submit">Actualizar</button>
  </form>
  ${error ? `<p class="msg error">${esc(error)}</p>` : ""}
  <pre class="panel" style="white-space:pre-wrap;max-height:70vh;overflow:auto">${esc(output || "Sin entradas.")}</pre>
</div>`;
	return shell("Logs · Administración", body, { user, topbar: topbar(user) });
}

export function schedulesPage({ user, jobs = [], notice = "", error = "" } = {}) {
	const now = Date.now();
	const rows = jobs
		.map((job) => {
			const start = new Date(job.start).getTime();
			const end = new Date(job.end).getTime();
			const status =
				now >= start && now < end ? "activo" : now < start ? "próximo" : "pasado";
			return `<tr>
      <td><strong>${esc(job.type === "quarantine" ? "Cuarentena" : "Mantenimiento")}</strong></td>
      <td class="mono">${esc(fmtDate(job.start))}</td>
      <td class="mono">${esc(fmtDate(job.end))}</td>
      <td><span class="badge${status === "activo" ? " current" : status === "pasado" ? " blocked" : ""}">${status}</span></td>
      <td>${esc(job.createdBy || "—")}</td>
      <td><form method="post" action="/api/admin/schedules/${esc(job.id)}/delete" onsubmit="return confirm('¿Eliminar esta programación?')">
        <button class="small danger" type="submit">Eliminar</button>
      </form></td>
    </tr>`;
		})
		.join("");
	const body = `
${adminTabs("settings", user.role)}
<div class="card">
  <h1>Programación</h1>
  <p class="muted">Activa mantenimiento o cuarentena automáticamente en una ventana de tiempo. La programación tiene prioridad sobre el botón manual.</p>
  ${notice ? `<p class="msg ok">${esc(notice)}</p>` : ""}
  ${error ? `<p class="msg error">${esc(error)}</p>` : ""}
  ${rows ? `<div class="scroll"><table><thead><tr><th>Tipo</th><th>Inicio</th><th>Fin</th><th>Estado</th><th>Creada por</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="empty">No hay programaciones.</p>'}
  <h2 style="margin-top:24px">Nueva programación</h2>
  <form method="post" action="/api/admin/schedules">
    <div class="field-grid">
      <div>
        <label for="schedule-type">Tipo</label>
        <select id="schedule-type" name="type">
          <option value="maintenance">Mantenimiento</option>
          <option value="quarantine">Cuarentena</option>
        </select>
      </div>
      <div>
        <label for="schedule-start">Inicio</label>
        <input id="schedule-start" name="start" type="datetime-local" required>
      </div>
      <div>
        <label for="schedule-end">Fin</label>
        <input id="schedule-end" name="end" type="datetime-local" required>
      </div>
    </div>
    <label for="schedule-message">Mensaje (opcional)</label>
    <textarea id="schedule-message" name="message" maxlength="300" style="min-height:60px"></textarea>
    <button class="primary" type="submit">Crear programación</button>
  </form>
</div>`;
	return shell("Programación · Administración", body, { user, topbar: topbar(user) });
}

export function templatesPage({
	user,
	blockTemplates = [],
	notesTemplates = [],
	notice = "",
	error = "",
} = {}) {
	const rows = (list, kind) =>
		list
			.map(
				(entry) => `<tr>
      <td><strong>${esc(entry.label)}</strong></td>
      <td>${esc(entry.text)}</td>
      <td><form method="post" action="/api/admin/templates/${esc(entry.id)}/delete" onsubmit="return confirm('¿Eliminar esta plantilla?')">
        <input type="hidden" name="kind" value="${kind}">
        <button class="small danger" type="submit">Eliminar</button>
      </form></td>
    </tr>`,
			)
			.join("");
	const body = `
${adminTabs("settings", user.role)}
<div class="card">
  <h1>Plantillas de mensajes</h1>
  <p class="muted">Mensajes reutilizables para bloqueos y notas internas.</p>
  ${notice ? `<p class="msg ok">${esc(notice)}</p>` : ""}
  ${error ? `<p class="msg error">${esc(error)}</p>` : ""}
  <h2>Bloqueos</h2>
  ${blockTemplates.length ? `<div class="scroll"><table><thead><tr><th>Nombre</th><th>Texto</th><th></th></tr></thead><tbody>${rows(blockTemplates, "block")}</tbody></table></div>` : '<p class="empty">No hay plantillas de bloqueo.</p>'}
  <h2 style="margin-top:24px">Notas internas</h2>
  ${notesTemplates.length ? `<div class="scroll"><table><thead><tr><th>Nombre</th><th>Texto</th><th></th></tr></thead><tbody>${rows(notesTemplates, "notes")}</tbody></table></div>` : '<p class="empty">No hay plantillas de notas.</p>'}
  <h2 style="margin-top:24px">Añadir plantilla</h2>
  <form method="post" action="/api/admin/templates">
    <div class="field-grid">
      <div>
        <label for="template-kind">Tipo</label>
        <select id="template-kind" name="kind">
          <option value="block">Bloqueo</option>
          <option value="notes">Nota interna</option>
        </select>
      </div>
      <div>
        <label for="template-label">Nombre</label>
        <input id="template-label" name="label" maxlength="60" required>
      </div>
    </div>
    <label for="template-text">Texto</label>
    <textarea id="template-text" name="text" maxlength="500" required></textarea>
    <button class="primary" type="submit">Crear plantilla</button>
  </form>
</div>`;
	return shell("Plantillas · Administración", body, { user, topbar: topbar(user) });
}

export function maintenancePage({ settings, user = null } = {}) {
	const body = `<div class="card login-card">
  <div class="login-logo">${LOGO}</div>
  <h1>En mantenimiento</h1>
  <p class="muted">${esc(settings.maintenanceMessage)}</p>
  ${
		user
			? `<form method="post" action="/logout"><button class="primary" type="submit">Cerrar sesión</button></form>`
			: '<a class="small" href="/login">Volver al login</a>'
	}
</div>`;
	return shell("En mantenimiento · Proxy Web", body);
}

export function quarantinePage({ settings, user = null } = {}) {
	const body = `<div class="card login-card">
  <div class="login-logo">${LOGO}</div>
  <h1>Cuarentena activa</h1>
  <p class="muted">${esc(settings.quarantineMessage)}</p>
  ${
		user
			? `<form method="post" action="/logout"><button class="primary" type="submit">Cerrar sesión</button></form>`
			: '<a class="small" href="/login">Volver al login</a>'
	}
</div>`;
	return shell("Cuarentena · Proxy Web", body);
}

export function blockedPage({ title = "Cuenta bloqueada", message = "", user = null } = {}) {
	const body = `<div class="card login-card">
  <div class="login-logo">${LOGO}</div>
  <h1>${esc(title)}</h1>
  <p class="muted">${esc(message || "Esta cuenta está bloqueada. Contacta con el administrador.")}</p>
  ${
		user
			? `<form method="post" action="/logout"><button class="primary" type="submit">Cerrar sesión</button></form>`
			: '<a class="small" href="/login">Volver al login</a>'
	}
</div>`;
	return shell(`${esc(title)} · Proxy Web`, body);
}
