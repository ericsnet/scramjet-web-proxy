/*
 * Analítica del panel: solo pulsaciones y formularios del propio proxy.
 * No lee el iframe, ni URLs visitadas, ni texto escrito, ni teclas.
 * El servidor descarta eventos si la analítica está apagada o el usuario
 * ha desactivado su perfil de uso.
 */
(() => {
	if (window.__pwUsage) return;
	window.__pwUsage = true;

	const body = document.body;
	if (!body || body.dataset.usageEnabled === "0") return;

	const ENDPOINT = "/api/usage";
	const MAX_QUEUE = 12;
	const FLUSH_MS = 5000;
	const startedAt = Date.now();

	const NAV = {
		"/": "nav.home",
		"/chat": "nav.chat",
		"/bookmarks": "nav.bookmarks",
		"/history": "nav.history",
		"/vault": "nav.vault",
		"/account": "nav.account",
		"/invites": "nav.invites",
		"/admin/overview": "nav.admin.overview",
		"/admin": "nav.admin.users",
		"/admin/sessions": "nav.admin.sessions",
		"/admin/security": "nav.admin.security",
		"/admin/traffic": "nav.admin.traffic",
		"/admin/monitor": "nav.admin.monitor",
		"/admin/activity": "nav.admin.activity",
		"/admin/audit": "nav.admin.audit",
		"/admin/requests": "nav.admin.requests",
		"/admin/reports": "nav.admin.reports",
		"/admin/stats": "nav.admin.stats",
		"/admin/usage": "nav.admin.usage",
		"/admin/settings": "nav.admin.settings",
		"/admin/system": "nav.admin.system",
		"/admin/logs": "nav.admin.logs",
		"/admin/templates": "nav.admin.templates",
		"/admin/schedules": "nav.admin.schedules",
		"/design": "nav.design",
		"/pentest": "nav.pentest",
		"/qa": "nav.qa",
		"/reports": "nav.reports",
	};

	const SELECTORS = [
		["#sj-form", "proxy.navigate"],
		["#landing-new-tab-btn", "proxy.newtab"],
		["#new-tab-btn", "proxy.newtab"],
		["#home-btn", "proxy.home"],
		["#back-btn", "proxy.back"],
		["#forward-btn", "proxy.forward"],
		["#reload-btn", "proxy.reload"],
		["#fullscreen-btn", "proxy.fullscreen"],
		["#bookmark-btn", "proxy.bookmark"],
		["#vault-toolbar-btn", "proxy.vault"],
		["#reader-btn", "proxy.reader"],
		["#zoom-in-btn", "proxy.zoom.in"],
		["#zoom-out-btn", "proxy.zoom.out"],
		["#sj-retry", "proxy.retry"],
		["#sj-error-home", "proxy.home"],
		["#blocked-request-btn", "proxy.unblock.request"],
		["#quick-links a", "proxy.quicklink"],
		["#recent-links a", "proxy.recent"],
		["#favorites a", "proxy.favorite"],
		["[data-global-search]", "shell.search"],
		["[data-theme-toggle]", "shell.theme"],
		["#sidebar-toggle", "shell.sidebar"],
		["#nav-toggle", "shell.menu"],
		["#app-sidebar-close", "shell.menu"],
		[".topbar-user", "shell.user"],
		[".brand", "shell.brand"],
		[".chat-fab", "shell.chatfab"],
		[".panic-button", "shell.panic"],
		["#chat-form", "chat.send"],
		["#chat-send", "chat.send"],
		["#chat-new-dm", "chat.dm.create"],
		["#chat-new-group", "chat.group.create"],
		["#chat-search-open", "chat.search"],
		["#chat-details-open", "chat.details"],
		["#chat-details-close", "chat.details"],
		["#chat-mobile-channel", "chat.mobile.channel"],
		["#chat-file", "chat.attach"],
		["#chat-mic", "chat.attach"],
		["#chat-load-older", "chat.load.older"],
		["#chat-new-poll", "chat.poll.create"],
		["#chat-poll-create", "chat.poll.create"],
		["#chat-alias-open", "chat.alias"],
		["#chat-friends", "chat.friends"],
		["#chat-sidebar-open", "shell.menu"],
		[".chat-channel-item", "chat.channel"],
		[".chat-tool[data-chat-reply]", "chat.reply"],
		[".chat-tool[data-chat-edit]", "chat.edit"],
		[".chat-tool[data-chat-delete]", "chat.delete"],
		[".chat-tool[data-chat-pin]", "chat.pin"],
		[".chat-pin-chip", "chat.jump"],
		[".chat-poll-option", "chat.poll.vote"],
		[".chat-reaction", "chat.react"],
		[".chat-reaction-picker button", "chat.react"],
		[".chat-search-result", "chat.jump"],
		["#vault-unlock-btn", "vault.unlock"],
		["#vault-lock-btn", "vault.lock"],
		["#vault-setup-btn", "vault.setup"],
		["#vault-add-btn", "vault.entry.add"],
		["#vault-save-entry", "vault.entry.edit"],
		["#vault-generate-password", "vault.generate"],
		["#vault-search", "vault.search"],
		["#vault-reset-link", "vault.setup"],
		["#account-icon-pick", "account.icon"],
		["#users-import-run", "admin.users.import"],
	];

	const FORMS = [
		[/^\/api\/account\/password/, "account.password"],
		[/^\/api\/account\/mfa\/start/, "account.mfa.enable"],
		[/^\/api\/account\/mfa\/disable/, "account.mfa.disable"],
		[/^\/api\/account\/mfa\/recovery/, "account.mfa.recovery"],
		[/^\/api\/account\/icon\//, "account.icon"],
		[/^\/api\/account\/language/, "account.language"],
		[/^\/api\/account\/sessions\/revoke-others/, "account.sessions.revoke.others"],
		[/^\/api\/account\/sessions\/.+\/revoke/, "account.sessions.revoke"],
		[/^\/api\/account\/usage/, "account.usage.optout"],
		[/^\/api\/admin\/settings\/reset/, "admin.settings.reset"],
		[/^\/api\/admin\/settings/, "admin.settings.save"],
		[/^\/api\/admin\/users/, "admin.users.edit"],
		[/^\/api\/admin\/groups/, "admin.group.rules"],
		[/^\/api\/admin\/backup\/create/, "admin.backup.create"],
		[/^\/api\/admin\/backup\/restore/, "admin.backup.restore"],
		[/^\/api\/admin\/audit\/clear/, "admin.audit.clear"],
		[/^\/api\/admin\/security\/ban/, "admin.security.ban"],
		[/^\/api\/admin\/security\/unban/, "admin.security.unban"],
		[/^\/api\/admin\/security\/dismiss/, "admin.security.dismiss"],
		[/^\/api\/admin\/requests\/.+\/approve/, "admin.requests.approve"],
		[/^\/api\/admin\/requests\/.+\/deny/, "admin.requests.deny"],
		[/^\/api\/admin\/reports\/.+/, "admin.reports.update"],
		[/^\/api\/admin\/schedules/, "admin.schedules.add"],
		[/^\/api\/admin\/templates/, "admin.templates.add"],
		[/^\/api\/admin\/maintenance/, "admin.maintenance"],
		[/^\/api\/admin\/adblock/, "admin.adblock.update"],
		[/^\/api\/admin\/categories/, "admin.categories.refresh"],
		[/^\/api\/admin\/chat/, "admin.chat.clear"],
		[/^\/logout/, "shell.logout"],
		[/^\/api\/panic/, "shell.panic"],
		[/^\/api\/invite/, "auth.invite.accept"],
	];

	let queue = [];
	let timer = 0;
	let sentView = false;
	let sentTime = false;

	function page() {
		return location.pathname || "/";
	}

	function zoneFor(el) {
		const node = el && el.closest ? el.closest("[data-zone]") : null;
		return node ? node.getAttribute("data-zone") : "content";
	}

	function controlFor(el) {
		if (!el || !el.tagName) return "other";
		const tag = el.tagName.toLowerCase();
		if (tag === "button") return el.type === "submit" ? "submit" : "button";
		if (tag === "a") return "link";
		if (tag === "summary") return "summary";
		if (tag === "select") return "select";
		if (tag === "textarea") return "textarea";
		if (tag === "label") return "label";
		if (tag === "option") return "option";
		if (tag === "input") return el.type === "submit" ? "submit" : "input";
		return "other";
	}

	function navFor(el) {
		const link = el.closest ? el.closest("a[href]") : null;
		if (!link) return "";
		try {
			const url = new URL(link.getAttribute("href"), location.href);
			if (url.origin !== location.origin) return "";
			return NAV[url.pathname] || "";
		} catch {
			return "";
		}
	}

	function featureFor(el) {
		const marked = el.closest ? el.closest("[data-usage]") : null;
		if (marked) {
			const value = marked.getAttribute("data-usage");
			if (value) return value;
		}
		const nav = navFor(el);
		if (nav) return nav;
		for (const [selector, key] of SELECTORS) {
			if (el.closest(selector)) return key;
		}
		return "";
	}

	function push(event) {
		queue.push(event);
		if (queue.length >= MAX_QUEUE) flush(false);
		else if (!timer) timer = setTimeout(() => flush(false), FLUSH_MS);
	}

	function payload(extra = {}) {
		const events = queue.slice(0, 40);
		queue = queue.slice(40);
		const data = { page: page(), events, ...extra };
		if (!sentView) {
			data.view = true;
			sentView = true;
		}
		return data;
	}

	function send(data) {
		try {
			const json = JSON.stringify(data);
			if (navigator.sendBeacon) {
				const blob = new Blob([json], { type: "application/json" });
				if (navigator.sendBeacon(ENDPOINT, blob)) return;
			}
			fetch(ENDPOINT, {
				method: "POST",
				credentials: "same-origin",
				headers: { "content-type": "application/json" },
				body: json,
				keepalive: true,
			}).catch(() => {});
		} catch {
			// La analítica nunca debe romper la interfaz.
		}
	}

	function flush(time = false) {
		if (timer) {
			clearTimeout(timer);
			timer = 0;
		}
		if (time && !sentTime) {
			const seconds = Math.round((Date.now() - startedAt) / 1000);
			const bucket = seconds < 5 ? "0-5" : seconds < 30 ? "5-30" : seconds < 120 ? "30-120" : "120+";
			queue.push({ t: "time", d: bucket });
			sentTime = true;
		}
		const data = payload();
		if (!data.events.length && !data.view) return;
		send(data);
	}

	document.addEventListener(
		"click",
		(event) => {
			const target = event.target;
			if (!(target instanceof Element)) return;
			const el = target.closest("a,button,summary,input,select,textarea,label,option,[data-usage]");
			if (!el) {
				push({ z: zoneFor(target), c: "other" });
				return;
			}
			const control = controlFor(el);
			if (control === "submit") return;
			const feature = featureFor(el);
			push(feature ? { f: feature, z: zoneFor(el), c: control } : { z: zoneFor(el), c: control });
		},
		true,
	);

	document.addEventListener(
		"submit",
		(event) => {
			const form = event.target;
			if (!(form instanceof HTMLFormElement)) return;
			const marked = form.getAttribute("data-usage");
			let feature = marked || "";
			if (!feature) {
				for (const [selector, key] of SELECTORS) {
					if (form.matches(selector)) {
						feature = key;
						break;
					}
				}
			}
			if (!feature) {
				const action = form.getAttribute("action") || "";
				for (const [pattern, key] of FORMS) {
					if (pattern.test(action)) {
						feature = key;
						break;
					}
				}
			}
			push(feature ? { f: feature, z: zoneFor(form), c: "submit" } : { z: zoneFor(form), c: "submit" });
			flush(false);
		},
		true,
	);

	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState === "hidden") flush(true);
	});
	window.addEventListener("pagehide", () => flush(true));

	// Vista inicial: un único evento por carga de página.
	flush(false);
})();
