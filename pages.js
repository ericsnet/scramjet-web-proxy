import { countOpenAlerts } from "./security.js";
import { canAssignRole, canManageRole, isAdminRole, isReportsRole } from "./roles.js";

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
html{overflow-x:hidden}
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
.badge.role-user{color:#bfdbfe;border-color:#1d4ed8;background:#0d1b2e}
.badge.role-designer{color:#fbcfe8;border-color:#9d174d;background:#2a0a1a}
.badge.role-pentester{color:#fed7aa;border-color:#c2410c;background:#2a1306}
.badge.role-qa{color:#bae6fd;border-color:#0369a1;background:#08202e}
.badge.role-moderator{color:#bbf7d0;border-color:#166534;background:#0d2115}
.badge.role-admin{color:#ddd6fe;border-color:#6d28d9;background:#1d1233}
.badge.role-creator{color:#fde68a;border-color:#a16207;background:#2a1d05}
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
.grid{display:grid;grid-template-columns:1fr 1fr;gap:0 14px;min-width:0}
.grid>*{min-width:0}.scroll{max-width:100%}
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
.activity .what{flex:1;min-width:0;word-break:break-all}
.activity .entry-delete{flex:0 0 auto;margin-left:auto;align-self:center}
.activity .query{color:var(--ok);font-size:12.5px;display:block}
.filter{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:18px}
.filter select{width:auto;min-width:180px}
.empty{color:var(--muted);padding:20px 0}
@media(max-width:640px){.grid{grid-template-columns:1fr}.wrap{margin-top:24px}.card{padding:20px}
  .activity li{flex-wrap:wrap;gap:4px}.user-head .meta{margin-left:0;width:100%}}
footer{padding:0 20px 22px;text-align:center;color:#5b6b80;font-size:12px}
.topbar{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;white-space:nowrap;width:100%}
.topbar::-webkit-scrollbar{display:none}
.topbar .brand{flex:0 0 auto}
.topbar .who{overflow:hidden;text-overflow:ellipsis;max-width:170px}
.tabs{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}
.tabs::-webkit-scrollbar{display:none}
.tabs a{flex:0 0 auto}

/* ---- acabado visual ---- */
body{
  position:relative;overflow-x:hidden;
  background:var(--bg);
}
body::before{display:none}
.page-progress{position:fixed;top:0;left:0;width:100%;height:3px;z-index:100;overflow:hidden;
  background:rgba(59,130,246,.16)}
.page-progress[hidden]{display:none}
.page-progress i{display:block;width:36%;height:100%;border-radius:999px;
  background:linear-gradient(90deg,#60a5fa,#3b82f6);box-shadow:0 0 12px rgba(59,130,246,.8);
  animation:pageProgress 1.1s ease-in-out infinite}
@keyframes pageProgress{0%{transform:translateX(-120%)}100%{transform:translateX(320%)}}
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
.role-picker{border:0;padding:0;margin:12px 0;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px}
.role-picker legend{padding:0 0 8px;color:var(--muted);font-size:12px;font-weight:600;letter-spacing:.03em}
.role-option{position:relative;display:flex;align-items:center;gap:10px;padding:10px 11px;border:1px solid var(--border);border-radius:12px;background:linear-gradient(180deg,rgba(21,30,41,.72),rgba(15,23,42,.55));cursor:pointer;transition:border-color .16s ease,background .16s ease,box-shadow .16s ease,transform .16s ease}
.role-option:hover{border-color:#34506f;background:rgba(30,44,62,.78);transform:translateY(-1px)}
.role-option:focus-within{outline:2px solid rgba(96,165,250,.45);outline-offset:2px}
.role-option.selected{border-color:rgba(96,165,250,.62);background:linear-gradient(180deg,rgba(37,99,235,.22),rgba(30,64,175,.10));box-shadow:0 0 0 1px rgba(96,165,250,.12),0 6px 18px rgba(37,99,235,.10)}
.role-option.disabled{opacity:.42;cursor:not-allowed;filter:grayscale(.6);transform:none}
.role-option input{position:absolute;opacity:0;width:1px;height:1px;pointer-events:none}
.role-option-icon{display:grid;place-items:center;width:32px;height:32px;flex:0 0 32px;border-radius:9px;background:rgba(148,163,184,.09);border:1px solid rgba(148,163,184,.12);font-size:16px}
.role-option.selected .role-option-icon{background:rgba(59,130,246,.22);border-color:rgba(96,165,250,.28)}
.role-option-text{min-width:0;display:flex;flex-direction:column;gap:1px}
.role-option-text strong{font-size:12px;color:var(--text);font-weight:600;white-space:normal;line-height:1.25}
.role-option-text small{font-size:10.5px;color:var(--muted);white-space:normal;line-height:1.3}
.role-option::after{content:"";margin-left:auto;flex:0 0 18px;width:18px;height:18px;border-radius:50%;border:1px solid var(--border);background:rgba(2,6,23,.25)}
.role-option.selected::after{content:"✓";display:grid;place-items:center;background:var(--accent);border-color:var(--accent);color:#fff;font-size:11px;font-weight:700}
.role-form{flex:1 0 100%;width:100%;display:block!important}
.role-form .role-picker{width:100%;margin:4px 0 0}
.role-form .hint{margin:6px 0 8px}
.tool-tabs{margin:0 0 16px}
.report-status-open{color:#fecaca;border-color:#7f1d1d;background:#2a0b0b}
.report-status-triaged{color:#fde68a;border-color:#a16207;background:#2a1d05}
.report-status-in_progress{color:#bfdbfe;border-color:#1d4ed8;background:#0d1b2e}
.report-status-fixed{color:#bbf7d0;border-color:#166534;background:#0d2115}
.report-status-dismissed{color:#cbd5e1;border-color:#475569;background:#151e29}
.report-type-bug{color:#bfdbfe;border-color:#1d4ed8;background:#0d1b2e}
.report-type-security{color:#fed7aa;border-color:#c2410c;background:#2a1306}
.report-type-design{color:#fbcfe8;border-color:#9d174d;background:#2a0a1a}
.report-severity-low{color:#bbf7d0;border-color:#166534;background:#0d2115}
.report-severity-medium{color:#fde68a;border-color:#a16207;background:#2a1d05}
.report-severity-high{color:#fed7aa;border-color:#c2410c;background:#2a1306}
.report-severity-critical{color:#fecaca;border-color:#7f1d1d;background:#2a0b0b}
.report-detail summary{cursor:pointer;color:#dbeafe;font-weight:600}
.report-detail-body{margin-top:8px;color:var(--muted);font-size:13px;line-height:1.55;max-width:760px}
.report-detail-body p{margin:4px 0}
.report-admin-form{display:flex;flex-direction:column;gap:5px;min-width:180px}
.report-title-link{color:#dbeafe;font-weight:600;text-decoration:none}
.report-title-link:hover{text-decoration:underline}
.report-detail-card h1{margin:10px 0 6px}
.report-detail-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}
.report-detail-id{color:#8298af;font-size:11px;border:1px solid var(--border);border-radius:999px;padding:4px 8px}
.report-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:10px 0}
.report-detail-grid section{padding:12px;border:1px solid var(--border);border-radius:11px;background:rgba(255,255,255,.02);min-width:0}
.report-detail-grid h2{margin-top:0}
.report-long-text{white-space:pre-wrap;overflow-wrap:anywhere;color:var(--muted);line-height:1.65;font-size:13.5px}
.report-management{margin-top:10px;padding-top:14px;border-top:1px solid var(--border)}
.report-management textarea{min-height:90px}
@media (max-width:700px){.report-detail-grid{grid-template-columns:1fr}}
.report-admin-form select,.report-admin-form input{font-size:12px;padding:6px 8px}
.tool-checklist{margin:0;padding-left:20px;color:var(--muted);line-height:1.8;font-size:13.5px}
.tool-tools{margin-bottom:14px}
.tool-inline{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:8px 0}
.tool-inline label{display:flex;align-items:center;gap:6px;color:var(--muted);font-size:12px;margin:0}
.tool-inline input[type="color"]{width:40px;height:32px;padding:2px;border-radius:7px;border:1px solid var(--border);background:transparent}
.tool-inline input[type="text"],.tool-inline input:not([type]){min-width:220px}
.tool-result{margin:8px 0 0;font-size:12.5px;line-height:1.5;color:var(--muted)}
.tool-result.ok{color:#86efac}
.tool-result.warn{color:#fde68a}
.tool-output{margin:10px 0 0;padding:10px 11px;border:1px solid var(--border);border-radius:9px;background:rgba(0,0,0,.18);color:#bfdbfe;font-family:"JetBrains Mono",monospace;font-size:11.5px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere;max-height:260px;overflow:auto}
.tool-output li{list-style:none;margin:3px 0}
.tool-output li.warn{color:#fde68a}
.contrast-preview{margin-top:10px;padding:22px;border-radius:10px;border:1px solid var(--border);font-size:18px;font-weight:600;text-align:center}
.qa-tests{display:flex;flex-direction:column;gap:7px;margin:10px 0}
.qa-test{display:grid;grid-template-columns:minmax(180px,1fr) auto;gap:6px 10px;padding:9px 10px;border:1px solid var(--border);border-radius:10px;background:rgba(255,255,255,.02)}
.qa-test-info{min-width:0;display:flex;flex-direction:column;gap:2px}
.qa-test-info strong{font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.qa-test-info small{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
.qa-status-buttons{display:flex;gap:3px;flex-wrap:wrap;justify-content:flex-end}
.qa-status{padding:3px 6px!important;font-size:10px!important;border-radius:6px!important}
.qa-status.active.pending{border-color:#475569!important;background:rgba(148,163,184,.18)!important;color:#e2e8f0!important}
.qa-status.active.pass{border-color:#166534!important;background:rgba(74,222,128,.16)!important;color:#bbf7d0!important}
.qa-status.active.fail{border-color:#7f1d1d!important;background:rgba(248,113,113,.18)!important;color:#fecaca!important}
.qa-status.active.blocked{border-color:#a16207!important;background:rgba(251,191,36,.16)!important;color:#fde68a!important}
.qa-note{grid-column:1/-1;width:100%;padding:6px 8px;font-size:11.5px;border-radius:7px}
@media (max-width:700px){.qa-test{grid-template-columns:1fr}.qa-status-buttons{justify-content:flex-start}}
.design-swatches{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px}
.design-swatch{border:1px solid var(--border);border-radius:10px;padding:8px;background:rgba(255,255,255,.02);display:flex;flex-direction:column;gap:4px}
.design-swatch span{display:block;height:34px;border-radius:7px;border:1px solid rgba(255,255,255,.08)}
.design-swatch strong{font-size:12px}
.design-swatch small{color:var(--muted);font-size:10.5px}
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
.readonly-user{border-color:var(--border);background:var(--soft)}
.readonly-user .user-summary{cursor:default}
.readonly-user .user-summary:hover{background:transparent}
.self-user{border-color:#2f4a6b;background:linear-gradient(90deg,rgba(59,130,246,.07),var(--soft) 60%)}
.readonly-user .user-summary-meta .small{margin-right:8px}
.users-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;align-items:stretch}
.users-grid .admin-user{height:100%;display:flex;flex-direction:column;position:relative}
.users-grid .admin-user[open]{grid-column:1/-1;display:block}
.users-grid .user-summary{flex:1;flex-direction:column;align-items:flex-start;justify-content:flex-start;gap:9px;padding:14px;height:auto;min-height:168px;position:relative}
.users-grid .user-summary-main{flex-direction:column;align-items:flex-start;gap:7px;width:100%}
.users-grid .user-summary .user-avatar{width:38px;height:38px;border-radius:11px;font-size:13px}
.users-grid .user-name{font-size:15px;line-height:1.2}
.users-grid .user-summary-meta{margin-left:0;width:100%;display:grid;grid-template-columns:1fr 1fr;gap:6px 10px;font-size:11.5px}
.users-grid .user-summary-meta span{min-width:0;overflow:hidden;text-overflow:ellipsis}
.users-grid .user-chevron{position:absolute;top:13px;right:13px;margin:0}
.users-grid .admin-user[open]>.user-summary{min-height:0;flex-direction:row;flex-wrap:wrap;align-items:center}
.users-grid .admin-user[open]>.user-summary .user-summary-main{flex-direction:row;align-items:center;width:auto}
.users-grid .admin-user[open]>.user-summary .user-summary-meta{margin-left:auto;width:auto;display:flex;flex-wrap:wrap}
.users-grid .admin-user[open]>.user-summary .user-chevron{position:static;margin-left:auto}
.user-body{padding:0 14px 14px}
.user-body .user-stats{margin-top:12px}
.user-extra{margin-top:14px;padding-top:14px;border-top:1px solid var(--border)}
@media(max-width:640px){
  .user-summary-meta{order:3;margin-left:0;width:100%;gap:10px}
  .user-chevron{order:2;margin-left:auto}
  .users-grid{grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:9px}
  .users-grid .user-summary{min-height:150px;padding:11px}
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
dialog{position:relative;border:1px solid var(--border);border-radius:14px;background:var(--soft);color:var(--text);
  padding:20px;width:min(430px,calc(100vw - 32px));box-shadow:0 24px 70px rgba(0,0,0,.5)}
dialog::backdrop{background:rgba(0,0,0,.55);backdrop-filter:blur(3px)}
dialog h2{margin-top:0}
.dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
.section{margin-top:26px;padding-top:4px}
.section h3{font-size:13px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);
  margin:0 0 6px;font-weight:600}
.settings-toolbar{display:flex;align-items:center;gap:9px;flex-wrap:wrap;position:sticky;top:8px;z-index:6;
  padding:9px;border:1px solid var(--border);border-radius:12px;background:rgba(17,24,33,.96);box-shadow:0 8px 24px rgba(0,0,0,.22)}
.settings-search{display:flex;align-items:center;gap:7px;flex:1 1 260px;min-width:190px;margin:0;color:var(--muted)}
.settings-search input{margin:0;padding:9px 11px;min-width:0}
.settings-toolbar button.primary{width:auto;margin:0;padding:9px 16px;font-size:13px;flex:0 0 auto}
.settings-dirty{font-size:12px;color:var(--ok);white-space:nowrap}
.settings-dirty.dirty{color:#fbbf24}
.settings-jump{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding:10px 0 2px}
.settings-jump::-webkit-scrollbar{display:none}
.settings-jump a{flex:0 0 auto;font-size:11.5px;color:var(--muted);border:1px solid var(--border);border-radius:999px;
  padding:5px 9px;background:rgba(21,30,41,.5);text-decoration:none;white-space:nowrap}
.settings-jump a:hover{color:var(--text);border-color:#3b5b7d;text-decoration:none}
.settings-status{display:flex;gap:6px;flex-wrap:wrap;margin:3px 0 4px}
.settings-block{margin-top:16px;padding:16px;border:1px solid var(--border);border-radius:13px;
  background:linear-gradient(180deg,rgba(21,30,41,.62),rgba(13,20,28,.38));scroll-margin-top:72px}
.settings-block h3{font-size:12px;letter-spacing:.08em;color:#a9bed7;margin:0 0 10px}
.settings-block .check{padding:8px 10px;margin:8px 0;border:1px solid var(--border);border-radius:9px;background:rgba(0,0,0,.12)}
.settings-block .check:hover{border-color:#3b5b7d}
.settings-block .check input{width:18px;height:18px}
.settings-block[hidden]{display:none}
.settings-final-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:22px;padding-top:16px;border-top:1px solid var(--border)}
.settings-final-actions .primary{margin:0}
@media(max-width:640px){.settings-toolbar{position:static}.settings-toolbar button.primary{width:100%}.settings-block{padding:12px}.settings-jump{margin-right:-4px}}
.chat-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:10px}
.chat-channel-bar{display:flex;gap:7px;align-items:center;flex-wrap:wrap}
.chat-channel-bar select{width:auto;min-width:150px;padding:8px 10px;font-size:13px}
.chat-online-users{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 12px}
.chat-user-chip{font-size:11.5px;color:var(--muted);border:1px solid var(--border);border-radius:999px;padding:3px 8px;background:rgba(21,30,41,.45)}
.chat-toolbar .chat-online{color:var(--muted);font-size:12.5px;display:inline-flex;align-items:center;gap:7px}
.chat-online::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--ok);box-shadow:0 0 0 3px rgba(74,222,128,.12)}
.chat-box{display:flex;flex-direction:column;border:1px solid var(--border);border-radius:14px;
  background:linear-gradient(180deg,rgba(21,30,41,.65),rgba(13,20,28,.65));overflow:hidden}
.chat-messages{height:min(58vh,560px);min-height:220px;overflow-y:auto;padding:12px 14px;scroll-behavior:auto;
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
.chat-mention{color:#93c5fd;font-weight:600}
.chat-message.own .chat-mention{color:#dbeafe}
.chat-empty{color:var(--muted);text-align:center;padding:52px 18px;font-size:14px;margin:auto}
.chat-attachment{display:block;margin-top:8px;border-radius:9px;overflow:hidden;max-width:360px}
.chat-attachment img{display:block;max-width:100%;max-height:280px;object-fit:contain}
.chat-attachment.file{font-size:12px;color:#93c5fd;padding:8px 9px;border:1px solid var(--border);background:rgba(0,0,0,.12)}
.chat-poll{display:flex;flex-direction:column;gap:5px;margin-top:9px;min-width:190px}
.chat-poll-option{display:flex;justify-content:space-between;gap:8px;background:rgba(255,255,255,.06);border:1px solid var(--border);border-radius:8px;color:var(--text);padding:6px 8px;font:inherit;font-size:12.5px;cursor:pointer;text-align:left}
.chat-message.own .chat-poll-option{background:rgba(0,0,0,.12);border-color:rgba(255,255,255,.2);color:#fff}
.chat-poll-option b{color:#93c5fd;font-size:11.5px}
.chat-message.own .chat-poll-option b{color:#bfdbfe}
.chat-reactions{display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-top:7px;position:relative}
.chat-reaction{background:rgba(255,255,255,.08);border:1px solid var(--border);border-radius:999px;color:var(--text);font-size:11.5px;padding:2px 7px;cursor:pointer}
.chat-message.own .chat-reaction{background:rgba(0,0,0,.14);border-color:rgba(255,255,255,.2);color:#fff}
.chat-reaction.mine{border-color:#60a5fa;background:rgba(59,130,246,.2)}
.chat-reaction-menu{display:inline-block;position:relative}
.chat-reaction-menu summary{list-style:none;cursor:pointer;color:var(--muted);font-size:14px;padding:1px 5px;border:1px solid var(--border);border-radius:999px}
.chat-reaction-menu summary::-webkit-details-marker{display:none}
.chat-reaction-picker{position:absolute;left:0;bottom:26px;display:flex;gap:2px;background:var(--soft);border:1px solid var(--border);border-radius:10px;padding:5px;z-index:5;box-shadow:0 10px 24px rgba(0,0,0,.35)}
.chat-reaction-picker button{background:none;border:0;font-size:17px;cursor:pointer;padding:2px 3px;line-height:1}
.chat-reaction-picker button:hover{transform:scale(1.15)}
.chat-form{display:flex;gap:10px;align-items:flex-end;margin-top:14px}
.chat-attach-row{display:flex;align-items:center;gap:10px;margin-top:5px}
.chat-file-label{margin:0;display:inline-flex;cursor:pointer}
.chat-counter{font-size:11.5px;color:var(--muted);margin-left:auto}
.chat-form textarea{flex:1;min-height:54px;max-height:150px;resize:vertical;margin:0}
.chat-form button.primary{width:auto;margin:0;padding:12px 20px;flex:0 0 auto}
.chat-counter{font-size:11.5px;color:var(--muted);text-align:right}
.role-scale{margin:10px 0 0;padding-left:22px;color:var(--muted);font-size:13px;line-height:1.5}
.role-scale li{margin-bottom:9px}
.role-scale strong{display:block;color:var(--text);font-size:14px}
.role-scale li.role-user strong{color:#93c5fd}
.role-scale li.role-designer strong{color:#f9a8d4}
.role-scale li.role-pentester strong{color:#fdba74}
.role-scale li.role-qa strong{color:#7dd3fc}
.role-scale li.role-moderator strong{color:#86efac}
.role-scale li.role-admin strong{color:#c4b5fd}
.role-scale li.role-creator strong{color:#fde68a}
.role-scale span{display:block}
.role-scale b{color:#fde68a}
.traffic-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}
.traffic-live{display:inline-flex;align-items:center;gap:7px;color:#86efac;font-size:12px;font-weight:600;padding:6px 10px;border:1px solid rgba(74,222,128,.3);border-radius:999px;background:rgba(74,222,128,.07)}
.traffic-live i{width:7px;height:7px;border-radius:50%;background:#4ade80;box-shadow:0 0 0 4px rgba(74,222,128,.12);animation:trafficPulse 1.8s infinite}
.traffic-visuals{margin-bottom:16px}
.traffic-sparkline{height:118px;display:flex;align-items:flex-end;gap:3px;padding:10px 2px 0;border-bottom:1px solid var(--border)}
.traffic-spark{flex:1;min-width:2px;border-radius:3px 3px 0 0;background:linear-gradient(180deg,#60a5fa,#2563eb);opacity:.8;transition:height .3s}
.traffic-spark:hover{opacity:1}
.traffic-legend{display:flex;justify-content:space-between;color:var(--muted);font-size:11px;margin-top:8px}
.traffic-legend span{display:inline-flex;align-items:center;gap:5px}
.dot-ok{display:inline-block;width:7px;height:7px;border-radius:50%;background:#60a5fa}
.traffic-bars{display:flex;flex-direction:column;gap:7px}
.traffic-bar-row{display:grid;grid-template-columns:58px minmax(0,1fr) 32px;gap:8px;align-items:center;font-size:11.5px;color:var(--muted)}
.traffic-bar-row .mono{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10.5px}
.traffic-bar{height:7px;border-radius:99px;background:#172538;overflow:hidden}
.traffic-bar i{display:block;height:100%;border-radius:99px;transition:width .35s}
.bar-2xx,.bar-path{background:#22c55e}.bar-3xx{background:#3b82f6}.bar-4xx{background:#f59e0b}.bar-5xx{background:#ef4444}
.traffic-bar-row b{text-align:right;color:var(--text);font-size:11px}
h2 small{font-size:11px;font-weight:400;color:var(--muted);margin-left:4px}
@keyframes trafficPulse{0%,100%{opacity:1}50%{opacity:.35}}
.badge.status-2xx{color:#bbf7d0;border-color:#166534;background:#0d2115}
.badge.status-3xx{color:#bfdbfe;border-color:#1e40af;background:#101c33}
.badge.status-4xx{color:#fde68a;border-color:#a16207;background:#271c06}
.badge.status-5xx{color:#fecaca;border-color:#7f1d1d;background:#1f1113}
.monitor-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}
.monitor-user{border:1px solid var(--border);border-radius:13px;padding:13px;background:linear-gradient(180deg,rgba(21,30,41,.7),rgba(13,20,28,.45));min-width:0}
.monitor-user-head{display:flex;align-items:center;gap:9px;min-width:0}
.monitor-user-head .user-avatar{width:34px;height:34px;flex:0 0 34px}
.monitor-user-title{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0}
.monitor-user-title strong{font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.monitor-user-head .monitor-time{margin-left:auto;color:var(--muted);font-size:10.5px;white-space:nowrap}
.monitor-current{margin-top:10px;padding:8px 9px;border:1px solid var(--border);border-radius:9px;background:rgba(0,0,0,.14);min-width:0}
.monitor-label{display:block;font-size:9.5px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin-bottom:3px}
.monitor-url{display:block;font-family:"JetBrains Mono",monospace;font-size:11px;color:#bfdbfe;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.monitor-query{display:block;font-size:11px;color:#fde68a;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.monitor-meta{display:flex;gap:8px;flex-wrap:wrap;color:var(--muted);font-size:10.5px;margin-top:8px}
.monitor-streams{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}
.monitor-stream{font-family:"JetBrains Mono",monospace;font-size:10px;border:1px solid #2f4a6b;border-radius:999px;padding:3px 7px;color:#93c5fd;background:rgba(59,130,246,.08);max-width:100%;overflow:hidden;text-overflow:ellipsis}
.monitor-actions{margin-top:9px;display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}
.monitor-online{color:#86efac;border-color:#166534;background:#0d2115}
.monitor-offline{color:#94a7bd;border-color:var(--border);background:rgba(0,0,0,.12)}
.monitor-recent td:first-child{white-space:nowrap}
.monitor-recent .monitor-url{max-width:420px}
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
.chat-toast.mention{border-left-color:#60a5fa;background:#132033}
@media(max-width:640px){.chat-toast-stack{left:10px;bottom:calc(10px + env(safe-area-inset-bottom,0px));width:calc(100vw - 20px)}}

/* ---- chat: aplicación de mensajería ---- */
.wrap.wide{width:min(1180px,calc(100% - 28px));margin-top:24px;margin-bottom:46px}
.chat-app{display:grid;grid-template-columns:252px minmax(0,1fr);height:min(74vh,760px);min-height:540px;
  border:1px solid var(--border);border-radius:18px;overflow:hidden;background:var(--soft);
  box-shadow:0 26px 70px rgba(0,0,0,.38)}
.chat-sidebar{display:flex;flex-direction:column;min-height:0;background:#0b121b;border-right:1px solid var(--border);padding:16px 12px;gap:7px}
.chat-sidebar-head{display:flex;align-items:center;gap:10px;padding:2px 6px 10px}
.chat-sidebar-brand{display:flex;align-items:center;gap:9px;min-width:0}
.chat-sidebar-mark{display:grid;place-items:center;width:34px;height:34px;border-radius:11px;
  background:linear-gradient(145deg,#3b82f6,#1d4ed8);color:#fff;font-size:16px;box-shadow:0 6px 16px rgba(37,99,235,.3)}
.chat-sidebar-brand strong{display:block;font-size:14px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.chat-sidebar-brand small{display:block;color:#6f8197;font-size:10.5px;margin-top:2px}
.chat-sidebar-label{font-size:10px;text-transform:uppercase;letter-spacing:.11em;color:#64778c;padding:10px 8px 3px}
.chat-channel-list{display:flex;flex-direction:column;gap:3px;min-height:0;overflow-y:auto;padding-right:2px}
.chat-channel-item{display:flex;align-items:center;gap:9px;width:100%;padding:8px;border:1px solid transparent;
  border-radius:10px;background:none;color:var(--text);font:inherit;text-align:left;cursor:pointer}
.chat-channel-item:hover{background:rgba(59,130,246,.08)}
.chat-channel-item.active{background:#162438;border-color:#263b55}
.chat-channel-avatar{display:grid;place-items:center;flex:0 0 32px;width:32px;height:32px;border-radius:10px;
  color:#fff;font-weight:700;font-size:13px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.1)}
.chat-channel-avatar.large{width:40px;height:40px;border-radius:12px;font-size:16px}
.chat-channel-text{min-width:0;flex:1}
.chat-channel-text strong{display:block;font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.chat-channel-text small{display:block;font-size:10.5px;color:#6f8197;margin-top:2px}
.chat-unread{min-width:19px;height:19px;padding:0 5px;border-radius:999px;background:#3b82f6;color:#fff;
  font-size:10.5px;font-weight:700;line-height:19px;text-align:center}
.chat-online-users{display:flex;flex-direction:column;gap:5px;padding:0 4px;overflow-y:auto;max-height:155px}
.chat-user-chip{display:flex;align-items:center;gap:7px;color:#9aabbf;font-size:12px;min-height:22px}
.chat-user-chip i{display:grid;place-items:center;width:21px;height:21px;border-radius:7px;color:#fff;
  font-size:10px;font-weight:700;font-style:normal}
.chat-sidebar-empty{color:#64778c;font-size:11.5px;padding:3px 8px}
.chat-main{display:flex;flex-direction:column;min-width:0;min-height:0;background:linear-gradient(180deg,#101923,#0c131c)}
.chat-header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;
  border-bottom:1px solid var(--border);background:rgba(13,20,28,.88)}
.chat-header-info{display:flex;align-items:center;gap:11px;min-width:0}
.chat-header-info h1{font-size:16px;line-height:1.2;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.chat-header-info p{margin:4px 0 0;color:var(--muted);font-size:11.5px}
.chat-header-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.chat-action{display:inline-flex;align-items:center;gap:5px;padding:7px 9px;border:1px solid var(--border);
  border-radius:9px;background:var(--input);color:var(--muted);font:inherit;font-size:11.5px;cursor:pointer}
.chat-action svg{width:14px;height:14px}
.chat-action:hover{color:var(--text);border-color:#3d5672;background:#1a2839}
.chat-app .chat-messages{flex:1;height:auto;min-height:0;padding:18px 20px 10px;gap:4px}
.chat-app .chat-message{gap:8px;align-items:flex-end}
.chat-app .chat-message.own{align-items:flex-end}
.chat-msg-avatar{display:grid;place-items:center;flex:0 0 28px;width:28px;height:28px;border-radius:9px;
  color:#fff;font-size:11px;font-weight:700;box-shadow:0 3px 9px rgba(0,0,0,.18)}
.chat-app .chat-bubble{max-width:min(74%,610px);padding:8px 11px 9px;border-radius:15px 15px 15px 5px}
.chat-app .chat-message.own .chat-bubble{border-radius:15px 15px 5px 15px}
.chat-composer{display:flex;align-items:flex-end;gap:7px;margin:6px 16px 16px;padding:7px 8px 6px;
  border:1px solid var(--border);border-radius:16px;background:#111b26;transition:border-color .15s,box-shadow .15s}
.chat-composer:focus-within{border-color:#36547a;box-shadow:0 0 0 3px rgba(59,130,246,.12)}
.chat-attach{display:grid;place-items:center;flex:0 0 34px;width:34px;height:34px;border-radius:10px;cursor:pointer;color:#8fa4bc}
.chat-attach:hover{background:#1a2839;color:#dbeafe}
.chat-attach svg{width:17px;height:17px}
.chat-compose-input{flex:1;min-width:0;display:flex;flex-direction:column}
.chat-composer textarea{width:100%;min-height:30px;max-height:130px;margin:0;padding:5px 4px 1px;border:0;
  border-radius:0;background:transparent;box-shadow:none;resize:none;font-size:14px;line-height:1.45}
.chat-compose-meta{display:flex;justify-content:space-between;gap:10px;padding:1px 4px 2px;min-height:14px}
.chat-compose-meta .chat-counter{font-size:10px;color:#64778c}
.chat-send{display:grid;place-items:center;flex:0 0 36px;width:36px;height:36px;border:0;border-radius:11px;
  background:linear-gradient(145deg,#3b82f6,#2563eb);color:#fff;cursor:pointer;box-shadow:0 6px 14px rgba(37,99,235,.25)}
.chat-send:hover{background:#2f6fdd}
.chat-send:disabled{opacity:.45;cursor:not-allowed}
.chat-send svg{width:17px;height:17px}
.chat-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;
  flex:1 1 auto;min-height:0;margin:auto;padding:24px 18px;color:#71859b;font-size:12px}
.chat-empty strong{color:#bfd0e3;font-size:14px}
.chat-empty-icon{display:grid;place-items:center;width:46px;height:46px;border-radius:15px;background:#142235;font-size:22px;margin-bottom:4px}
.chat-dialog{max-width:440px}
.chat-dialog .muted{margin:0 0 4px}
.chat-member-search{margin-bottom:8px;padding:8px 10px;font-size:13px}
.chat-member-picker{max-height:220px;overflow-y:auto;border:1px solid var(--border);border-radius:11px;
  padding:5px;display:grid;grid-template-columns:1fr 1fr;gap:4px;background:rgba(0,0,0,.12)}
.chat-member-option{display:flex;align-items:center;gap:8px;min-width:0;padding:7px 8px;margin:0;border-radius:8px;
  color:var(--text);font-size:12.5px;cursor:pointer;border:1px solid transparent}
.chat-member-option:hover{background:#1a2839;border-color:#2b3f59}
.chat-member-option[hidden]{display:none!important}
.chat-member-option:has(input:checked){background:rgba(59,130,246,.14);border-color:#2e5a91}
.chat-member-option input{appearance:none;width:18px;height:18px;flex:0 0 18px;margin:0;border:1.5px solid #40536a;
  border-radius:6px;background:#0c141e;cursor:pointer;position:relative;transition:background .15s,border-color .15s}
.chat-member-option input:checked{background:var(--accent);border-color:var(--accent)}
.chat-member-option input:checked::after{content:"✓";position:absolute;inset:0;display:grid;place-items:center;
  color:#fff;font-size:12px;font-weight:800;line-height:1}
.chat-member-avatar{display:grid;place-items:center;width:25px;height:25px;flex:0 0 25px;border-radius:8px;
  color:#fff;font-size:10px;font-weight:700}
.chat-member-option span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media(max-width:640px){.chat-member-picker{grid-template-columns:1fr}}
.dialog-x{position:absolute;right:12px;top:10px;background:none;border:0;color:var(--muted);font-size:22px;line-height:1;cursor:pointer;padding:2px 5px}
.dialog-x:focus{outline:none;color:var(--text)}
.dialog-x:hover{color:var(--text)}
button.primary-small,a.primary-small{background:var(--accent);color:#fff;border-color:var(--accent)}
button.primary-small:hover,a.primary-small:hover{background:#2f6fdd;border-color:#2f6fdd}
.panic-button-form{position:fixed;left:16px;bottom:16px;z-index:45;margin:0}
.panic-button{display:inline-flex;align-items:center;gap:6px;border:1px solid #7f1d1d;border-radius:999px;
  background:#3a1115;color:#fecaca;font:inherit;font-size:12px;font-weight:700;padding:9px 14px;cursor:pointer;
  box-shadow:0 8px 24px rgba(0,0,0,.35);transition:background .15s,border-color .15s}
.panic-button:hover{background:#5b171d;border-color:#b91c1c;color:#fff}
.panic-button:active{transform:translateY(1px)}
@media(max-width:820px){.panic-button-form{left:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px))}}
.chat-action{position:relative}
.friend-badge{position:absolute;top:-5px;right:-5px;min-width:18px;height:18px;padding:0 5px;border-radius:999px;
  background:#dc2626;color:#fff;font-size:10px;font-weight:700;line-height:18px;text-align:center}
.friend-dialog{max-width:580px}
.friend-dialog h3{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:18px 0 5px}
.friend-list{display:flex;flex-direction:column;gap:2px}
.friend-row{display:flex;align-items:center;gap:9px;padding:7px 0;border-bottom:1px solid var(--border);flex-wrap:wrap}
.friend-row:last-child{border-bottom:0}
.friend-row .friend-name{font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis}
.friend-row .actions,.friend-row form{margin-left:auto}
.friend-row .actions{display:flex;gap:6px;flex-wrap:wrap}
.friend-search-box{display:flex;flex-direction:column;gap:6px;margin-top:6px}
.friend-search-box input[type="search"]{width:100%;margin:0}
.friend-results{max-height:230px;overflow-y:auto;border:1px solid var(--border);border-radius:10px;padding:3px 9px;background:rgba(0,0,0,.12)}
.friend-results[hidden]{display:none}
.friend-result{display:flex;align-items:center;gap:9px;padding:7px 0;border-bottom:1px solid var(--border)}
.friend-result:last-child{border-bottom:0}
.friend-result .friend-name{min-width:0;overflow:hidden;text-overflow:ellipsis;font-weight:600}
.friend-result button{margin-left:auto}
.friend-result[hidden]{display:none}
.dm-result{width:100%;background:none;border:0;border-bottom:1px solid var(--border);border-radius:0;
  color:var(--text);font:inherit;text-align:left;cursor:pointer}
.dm-result:last-child{border-bottom:0}
.dm-result:hover{background:rgba(59,130,246,.08)}
.dm-result .badge{margin-left:auto}
@media(max-width:820px){
  .wrap.wide{width:calc(100% - 16px);margin-top:12px}
  .chat-app{grid-template-columns:1fr;height:auto;min-height:calc(100vh - 150px)}
  .chat-sidebar{border-right:0;border-bottom:1px solid var(--border);padding:10px;max-height:190px}
  .chat-sidebar-head{padding-bottom:4px}
  .chat-channel-list{flex-direction:row;overflow-x:auto;overflow-y:hidden;gap:5px}
  .chat-channel-item{min-width:150px;width:auto;flex:0 0 auto;padding:6px}
  .chat-online-users{flex-direction:row;flex-wrap:wrap;max-height:none}
  .chat-header{padding:11px 12px}
  .chat-header-actions span{display:none}
  .chat-action{padding:7px}
  .chat-app .chat-messages{padding:12px 12px 6px}
  .chat-app .chat-bubble{max-width:86%}
  .chat-composer{margin:5px 10px 10px}
}

@media(max-width:640px){.chat-fab{right:14px;width:50px;height:50px}
  .chat-fab svg{width:24px;height:24px}}
@media(max-width:640px){.chat-messages{height:58vh}.chat-form{flex-direction:column;align-items:stretch}
  .chat-form button.primary{width:100%}}
@media(max-width:640px){.field-grid{grid-template-columns:1fr}.link-row{grid-template-columns:1fr}
  .tabs a{font-size:12px;padding:7px 10px}}
.tabs{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;width:100vw;max-width:100vw;
  margin-left:calc(50% - 50vw);margin-right:calc(50% - 50vw);border-radius:0;border-left:0;border-right:0;
  padding-left:max(14px,calc((100vw - 860px)/2));padding-right:max(14px,calc((100vw - 860px)/2))}
.tabs::-webkit-scrollbar{display:none}
.tabs a{white-space:nowrap;flex:0 0 auto}
.error-screen{text-align:center;padding:48px 20px 56px;position:relative;overflow:hidden}
.error-orbit{display:grid;place-items:center;width:92px;height:92px;margin:0 auto 16px;border-radius:28px;
  background:radial-gradient(circle at 30% 20%,#1d3d66,#0e1b2c);border:1px solid #2f4c6b;
  box-shadow:0 18px 50px rgba(37,99,235,.2)}
.error-orbit span{font-size:38px;filter:saturate(.9)}
.error-code{font-size:clamp(68px,14vw,120px);font-weight:800;letter-spacing:-.08em;line-height:.9;
  background:linear-gradient(180deg,#dbeafe,#3b82f6 65%,#1d4ed8);-webkit-background-clip:text;background-clip:text;color:transparent}
.error-screen h1{font-size:clamp(24px,4vw,34px);margin:18px 0 8px}
.error-screen p{max-width:520px;margin:0 auto;color:var(--muted);font-size:14.5px;line-height:1.6}
.error-actions{display:flex;justify-content:center;gap:9px;flex-wrap:wrap;margin-top:24px}
.error-actions .small{margin:0}
.error-preview{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:6px;margin-top:30px;padding-top:18px;border-top:1px solid var(--border)}
.error-preview span{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-right:3px}
.error-preview a{font-size:11px;padding:4px 8px;border:1px solid var(--border);border-radius:999px;color:var(--muted);text-decoration:none;line-height:1}
.error-preview a:hover{color:var(--text);border-color:#34506f;text-decoration:none}
.error-preview a.active{background:var(--accent);border-color:var(--accent);color:#fff}
.topbar-avatar{display:grid;place-items:center;flex:0 0 24px;width:24px;height:24px;border-radius:7px;
  overflow:hidden;color:#fff;font-size:10px;font-weight:700;box-shadow:inset 0 0 0 1px rgba(255,255,255,.1)}
.topbar-avatar img,.user-avatar img,.account-avatar img,.chat-msg-avatar img,.chat-member-avatar img{width:100%;height:100%;object-fit:cover;display:block;border-radius:inherit}
.user-avatar{display:grid;place-items:center;flex:0 0 30px;width:30px;height:30px;border-radius:9px;
  overflow:hidden;color:#fff;font-size:11px;font-weight:700;box-shadow:inset 0 0 0 1px rgba(255,255,255,.1)}
.account-head{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.account-head h1{margin:0}
.account-avatar{display:grid;place-items:center;flex:0 0 64px;width:64px;height:64px;border-radius:19px;
  overflow:hidden;color:#fff;font-size:23px;font-weight:700;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}
.account-icon-row{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-top:12px}
.account-icon-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.account-icon-actions form{margin:0}
.chat-msg-avatar,.chat-member-avatar{overflow:hidden}
.chat-msg-avatar img,.chat-member-avatar img{width:100%;height:100%;object-fit:cover;display:block;border-radius:inherit}
.chat-user-chip .chat-chip-avatar{display:grid;place-items:center;flex:0 0 21px;width:21px;height:21px;border-radius:7px;
  overflow:hidden;color:#fff;font-size:10px;font-weight:700;font-style:normal}
.chat-user-chip .chat-chip-avatar img{width:100%;height:100%;object-fit:cover;display:block;border-radius:inherit}
.topbar{flex-wrap:nowrap!important;justify-content:flex-start;overflow-x:auto;scrollbar-width:none;white-space:nowrap;padding-left:20px;padding-right:20px}
.topbar::-webkit-scrollbar{display:none}

/* ============================================================
   Responsive v2 — móvil, tablet, landscape y teclado
   ============================================================ */
@media(max-width:820px){
  .wrap{width:calc(100% - 24px);margin:20px auto 40px;padding-left:0;padding-right:0}
  .card{padding:18px;border-radius:12px}
  h1{font-size:22px}
  h2{font-size:16px}
  .topbar{padding:9px 12px;padding-top:calc(9px + env(safe-area-inset-top,0px));gap:10px;font-size:13px}
  .topbar .brand{font-size:14px}
  .topbar .who{max-width:120px}
  .grid,.field-grid,.link-row{grid-template-columns:1fr}
  .actions{width:100%}
  .actions form{width:100%;flex-wrap:wrap}
  .actions input,.actions select{width:100%;min-width:0;flex:1 1 140px}
  .scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;max-width:100%}
  table{display:block;width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;white-space:nowrap}
  .stats{grid-template-columns:repeat(auto-fit,minmax(130px,1fr))}
  .activity li{flex-wrap:wrap;gap:4px}
  .activity .when{white-space:normal}
  .session-list li{align-items:flex-start}
  .session-list .info{flex:1 1 100%}
  dialog{width:calc(100vw - 24px);padding:18px;max-height:calc(100dvh - 24px);overflow-y:auto}
  input,select,textarea{font-size:16px}
  footer{padding-bottom:calc(18px + env(safe-area-inset-bottom,0px))}

  /* chat interno */
  .chat-app{display:flex;flex-direction:column;grid-template-columns:none;height:auto;min-height:0}
  .chat-sidebar{
    flex-direction:row;align-items:center;gap:6px;padding:7px 9px;
    max-height:none;overflow-x:auto;overflow-y:hidden;
    border-right:0;border-bottom:1px solid var(--border);
    -webkit-overflow-scrolling:touch;
  }
  .chat-sidebar-head,.chat-sidebar-label,.chat-online-users{display:none}
  .chat-channel-list{flex-direction:row;overflow-x:auto;overflow-y:hidden;gap:5px;padding:0;min-height:0}
  .chat-channel-item{width:auto;white-space:nowrap;padding:7px 10px;min-height:38px}
  .chat-main{display:flex;flex-direction:column;min-width:0;min-height:0}
  .chat-header{flex-wrap:wrap;gap:8px;padding:10px 12px}
  .chat-header h1{font-size:17px}
  .chat-header-actions{flex-wrap:wrap;gap:5px}
  .chat-header-actions .chat-action span{display:none}
  .chat-header-actions .chat-action{width:40px;height:40px;padding:0;justify-content:center}
  .chat-app .chat-messages{height:calc(100dvh - 330px);min-height:200px;padding:10px 10px 6px}
  .chat-app .chat-bubble{max-width:90%}
  .chat-attachment{max-width:100%}
  .chat-form,.chat-composer{
    flex-direction:row;align-items:flex-end;gap:6px;
    position:sticky;bottom:0;z-index:2;
    background:var(--bg);padding-bottom:calc(6px + env(safe-area-inset-bottom,0px));
  }
  .chat-form textarea,.chat-compose-input textarea{font-size:16px;min-height:44px;max-height:120px}
  .chat-form button.primary,.chat-send{width:44px;min-width:44px;height:44px;padding:0;flex:0 0 44px}
  .chat-attach{min-width:40px;min-height:40px;display:grid;place-items:center}
  .chat-compose-meta{display:none}
  pre.panel{max-width:100%}
}

@media(max-width:520px){
  .wrap{width:calc(100% - 18px)}
  .card{padding:14px}
  .topbar .who{display:none}
  .topbar .brand{font-size:13.5px}
  .chat-app .chat-messages{height:calc(100dvh - 310px)}
  .chat-app .chat-bubble{max-width:92%}
  .chat-header-actions .chat-action{width:38px;height:38px}
  .user-summary-meta{gap:8px}
}

@media(max-width:380px){
  h1{font-size:20px}
  .stat .v{font-size:18px}
  .chat-app .chat-messages{height:calc(100dvh - 300px)}
  .card{padding:12px}
}

@media(hover:none){
  button.small,a.small,.chat-action,.chat-send,.chat-channel-item,.chat-tab{min-height:44px}
  .chat-send{min-width:44px}
}

@media(max-height:520px) and (orientation:landscape){
  .chat-app .chat-messages{height:calc(100dvh - 230px);min-height:140px}
  .chat-sidebar{max-height:none;padding-top:5px;padding-bottom:5px}
  .chat-header{padding:6px 10px}
}

/* El chat ocupa toda la altura disponible (móvil y escritorio). */
@supports selector(:has(*)) {
  body:has(.chat-app){height:100dvh;min-height:100dvh;overflow:hidden}
  body:has(.chat-app) .wrap{
    flex:1;display:flex;flex-direction:column;width:100%;max-width:100%;
    margin:0 auto;padding:0;min-height:0;overflow:hidden;
  }
  body:has(.chat-app) .chat-app{flex:1;height:auto;min-height:0;overflow:hidden}
  body:has(.chat-app) .chat-sidebar{flex:0 0 auto}
  body:has(.chat-app) .chat-main{flex:1;min-height:0;display:flex;flex-direction:column}
  body:has(.chat-app) .chat-app .chat-messages{flex:1;height:auto;min-height:0}
  @media(max-width:820px){
    body:has(.chat-app) footer{display:none}
    body:has(.chat-app) .chat-app .chat-messages{height:auto}
  }
}
/* ---- notificaciones grandes de chat ---- */
.chat-toast-stack{left:auto;right:18px;bottom:calc(88px + env(safe-area-inset-bottom,0px));align-items:flex-end;
  width:min(420px,calc(100vw - 36px));gap:10px}
.chat-toast{width:100%;min-height:122px;background:linear-gradient(145deg,#172231,#0f1823);
  border:1px solid #2f4560;border-left:5px solid var(--accent);border-radius:18px;padding:15px;
  box-shadow:0 24px 60px rgba(0,0,0,.55),0 8px 20px rgba(37,99,235,.14);font-size:14px;
  display:grid;grid-template-columns:50px minmax(0,1fr) auto;grid-template-rows:auto minmax(0,1fr) auto;
  gap:5px 12px;cursor:pointer;animation:chatToastIn .28s cubic-bezier(.2,.9,.25,1.15)}
.chat-toast:hover{transform:translateY(-2px);border-color:#3c5f86;box-shadow:0 28px 70px rgba(0,0,0,.6),0 10px 24px rgba(37,99,235,.2)}
.chat-toast .chat-toast-avatar{grid-column:1;grid-row:1 / 4;width:50px;height:50px;border-radius:15px;
  overflow:hidden;display:grid;place-items:center;color:#fff;font-size:18px;font-weight:800;
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}
.chat-toast .chat-toast-avatar img{width:100%;height:100%;object-fit:cover;display:block}
.chat-toast strong{grid-column:2;grid-row:1;font-size:16px;line-height:1.25;color:#f8fafc;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.chat-toast .chat-toast-text{grid-column:2;grid-row:2;color:#c7d5e5;line-height:1.5;font-size:13.5px;
  overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow-wrap:anywhere}
.chat-toast .chat-toast-link{grid-column:2;grid-row:3;font-size:12px;font-weight:700;color:#93c5fd;
  width:max-content;text-decoration:none}
.chat-toast .chat-toast-link:hover{color:#dbeafe;text-decoration:none}
.chat-toast-close{grid-column:3;grid-row:1;background:none;border:0;color:#8498af;font-size:22px;
  line-height:1;cursor:pointer;padding:0 2px;align-self:start}
.chat-toast-close:hover{color:#fff}
.chat-toast.unread{border-left-color:#f59e0b;background:linear-gradient(145deg,#2a2113,#15130f)}
.chat-toast.mention{border-left-color:#60a5fa;background:linear-gradient(145deg,#142642,#0d1725)}
@keyframes chatToastIn{from{opacity:0;transform:translateY(18px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}
@media(max-width:640px){
  .chat-toast-stack{left:auto;right:10px;bottom:calc(76px + env(safe-area-inset-bottom,0px));width:calc(100vw - 20px)}
  .chat-toast{min-height:112px;grid-template-columns:44px minmax(0,1fr) auto;padding:13px}
  .chat-toast .chat-toast-avatar{width:44px;height:44px;border-radius:13px}
  .chat-toast strong{font-size:15px}
}

/* ============================================================
   Rediseño visual general · 2026-11
   ============================================================ */
:root{
  --bg:#080b11;--soft:#0e1621;--input:#121d2a;--border:#223247;--border-strong:#334a66;
  --text:#edf4fc;--muted:#93a6bc;--dim:#6f8399;--accent:#3b82f6;--accent-2:#60a5fa;
  --ok:#4ade80;--error:#f87171;
}
body{
  background:
    radial-gradient(900px 520px at 50% -12%, rgba(37,99,235,.17), transparent 62%),
    radial-gradient(700px 420px at 100% 105%, rgba(30,64,175,.1), transparent 60%),
    var(--bg);
}
.topbar{
  position:sticky;top:0;z-index:60;min-height:54px;
  background:rgba(8,12,18,.9);backdrop-filter:blur(16px);
  border-bottom:1px solid rgba(52,75,102,.55);
}
.topbar a{padding:5px 1px}
.topbar .who{font-size:12px}
.wrap{width:min(1200px,calc(100% - 40px));margin:32px auto 64px}
.wrap.wide{width:min(1380px,calc(100% - 32px))}
.card{
  background:linear-gradient(180deg,rgba(17,27,40,.94),rgba(11,18,27,.96));
  border:1px solid #223247;border-radius:18px;padding:22px;
  box-shadow:0 18px 48px rgba(0,0,0,.22);
}
.card h1{font-size:clamp(24px,3vw,32px);margin-top:0;margin-bottom:8px}
.card h2{font-size:18px;letter-spacing:-.02em;margin-top:0}
.card p.muted{margin-top:6px}
h1{letter-spacing:-.04em}
input,select,textarea{
  background:#0d1723;border:1px solid #26394f;border-radius:10px;color:var(--text);
}
input:focus,select:focus,textarea:focus{
  border-color:#4d7db8;box-shadow:0 0 0 4px rgba(59,130,246,.14);
}
button.primary{
  background:linear-gradient(180deg,#4b8ff8,#2563eb);border:1px solid #4b8ff8;
  box-shadow:0 10px 24px -10px rgba(37,99,235,.8);border-radius:11px;
}
button.primary:hover{background:linear-gradient(180deg,#5a9aff,#2f6fdd)}
button.small,a.small{
  background:#101b28;border-color:#26394f;border-radius:9px;color:#d9e6f5;
}
button.small:hover,a.small:hover{border-color:#41617f;background:#142335}
.badge{
  background:rgba(15,28,43,.75);border-color:#2b4058;color:#bcd0e6;
  border-radius:999px;padding:4px 8px;font-size:10.5px;font-weight:650;
}
.stats{gap:14px}
.stat,.overview-stat{
  border:1px solid #223247;border-radius:14px;padding:16px;
  background:linear-gradient(180deg,rgba(20,33,48,.9),rgba(12,21,31,.9));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.03);
}
.stat .k{color:#8fa5bd;font-size:10.5px;letter-spacing:.09em}
.stat .v{font-size:26px;margin-top:7px}
.tabs{
  position:sticky;top:54px;z-index:55;
  margin:0 0 24px;padding:8px max(14px,calc((100vw - 1380px)/2));
  border:0;border-bottom:1px solid #1e3043;border-radius:0;
  background:rgba(8,12,18,.93);backdrop-filter:blur(16px);
}
.tabs a{
  border:1px solid transparent;border-radius:9px;padding:8px 12px;
  color:#91a7bf;font-size:12px;font-weight:600;transition:background .15s,color .15s,border-color .15s;
}
.tabs a:hover{background:#112031;color:#e8f2fd;text-decoration:none}
.tabs a.active{
  background:linear-gradient(180deg,#4389f5,#2764d6);color:#fff;border-color:#6ba4f7;
  box-shadow:0 7px 18px -8px rgba(37,99,235,.9);
}
.tab-sep{flex:0 0 auto;width:1px;height:18px;background:#24384e;margin:0 3px}
table{border-collapse:separate;border-spacing:0}
th{color:#879db5;padding:0 12px 11px;font-size:10.5px}
td{padding:13px 12px;border-top:1px solid rgba(34,50,71,.7)}
tbody tr{transition:background .12s}
tbody tr:hover{background:rgba(59,130,246,.045)}
.overview-hero{
  display:flex;align-items:flex-start;justify-content:space-between;gap:18px;flex-wrap:wrap;
  margin-bottom:18px;padding:24px;border:1px solid #263f5b;border-radius:18px;
  background:
    radial-gradient(700px 220px at 10% -40%, rgba(59,130,246,.28), transparent 65%),
    linear-gradient(135deg,rgba(16,31,48,.98),rgba(10,18,28,.96));
  box-shadow:0 24px 60px rgba(0,0,0,.28);
}
.overview-kicker{
  display:inline-block;margin-bottom:8px;color:#93c5fd;font-size:10.5px;font-weight:750;
  text-transform:uppercase;letter-spacing:.14em;
}
.overview-hero h1{margin:0;font-size:clamp(30px,4vw,42px)}
.overview-hero p{margin:7px 0 12px}
.overview-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:12px;margin-bottom:18px}
.overview-stat{display:flex;flex-direction:column;gap:8px;text-decoration:none;transition:transform .15s,border-color .15s}
.overview-stat:hover{transform:translateY(-2px);border-color:#355778;text-decoration:none}
.overview-stat span{font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:#8fa5bd}
.overview-stat strong{font-size:28px;line-height:1;color:#f4f8fd;letter-spacing:-.04em}
.overview-lower{margin-top:0;gap:18px}
.overview-actions{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.overview-action{
  display:flex;align-items:flex-start;gap:10px;padding:12px;border:1px solid #26394f;border-radius:12px;
  background:#101b28;color:#dce9f7;transition:background .15s,border-color .15s,transform .15s;
}
.overview-action:hover{background:#142438;border-color:#3b5b7d;text-decoration:none;transform:translateY(-1px)}
.overview-action-icon{display:grid;place-items:center;width:30px;height:30px;flex:0 0 30px;border-radius:9px;
  background:rgba(59,130,246,.14);font-size:15px}
.overview-action strong{display:block;font-size:13px}
.overview-action small{display:block;color:#8298af;font-size:11px;margin-top:2px}
.overview-action-form{margin:0;min-width:0}
.overview-action-form .overview-action{width:100%;text-align:left;font:inherit;cursor:pointer}
.overview-action.danger{border-color:#7f1d1d;background:rgba(58,17,21,.55)}
.overview-action.danger .overview-action-icon{background:rgba(248,113,113,.14);color:#fecaca}
.section-title-row{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:12px}
.section-title-row h2{margin:0}
.monitor-user,.user,.settings-block{background:linear-gradient(180deg,rgba(18,30,44,.72),rgba(12,21,31,.62))}
@media(max-width:820px){
  .wrap,.wrap.wide{width:calc(100% - 18px);margin:18px auto 40px}
  .card{padding:16px;border-radius:15px}
  .topbar{position:relative;min-height:0}
  .tabs{position:relative;top:0;padding-left:10px;padding-right:10px;margin-bottom:16px}
  .overview-hero{padding:18px}
  .overview-actions{grid-template-columns:1fr}
  .overview-stats{grid-template-columns:repeat(2,1fr)}
}
@media(max-width:460px){
  .overview-stats{grid-template-columns:repeat(2,minmax(0,1fr))}
  .overview-stat{padding:13px}
  .overview-stat strong{font-size:23px}
  .card{padding:14px}
}

`;

function avatarColor(name) {
	let hash = 0;
	for (const char of String(name || "?")) hash = (hash * 31 + char.charCodeAt(0)) % 360;
	return `hsl(${hash} 42% 32%)`;
}

function userAvatar(name, icon, className = "user-avatar") {
	const initial = esc(String(name || "?").slice(0, 1).toUpperCase());
	const image = icon?.url
		? `<img src="${esc(icon.url)}" alt="" loading="lazy">`
		: initial;
	return `<span class="${esc(className)}" style="background:${avatarColor(name)}">${image}</span>`;
}

function shell(title, body, { topbar = "", chatFab = true, wide = false, full = false, head = "" } = {}) {
	return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>Inici - Classroom</title>
<link rel="icon" type="image/png" href="/favicon.png">
<script src="/page-i18n.js" defer></script>
${topbar ? '<script src="/session-guard.js" defer></script>' : ""}
<script src="/global-search.js?v=2" defer></script>
<style>${CSS}</style>
${head}
</head>
<body>
<div id="page-progress" class="page-progress" hidden><i></i></div>
${topbar}
<main class="wrap${wide ? " wide" : ""}${full ? " full" : ""}">${body}</main>
<footer>Proxy Web</footer>
${topbar ? `<form method="post" action="/api/panic" class="panic-button-form"><button class="panic-button" type="submit" title="Redirigir este dispositivo a Classroom durante 5 minutos">⚠ Pánico</button></form>` : ""}
${topbar && chatFab ? '<a class="chat-fab" href="/chat" aria-label="Abrir chat" title="Abrir chat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.4 8.9 8.9 0 0 1-3.6-.8L3 21l1.9-5.2A8.4 8.4 0 1 1 21 11.5Z"/></svg></a><script src="/chat-notify.js" defer></script>' : ""}
<script>
(() => {
  const bar = document.getElementById("page-progress");
  if (!bar) return;
  let timer = null;
  const show = () => {
    bar.hidden = false;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { bar.hidden = true; timer = null; }, 15000);
  };
  const hide = () => {
    bar.hidden = true;
    if (timer) { clearTimeout(timer); timer = null; }
  };
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
    try {
      if (new URL(link.href, location.href).origin === location.origin) show();
    } catch {}
  }, true);
})();
</script>
</body>
</html>`;
}

function topbar(user) {
	const roles = Array.isArray(user?.roles) && user.roles.length ? user.roles : [user?.role];
	const staff = roles.some((role) => ["admin", "creator", "moderator"].includes(role));
	const admin = staff ? '<a href="/admin">Administración</a>' : "";
	const alertCount = roles.some((role) => ["admin", "creator"].includes(role))
		? countOpenAlerts()
		: 0;
	const security = roles.some((role) => ["admin", "creator"].includes(role))
		? `<a href="/admin/security">Seguridad${alertCount ? ` <span class="alert-count">${alertCount}</span>` : ""}</a>`
		: "";
	const toolLinks = [];
	if (roles.includes("creator")) {
		toolLinks.push('<a href="/design">Herramientas</a>');
	} else {
		if (roles.includes("designer")) toolLinks.push('<a href="/design">Diseño</a>');
		if (roles.includes("pentester")) toolLinks.push('<a href="/pentest">Pentest</a>');
		if (roles.includes("qa")) toolLinks.push('<a href="/qa">QA</a>');
		if (roles.some((role) => ["designer", "pentester", "qa"].includes(role))) {
			toolLinks.push('<a href="/reports">Informes</a>');
		}
	}
	const roleNames = roles.map(roleLabel);
	const roleText = `${roleNames.slice(0, 2).join(" + ")}${roleNames.length > 2 ? ` +${roleNames.length - 2}` : ""}`;
	return `<header class="topbar">
  <div class="brand"><span class="brand-icon">${LOGO}</span>Proxy <span>Web</span></div>
  <a href="/">Proxy</a>
  <a href="/chat">Chat</a>
  <a href="/bookmarks">Favoritos</a>
  <a href="/history">Historial</a>
  <a href="/vault">Bóveda</a>
  <a href="/account">Mi cuenta</a>
  ${toolLinks.join("")}
  ${security}
  ${admin}
  ${user ? userAvatar(user.username, user.icon, "topbar-avatar") : ""}
  <span class="who">${esc(user?.username || "")} · ${esc(roleText)}</span>
  <form method="post" action="/logout" class="inline"><button class="link" type="submit">Salir</button></form>
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
	user: { icon: "👤", desc: "Navegación, chat y cuenta" },
	moderator: { icon: "🛡", desc: "Moderación y consulta" },
	designer: { icon: "🎨", desc: "Interfaz y sistema visual" },
	pentester: { icon: "🕵", desc: "Seguridad y pentest" },
	qa: { icon: "🧪", desc: "Pruebas y bugs" },
	admin: { icon: "⚙", desc: "Gestión completa" },
	creator: { icon: "👑", desc: "Cuenta propietaria" },
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
  <span class="role-option-icon">${esc(meta.icon)}</span>
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
${topbar(user)}
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
	return shell("Activar MFA · Proxy Web", body);
}

export function mfaRecoveryPage({ user, codes = [], title = "Códigos de recuperación", message = "" } = {}) {
	const body = `
${topbar(user)}
<div class="card" style="max-width:620px;margin:0 auto">
  <h1>${esc(title)}</h1>
  <p class="muted">${esc(message)}</p>
  <pre class="panel" style="font-size:16px;line-height:1.7">${esc(codes.join("\n"))}</pre>
  <p class="hint">Cada código se puede usar una sola vez. Guárdalos en un lugar seguro y sin conexión.</p>
  <a class="small primary-small" href="/account">He guardado los códigos</a>
</div>`;
	return shell("Códigos de recuperación · Proxy Web", body);
}

const HTTP_ERRORS = {
	400: ["Solicitud no válida", "La petición no tiene el formato esperado.", "🧩"],
	401: ["Necesitas iniciar sesión", "Tu sesión no es válida o ha caducado.", "🔐"],
	403: ["Acceso restringido", "No tienes permisos para ver este contenido.", "⛔"],
	404: ["Página no encontrada", "La dirección no existe o se ha movido.", "🧭"],
	405: ["Método no permitido", "Esta acción no está permitida en esta ruta.", "🛑"],
	408: ["Tiempo de espera agotado", "La petición tardó demasiado. Inténtalo de nuevo.", "⏳"],
	413: ["Contenido demasiado grande", "El archivo o formulario supera el límite permitido.", "📦"],
	418: ["Soy una tetera", "El servidor está haciendo café, no té.", "🫖"],
	421: ["Destino no válido", "El dominio usado para acceder no está permitido.", "🌐"],
	429: ["Demasiadas peticiones", "Has hecho demasiadas solicitudes en poco tiempo.", "🐢"],
	451: ["Contenido no disponible", "Este contenido no está disponible por motivos legales.", "⚖️"],
	500: ["Error interno", "Algo falló en el servidor. Ya se está revisando.", "🧯"],
	501: ["Aún no implementado", "Esta función todavía no está disponible.", "🚧"],
	502: ["Pasarela incorrecta", "Un servicio intermedio devolvió una respuesta no válida.", "🔌"],
	503: ["Servicio no disponible", "El servicio está temporalmente fuera de línea.", "🛠️"],
	504: ["Pasarela sin respuesta", "El servicio tardó demasiado en responder.", "📡"],
};

export function errorPage({
	status = 500,
	title = "",
	message = "",
	user = null,
	previewCodes = null,
} = {}) {
	const code = Number(status) || 500;
	const info = HTTP_ERRORS[code] || ["Error del servidor", "No se pudo completar la operación.", "⚠️"];
	const heading = title || info[0];
	const detail = message || info[1];
	const icon = info[2];
	const preview = Array.isArray(previewCodes) && previewCodes.length
		? `<div class="error-preview">
  <span>Vista previa</span>
  ${previewCodes.map((item) => `<a class="${item === code ? "active" : ""}" href="/admin/error-preview?code=${item}">${item}</a>`).join("")}
</div>`
		: "";
	const body = `<div class="error-screen">
  <div class="error-orbit" aria-hidden="true"><span>${esc(icon)}</span></div>
  <div class="error-code">${esc(code)}</div>
  <h1>${esc(heading)}</h1>
  <p>${esc(detail)}</p>
  <div class="error-actions">
    <a class="small primary-small" href="/">Volver al inicio</a>
    ${user ? '<a class="small" href="/account">Mi cuenta</a>' : '<a class="small" href="/login">Iniciar sesión</a>'}
    ${code >= 500 ? '<button class="small" type="button" onclick="location.reload()">Reintentar</button>' : ""}
    <button class="small" type="button" onclick="history.back()">Volver atrás</button>
  </div>
  ${code >= 500 ? '<p class="hint">Si el problema continúa, contacta con el administrador.</p>' : ""}
  ${preview}
</div>`;
	return shell(`${code} · ${heading}`, body, { topbar: user ? topbar(user) : "", chatFab: false });
}

export function accountPage({
	user,
	sessions = [],
	currentId = "",
	allowPasswordChange = true,
	mfa = {},
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
    ${userAvatar(user.username, user.icon, "account-avatar")}
    <div>
      <h1>Mi cuenta</h1>
      <p class="muted">
        Usuario <strong>${esc(user.username)}</strong> ·
        ${roleLabel(user.role)}
      </p>
    </div>
  </div>
  <p class="muted">
    <a href="/bookmarks">Favoritos</a> · <a href="/history">Historial</a> · <a href="/vault">Bóveda de contraseñas</a>
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
    ${userAvatar(user.username, user.icon, "account-avatar")}
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
	return shell("Historial · Proxy Web", body, { topbar: topbar(user) });
}

export function chatPage({
	user,
	settings,
	messages = [],
	pinned = [],
	readSeq = 0,
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
	notice = "",
	error = "",
} = {}) {
	const current = String(user?.username || "");
	const enabled = !!settings.chatEnabled;
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
		channel.type === "public" ? "#" : channel.type === "group" ? "◆" : channel.name.slice(0, 1).toUpperCase();
	const channelItems = channels
		.map(
			(channel) => `<button type="button" class="chat-channel-item${channel.id === currentChannel ? " active" : ""}" data-channel-id="${esc(channel.id)}">
  <span class="chat-channel-avatar" style="background:${avatarColor(channel.name)}">${esc(channelIcon(channel))}</span>
  <span class="chat-channel-text"><strong>${esc(channel.name)}</strong><small>${channel.type === "public" ? "Sala general" : channel.type === "group" ? "Grupo" : "Privado"}</small></span>
  ${channel.unread ? `<span class="chat-unread">${channel.unread > 99 ? "99+" : channel.unread}</span>` : ""}
</button>`,
		)
		.join("");
	const currentInfo = channels.find((channel) => channel.id === currentChannel) || channels[0] || { name: "General", type: "public" };
	const channelMeta =
		currentInfo.type === "public"
			? "Sala pública"
			: currentInfo.type === "group"
				? `Grupo · ${currentInfo.members?.length || 0} miembros`
				: "Chat privado";
	const channelOptions = channels
		.map(
			(channel) =>
				`<option value="${esc(channel.id)}"${channel.id === currentChannel ? " selected" : ""}>${esc(channel.name)}${channel.unread ? ` (${channel.unread})` : ""}</option>`,
		)
		.join("");
	const dmResults = dmCandidates
		.map((entry) => `<button type="button" class="friend-result dm-result" data-dm-user="${esc(entry.username)}" data-dm-name="${esc(entry.username.toLowerCase())}">
      ${userAvatar(entry.username, entry.icon, "chat-member-avatar")}
      <span class="friend-name">${esc(entry.username)}</span>
      <span class="badge">Privado</span>
    </button>`)
		.join("");
	const memberOptions = dmCandidates
		.map(
			(entry) => `<label class="chat-member-option" data-member-name="${esc(entry.username.toLowerCase())}">
      <input type="checkbox" name="members" value="${esc(entry.username)}">
      ${userAvatar(entry.username, entry.icon, "chat-member-avatar")}
      <span>${esc(entry.username)}</span>
    </label>`,
		)
		.join("");
	const friendResults = requestableUsers
		.map((entry) => `<form method="post" action="/api/friends/request" class="friend-result" data-friend-name="${esc(entry.username.toLowerCase())}">
      <input type="hidden" name="username" value="${esc(entry.username)}">
      <input type="hidden" name="next" value="${esc(returnTo)}">
      ${userAvatar(entry.username, entry.icon, "chat-member-avatar")}
      <span class="friend-name">${esc(entry.username)}</span>
      <button class="small primary-small" type="submit">Enviar solicitud</button>
    </form>`)
		.join("");
	const friendRows = friends
		.map((entry) => `<div class="friend-row">
      ${userAvatar(entry.username, entry.icon, "chat-member-avatar")}
      <span class="friend-name">${esc(entry.username)}</span>
      <form method="post" action="/api/friends/remove"><input type="hidden" name="username" value="${esc(entry.username)}"><input type="hidden" name="next" value="${esc(returnTo)}"><button class="small danger" type="submit">Quitar</button></form>
    </div>`)
		.join("");
	const incomingRows = incomingEntries
		.map((entry) => `<div class="friend-row">
      ${userAvatar(entry.username, entry.icon, "chat-member-avatar")}
      <span class="friend-name">${esc(entry.username)}</span>
      <div class="actions">
        <form method="post" action="/api/friends/accept"><input type="hidden" name="username" value="${esc(entry.username)}"><input type="hidden" name="next" value="${esc(returnTo)}"><button class="small primary-small" type="submit">Aceptar</button></form>
        <form method="post" action="/api/friends/reject"><input type="hidden" name="username" value="${esc(entry.username)}"><input type="hidden" name="next" value="${esc(returnTo)}"><button class="small danger" type="submit">Rechazar</button></form>
      </div>
    </div>`)
		.join("");
	const outgoingRows = outgoingEntries
		.map((entry) => `<div class="friend-row">
      ${userAvatar(entry.username, entry.icon, "chat-member-avatar")}
      <span class="friend-name">${esc(entry.username)}</span>
      <span class="badge">pendiente</span>
      <form method="post" action="/api/friends/cancel"><input type="hidden" name="username" value="${esc(entry.username)}"><input type="hidden" name="next" value="${esc(returnTo)}"><button class="small" type="submit">Cancelar</button></form>
    </div>`)
		.join("");
	const onlineChips = onlineUsers
		.map((name) => {
			const entry = userByName.get(String(name).toLowerCase());
			return `<span class="chat-user-chip">${userAvatar(name, entry?.icon, "chat-chip-avatar")}${esc(name)}</span>`;
		})
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

	const rows = messages
		.map((m) => {
			const role = String(m.role || "user");
			const own = String(m.username).toLowerCase() === current.toLowerCase();
			const canDelete = enabled && (canModerate || (allowDelete && own));
			const attachment = m.attachment
				? m.attachment.type?.startsWith("image/")
					? `<a class="chat-attachment" href="/api/chat/files/${esc(m.attachment.id)}" target="_blank" rel="noopener"><img src="/api/chat/files/${esc(m.attachment.id)}" alt="${esc(m.attachment.name)}" loading="lazy"></a>`
					: `<a class="chat-attachment file" href="/api/chat/files/${esc(m.attachment.id)}" target="_blank" rel="noopener">${esc(m.attachment.name)} · ${esc(fmtBytes(m.attachment.size))}</a>`
				: "";
			const poll = m.poll
				? `<div class="chat-poll">${(m.poll.options || [])
						.map(
							(option, index) =>
								`<button type="button" class="chat-poll-option" data-chat-vote="${index}"><span>${esc(option.text)}</span><b>${option.votes?.length || 0}</b></button>`,
						)
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
			const picker = `<details class="chat-reaction-menu"><summary title="Reaccionar" aria-label="Reaccionar">☺</summary><div class="chat-reaction-picker">${reactionSet
				.map(
					(emoji) =>
						`<button type="button" data-chat-react="${esc(emoji)}" aria-label="Reaccionar con ${esc(emoji)}">${esc(emoji)}</button>`,
				)
				.join("")}</div></details>`;
			const replyQuote = m.replyTo
				? `<div class="chat-reply-quote"><strong>@${esc(m.replyTo.username)}</strong><span>${esc((m.replyTo.text || "").slice(0, 140) || "Adjunto")}</span></div>`
				: "";
			const edited = m.editedAt
				? `<span class="chat-edited" title="Editado ${esc(fmtDate(m.editedAt))}">editado</span>`
				: "";
			const pinBadge = m.pinned ? '<span class="chat-pin-badge" title="Mensaje fijado">📌</span>' : "";
			const tools = `<div class="chat-msg-tools">
        <button type="button" class="chat-tool" data-chat-reply="${esc(m.id)}" title="Responder">↩</button>
        ${m.canEdit ? `<button type="button" class="chat-tool" data-chat-edit="${esc(m.id)}" title="Editar">✎</button>` : ""}
        ${m.canPin ? `<button type="button" class="chat-tool" data-chat-pin="${esc(m.id)}" data-pinned="${m.pinned ? "1" : "0"}" title="${m.pinned ? "Desfijar" : "Fijar"}">📌</button>` : ""}
        ${canDelete ? `<button type="button" class="chat-tool danger" data-chat-delete="${esc(m.id)}" title="Eliminar">🗑</button>` : ""}
      </div>`;
			return `<article class="chat-message${own ? " own" : ""}${m.pinned ? " pinned" : ""}" data-chat-message data-chat-id="${esc(m.id)}" data-chat-seq="${esc(m.seq)}">
  ${own ? "" : userAvatar(m.username, m.icon, "chat-msg-avatar")}
  <div class="chat-bubble">
    ${replyQuote}
    <div class="chat-meta">
      ${own ? "" : `<span class="chat-author">${esc(m.username)}</span>`}
      ${roleBadge(role, m.roles)}
      ${pinBadge}
      <time datetime="${esc(m.at)}">${esc(fmtChatDate(m.at, settings.timezone))}</time>
      ${edited}
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
						`<button type="button" class="chat-pin-chip" data-chat-jump="${esc(message.id)}" title="${esc(message.text || "")}"><span>📌</span><strong>${esc(message.username)}</strong><small>${esc((message.text || "").slice(0, 80) || "Adjunto")}</small></button>`,
				)
				.join("")
		: "";
	const body = enabled ? `
<div class="chat-app">
  <aside class="chat-sidebar">
    <div class="chat-sidebar-head">
      <div class="chat-sidebar-brand"><span class="chat-sidebar-mark">◉</span><div><strong>${esc(settings.chatTitle || "Chat")}</strong><small>Mensajería interna</small></div></div>
    </div>
    <div class="chat-sidebar-label">Conversaciones</div>
    <div class="chat-channel-list" id="chat-channel-list">${channelItems}</div>
    <div class="chat-sidebar-label">En línea</div>
    <div class="chat-online-users" id="chat-online-users">${onlineChips || '<span class="chat-sidebar-empty">Nadie conectado</span>'}</div>
  </aside>
  <section class="chat-main">
    <header class="chat-header">
      <div class="chat-header-info">
        <span class="chat-channel-avatar large" style="background:${avatarColor(currentInfo.name)}">${esc(channelIcon(currentInfo))}</span>
        <div>
          <h1 id="chat-channel-name">${esc(currentInfo.name)}</h1>
          <p><span id="chat-channel-meta">${esc(channelMeta)}</span>${settings.chatShowOnline ? ` <span class="chat-online" id="chat-online">${esc(online)} conectado${online === 1 ? "" : "s"}</span>` : ""}</p>
        </div>
      </div>
      <select id="chat-mobile-channel" class="chat-mobile-channel" aria-label="Canal">${channelOptions}</select>
      <div class="chat-header-actions">
        <button class="chat-action" type="button" id="chat-search-open" title="Buscar mensajes">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><span>Buscar</span>
        </button>
        <button class="chat-action" type="button" id="chat-friends" title="Amigos">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg><span>Amigos</span>${pendingCount ? `<b class="friend-badge">${pendingCount}</b>` : ""}
        </button>
        <button class="chat-action" type="button" id="chat-new-dm" title="Nuevo chat privado">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span>Privado</span>
        </button>
        <button class="chat-action" type="button" id="chat-new-group" title="Nuevo grupo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg><span>Grupo</span>
        </button>
        <button class="chat-action" type="button" id="chat-new-poll" title="Nueva encuesta">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg><span>Encuesta</span>
        </button>
        <a class="chat-action chat-exit" href="/" title="Salir del chat" aria-label="Salir del chat">×</a>
      </div>
    </header>
    ${notice ? `<p class="msg ok">${esc(notice)}</p>` : ""}
    ${error ? `<p class="msg error">${esc(error)}</p>` : ""}
    <p class="msg error" id="chat-error" hidden></p>
    <div class="chat-pinned-bar" id="chat-pinned-bar"${pinned.length ? "" : " hidden"}>
      <span class="chat-pinned-label">📌 Fijados</span>
      <div class="chat-pinned-list" id="chat-pinned-list">${pinnedHtml}</div>
    </div>
    <button type="button" class="chat-load-older" id="chat-load-older"${hasMore ? "" : " hidden"}>Cargar mensajes anteriores</button>
    <div class="chat-messages" id="chat-messages"
      data-channel="${esc(currentChannel)}"
      data-last-seq="${esc(latestSeq)}"
      data-read-seq="${esc(readSeq)}"
      data-has-more="${hasMore ? "1" : "0"}"
      data-revision="${esc(revision)}"
      data-current-user="${esc(current)}"
      data-max-length="${esc(settings.chatMaxLength)}"
      data-can-moderate="${canModerate ? "1" : "0"}"
      data-allow-delete="${allowDelete ? "1" : "0"}">
      ${rows || '<div class="chat-empty"><span class="chat-empty-icon">💬</span><strong>Todavía no hay mensajes</strong><span>Escribe el primero en este canal.</span></div>'}
    </div>
    <div class="chat-typing" id="chat-typing" hidden></div>
    <div class="chat-context-bar" id="chat-context" hidden>
      <span class="chat-context-label" id="chat-context-label"></span>
      <span class="chat-context-text" id="chat-context-text"></span>
      <button type="button" class="chat-context-cancel" id="chat-context-cancel" aria-label="Cancelar">×</button>
    </div>
    <div class="chat-upload-progress" id="chat-upload-progress" hidden><span id="chat-upload-bar"></span></div>
    <form method="post" action="/api/chat/messages" class="chat-composer" id="chat-form" autocomplete="off">
      <input type="hidden" name="channel" id="chat-channel-hidden" value="${esc(currentChannel)}">
      <label class="chat-attach" for="chat-file" title="Adjuntar archivo" aria-label="Adjuntar archivo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
      </label>
      <input id="chat-file" type="file" accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain" hidden>
      <div class="chat-compose-input">
        <textarea id="chat-input" name="text" maxlength="${esc(settings.chatMaxLength)}" rows="1" placeholder="Escribe un mensaje…" aria-label="Mensaje"></textarea>
        <div class="chat-compose-meta"><span id="chat-file-name" class="muted"></span><span class="chat-counter"><span id="chat-counter">0</span>/${esc(settings.chatMaxLength)}</span></div>
      </div>
      <button class="chat-send" type="submit" id="chat-send" title="Enviar" aria-label="Enviar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
      </button>
    </form>
  </section>
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
<script src="/chat.js" defer></script>` : `
<div class="card">
  <div class="chat-disabled">
    <p class="muted">El chat está desactivado por la administración.</p>
    ${["admin", "creator"].includes(user?.role) ? '<a class="small" href="/admin/settings">Activar en Ajustes</a>' : '<a class="small" href="/">Volver al proxy</a>'}
  </div>
</div>`;
	return shell(`${settings.chatTitle || "Chat"} · Proxy Web`, body, {
		topbar: topbar(user),
		chatFab: false,
		wide: true,
		full: true,
		head: '<link rel="stylesheet" href="/chat.css">',
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
	blockTemplates = [],
	notice = "",
	error = "",
} = {}) {
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
				return `<div class="${wrapper}">
  <div class="user-summary">
    <span class="user-summary-main">
      ${userAvatar(u.username, u.icon, "user-avatar")}
      <strong class="user-name">${esc(u.username)}</strong>
      ${roleBadges(u.roles, u.role)}
      ${self ? '<span class="badge">tú</span>' : ""}
    </span>
    <span class="user-summary-meta">${self ? '<a class="small" href="/account">Mi cuenta</a>' : ""}${esc(reason)}</span>
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
      ${userAvatar(u.username, u.icon, "user-avatar")}
      <strong class="user-name">${esc(u.username)}</strong>
      ${roleBadges(u.roles, u.role)}
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

	const body = `
${adminTabs("users", user.role)}
<div class="card" style="margin-bottom:22px">
  <h2>Escala de privilegios</h2>
  <ol class="role-scale">
    <li class="role-user"><strong>Usuario</strong><span>Navegación, chat, favoritos, historial propio y cuenta.</span></li>
    <li class="role-designer"><strong>Diseñador gráfico</strong><span>Herramientas de diseño, sistema visual, revisión de interfaz e informes de problemas visuales.</span></li>
    <li class="role-pentester"><strong>Pentester</strong><span>Checklist de seguridad, resumen de exposición e informes de vulnerabilidades. Sin acceso a datos de administración.</span></li>
    <li class="role-qa"><strong>QA / bugs</strong><span>Casos de prueba, entorno del navegador e informes de fallos con pasos para reproducirlos.</span></li>
    <li class="role-moderator"><strong>Moderador</strong><span>Consulta usuarios, actividad, sesiones, auditoría y solicitudes; puede bloquear o cerrar sesión solo a usuarios.</span></li>
    <li class="role-admin"><strong>Administrador</strong><span>Gestiona usuarios y moderadores, ajustes, seguridad y copias; no puede gestionar a otros administradores ni al creador.</span></li>
    <li class="role-creator"><strong>Creador</strong><span>Acceso total y cuenta protegida. <b>Único</b> que puede crear, ascender, degradar, resetear o eliminar administradores.</span></li>
  </ol>
  <p class="hint">Tu rol actual: <strong>${esc(roleLabel(user.role))}</strong>.</p>
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
	return shell("Usuarios · Administración", body, { topbar: topbar(user), wide: true });
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
	return shell("Seguridad · Administración", body, { topbar: topbar(user) });
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
	return shell("Movimientos · Seguridad", body, { topbar: topbar(user), wide: true });
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
	return shell("Tráfico · Administración", body, { topbar: topbar(user) });
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
			(action) => `<a class="overview-action${action.danger ? " danger" : ""}" href="${esc(action.href)}"><span class="overview-action-icon">${esc(action.icon || "→")}</span><span><strong>${esc(action.label)}</strong><small>${esc(action.detail || "")}</small></span></a>`,
		)
		.join("");
	const controlCards = `
<form method="post" action="/api/admin/maintenance" class="overview-action-form">
  <input type="hidden" name="enabled" value="${status.maintenance ? "0" : "1"}">
  <input type="hidden" name="next" value="/admin/overview">
  <button class="overview-action${status.maintenance ? " danger" : ""}" type="submit"><span class="overview-action-icon">🛠</span><span><strong>${status.maintenance ? "Desactivar mantenimiento" : "Activar mantenimiento"}</strong><small>${status.maintenance ? "Los usuarios ya pueden entrar" : "Solo administradores podrán entrar"}</small></span></button>
</form>
<form method="post" action="/api/admin/quarantine" class="overview-action-form">
  <input type="hidden" name="enabled" value="${status.quarantine ? "0" : "1"}">
  <input type="hidden" name="next" value="/admin/overview">
  <button class="overview-action${status.quarantine ? " danger" : ""}" type="submit"><span class="overview-action-icon">🧪</span><span><strong>${status.quarantine ? "Desactivar cuarentena" : "Activar cuarentena"}</strong><small>${status.quarantine ? "Volver a permitir conexiones" : "Cortar conexiones y bloquear webs"}</small></span></button>
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
	return shell("Resumen · Administración", body, { topbar: topbar(user), wide: true });
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
    ${userAvatar(entry.username, entry.icon, "user-avatar")}
    <div class="monitor-user-title">
      <strong>${esc(entry.username)}</strong>
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
<script src="/monitor.js" defer></script>`;
	return shell("Vigilancia · Administración", body, { topbar: topbar(user), wide: true });
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
  <p class="hint">Se guardan al pulsar “Guardar ajustes” o con <kbd>Ctrl</kbd> + <kbd>S</kbd>. Si otra pestaña ha cambiado los ajustes, se mostrará un aviso en vez de sobrescribirlos.</p>

  <div class="settings-toolbar">
    <label class="settings-search"><span>🔎</span><input id="settings-search" type="search" placeholder="Buscar ajuste: chat, sesiones, bloqueo…" aria-label="Buscar ajuste"></label>
    <span class="settings-dirty" id="settings-dirty" aria-live="polite">Sin cambios</span>
    <button class="primary" type="submit">Guardar ajustes</button>
  </div>
  <div class="settings-jump">
    <a href="#settings-security">🛡 Seguridad</a>
    <a href="#settings-performance">⚡ Rendimiento</a>
    <a href="#settings-activity">📊 Actividad</a>
    <a href="#settings-chat">💬 Chat</a>
    <a href="#settings-maintenance">🚧 Mantenimiento</a>
    <a href="#settings-quarantine">🧪 Cuarentena</a>
    <a href="#settings-sites">🌐 Sitios</a>
    <a href="#settings-language">🌍 Idioma</a>
    <a href="#settings-backups">💾 Copias</a>
    <a href="#settings-landing">🏠 Portada</a>
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
    <h3>🛡 Seguridad y sesiones</h3>
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
    <h3>📊 Actividad</h3>
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
    <h3>⚡ Rendimiento del proxy</h3>
    <div class="field-grid">
      <div>
        <label for="proxyBandwidthPerUserKbps">Ancho de banda por usuario (Kbps, 0 = sin límite)</label>
        <input id="proxyBandwidthPerUserKbps" name="proxyBandwidthPerUserKbps" type="number" min="0" max="100000" step="250" value="${esc(settings.proxyBandwidthPerUserKbps ?? 8000)}" required>
      </div>
      <div>
        <label for="proxyMaxStreamsPerUser">Máximo de streams por usuario</label>
        <input id="proxyMaxStreamsPerUser" name="proxyMaxStreamsPerUser" type="number" min="8" max="128" value="${esc(settings.proxyMaxStreamsPerUser ?? 32)}" required>
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
    <p class="hint">El límite de ancho de banda es por usuario y suma subida y bajada; 8000 Kbps ≈ 8 Mbps. Un stream es una conexión de red de la web (imágenes, vídeo, juegos…). Si hay muchos usuarios, baja el ancho de banda o los streams antes que el búfer.</p>
  </div>

  <div class="section settings-block" id="settings-chat" data-settings-search="chat mensajes usuarios grupos privados retención adjuntos">
    <h3>💬 Chat de usuarios</h3>
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
    <h3>🚧 Mantenimiento</h3>
    <label class="check"><input type="checkbox" name="maintenanceMode"${settings.maintenanceMode ? " checked" : ""}> Activar modo mantenimiento (solo administradores)</label>
    <label for="maintenanceMessage">Mensaje para los usuarios</label>
    <textarea id="maintenanceMessage" name="maintenanceMessage" maxlength="300" style="min-height:60px">${esc(settings.maintenanceMessage)}</textarea>
  </div>

  <div class="section settings-block" id="settings-quarantine" data-settings-search="cuarentena seguridad bloqueo conexiones">
    <h3>🧪 Cuarentena</h3>
    <label class="check"><input type="checkbox" name="quarantineMode"${settings.quarantineMode ? " checked" : ""}> Activar cuarentena (solo administradores)</label>
    <label for="quarantineMessage">Mensaje para los usuarios</label>
    <textarea id="quarantineMessage" name="quarantineMessage" maxlength="300" style="min-height:60px">${esc(settings.quarantineMessage || "")}</textarea>
    <p class="hint">Al activarla se rechazan nuevas peticiones de webs y se cierran las conexiones abiertas de usuarios.</p>
    <p class="hint"><a class="small" href="/admin/schedules">Programar mantenimiento y cuarentena</a></p>
  </div>

  <div class="section settings-block" id="settings-sites" data-settings-search="sitios dominios permitidos prohibidos lista negra blanca categorías adultos apuestas social">
    <h3>🌐 Sitios y modo de acceso</h3>
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
    <h3>🌍 Idioma de la interfaz</h3>
    <label for="language">Idioma por defecto</label>
    <select id="language" name="language">
      <option value="es"${settings.language === "es" ? " selected" : ""}>Español</option>
      <option value="en"${settings.language === "en" ? " selected" : ""}>English</option>
      <option value="ca"${settings.language === "ca" ? " selected" : ""}>Català</option>
    </select>
  </div>

  <div class="section settings-block" id="settings-backups" data-settings-search="copias backup métricas token retención">
    <h3>💾 Copias y métricas</h3>
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
    <h3>🏠 Portada y búsqueda</h3>
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
	return shell("Ajustes · Administración", body, { topbar: topbar(user), wide: true });
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
	return shell("Sistema · Administración", body, { topbar: topbar(user) });
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
	return shell("Informes · Proxy Web", body, { topbar: topbar(user) });
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
	return shell("Informes · Administración", body, { topbar: topbar(user) });
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
	return shell(`Informe · ${report.title}`, body, { topbar: topbar(user), wide: true });
}

const TOOL_CONFIG = {
	designer: {
		path: "/design",
		title: "Diseño gráfico",
		icon: "🎨",
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
		icon: "🛡",
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
		icon: "🧪",
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
			["Fondo", "#0b1017"],
			["Superficie", "#111c2e"],
			["Borde", "#243449"],
			["Texto", "#e5edf7"],
			["Muted", "#8298af"],
			["Azul", "#3b82f6"],
			["Éxito", "#4ade80"],
			["Error", "#f87171"],
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
      <label>Texto <input type="color" id="design-fg" value="#e5edf7"></label>
      <label>Fondo <input type="color" id="design-bg" value="#0b1017"></label>
    </div>
    <div class="contrast-preview" id="design-contrast-preview">Texto de ejemplo</div>
    <p class="tool-result" id="design-contrast-result"></p>
  </div>
  <div class="card">
    <h2>Paleta a partir de un color</h2>
    <div class="tool-inline">
      <label>Color base <input type="color" id="design-palette-base" value="#3b82f6"></label>
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
  <h1>${config.icon} ${esc(config.title)}</h1>
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
	return shell(`${config.title} · Herramientas`, body, { topbar: topbar(user), wide: true });
}

export function vaultPage({ user } = {}) {
	const body = `
<div class="card vault-shell" id="vault-app">
  <div class="vault-head">
    <div>
      <h1>🔐 Bóveda de contraseñas</h1>
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
		topbar: topbar(user),
		head: '<link rel="stylesheet" href="/vault.css">',
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
	return shell("Logs · Administración", body, { topbar: topbar(user) });
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
	return shell("Programación · Administración", body, { topbar: topbar(user) });
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
	return shell("Plantillas · Administración", body, { topbar: topbar(user) });
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
