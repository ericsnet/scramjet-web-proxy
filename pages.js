import { countOpenAlerts } from "./security.js";

export function esc(value) {
	return String(value ?? "")
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

const LOGO = `<svg viewBox="0 0 64 64" aria-hidden="true">
  <rect width="64" height="64" rx="16" fill="#0b1017"/>
  <path d="M14 19c7-3 13-2 18 2v26c-5-4-11-5-18-2z" fill="#3b82f6"/>
  <path d="M50 19c-7-3-13-2-18 2v26c5-4 11-5 18-2z" fill="#60a5fa"/>
  <path d="M32 21v26" stroke="#0b1017" stroke-width="3"/>
  <path d="M18 25c4-1 8-1 11 1" stroke="#0b1017" stroke-width="2" stroke-linecap="round" opacity=".55"/>
  <path d="M46 25c-4-1-8-1-11 1" stroke="#0b1017" stroke-width="2" stroke-linecap="round" opacity=".55"/>
</svg>`;

const CSS = `
:root {
  --bg:#0b0f14; --soft:#111821; --input:#151e29; --border:#243244;
  --text:#e6edf5; --muted:#8b9bb0; --accent:#3b82f6; --accent2:#1d4ed8;
  --error:#f87171; --ok:#4ade80;
}
*,*::before,*::after{box-sizing:border-box}
html,body{min-height:100%;margin:0}
body{
  font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;
  background:radial-gradient(900px 500px at 50% -10%,#16324f 0,transparent 60%),var(--bg);
  color:var(--text); display:flex; flex-direction:column; min-height:100vh;
}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
.topbar{
  display:flex;align-items:center;gap:14px;justify-content:flex-end;
  padding:14px 20px;border-bottom:1px solid var(--border);background:rgba(10,15,21,.7);
  font-size:14px;flex-wrap:wrap;
}
.topbar .brand{margin-right:auto;font-weight:700;letter-spacing:-.02em}
.topbar .brand span{color:var(--accent)}
.topbar .who{color:var(--muted)}
.inline{display:inline;margin:0}
.link{background:none;border:0;color:var(--accent);font:inherit;cursor:pointer;padding:0}
.link:hover{text-decoration:underline}
.wrap{width:min(860px,calc(100% - 32px));margin:40px auto 60px;flex:1}
.card{
  background:var(--soft);border:1px solid var(--border);border-radius:16px;
  padding:28px;box-shadow:0 18px 50px rgba(0,0,0,.25);
}
.card + .card{margin-top:22px}
h1{font-size:26px;letter-spacing:-.02em;margin:0 0 6px}
h2{font-size:17px;margin:0 0 14px}
p{line-height:1.6}
.muted{color:var(--muted);font-size:14px;margin:0 0 22px}
label{display:block;font-size:13px;color:var(--muted);margin:16px 0 7px}
input,select{
  width:100%;background:var(--input);border:1px solid var(--border);border-radius:10px;
  color:var(--text);font:inherit;font-size:15px;padding:11px 13px;outline:none;
}
input:focus,select:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(59,130,246,.16)}
button.primary{
  width:100%;margin-top:22px;background:var(--accent);color:#fff;border:0;border-radius:10px;
  font:inherit;font-weight:600;font-size:15px;padding:12px 16px;cursor:pointer;
}
button.primary:hover{background:var(--accent2)}
button.small{
  background:var(--input);color:var(--text);border:1px solid var(--border);border-radius:8px;
  font:inherit;font-size:13px;padding:7px 11px;cursor:pointer;white-space:nowrap;
}
a.small{
  display:inline-flex;align-items:center;background:var(--input);color:var(--text);
  border:1px solid var(--border);border-radius:8px;font-size:13px;padding:7px 11px;
  white-space:nowrap;text-decoration:none;
}
a.small:hover{text-decoration:none;border-color:#3b4d66}
button.small:hover{border-color:#3b4d66}
button.danger{color:#fecaca;border-color:#7f1d1d;background:#1f1113}
button.danger:hover{border-color:#b91c1c}
button:disabled{opacity:.45;cursor:not-allowed}
.msg{margin:18px 0 0;font-size:14px}
.msg.error{color:var(--error)}
.msg.ok{color:var(--ok)}
.hint{font-size:12.5px;color:#6f7f93;margin-top:10px}
.badge{display:inline-block;font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;
  border-radius:999px;padding:3px 9px;border:1px solid var(--border);color:var(--muted)}
.badge.admin{color:#bfdbfe;border-color:#1e40af;background:#101c33}
.badge.creator{color:#fde68a;border-color:#a16207;background:#271c06}
.badge.bot{color:#fbcfe8;border-color:#9d174d;background:#2a0d1a}
table{width:100%;border-collapse:collapse;font-size:14px}
th{color:var(--muted);font-weight:500;text-align:left;font-size:12px;text-transform:uppercase;
  letter-spacing:.06em;padding:0 10px 10px}
td{padding:12px 10px;border-top:1px solid var(--border);vertical-align:middle}
.actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.actions form{display:flex;gap:6px;align-items:center}
.actions input{width:150px;padding:7px 9px;font-size:13px}
.actions select{width:auto;padding:7px 9px;font-size:13px}
.pw-row{display:flex;gap:8px;align-items:center}
.pw-row input{flex:1;min-width:0}
.days{display:flex;gap:12px;flex-wrap:wrap;margin:10px 0}
.day{display:flex;align-items:center;gap:5px;font-size:13px;color:var(--muted);margin:0}
.day input{width:auto}
.scroll{overflow-x:auto}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}
.badge.blocked{color:#fecaca;border-color:#7f1d1d;background:#1f1113}
.user{border:1px solid var(--border);border-radius:12px;padding:14px;background:rgba(21,30,41,.5)}
.user + .user{margin-top:12px}
.user-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}
.user-head .meta{color:var(--muted);font-size:12.5px;margin-left:auto}
.user .actions input{width:160px}
.activity{list-style:none;margin:0;padding:0}
.activity li{display:flex;gap:14px;padding:11px 0;border-top:1px solid var(--border);font-size:14px;align-items:baseline}
.activity li:first-child{border-top:0}
.activity .when{color:var(--muted);font-size:12px;white-space:nowrap;font-variant-numeric:tabular-nums}
.activity .who{color:var(--accent);font-size:12.5px;font-weight:600;white-space:nowrap}
.activity .what{min-width:0;word-break:break-all}
.activity .query{color:var(--ok);font-size:12.5px;display:block}
.filter{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:18px}
.filter select{width:auto;min-width:180px}
.empty{color:var(--muted);padding:20px 0}
@media(max-width:640px){.grid{grid-template-columns:1fr}.wrap{margin-top:24px}.card{padding:20px}
  .activity li{flex-wrap:wrap;gap:4px}.user-head .meta{margin-left:0;width:100%}}
footer{padding:0 20px 22px;text-align:center;color:#5b6b80;font-size:12px}

/* ---- acabado visual ---- */
body{
  position:relative;overflow-x:hidden;
  background:var(--bg);
}
body::before{display:none}
.topbar,.wrap,footer{position:relative;z-index:1}
.topbar{
  background:var(--soft);
  border-bottom:1px solid var(--border);
  font-size:13.5px;
}
.topbar .brand{display:flex;align-items:center;gap:9px;font-size:15px;letter-spacing:-.02em}
.topbar .brand-icon{display:inline-flex;width:24px;height:24px;border-radius:6px;overflow:hidden}
.topbar .brand-icon svg{width:100%;height:100%;display:block}
.topbar a{color:var(--muted);transition:color .15s}
.topbar a:hover{color:var(--text);text-decoration:none}
.topbar .who{color:var(--muted)}
.topbar .link{color:var(--accent)}
.topbar .alert-count{display:inline-block;min-width:18px;padding:0 5px;margin-left:3px;border-radius:999px;
  background:#dc2626;color:#fff;font-size:10px;font-weight:700;line-height:18px;text-align:center;vertical-align:1px}
.card{
  background:var(--soft);
  border:1px solid var(--border);
  border-radius:14px;
  box-shadow:none;
}
h1{letter-spacing:-.03em}
.login-card{max-width:430px;margin:0 auto;text-align:center}
.login-card form{text-align:left}
.login-logo{width:58px;height:58px;margin:0 auto 16px;border-radius:14px;overflow:hidden;
  border:1px solid var(--border)}
.login-logo svg{display:block;width:100%;height:100%}
input,select{background:var(--input);transition:border-color .15s,box-shadow .15s}
input:focus,select:focus{box-shadow:0 0 0 3px rgba(59,130,246,.14)}
button.primary{
  background:var(--accent);
  transition:background .15s;
}
button.primary:hover{background:#2f6fdd}
button.small,a.small{background:var(--input);transition:border-color .15s}
button.small:hover,a.small:hover{border-color:var(--border-strong)}
.msg{padding:10px 13px;border-radius:8px;border:1px solid transparent}
.msg.error{background:rgba(248,113,113,.08);border-color:rgba(248,113,113,.25)}
.msg.ok{background:rgba(74,222,128,.07);border-color:rgba(74,222,128,.22)}
.user{background:var(--soft);transition:border-color .15s}
.user:hover{border-color:var(--border-strong)}
.badge.admin{box-shadow:none}
a{color:var(--accent-2)}
footer{color:var(--dim)}
@media(prefers-reduced-motion:reduce){button.primary,.user{transition:none}}

/* ---- paneles nuevos ---- */
.tabs{display:flex;gap:5px;flex-wrap:wrap;margin:0 0 20px;padding:6px;border:1px solid var(--border);
  border-radius:14px;background:rgba(17,25,35,.55);backdrop-filter:blur(10px)}
.tabs a{padding:8px 13px;border-radius:9px;color:var(--muted);font-size:13px;text-decoration:none;
  transition:background .15s,color .15s}
.tabs a:hover{color:var(--text);background:rgba(59,130,246,.08)}
.tabs a.active{color:#fff;background:linear-gradient(180deg,#3b82f6,#2563eb);
  box-shadow:0 8px 18px -10px rgba(37,99,235,.9)}
textarea{width:100%;background:linear-gradient(180deg,#141e29,#111923);border:1px solid var(--border);
  border-radius:10px;color:var(--text);font:inherit;font-size:14px;padding:10px 12px;outline:none;
  resize:vertical;min-height:80px}
textarea:focus{border-color:var(--accent);box-shadow:0 0 0 4px rgba(59,130,246,.13)}
.check{display:flex;align-items:center;gap:9px;margin:14px 0;color:var(--muted);font-size:14px}
.check input{width:16px;height:16px;accent-color:var(--accent)}
.field-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}
.mono{font-family:"JetBrains Mono",monospace;font-size:11.5px;color:#94a9c1}
.warn{margin:14px 0;padding:11px 13px;border-radius:10px;border:1px solid rgba(251,191,36,.25);
  background:rgba(251,191,36,.07);color:#fcd34d;font-size:13px}
.user-stats{display:flex;gap:16px;flex-wrap:wrap;color:var(--muted);font-size:12.5px;margin:2px 0 12px}
.user-stats b{color:var(--text);font-weight:600}
.admin-user{padding:0;overflow:hidden}
.admin-user > .user-summary{display:flex;align-items:center;gap:10px;flex-wrap:wrap;
  padding:12px 14px;cursor:pointer;list-style:none;user-select:none}
.admin-user > .user-summary::-webkit-details-marker{display:none}
.admin-user > .user-summary:hover{background:rgba(59,130,246,.055)}
.admin-user[open] > .user-summary{border-bottom:1px solid var(--border);background:rgba(59,130,246,.04)}
.user-summary-main{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
.user-name{font-weight:650;letter-spacing:-.01em}
.user-summary-meta{margin-left:auto;display:flex;align-items:center;gap:13px;flex-wrap:wrap;
  color:var(--muted);font-size:12px}
.user-summary-meta b{color:var(--text);font-weight:600}
.user-chevron{color:var(--muted);font-size:12px;line-height:1;transition:transform .15s}
.admin-user[open] .user-chevron{transform:rotate(180deg)}
.protected-user{border-color:#6b5312;background:linear-gradient(90deg,rgba(161,98,7,.12),rgba(21,30,41,.5) 60%)}
.protected-user .user-summary{cursor:default}
.protected-user .user-summary:hover{background:transparent}
.user-body{padding:0 14px 14px}
.user-body .user-stats{margin-top:12px}
.user-extra{margin-top:14px;padding-top:14px;border-top:1px solid var(--border)}
@media(max-width:640px){
  .user-summary-meta{order:3;margin-left:0;width:100%;gap:10px}
  .user-chevron{order:2;margin-left:auto}
}
details.more{margin-top:12px;border-top:1px solid var(--border);padding-top:10px}
details.more summary{cursor:pointer;color:var(--accent-2,#60a5fa);font-size:13px}
details.more[open] summary{margin-bottom:10px}
.link-row{display:grid;grid-template-columns:1fr 1.5fr auto;gap:8px;align-items:center;margin-bottom:8px}
.link-row input{padding:8px 10px;font-size:13px}
.session-list{list-style:none;margin:0;padding:0}
.session-list li{display:flex;gap:14px;align-items:center;justify-content:space-between;
  padding:12px 0;border-top:1px solid var(--border);flex-wrap:wrap}
.session-list li:first-child{border-top:0}
.session-list .info{min-width:0;flex:1}
.session-list .meta{color:var(--muted);font-size:12px;margin-top:3px;display:flex;gap:12px;flex-wrap:wrap}
.badge.current{color:#bbf7d0;border-color:#166534;background:#0d1f14}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px}
.stat{border:1px solid var(--border);border-radius:14px;padding:14px 16px;
  background:linear-gradient(180deg,rgba(21,30,41,.6),rgba(13,20,28,.6))}
.stat .k{color:var(--muted);font-size:11.5px;text-transform:uppercase;letter-spacing:.07em}
.stat .v{font-size:21px;font-weight:700;letter-spacing:-.02em;margin-top:5px}
.stat .v small{font-size:12px;font-weight:500;color:var(--muted);letter-spacing:0}
pre.panel{background:#080d13;border:1px solid var(--border);border-radius:10px;padding:12px;
  overflow:auto;font-family:"JetBrains Mono",monospace;font-size:11.5px;color:#93a7bd;max-height:260px}
.section{margin-top:26px;padding-top:4px}
.section h3{font-size:13px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);
  margin:0 0 6px;font-weight:600}
.chat-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px}
.chat-toolbar .chat-online{color:var(--muted);font-size:12.5px;display:inline-flex;align-items:center;gap:7px}
.chat-online::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--ok);box-shadow:0 0 0 3px rgba(74,222,128,.12)}
.chat-box{display:flex;flex-direction:column;border:1px solid var(--border);border-radius:14px;
  background:linear-gradient(180deg,rgba(21,30,41,.65),rgba(13,20,28,.65));overflow:hidden}
.chat-messages{height:min(58vh,560px);min-height:220px;overflow-y:auto;padding:12px 14px;scroll-behavior:smooth;
  display:flex;flex-direction:column;gap:8px}
.chat-message{display:flex;justify-content:flex-start;padding:0;border:0;background:none!important}
.chat-message.own{justify-content:flex-end}
.chat-bubble{max-width:min(80%,560px);min-width:110px;padding:8px 11px 9px;border-radius:14px 14px 14px 4px;
  background:linear-gradient(180deg,#182433,#121b27);border:1px solid var(--border);
  box-shadow:0 4px 14px rgba(0,0,0,.16)}
.chat-message.own .chat-bubble{border-radius:14px 14px 4px 14px;border-color:#2b5bd7;
  background:linear-gradient(180deg,#1d4ed8,#1e40af);box-shadow:0 6px 18px rgba(29,78,216,.24)}
.chat-meta{display:flex;align-items:center;gap:7px;flex-wrap:wrap;font-size:11px;color:var(--muted)}
.chat-author{color:var(--text);font-size:12.5px;font-weight:600}
.chat-meta time{font-variant-numeric:tabular-nums;font-size:10.5px}
.chat-message.own .chat-meta{color:rgba(255,255,255,.72)}
.chat-delete{margin-left:auto;font-size:10.5px;color:#fca5a5!important}
.chat-message.own .chat-delete{color:#fecaca!important}
.chat-text{margin:5px 0 0;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.5;font-size:14.5px;color:var(--text)}
.chat-message.own .chat-text{color:#fff}
.chat-empty{color:var(--muted);text-align:center;padding:52px 18px;font-size:14px;margin:auto}
.chat-form{display:flex;gap:10px;align-items:flex-end;margin-top:14px}
.chat-form textarea{flex:1;min-height:54px;max-height:150px;resize:vertical;margin:0}
.chat-form button.primary{width:auto;margin:0;padding:12px 20px;flex:0 0 auto}
.chat-counter{font-size:11.5px;color:var(--muted);text-align:right;margin-top:5px}
.chat-disabled{text-align:center;padding:34px 10px}
.chat-fab{position:fixed;right:20px;bottom:calc(20px + env(safe-area-inset-bottom,0px));z-index:80;
  width:54px;height:54px;border-radius:50%;display:flex;align-items:center;justify-content:center;
  background:linear-gradient(180deg,#3b82f6,#2563eb);color:#fff;text-decoration:none;
  border:1px solid rgba(255,255,255,.2);box-shadow:0 16px 32px -10px rgba(37,99,235,.85),0 5px 14px rgba(0,0,0,.35);
  transition:transform .15s,background .15s}
.chat-fab svg{width:26px;height:26px;display:block}
.chat-fab:hover{background:#2f6fdd;text-decoration:none;transform:translateY(-2px)}
.chat-fab:focus-visible{outline:3px solid rgba(96,165,250,.55);outline-offset:3px}
.chat-fab-badge{position:absolute;top:-5px;right:-5px;min-width:21px;height:21px;padding:0 5px;
  border-radius:999px;background:#ef4444;color:#fff;font-size:11px;font-weight:700;line-height:21px;
  text-align:center;border:2px solid var(--bg);box-shadow:0 2px 8px rgba(0,0,0,.4)}
.chat-toast-stack{position:fixed;left:18px;bottom:calc(18px + env(safe-area-inset-bottom,0px));z-index:90;
  display:flex;flex-direction:column;gap:9px;width:min(340px,calc(100vw - 36px));pointer-events:none}
.chat-toast{pointer-events:auto;background:var(--soft);border:1px solid var(--border);border-left:3px solid var(--accent);
  border-radius:12px;padding:11px 12px;box-shadow:0 14px 32px rgba(0,0,0,.4);font-size:13px;
  display:grid;grid-template-columns:1fr auto;gap:3px 10px}
.chat-toast strong{font-size:13px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.chat-toast span{grid-column:1;color:var(--muted);line-height:1.45;overflow-wrap:anywhere}
.chat-toast a{grid-column:1;font-size:12px;color:var(--accent-2,#60a5fa);width:max-content}
.chat-toast-close{grid-column:2;grid-row:1;background:none;border:0;color:var(--muted);font-size:18px;
  line-height:1;cursor:pointer;padding:0 2px}
.chat-toast.unread{border-left-color:#f59e0b}
@media(max-width:640px){.chat-toast-stack{left:10px;bottom:calc(10px + env(safe-area-inset-bottom,0px));width:calc(100vw - 20px)}}
@media(max-width:640px){.chat-fab{right:14px;width:50px;height:50px}
  .chat-fab svg{width:24px;height:24px}}
@media(max-width:640px){.chat-messages{height:58vh}.chat-form{flex-direction:column;align-items:stretch}
  .chat-form button.primary{width:100%}}
@media(max-width:640px){.field-grid{grid-template-columns:1fr}.link-row{grid-template-columns:1fr}
  .tabs a{font-size:12px;padding:7px 10px}}
`;

function shell(title, body, { topbar = "", chatFab = true } = {}) {
	return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<script src="/page-i18n.js" defer></script>
<style>${CSS}</style>
</head>
<body>
${topbar}
<main class="wrap">${body}</main>
<footer>Proxy Web</footer>
${topbar && chatFab ? '<a class="chat-fab" href="/chat" aria-label="Abrir chat" title="Abrir chat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.4 8.9 8.9 0 0 1-3.6-.8L3 21l1.9-5.2A8.4 8.4 0 1 1 21 11.5Z"/></svg></a><script src="/chat-notify.js" defer></script>' : ""}
</body>
</html>`;
}

function topbar(user) {
	const staff = ["admin", "creator", "moderator"].includes(user?.role);
	const admin = staff ? '<a href="/admin">Administración</a>' : "";
	const alertCount = ["admin", "creator"].includes(user?.role) ? countOpenAlerts() : 0;
	const security = ["admin", "creator"].includes(user?.role)
		? `<a href="/admin/security">Seguridad${alertCount ? ` <span class="alert-count">${alertCount}</span>` : ""}</a>`
		: "";
	return `<header class="topbar">
  <div class="brand"><span class="brand-icon">${LOGO}</span>Proxy <span>Web</span></div>
  <a href="/">Proxy</a>
  <a href="/chat">Chat</a>
  <a href="/bookmarks">Favoritos</a>
  <a href="/history">Historial</a>
  <a href="/account">Mi cuenta</a>
  ${security}
  ${admin}
  <span class="who">${esc(user?.username || "")} · ${roleLabel(user?.role)}</span>
  <form method="post" action="/logout" class="inline"><button class="link" type="submit">Salir</button></form>
</header>`;
}

function roleLabel(role) {
	if (role === "creator") return "creador";
	if (role === "admin") return "administrador";
	if (role === "moderator") return "moderador";
	return "usuario";
}

const ADMIN_TABS = [
	["users", "/admin", "Usuarios"],
	["sessions", "/admin/sessions", "Sesiones"],
	["security", "/admin/security", "Seguridad"],
	["activity", "/admin/activity", "Actividad"],
	["audit", "/admin/audit", "Auditoría"],
	["requests", "/admin/requests", "Solicitudes"],
	["stats", "/admin/stats", "Estadísticas"],
	["settings", "/admin/settings", "Ajustes"],
	["system", "/admin/system", "Sistema"],
];

function adminTabs(active, role = "admin") {
	const visible = ["admin", "creator"].includes(role)
		? ADMIN_TABS
		: ADMIN_TABS.filter(([key]) => !["settings", "system", "security"].includes(key));
	const links = visible
		.map(
			([key, href, label]) =>
				`<a href="${href}"${key === active ? ' class="active"' : ""}>${label}</a>`,
		)
		.join("");
	return `<nav class="tabs">${links}</nav>`;
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

export function loginPage({ next = "/", error = "", maintenance = "" } = {}) {
	const body = `<div class="card login-card">
  <div class="login-logo">${LOGO}</div>
  <h1>Proxy <span style="color:var(--accent)">Web</span></h1>
  <p class="muted">Acceso privado. Identifícate para usar el proxy.</p>
  ${maintenance ? `<p class="warn">${esc(maintenance)}</p>` : ""}
  <form method="post" action="/api/login">
    <input type="hidden" name="next" value="${esc(next)}">
    <label for="username">Usuario</label>
    <input id="username" name="username" autocomplete="username" required autofocus>
    <label for="password">Contraseña</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required>
    <button class="primary" type="submit">Entrar</button>
  </form>
  ${error ? `<p class="msg error">${esc(error)}</p>` : ""}
</div>`;
	return shell("Entrar · Proxy Web", body);
}

export function accountPage({
	user,
	sessions = [],
	currentId = "",
	allowPasswordChange = true,
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
  <h1>Mi cuenta</h1>
  <p class="muted">
    Usuario <strong>${esc(user.username)}</strong> ·
    ${roleLabel(user.role)}
  </p>
  <p class="muted">
    <a href="/bookmarks">Favoritos</a> · <a href="/history">Historial</a>
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
  <p class="hint">El administrador puede ver las direcciones y búsquedas que realices con el proxy.</p>
  ${notice ? `<p class="msg ok">${esc(notice)}</p>` : ""}
  ${error ? `<p class="msg error">${esc(error)}</p>` : ""}
</div>

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
	return shell("Mi cuenta · Proxy Web", body, { topbar: topbar(user) });
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
	return shell("Favoritos · Proxy Web", body, { topbar: topbar(user) });
}

export function historyPage({
	user,
	activity = [],
	total = 0,
	page = 1,
	pages = 1,
	search = "",
	canClear = false,
	notice = "",
} = {}) {
	const items = activity
		.map(
			(e) => `<li>
  <span class="when">${esc(fmtDate(e.at))}</span>
  <span class="what">
    ${e.query ? `<span class="query">Búsqueda: ${esc(e.query)}</span>` : ""}
    ${e.url ? `<span class="url">${esc(e.url)}</span>` : ""}
  </span>
</li>`,
		)
		.join("");
	const query = search ? `&q=${encodeURIComponent(search)}` : "";
	const body = `
<div class="card">
  <h1>Mi historial</h1>
  <p class="muted">Direcciones y búsquedas que has introducido. Total: ${esc(total)}.</p>
  <form method="get" action="/history" class="filter">
    <input name="q" value="${esc(search)}" placeholder="Buscar en el historial" aria-label="Buscar">
    <button class="small" type="submit">Buscar</button>
    ${search ? '<a href="/history">Quitar búsqueda</a>' : ""}
  </form>
  ${
		canClear
			? `<form method="post" action="/api/account/history/clear" onsubmit="return confirm('¿Vaciar tu historial?')" style="margin-bottom:16px">
      <button class="small danger" type="submit">Vaciar historial</button>
    </form>`
			: ""
	}
  ${notice ? `<p class="msg ok">${esc(notice)}</p>` : ""}
  ${items ? `<ul class="activity">${items}</ul>` : '<p class="empty">No hay resultados.</p>'}
  ${
		pages > 1
			? `<div class="filter" style="margin-top:16px">
    ${page > 1 ? `<a class="small" href="/history?page=${page - 1}${query}">Anterior</a>` : ""}
    <span class="muted">Página ${page} de ${pages}</span>
    ${page < pages ? `<a class="small" href="/history?page=${page + 1}${query}">Siguiente</a>` : ""}
  </div>`
			: ""
	}
</div>`;
	return shell("Historial · Proxy Web", body, { topbar: topbar(user) });
}

export function chatPage({
	user,
	settings,
	messages = [],
	latestSeq = 0,
	generation = 1,
	online = 0,
	canModerate = false,
	notice = "",
	error = "",
} = {}) {
	const current = String(user?.username || "");
	const enabled = !!settings.chatEnabled;
	const allowDelete = !!settings.chatAllowUserDelete;
	const rows = messages
		.map((m) => {
			const role = String(m.role || "user");
			const own = String(m.username).toLowerCase() === current.toLowerCase();
			const canDelete =
				enabled && (canModerate || (allowDelete && own));
			const roleBadge =
				role === "creator"
					? '<span class="badge creator">creador</span>'
					: role === "admin"
						? '<span class="badge admin">admin</span>'
						: role === "moderator"
							? '<span class="badge">moderador</span>'
							: "";
			return `<article class="chat-message${own ? " own" : ""}" data-chat-message data-chat-id="${esc(m.id)}" data-chat-seq="${esc(m.seq)}">
  <div class="chat-bubble">
    <div class="chat-meta">
      ${own ? "" : `<span class="chat-author">${esc(m.username)}</span>`}
      ${roleBadge}
      <time datetime="${esc(m.at)}">${esc(fmtChatDate(m.at, settings.timezone))}</time>
      ${canDelete ? `<button class="link chat-delete" type="button" data-chat-delete="${esc(m.id)}">Eliminar</button>` : ""}
    </div>
    <p class="chat-text">${esc(m.text)}</p>
  </div>
</article>`;
		})
		.join("");

	const body = `
<div class="card">
  <h1>${esc(settings.chatTitle || "Chat de usuarios")}</h1>
  <p class="muted">${esc(settings.chatWelcome || "")}</p>
  ${
		enabled
			? `
  <div class="chat-toolbar">
    <span class="muted" style="margin:0">Chat privado entre usuarios del proxy.</span>
    ${
			settings.chatShowOnline
				? `<span class="chat-online" id="chat-online">${esc(online)} conectado${online === 1 ? "" : "s"}</span>`
				: ""
		}
  </div>
  ${notice ? `<p class="msg ok">${esc(notice)}</p>` : ""}
  ${error ? `<p class="msg error">${esc(error)}</p>` : ""}
  <p class="msg error" id="chat-error" hidden></p>
  <div class="chat-box">
    <div class="chat-messages" id="chat-messages"
      data-last-seq="${esc(latestSeq)}"
      data-generation="${esc(generation)}"
      data-current-user="${esc(current)}"
      data-max-length="${esc(settings.chatMaxLength)}"
      data-can-moderate="${canModerate ? "1" : "0"}"
      data-allow-delete="${allowDelete ? "1" : "0"}">
      ${rows || '<p class="chat-empty" id="chat-empty">Todavía no hay mensajes. Escribe el primero.</p>'}
    </div>
    <form method="post" action="/api/chat/messages" class="chat-form" id="chat-form" autocomplete="off">
      <div style="flex:1">
        <textarea id="chat-input" name="text" maxlength="${esc(settings.chatMaxLength)}" required
          placeholder="Escribe un mensaje…" aria-label="Mensaje"></textarea>
        <div class="chat-counter"><span id="chat-counter">0</span>/${esc(settings.chatMaxLength)}</div>
      </div>
      <button class="primary" type="submit" id="chat-send">Enviar</button>
    </form>
  </div>
  <script src="/chat.js" defer></script>`
			: `<div class="chat-disabled">
    <p class="muted">El chat está desactivado por la administración.</p>
    ${["admin", "creator"].includes(user?.role) ? '<a class="small" href="/admin/settings">Activar en Ajustes</a>' : '<a class="small" href="/">Volver al proxy</a>'}
  </div>`
	}
</div>`;
	return shell(`${settings.chatTitle || "Chat"} · Proxy Web`, body, { topbar: topbar(user), chatFab: false });
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
		{ topbar: topbar(user) },
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
		{ topbar: topbar(user) },
	);
}

export function adminPage({
	user,
	users,
	counts = {},
	canManage = false,
	quarantine = false,
	quarantineAttempts = [],
	security = {},
	notice = "",
	error = "",
} = {}) {
	const dayLabels = [
		[0, "D"],
		[1, "L"],
		[2, "M"],
		[3, "X"],
		[4, "J"],
		[5, "V"],
		[6, "S"],
	];
	const quarantineRows = quarantineAttempts
		.map(
			(e) => `<tr>
  <td class="mono">${esc(fmtDate(e.at))}</td>
  <td><strong>${esc(e.actor)}</strong></td>
  <td class="mono">${esc(e.target || "—")}</td>
  <td>${esc(e.detail || "")}</td>
  <td class="mono">${esc(e.ip || "—")}</td>
  <td>${esc((e.userAgent || "").slice(0, 50))}</td>
</tr>`,
		)
		.join("");
	const cards = users
		.map((u) => {
			const self = u.username.toLowerCase() === user.username.toLowerCase();
			const visits = counts[u.username] || 0;
			const tempBlocked = !!u.blockedUntil;
			if (u.role === "creator") {
				return `<div class="user admin-user protected-user">
  <div class="user-summary">
    <span class="user-summary-main">
      <strong class="user-name">${esc(u.username)}</strong>
      <span class="badge creator">creador</span>
      ${self ? '<span class="badge">tú</span>' : ""}
    </span>
    <span class="user-summary-meta">Cuenta protegida · solo el creador puede usar su cuenta</span>
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
			const roleForm = `<form method="post" action="/api/admin/users/${encodeURIComponent(u.username)}/role">
        <select name="role" aria-label="Rol de ${esc(u.username)}">
          <option value="user"${u.role === "user" ? " selected" : ""}>usuario</option>
          <option value="moderator"${u.role === "moderator" ? " selected" : ""}>moderador</option>
          <option value="admin"${u.role === "admin" ? " selected" : ""}>admin</option>
        </select>
        <button class="small" type="submit">Guardar rol</button>
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
      ${tempForm}
      ${deleteForm}
    </div>
    <form method="post" action="/api/admin/users/${encodeURIComponent(u.username)}/block-message" style="margin-top:12px">
      <label for="blockmsg-${esc(u.username)}">Mensaje de bloqueo</label>
      <textarea id="blockmsg-${esc(u.username)}" name="message" maxlength="500" placeholder="Se mostrará al usuario cuando intente entrar bloqueado">${esc(u.blockMessage || "")}</textarea>
      <button class="small" type="submit" style="margin-top:8px">Guardar mensaje</button>
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
      <strong class="user-name">${esc(u.username)}</strong>
      <span class="badge${u.role === "admin" ? " admin" : u.role === "creator" ? " creator" : ""}">${esc(roleLabel(u.role))}</span>
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
  <div class="actions">
    <a class="small" href="/admin/activity?user=${encodeURIComponent(u.username)}">Ver actividad</a>
    <a class="small" href="/admin/sessions?user=${encodeURIComponent(u.username)}">Ver sesiones</a>
    ${
			u.sessionCount
				? `<form method="post" action="/api/admin/users/${encodeURIComponent(u.username)}/logout" onsubmit="return confirm('¿Cerrar todas las sesiones de ${esc(u.username)}?')">
      <button class="small" type="submit"${self ? " disabled title='Usa Salir para cerrar tu propia sesión'" : ""}>Forzar logout</button>
    </form>`
				: ""
		}
    ${blockForm}
  </div>
  ${details}
  </div>
</details>`;
		})
		.join("\n");

	const body = `
${adminTabs("users", user.role)}
${
	user.role === "admin" || user.role === "creator"
		? `<div class="card" style="margin-bottom:22px">
  <h2>Escáner de seguridad</h2>
  <p class="muted" style="margin-bottom:10px">
    ${security.open ? `${security.open} alerta${security.open === 1 ? "" : "s"} abierta${security.open === 1 ? "" : "s"} · ${security.bots} con comportamiento de bot · ${security.banned} IP${security.banned === 1 ? "" : "s"} baneada${security.banned === 1 ? "" : "s"}.` : "Sin alertas abiertas. El escáner sigue observando patrones sospechosos y comportamiento automatizado."}
  </p>
  <a class="small" href="/admin/security">Abrir escáner</a>
