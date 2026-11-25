(() => {
	const box = document.getElementById("chat-messages");
	if (!box) return;

	const channelList = document.getElementById("chat-channel-list");
	const channelHidden = document.getElementById("chat-channel-hidden");
	const form = document.getElementById("chat-form");
	const input = document.getElementById("chat-input");
	const send = document.getElementById("chat-send");
	const counter = document.getElementById("chat-counter");
	const onlineEl = document.getElementById("chat-online");
	const onlineUsersEl = document.getElementById("chat-online-users");
	const errorEl = document.getElementById("chat-error");
	const fileInput = document.getElementById("chat-file");
	const fileName = document.getElementById("chat-file-name");

	let channelId = String(box.dataset.channel || "general");
	let lastSeq = Number(box.dataset.lastSeq) || 0;
	let revision = String(box.dataset.revision || "0");
	let maxLength = Number(box.dataset.maxLength) || 500;
	const currentUser = String(box.dataset.currentUser || "");
	const seen = new Set(
		[...box.querySelectorAll("[data-chat-id]")].map((el) => el.dataset.chatId),
	);
	let inFlight = false;
	let stopped = false;
	let selectedFile = null;
	let cooldownUntil = 0;
	let channelsCache = [];
	let forceScroll = false;
	const channelName = document.getElementById("chat-channel-name");
	const channelMeta = document.getElementById("chat-channel-meta");

	const allowedReactions = ["👍", "❤️", "😂", "😮", "😢", "🔥"];
	const avatarColor = (name) => {
		let hash = 0;
		for (const char of String(name || "?")) hash = (hash * 31 + char.charCodeAt(0)) % 360;
		return `hsl(${hash} 42% 32%)`;
	};
	const channelIcon = (channel) =>
		channel.type === "public" ? "#" : channel.type === "group" ? "◆" : String(channel.name || "?").slice(0, 1).toUpperCase();

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
	function removeEmpty() {
		for (const empty of box.querySelectorAll(".chat-empty")) empty.remove();
	}
	function ensureEmpty() {
		removeEmpty();
		if (box.querySelector("[data-chat-message]")) return;
		const empty = document.createElement("p");
		empty.className = "chat-empty";
		empty.id = "chat-empty";
		empty.textContent = "Todavía no hay mensajes. Escribe el primero.";
		box.appendChild(empty);
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
	function roleBadge(role) {
		if (!["admin", "moderator", "creator"].includes(role)) return null;
		const badge = document.createElement("span");
		badge.className = `badge role-${role}`;
		badge.textContent = role === "creator" ? "creador" : role === "admin" ? "admin" : "moderador";
		return badge;
	}
	function makeAttachment(attachment) {
		if (!attachment) return null;
		const url = `/api/chat/files/${encodeURIComponent(attachment.id)}`;
		if (String(attachment.type || "").startsWith("image/")) {
			const link = document.createElement("a");
			link.className = "chat-attachment";
			link.href = url;
			link.target = "_blank";
			link.rel = "noopener";
			const image = document.createElement("img");
			image.src = url;
			image.alt = attachment.name || "imagen";
			image.loading = "lazy";
			link.appendChild(image);
			return link;
		}
		const link = document.createElement("a");
		link.className = "chat-attachment file";
		link.href = url;
		link.target = "_blank";
		link.rel = "noopener";
		link.textContent = `${attachment.name || "archivo"} · ${Math.ceil((attachment.size || 0) / 1024)} KB`;
		return link;
	}
	function makePoll(message) {
		if (!message.poll) return null;
		const poll = document.createElement("div");
		poll.className = "chat-poll";
		(message.poll.options || []).forEach((option, index) => {
			const button = document.createElement("button");
			button.type = "button";
			button.className = "chat-poll-option";
			button.dataset.chatVote = String(index);
			const label = document.createElement("span");
			label.textContent = option.text;
			const count = document.createElement("b");
			count.textContent = String(option.votes?.length || 0);
			button.append(label, count);
			poll.appendChild(button);
		});
		return poll;
	}
	function makeReactions(message) {
		const wrap = document.createElement("div");
		wrap.className = "chat-reactions";
		for (const [emoji, votes] of Object.entries(message.reactions || {})) {
			if (!votes?.length) continue;
			const button = document.createElement("button");
			button.type = "button";
			button.className = "chat-reaction";
			if (votes.some((v) => String(v).toLowerCase() === currentUser.toLowerCase())) {
				button.classList.add("mine");
			}
			button.dataset.chatReaction = emoji;
			button.textContent = `${emoji} ${votes.length}`;
			wrap.appendChild(button);
		}
		const menu = document.createElement("details");
		menu.className = "chat-reaction-menu";
		const summary = document.createElement("summary");
		summary.title = "Reaccionar";
		summary.textContent = "☺";
		const picker = document.createElement("div");
		picker.className = "chat-reaction-picker";
		for (const emoji of allowedReactions) {
			const button = document.createElement("button");
			button.type = "button";
			button.dataset.chatReact = emoji;
			button.textContent = emoji;
			picker.appendChild(button);
		}
		menu.append(summary, picker);
		wrap.appendChild(menu);
		return wrap;
	}
	function makeUserAvatar(name, icon, className) {
		const avatar = document.createElement("span");
		avatar.className = className;
		avatar.style.background = avatarColor(name);
		if (icon?.url) {
			const image = document.createElement("img");
			image.src = icon.url;
			image.alt = "";
			image.loading = "lazy";
			avatar.appendChild(image);
		} else {
			avatar.textContent = String(name || "?").slice(0, 1).toUpperCase();
		}
		return avatar;
	}
	function makeMessage(message) {
		const article = document.createElement("article");
		const own = String(message.username).toLowerCase() === currentUser.toLowerCase();
		article.className = `chat-message${own ? " own" : ""}`;
		article.dataset.chatMessage = "";
		article.dataset.chatId = String(message.id);
		article.dataset.chatSeq = String(message.seq);

		if (!own) {
			article.appendChild(makeUserAvatar(message.username, message.icon, "chat-msg-avatar"));
		}

		const bubble = document.createElement("div");
		bubble.className = "chat-bubble";
		const meta = document.createElement("div");
		meta.className = "chat-meta";
		if (!own) {
			const author = document.createElement("span");
			author.className = "chat-author";
			author.textContent = String(message.username);
			meta.appendChild(author);
		}
		const badge = roleBadge(message.role);
		if (badge) meta.appendChild(badge);
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
		bubble.appendChild(meta);
		if (message.text) {
			const text = document.createElement("p");
			text.className = "chat-text";
			for (const part of String(message.text).split(/(@[A-Za-z0-9._-]{3,32})/g)) {
				if (!part) continue;
				if (/^@[A-Za-z0-9._-]{3,32}$/.test(part)) {
					const mention = document.createElement("span");
					mention.className = "chat-mention";
					mention.textContent = part;
					text.appendChild(mention);
				} else {
					text.appendChild(document.createTextNode(part));
				}
			}
			bubble.appendChild(text);
		}
		const attachment = makeAttachment(message.attachment);
		if (attachment) bubble.appendChild(attachment);
		const poll = makePoll(message);
		if (poll) bubble.appendChild(poll);
		bubble.appendChild(makeReactions(message));
		article.appendChild(bubble);
		return article;
	}
	function clearMessages() {
		for (const el of box.querySelectorAll("[data-chat-message]")) el.remove();
		seen.clear();
		lastSeq = 0;
		ensureEmpty();
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
	function replaceMessage(message) {
		const old = box.querySelector(`[data-chat-id="${CSS.escape(String(message.id))}"]`);
		if (!old) return;
		const top = box.scrollTop;
		old.replaceWith(makeMessage(message));
		box.scrollTop = top;
	}
	function updateOnline(value, icons = null) {
		if (value === null || value === undefined) return;
		const list = Array.isArray(value) ? value : [];
		if (onlineEl) {
			const n = list.length;
			onlineEl.textContent = `${n} conectado${n === 1 ? "" : "s"}`;
		}
		if (onlineUsersEl) {
			onlineUsersEl.textContent = "";
			for (const name of list) {
				const chip = document.createElement("span");
				chip.className = "chat-user-chip";
				chip.appendChild(makeUserAvatar(name, icons?.[name], "chat-chip-avatar"));
				chip.appendChild(document.createTextNode(String(name)));
				onlineUsersEl.appendChild(chip);
			}
		}
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
	function markRead() {
		if (document.hidden || lastSeq <= 0) return;
		fetch("/api/chat/read", {
			method: "POST",
			headers: { "Content-Type": "application/json", Accept: "application/json" },
			body: JSON.stringify({ channel: channelId, seq: lastSeq }),
			keepalive: true,
		}).catch(() => {});
	}
	async function refresh() {
		if (inFlight || stopped || document.hidden) return;
		inFlight = true;
		const stick = forceScroll || nearBottom();
		forceScroll = false;
		const previousTop = box.scrollTop;
		let rebuilt = false;
		try {
			let data = await request(
				`/api/chat/messages?channel=${encodeURIComponent(channelId)}&after=${lastSeq}`,
			);
			if (String(data.revision) !== revision || data.reset) {
				data = await request(
					`/api/chat/messages?channel=${encodeURIComponent(channelId)}&after=0`,
				);
				revision = String(data.revision || "0");
				clearMessages();
				appendMessages(data.messages);
				rebuilt = true;
			} else {
				appendMessages(data.messages);
			}
			lastSeq = Math.max(lastSeq, Number(data.latestSeq) || 0);
			updateOnline(data.online, data.onlineIcons);
			if (Number(data.maxLength) > 0) maxLength = Number(data.maxLength);
			if (input && Number(input.maxLength) !== maxLength) input.maxLength = maxLength;
			if (counter) counter.textContent = String((input?.value || "").length);
			if (stick) scrollBottom(true);
			else if (rebuilt) box.scrollTop = previousTop;
			markRead();
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
	function updateHeader() {
		const channel = channelsCache.find((item) => item.id === channelId);
		if (!channel) return;
		if (channelName) channelName.textContent = channel.name;
		if (channelMeta) {
			channelMeta.textContent =
				channel.type === "public"
					? "Sala pública"
					: channel.type === "group"
						? `Grupo · ${channel.members?.length || 0} miembros`
						: "Chat privado";
		}
	}
	function renderChannelList() {
		if (!channelList) return;
		channelList.textContent = "";
		for (const channel of channelsCache) {
			const button = document.createElement("button");
			button.type = "button";
			button.className = `chat-channel-item${channel.id === channelId ? " active" : ""}`;
			button.dataset.channelId = channel.id;
			const avatar = document.createElement("span");
			avatar.className = "chat-channel-avatar";
			avatar.style.background = avatarColor(channel.name);
			avatar.textContent = channelIcon(channel);
			const text = document.createElement("span");
			text.className = "chat-channel-text";
			const title = document.createElement("strong");
			title.textContent = channel.name;
			const kind = document.createElement("small");
			kind.textContent =
				channel.type === "public" ? "Sala general" : channel.type === "group" ? "Grupo" : "Privado";
			text.append(title, kind);
			button.append(avatar, text);
			if (channel.unread) {
				const badge = document.createElement("span");
				badge.className = "chat-unread";
				badge.textContent = channel.unread > 99 ? "99+" : String(channel.unread);
				button.appendChild(badge);
			}
			channelList.appendChild(button);
		}
	}
	async function refreshChannels() {
		const data = await request("/api/chat/channels").catch(() => null);
		if (!data) return;
		channelsCache = data.channels || [];
		updateOnline(data.online, data.onlineIcons);
		renderChannelList();
		updateHeader();
	}
	function switchChannel(value) {
		channelId = value || "general";
		box.dataset.channel = channelId;
		if (channelHidden) channelHidden.value = channelId;
		const url = new URL(location.href);
		if (channelId === "general") url.searchParams.delete("channel");
		else url.searchParams.set("channel", channelId);
		history.replaceState(null, "", url);
		for (const item of channelList?.querySelectorAll("[data-channel-id]") || []) {
			item.classList.toggle("active", item.dataset.channelId === channelId);
		}
		updateHeader();
		seen.clear();
		lastSeq = 0;
		revision = "0";
		for (const el of box.querySelectorAll("[data-chat-message]")) el.remove();
		ensureEmpty();
		clearError();
		forceScroll = true;
		refresh();
	}
	async function uploadAndSend(text) {
		let attachment = "";
		if (selectedFile) {
			if (selectedFile.size > 5 * 1024 * 1024) throw new Error("El archivo supera 5 MB.");
			const response = await fetch("/api/chat/upload", {
				method: "POST",
				headers: {
					"Content-Type": "application/octet-stream",
					"X-File-Name": encodeURIComponent(selectedFile.name),
					"X-File-Type": selectedFile.type,
					Accept: "application/json",
				},
				body: selectedFile,
			});
			const data = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(data.error === "invalid-type" ? "Tipo de archivo no permitido." : "No se pudo subir el archivo.");
			attachment = data.upload.id;
		}
		return request("/api/chat/messages", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ text, channel: channelId, attachment }),
		});
	}

	if (channelList) {
		channelList.addEventListener("click", (event) => {
			const item = event.target.closest("[data-channel-id]");
			if (item) switchChannel(item.dataset.channelId);
		});
	}
	if (input) {
		input.addEventListener("input", () => {
			if (counter) counter.textContent = String(input.value.length);
		});
		input.addEventListener("keydown", (event) => {
			if (event.key === "Enter" && !event.shiftKey) {
				event.preventDefault();
				form?.requestSubmit();
			}
		});
	}
	if (fileInput) {
		fileInput.addEventListener("change", () => {
			selectedFile = fileInput.files?.[0] || null;
			if (fileName) fileName.textContent = selectedFile ? selectedFile.name : "";
		});
	}
	if (form && input) {
		form.addEventListener("submit", async (event) => {
			event.preventDefault();
			const text = input.value.trim();
			if (!text && !selectedFile) return;
			const stick = nearBottom();
			clearError();
			if (send) send.disabled = true;
			try {
				const data = await uploadAndSend(text);
				input.value = "";
				selectedFile = null;
				if (fileInput) fileInput.value = "";
				if (fileName) fileName.textContent = "";
				if (counter) counter.textContent = "0";
				if (data.message) replaceMessage(data.message);
				await refresh();
				await refreshChannels();
				if (stick) scrollBottom(true);
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
		const deleteButton = event.target.closest("[data-chat-delete]");
		if (deleteButton) {
			if (!confirm("¿Eliminar este mensaje?")) return;
			deleteButton.disabled = true;
			try {
				await request(`/api/chat/messages/${encodeURIComponent(deleteButton.dataset.chatDelete)}/delete`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ channel: channelId }),
				});
				const article = deleteButton.closest("[data-chat-message]");
				const top = box.scrollTop;
				seen.delete(String(deleteButton.dataset.chatDelete));
				article?.remove();
				box.scrollTop = top;
				ensureEmpty();
				await refreshChannels();
			} catch (error) {
				showError(error.message);
				deleteButton.disabled = false;
			}
			return;
		}
		const reaction = event.target.closest("[data-chat-react],[data-chat-reaction]");
		if (reaction) {
			event.preventDefault();
			const article = reaction.closest("[data-chat-message]");
			const messageId = article?.dataset.chatId;
			const emoji = reaction.dataset.chatReact || reaction.dataset.chatReaction;
			if (!messageId || !emoji) return;
			try {
				const data = await request(
					`/api/chat/messages/${encodeURIComponent(messageId)}/reaction`,
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ emoji, channel: channelId }),
					},
				);
				if (data.message) replaceMessage(data.message);
			} catch (error) {
				showError(error.message);
			}
			return;
		}
		const vote = event.target.closest("[data-chat-vote]");
		if (vote) {
			const article = vote.closest("[data-chat-message]");
			const messageId = article?.dataset.chatId;
			if (!messageId) return;
			try {
				const data = await request(
					`/api/chat/polls/${encodeURIComponent(messageId)}/vote`,
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ option: Number(vote.dataset.chatVote), channel: channelId }),
					},
				);
				if (data.message) replaceMessage(data.message);
			} catch (error) {
				showError(error.message);
			}
		}
	});

	function bindDialog(openId, dialogId) {
		const open = document.getElementById(openId);
		const dialog = document.getElementById(dialogId);
		open?.addEventListener("click", () => dialog?.showModal());
	}
	bindDialog("chat-new-dm", "chat-dm-dialog");
	bindDialog("chat-new-group", "chat-group-dialog");
	bindDialog("chat-new-poll", "chat-poll-dialog");
	document.querySelectorAll("[data-close-dialog]").forEach((button) => {
		button.addEventListener("click", () => button.closest("dialog")?.close());
	});

	document.getElementById("chat-dm-create")?.addEventListener("click", async () => {
		const select = document.getElementById("chat-dm-user");
		if (!select?.value) return;
		try {
			await request("/api/chat/channels/dm", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ username: select.value }),
			});
			document.getElementById("chat-dm-dialog")?.close();
			await refreshChannels();
			await refreshChannels();
			const dm = channelsCache.find(
				(channel) =>
					channel.type === "dm" &&
					channel.name.toLowerCase() === select.value.toLowerCase(),
			);
			if (dm) switchChannel(dm.id);
		} catch (error) {
			showError(error.message);
		}
	});
	document.getElementById("chat-group-search")?.addEventListener("input", (event) => {
		const query = String(event.target.value || "").toLowerCase().trim();
		for (const option of document.querySelectorAll("#chat-group-members .chat-member-option")) {
			const matches = !query || option.dataset.memberName.includes(query);
			option.hidden = !matches;
			option.style.display = matches ? "" : "none";
		}
		const empty = document.getElementById("chat-group-empty");
		if (empty) {
			const anyVisible = [...document.querySelectorAll("#chat-group-members .chat-member-option")].some(
				(option) => option.style.display !== "none",
			);
			empty.hidden = anyVisible;
		}
	});
	document.getElementById("chat-group-create")?.addEventListener("click", async () => {
		const name = document.getElementById("chat-group-name");
		const members = document.getElementById("chat-group-members");
		const selected = [...(members?.querySelectorAll('input[type="checkbox"]:checked') || [])].map(
			(input) => input.value,
		);
		if (!name?.value.trim() || !selected.length) {
			showError("Pon un nombre y elige al menos un miembro.");
			return;
		}
		try {
			const data = await request("/api/chat/channels/group", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: name.value, members: selected }),
			});
			document.getElementById("chat-group-dialog")?.close();
			await refreshChannels();
			if (data.channel) switchChannel(data.channel.id);
		} catch (error) {
			showError(error.message);
		}
	});
	document.getElementById("chat-poll-create")?.addEventListener("click", async () => {
		const question = document.getElementById("chat-poll-question");
		const options = document.getElementById("chat-poll-options");
		const values = String(options?.value || "").split("\n").map((v) => v.trim()).filter(Boolean);
		try {
			const data = await request("/api/chat/polls", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ channel: channelId, question: question?.value || "", options: values }),
			});
			document.getElementById("chat-poll-dialog")?.close();
			if (data.message) replaceMessage(data.message);
			await refresh();
		} catch (error) {
			showError(error.message);
		}
	});

	document.addEventListener("visibilitychange", () => {
		if (!document.hidden) {
			refresh();
			markRead();
		}
	});
	setInterval(refresh, 4000);
	setInterval(refreshChannels, 15000);
	markRead();
	refresh();
	refreshChannels();
	scrollBottom(true);
})();
