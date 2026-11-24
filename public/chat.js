(() => {
	const box = document.getElementById("chat-messages");
	if (!box) return;
	const form = document.getElementById("chat-form");
	const input = document.getElementById("chat-input");
	const send = document.getElementById("chat-send");
	const counter = document.getElementById("chat-counter");
	const onlineEl = document.getElementById("chat-online");
	const errorEl = document.getElementById("chat-error");

	let lastSeq = Number(box.dataset.lastSeq) || 0;
	let generation = String(box.dataset.generation || "1");
	let maxLength = Number(box.dataset.maxLength) || 500;
	const currentUser = String(box.dataset.currentUser || "");
	const seen = new Set(
		[...box.querySelectorAll("[data-chat-id]")].map((el) => el.dataset.chatId),
	);
	let inFlight = false;
	let stopped = false;

	function showError(text) {
		if (!errorEl) return;
		errorEl.textContent = text;
		errorEl.hidden = false;
	}
	function clearError() {
		if (!errorEl) return;
		errorEl.hidden = true;
		errorEl.textContent = "";
	}
	function ensureEmpty() {
		if (box.querySelector("[data-chat-message]")) return;
		const empty = document.createElement("p");
		empty.className = "chat-empty";
		empty.id = "chat-empty";
		empty.textContent = "Todavía no hay mensajes. Escribe el primero.";
		box.appendChild(empty);
	}
	function removeEmpty() {
		document.getElementById("chat-empty")?.remove();
	}
	function nearBottom() {
		return box.scrollHeight - box.scrollTop - box.clientHeight < 90;
	}
	function scrollBottom(force = false) {
		if (force || nearBottom()) box.scrollTop = box.scrollHeight;
	}
	function timeText(value) {
		try {
			return new Date(value).toLocaleString("es-ES", {
				dateStyle: "short",
				timeStyle: "short",
			});
		} catch {
			return String(value || "");
		}
	}
	function makeMessage(message) {
		const article = document.createElement("article");
		const own =
			String(message.username).toLowerCase() === currentUser.toLowerCase();
		article.className = `chat-message${own ? " own" : ""}`;
		article.dataset.chatMessage = "";
		article.dataset.chatId = String(message.id);
		article.dataset.chatSeq = String(message.seq);

		const meta = document.createElement("div");
		meta.className = "chat-meta";
		const author = document.createElement("span");
		author.className = "chat-author";
		author.textContent = String(message.username);
		meta.appendChild(author);

		if (message.role === "admin" || message.role === "moderator") {
			const badge = document.createElement("span");
			badge.className = `badge${message.role === "admin" ? " admin" : ""}`;
			badge.textContent = message.role === "admin" ? "admin" : "moderador";
			meta.appendChild(badge);
		}

		const time = document.createElement("time");
		time.dateTime = String(message.at);
		time.textContent = timeText(message.at);
		meta.appendChild(time);

		if (message.canDelete) {
			const remove = document.createElement("button");
			remove.type = "button";
			remove.className = "link chat-delete";
			remove.dataset.chatDelete = String(message.id);
			remove.textContent = "Eliminar";
			meta.appendChild(remove);
		}

		const text = document.createElement("p");
		text.className = "chat-text";
		text.textContent = String(message.text);

		article.append(meta, text);
		return article;
	}
	function appendMessages(messages) {
		let added = false;
		for (const message of messages || []) {
			if (!message || !message.id || seen.has(String(message.id))) continue;
			if (Number(message.seq) <= lastSeq) continue;
			seen.add(String(message.id));
			box.appendChild(makeMessage(message));
			lastSeq = Math.max(lastSeq, Number(message.seq) || 0);
			added = true;
		}
		if (added) removeEmpty();
		return added;
	}
	function clearMessages() {
		for (const el of box.querySelectorAll("[data-chat-message]")) el.remove();
		seen.clear();
		lastSeq = 0;
		ensureEmpty();
	}
	function updateOnline(value) {
		if (!onlineEl || value === null || value === undefined) return;
		const n = Math.max(0, Number(value) || 0);
		onlineEl.textContent = `${n} conectado${n === 1 ? "" : "s"}`;
	}

	async function request(url, options = {}) {
		const response = await fetch(url, {
			cache: "no-store",
			...options,
			headers: { Accept: "application/json", ...(options.headers || {}) },
		});
		if (response.status === 401) {
			stopped = true;
			location.href = "/login?next=%2Fchat";
			throw new Error("Sesión caducada.");
		}
		if (response.status === 204) return {};
		let data = {};
		try {
			data = await response.json();
		} catch {}
		if (!response.ok) {
			const error = new Error(data.message || "No se pudo completar la acción.");
			error.status = response.status;
			error.data = data;
			throw error;
		}
		return data;
	}

	async function refresh() {
		if (inFlight || stopped || document.hidden) return;
		inFlight = true;
		try {
			let data = await request(`/api/chat/messages?after=${lastSeq}`);
			if (String(data.generation) !== generation || data.reset) {
				data = await request("/api/chat/messages?after=0");
				generation = String(data.generation || "1");
				clearMessages();
				appendMessages(data.messages);
			} else {
				appendMessages(data.messages);
			}
			lastSeq = Math.max(lastSeq, Number(data.latestSeq) || 0);
			updateOnline(data.online);
			if (Number(data.maxLength) > 0) maxLength = Number(data.maxLength);
			if (input && Number(input.maxLength) !== maxLength) input.maxLength = maxLength;
			if (counter) counter.textContent = String((input?.value || "").length);
			scrollBottom(false);
			clearError();
		} catch (error) {
			if (error.status === 403) {
				stopped = true;
				location.reload();
				return;
			}
			if (error.status !== 401) showError(error.message);
		} finally {
			inFlight = false;
		}
	}

	if (form && input) {
		let cooldownUntil = 0;
		const updateCounter = () => {
			if (counter) counter.textContent = String(input.value.length);
		};
		input.addEventListener("input", updateCounter);
		input.addEventListener("keydown", (event) => {
			if (event.key === "Enter" && !event.shiftKey) {
				event.preventDefault();
				form.requestSubmit();
			}
		});
		form.addEventListener("submit", async (event) => {
			event.preventDefault();
			const text = input.value.trim();
			if (!text) return;
			clearError();
			if (send) send.disabled = true;
			try {
				const data = await request("/api/chat/messages", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ text }),
				});
				input.value = "";
				updateCounter();
				if (data.message) {
					if (String(data.message.id) && !seen.has(String(data.message.id))) {
						seen.add(String(data.message.id));
						box.appendChild(makeMessage(data.message));
						lastSeq = Math.max(lastSeq, Number(data.message.seq) || 0);
						removeEmpty();
					}
					scrollBottom(true);
				}
			} catch (error) {
				showError(error.message);
				if (error.data?.retryAfter) {
					const wait = Math.max(1, Number(error.data.retryAfter) || 1);
					cooldownUntil = Date.now() + wait * 1000;
					if (send) send.disabled = true;
					setTimeout(() => {
						if (send && Date.now() >= cooldownUntil) send.disabled = false;
					}, wait * 1000);
				}
			} finally {
				if (send && Date.now() >= cooldownUntil) send.disabled = false;
				input.focus();
			}
		});
	}

	box.addEventListener("click", async (event) => {
		const button = event.target.closest("[data-chat-delete]");
		if (!button) return;
		if (!confirm("¿Eliminar este mensaje?")) return;
		const id = String(button.dataset.chatDelete || "");
		if (!id) return;
		button.disabled = true;
		try {
			await request(`/api/chat/messages/${encodeURIComponent(id)}/delete`, {
				method: "POST",
			});
			const article = button.closest("[data-chat-message]");
			seen.delete(id);
			article?.remove();
			ensureEmpty();
			clearError();
		} catch (error) {
			showError(error.message);
			button.disabled = false;
		}
	});

	document.addEventListener("visibilitychange", () => {
		if (!document.hidden) refresh();
	});
	setInterval(refresh, 4000);
	scrollBottom(true);
})();