</div>`
		: ""
}
${
	canManage
		? `<div class="card" style="border-color:${quarantine ? "#7f1d1d" : "var(--border)"}">
  <h2>Modo cuarentena</h2>
  <p class="muted">
    ${quarantine ? "ACTIVO: se rechazan nuevas peticiones de webs y se han cerrado las conexiones de usuarios." : "Desactivado. Al activarlo se rechazan nuevas webs y se cierran las conexiones abiertas de usuarios al instante."}
  </p>
  <form method="post" action="/api/admin/quarantine">
    <input type="hidden" name="enabled" value="${quarantine ? "0" : "1"}">
    <input type="hidden" name="next" value="/admin">
    <button class="${quarantine ? "small" : "small danger"}" type="submit">${quarantine ? "Desactivar cuarentena" : "Activar cuarentena ahora"}</button>
  </form>
</div>`
		: ""
}
<div class="card">
  <h2>Intentos durante la cuarentena</h2>
  <p class="muted">Peticiones rechazadas mientras la cuarentena estaba activa. Se muestran las últimas 20 (con límite anti-flood) y se eliminan automáticamente 10 minutos después de la primera vista.</p>
  ${
		quarantineRows
			? `<div class="scroll"><table>
    <thead><tr><th>Fecha</th><th>Usuario</th><th>Destino</th><th>Detalle</th><th>IP</th><th>Navegador</th></tr></thead>
    <tbody>${quarantineRows}</tbody>
  </table></div>`
			: '<p class="empty">No hay intentos registrados.</p>'
	}
</div>
<div class="card">
  <h1>Usuarios</h1>
  <p class="muted">
    ${canManage ? "Gestiona usuarios, contraseñas, roles, bloqueos, sitios y horarios." : "Puedes consultar usuarios, actividad y sesiones, y bloquear cuentas."}
    <a href="/admin/activity">Ver toda la actividad</a>.
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
    <label for="new-role">Rol</label>
    <select id="new-role" name="role">
      <option value="user">usuario normal</option>
      <option value="moderator">moderador</option>
      <option value="admin">administrador</option>
    </select>
    <button class="primary" type="submit">Crear usuario</button>
  </form>
  <p class="hint">Las contraseñas se guardan con hash scrypt: no se pueden ver, solo cambiar.</p>`
			: ""
	}
  ${notice ? `<p class="msg ok">${esc(notice)}</p>` : ""}
  ${error ? `<p class="msg error">${esc(error)}</p>` : ""}
