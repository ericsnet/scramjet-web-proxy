(() => {
	if (window.__chatNotifyLoaded) return;
	window.__chatNotifyLoaded = true;
	if (location.pathname === "/chat") return;

	const fab = document.querySelector(".chat-fab");
	let currentUser = "";
	let lastSeq = 0;
	let unread = 0;
	let stopped = false;
	let stack = null;

	function ensureStack() {
		if (stack) return stack;
		stack = document.createElement("div");
		stack.className = "chat-toast-stack";
		stack.setAttribute("aria-live", "polite");
		document.body.appendChild(stack);
		return stack;
	}

	function updateBadge() {
		if (!fab) return;
		let badge = fab.querySelector(".chat-fab-badge");
		if (unread <= 0) {
			badge?.remove();
			return;
		}
		if (!badge) {
			badge = document.createElement("span");
			badge.className = "chat-fab-badge";
			fab.appendChild(badge);
		}
		badge.textContent = unread > 99 ? "99+" : String(unread);
	}

	function showToast({ title, text, href = "/chat", tone = "" }) {
		const box = ensureStack();
		const toast = document.createElement("div");
		toast.className = `chat-toast${tone ? ` ${tone}` : ""}`;

		const heading = document.createElement("strong");
		heading.textContent = title;
		const body = document.createElement("span");
		body.textContent = text;
		const link = document.createElement("a");
		link.href = href;
		link.textContent = "Abrir chat";
		const close = document.createElement("button");
		close.type = "button";
		close.className = "chat-toast-close";
		close.setAttribute("aria-label", "Cerrar aviso");
		close.textContent = "×";
		close.addEventListener("click", () => toast.remove());

		toast.append(heading, body, link, close);
		box.appendChild(toast);
		while (box.children.length > 3) box.firstElementChild.remove();
		setTimeout(() => toast.remove(), 12000);
	}

	async function api(url, options = {}) {
		const response = await fetch(url, {
			cache: "no-store",
			...options,
			headers: { Accept: "application/json", ...(options.headers || {}) },
		});
		if (response.status === 401) {
			stopped = true;
			return null;
		}
		if (!response.ok) return null;
		if (response.status === 204) return {};
		try {
			return await response.json();
		} catch {
			return null;
		}
	}

	async function poll() {
		if (stopped || document.hidden) return;
		const data = await api(`/api/chat/messages?after=${lastSeq}`);
		if (!data) return;
		const messages = Array.isArray(data.messages) ? data.messages : [];
		const incoming = messages.filter(
			(message) =>
				String(message.username).toLowerCase() !== currentUser.toLowerCase(),
		);
		for (const message of incoming.slice(-3)) {
			const mentioned = Array.isArray(message.mentions) &&
				message.mentions.some((name) => String(name).toLowerCase() === currentUser.toLowerCase());
			showToast({
				title: mentioned ? `${message.username} te mencionó` : message.username,
				text: String(message.text || "").slice(0, 140),
				tone: mentioned ? "mention" : "",
			});
		}
		lastSeq = Math.max(lastSeq, Number(data.latestSeq) || 0);
		unread = Math.max(0, Number(data.unread) || 0);
		updateBadge();
	}

	async function init() {
		const data = await api("/api/chat/unread");
		if (!data) return;
		if (!data.enabled) {
			stopped = true;
			if (fab) fab.hidden = true;
			return;
		}
		currentUser = String(data.currentUser || "");
		lastSeq = Math.max(0, Number(data.latestSeq) || 0);
		unread = Math.max(0, Number(data.unread) || 0);
		updateBadge();
		if (unread > 0) {
			showToast({
				title: "Chat",
				text: `Tienes ${unread} mensaje${unread === 1 ? "" : "s"} nuevo${unread === 1 ? "" : "s"}.`,
				tone: "unread",
			});
		}
		setInterval(poll, 6000);
	}

	init();
})();
