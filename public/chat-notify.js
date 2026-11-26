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

	function stackTarget() {
		const wrapper = document.getElementById("sj-frame-wrapper");
		if (!wrapper) return document.body;
		const fullscreen = document.fullscreenElement;
		if (fullscreen && wrapper.contains(fullscreen)) return wrapper;
		if (wrapper.classList.contains("immersive")) return wrapper;
		return document.body;
	}

	function placeStack() {
		if (!stack) return;
		const target = stackTarget();
		if (stack.parentElement !== target) target.appendChild(stack);
	}

	function ensureStack() {
		if (!stack) {
			stack = document.createElement("div");
			stack.className = "chat-toast-stack";
			stack.setAttribute("aria-live", "polite");
		}
		placeStack();
		return stack;
	}

	const frameShell = document.getElementById("sj-frame-wrapper");
	if (frameShell) {
		new MutationObserver(placeStack).observe(frameShell, {
			attributes: true,
			attributeFilter: ["class"],
		});
	}
	for (const event of ["fullscreenchange", "webkitfullscreenchange"]) {
		document.addEventListener(event, placeStack);
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

	let audioContext = null;
	function unlockAudio() {
		try {
			audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
			if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
		} catch {}
	}
	window.addEventListener("pointerdown", unlockAudio, { once: true, capture: true });
	window.addEventListener("keydown", unlockAudio, { once: true, capture: true });
	function playSound() {
		if (!audioContext || audioContext.state !== "running") return;
		try {
			const now = audioContext.currentTime;
			const osc = audioContext.createOscillator();
			const gain = audioContext.createGain();
			osc.type = "sine";
			osc.frequency.setValueAtTime(880, now);
			osc.frequency.setValueAtTime(1174.66, now + 0.09);
			gain.gain.setValueAtTime(0.0001, now);
			gain.gain.exponentialRampToValueAtTime(0.055, now + 0.015);
			gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
			osc.connect(gain);
			gain.connect(audioContext.destination);
			osc.start(now);
			osc.stop(now + 0.36);
		} catch {}
	}

	function avatarColor(name) {
		let hash = 0;
		for (const char of String(name || "?")) hash = (hash * 31 + char.charCodeAt(0)) % 360;
		return `hsl(${hash} 42% 34%)`;
	}

	function showToast({ title, text, href = "/chat", tone = "", icon = "", name = "" }) {
		const box = ensureStack();
		const toast = document.createElement("div");
		toast.className = `chat-toast${tone ? ` ${tone}` : ""}`;

		const avatar = document.createElement("span");
		avatar.className = "chat-toast-avatar";
		avatar.style.background = avatarColor(name || title);
		if (icon) {
			const image = document.createElement("img");
			image.src = icon;
			image.alt = "";
			avatar.appendChild(image);
		} else {
			avatar.textContent = String(name || title || "?").slice(0, 1).toUpperCase();
		}

		const heading = document.createElement("strong");
		heading.textContent = title;
		const body = document.createElement("span");
		body.className = "chat-toast-text";
		body.textContent = text;
		const link = document.createElement("a");
		link.href = href;
		link.className = "chat-toast-link";
		link.textContent = "Abrir chat →";
		const close = document.createElement("button");
		close.type = "button";
		close.className = "chat-toast-close";
		close.setAttribute("aria-label", "Cerrar aviso");
		close.textContent = "×";
		close.addEventListener("click", (event) => {
			event.stopPropagation();
			toast.remove();
		});

		toast.addEventListener("click", () => {
			location.href = href;
		});
		toast.append(avatar, heading, body, link, close);
		box.appendChild(toast);
		while (box.children.length > 3) box.firstElementChild.remove();
		setTimeout(() => toast.remove(), 15000);
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
		const data = await api(`/api/chat/notifications?after=${lastSeq}`);
		if (!data) return;
		const messages = Array.isArray(data.messages) ? data.messages : [];
		const incoming = messages.filter(
			(message) =>
				String(message.username).toLowerCase() !== currentUser.toLowerCase(),
		);
		if (incoming.length) playSound();
		for (const message of incoming.slice(-3)) {
			const mentioned = Array.isArray(message.mentions) &&
				message.mentions.some((name) => String(name).toLowerCase() === currentUser.toLowerCase());
			const audio = String(message.attachment?.type || "").startsWith("audio/");
			showToast({
				title: mentioned ? `${message.username} te mencionó` : message.username,
				text: String(
					message.text ||
						(audio ? "🎤 Audio" : message.attachment ? "Archivo adjunto" : ""),
				).slice(0, 180),
				tone: mentioned ? "mention" : "",
				icon: message.icon?.url || "",
				name: message.username,
				href: `/chat?channel=${encodeURIComponent(message.channelId || "general")}`,
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
				name: "Chat",
			});
		}
		setInterval(poll, 5000);
	}

	init();
})();