</div>

<div class="card">
  <h2>Usuarios (${users.length})</h2>
  <p class="muted">Vista compacta. Pulsa un usuario para desplegar toda su información y sus acciones.</p>
  ${cards}
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
</script>`;
	return shell("Usuarios · Administración", body, { topbar: topbar(user) });
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
		.map(
			(e) => `<li>
  <span class="when">${esc(fmtDate(e.at))}</span>
  ${filter ? "" : `<span class="who">${esc(e.username)}</span>`}
  <span class="what">
    ${e.query ? `<span class="query">Búsqueda: ${esc(e.query)}</span>` : ""}
    ${e.url ? `<span class="url">${esc(e.url)}</span>` : ""}
  </span>
</li>`,
		)
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
  ${
		items
			? `<ul class="activity">${items}</ul>`
			: '<p class="empty">Todavía no hay actividad registrada.</p>'
	}
</div>`;
	return shell("Actividad · Administración", body, { topbar: topbar(user) });
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
	return shell("Sesiones · Administración", body, { topbar: topbar(user) });
}

export function securityPage({
	user,
	alerts = [],
	bans = [],
	summary = {},
	currentIp = "",
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
				a.kind === "account_swap"
					? "cuentas"
					: a.kind === "bot"
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
  <td><strong class="mono">${esc(a.ip)}</strong>${a.banned ? '<br><span class="badge blocked">baneada</span>' : ""}<br><span class="muted">${esc(a.username || "sin sesión")}</span></td>
  <td><strong>${esc(a.score)}</strong><br><span class="muted">${esc(a.count)} eventos</span></td>
  <td>${reasons || "—"}</td>
  <td class="mono">${esc(a.lastMethod || "")} ${esc(a.lastPath || "")}<br><span class="muted">${esc(a.userAgent || "sin user-agent")}</span></td>
  <td><div class="actions">
    ${
			a.status === "open"
				? `<form method="post" action="/api/admin/security/dismiss">
      <input type="hidden" name="id" value="${esc(a.id)}">
      <button class="small" type="submit">Descartar</button>
    </form>`
				: '<span class="muted">descartada</span>'
		}
    ${
			a.banned
				? `<form method="post" action="/api/admin/security/unban" onsubmit="return confirm('¿Quitar el bloqueo de esta IP?')">
      <input type="hidden" name="ip" value="${esc(a.ip)}">
      <button class="small" type="submit">Desbanear</button>
    </form>`
				: `<form method="post" action="/api/admin/security/ban" onsubmit="return confirm('¿Banear esta IP? El usuario no podrá acceder hasta que la desbanees.')">
      <input type="hidden" name="ip" value="${esc(a.ip)}">
      <input type="hidden" name="alert" value="${esc(a.id)}">
      <input type="hidden" name="kind" value="${kind === "bot" ? "bot" : "hack"}">
      <input name="reason" maxlength="200" placeholder="Motivo (opcional)" aria-label="Motivo del baneo">
      <button class="small danger" type="submit"${a.ip === currentIp ? " disabled" : ""}>Banear IP</button>
    </form>`
		}
  </div></td>
</tr>`;
		})
		.join("");
	const banRows = bans
		.map(
			(b) => `<tr>
  <td class="mono">${esc(b.ip)}</td>
  <td><span class="badge ${b.kind === "bot" ? "bot" : "blocked"}">${b.kind === "bot" ? "bot" : b.kind === "hack" ? "hacking" : "manual"}</span></td>
  <td>${esc(b.by || "—")}</td>
  <td>${esc(b.reason || "—")}</td>
  <td class="mono">${esc(fmtDate(b.at))}</td>
  <td><form method="post" action="/api/admin/security/unban" onsubmit="return confirm('¿Quitar el bloqueo de esta IP?')">
    <input type="hidden" name="ip" value="${esc(b.ip)}">
    <button class="small" type="submit">Desbanear</button>
  </form></td>
</tr>`,
		)
		.join("");
	const body = `
${adminTabs("security", user.role)}
<div class="stats">
  <div class="stat"><div class="k">Alertas abiertas</div><div class="v">${esc(summary.open || 0)}</div></div>
  <div class="stat"><div class="k">Bots detectados</div><div class="v">${esc(summary.bots || 0)}</div></div>
  <div class="stat"><div class="k">IPs baneadas</div><div class="v">${esc(summary.banned || 0)}</div></div>
  <div class="stat"><div class="k">Últimas 24 h</div><div class="v">${esc(summary.last24h || 0)}</div></div>
</div>
<div class="card">
  <h1>Escáner de seguridad</h1>
  <p class="muted">
    El escáner observa peticiones y comportamiento: rutas de escaneo, intentos de inyección, accesos no autorizados,
    enumeración de API, ráfagas, intervalos automatizados y user-agents de bot. No bloquea automáticamente:
    decide tú si baneas una IP.
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
  <h2>IPs baneadas (${bans.length})</h2>
  ${banRows ? `<div class="scroll"><table><thead><tr><th>IP</th><th>Tipo</th><th>Por</th><th>Motivo</th><th>Fecha</th><th></th></tr></thead><tbody>${banRows}</tbody></table></div>` : '<p class="empty">No hay IPs baneadas.</p>'}
</div>`;
	return shell("Seguridad · Administración", body, { topbar: topbar(user) });
}

export function settingsPage({ user, settings, notice = "", error = "" } = {}) {
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
  <p class="hint">Se guardan solo al pulsar “Guardar ajustes”. Si otra pestaña ha cambiado los ajustes, se mostrará un aviso en vez de sobrescribirlos.</p>

  <div class="section">
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
        <label for="maxLoginAttempts">Intentos de login antes de bloquear</label>
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
  </div>

  <div class="section">
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

  <div class="section">
    <h3>Chat de usuarios</h3>
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
    </div>
    <label for="chatWelcome">Mensaje de bienvenida</label>
    <textarea id="chatWelcome" name="chatWelcome" maxlength="200" style="min-height:60px">${esc(settings.chatWelcome || "")}</textarea>
    <p class="hint">Los mensajes son texto plano: no se interpreta HTML ni Markdown. Los administradores y moderadores pueden borrar cualquier mensaje desde el chat.</p>
    <button class="small danger" type="submit" formaction="/api/admin/chat/clear" formmethod="post" onclick="return confirm('¿Vaciar todo el chat? Esta acción no se puede deshacer.')">Vaciar chat</button>
  </div>

  <div class="section">
    <h3>Mantenimiento</h3>
    <label class="check"><input type="checkbox" name="maintenanceMode"${settings.maintenanceMode ? " checked" : ""}> Activar modo mantenimiento (solo administradores)</label>
    <label for="maintenanceMessage">Mensaje para los usuarios</label>
    <textarea id="maintenanceMessage" name="maintenanceMessage" maxlength="300" style="min-height:60px">${esc(settings.maintenanceMessage)}</textarea>
  </div>

  <div class="section">
    <h3>Cuarentena</h3>
    <label class="check"><input type="checkbox" name="quarantineMode"${settings.quarantineMode ? " checked" : ""}> Activar cuarentena (solo administradores)</label>
    <label for="quarantineMessage">Mensaje para los usuarios</label>
    <textarea id="quarantineMessage" name="quarantineMessage" maxlength="300" style="min-height:60px">${esc(settings.quarantineMessage || "")}</textarea>
    <p class="hint">Al activarla se rechazan nuevas peticiones de webs y se cierran las conexiones abiertas de usuarios.</p>
  </div>

  <div class="section">
    <h3>Sitios y modo de acceso</h3>
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

  <div class="section">
    <h3>Idioma de la interfaz</h3>
    <label for="language">Idioma por defecto</label>
    <select id="language" name="language">
      <option value="es"${settings.language === "es" ? " selected" : ""}>Español</option>
      <option value="en"${settings.language === "en" ? " selected" : ""}>English</option>
      <option value="ca"${settings.language === "ca" ? " selected" : ""}>Català</option>
    </select>
  </div>

  <div class="section">
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

  <div class="section">
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
  <button class="primary" type="submit">Guardar ajustes</button>
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
</script>`;
	return shell("Ajustes · Administración", body, { topbar: topbar(user) });
}

export function auditPage({
	user,
	events = [],
	users = [],
	actions = [],
	filters = {},
	canManage = false,
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
	return shell("Auditoría · Administración", body, { topbar: topbar(user) });
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
  <h2>Tailscale Funnel</h2>
  <p class="muted">URL pública: <a href="${esc(url)}">${esc(url)}</a></p>
  <pre class="panel">${esc(funnel.output || "Sin información")}</pre>
  <h2>Copias de seguridad</h2>
  <p class="muted">Incluye usuarios (con hashes), actividad, ajustes, auditoría y favoritos. Guárdala en un sitio seguro.</p>
  <div class="actions" style="margin-bottom:14px">
    <a class="small" href="/admin/backup.json">Descargar copia actual</a>
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
      <td><a class="small" href="/admin/backup/download/${encodeURIComponent(b.name)}">Descargar</a></td>
    </tr>`,
			)
			.join("")}</tbody>
  </table></div>
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
	return shell("Sistema · Administración", body, { topbar: topbar(user) });
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
