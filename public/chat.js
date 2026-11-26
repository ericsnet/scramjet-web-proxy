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
	const typingEl = document.getElementById("chat-typing");
	const pinnedBar = document.getElementById("chat-pinned-bar");
	const pinnedList = document.getElementById("chat-pinned-list");
	const contextBar = document.getElementById("chat-context");
	const contextLabel = document.getElementById("chat-context-label");
	const contextText = document.getElementById("chat-context-text");
	const contextCancel = document.getElementById("chat-context-cancel");
	const uploadProgress = document.getElementById("chat-upload-progress");
	const uploadBar = document.getElementById("chat-upload-bar");
	const searchOpen = document.getElementById("chat-search-open");
	const searchDialog = document.getElementById("chat-search-dialog");
	const searchInput = document.getElementById("chat-search-input");
	const searchCurrent = document.getElementById("chat-search-current");
	const searchResults = document.getElementById("chat-search-results");
	const loadOlderButton = document.getElementById("chat-load-older");

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
	let replyTarget = null;
	let editTarget = null;
	let readSeq = Number(box.dataset.readSeq) || 0;
	let hasMore = box.dataset.hasMore === "1";
	let lastTypingAt = 0;
	let lastRenderedAt = "";
	let lastRenderedUser = "";
	let loadingOlder = false;
	const messageStore = new Map();
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
	function roleBadge(role, roles = []) {
		const labels = {
			creator: "creador",
			admin: "admin",
			moderator: "moderador",
			designer: "diseño",
			pentester: "pentester",
			qa: "QA",
		};
		const list = (Array.isArray(roles) && roles.length ? roles : [role]).filter(
			(value) => value && value !== "user" && labels[value],
		);
		if (!list.length) return null;
		const wrap = document.createElement("span");
		wrap.className = "chat-role-badges";
		for (const value of list) {
			const badge = document.createElement("span");
			badge.className = `badge role-${value}`;
			badge.textContent = labels[value];
			wrap.appendChild(badge);
		}
		return wrap;
	}
	function dayLabel(value) {
		const date = new Date(value);
		const today = new Date();
		const yesterday = new Date();
		yesterday.setDate(today.getDate() - 1);
		if (date.toDateString() === today.toDateString()) return "Hoy";
		if (date.toDateString() === yesterday.toDateString()) return "Ayer";
		try {
			return date.toLocaleDateString("es-ES", {
				weekday: "long",
				day: "numeric",
				month: "long",
			});
		} catch {
			return date.toDateString();
		}
	}
	function makeDaySeparator(value) {
		const separator = document.createElement("div");
		separator.className = "chat-day";
		separator.dataset.chatDay = dayLabel(value);
		separator.textContent = dayLabel(value);
		return separator;
	}
	function makeReplyQuote(message) {
		if (!message.replyTo) return null;
		const quote = document.createElement("div");
		quote.className = "chat-reply-quote";
		const author = document.createElement("strong");
		author.textContent = `@${message.replyTo.username}`;
		const text = document.createElement("span");
		text.textContent = String(message.replyTo.text || "").slice(0, 140) || "Adjunto";
		quote.append(author, text);
		quote.addEventListener("click", () => jumpToMessage(message.replyTo.id));
		return quote;
	}
	function makeTools(message) {
		const tools = document.createElement("div");
		tools.className = "chat-msg-tools";
		const add = (label, title, action, dataset) => {
			const button = document.createElement("button");
			button.type = "button";
			button.className = `chat-tool${action === "delete" ? " danger" : ""}`;
			button.title = title;
			button.textContent = label;
			button.dataset[dataset] = String(message.id);
			tools.appendChild(button);
		};
		add("↩", "Responder", "reply", "chatReply");
		if (message.canEdit) add("✎", "Editar", "edit", "chatEdit");
		if (message.canPin) {
			const pin = document.createElement("button");
			pin.type = "button";
			pin.className = "chat-tool";
			pin.title = message.pinned ? "Desfijar" : "Fijar";
			pin.textContent = "📌";
			pin.dataset.chatPin = String(message.id);
			pin.dataset.pinned = message.pinned ? "1" : "0";
			tools.appendChild(pin);
		}
		if (message.canDelete) add("🗑", "Eliminar", "delete", "chatDelete");
		return tools;
	}
	function renderPinned(list) {
		if (!pinnedBar || !pinnedList) return;
		pinnedList.textContent = "";
		const items = Array.isArray(list) ? list : [];
		pinnedBar.hidden = !items.length;
		for (const message of items.slice(0, 3)) {
			const button = document.createElement("button");
			button.type = "button";
			button.className = "chat-pin-chip";
			button.dataset.chatJump = String(message.id);
			const icon = document.createElement("span");
			icon.textContent = "📌";
			const author = document.createElement("strong");
			author.textContent = message.username;
			const text = document.createElement("small");
			text.textContent = String(message.text || "Adjunto").slice(0, 80);
			button.append(icon, author, text);
			pinnedList.appendChild(button);
		}
	}
	function renderTyping(names) {
		if (!typingEl) return;
		const list = Array.isArray(names) ? names : [];
		typingEl.hidden = !list.length;
		if (!list.length) {
			typingEl.textContent = "";
			return;
		}
		const text =
			list.length === 1
				? `${list[0]} está escribiendo…`
				: list.length === 2
					? `${list[0]} y ${list[1]} están escribiendo…`
					: `${list[0]} y ${list.length - 1} más están escribiendo…`;
		typingEl.textContent = text;
	}
	function setContext(mode, message) {
		if (mode === "reply") {
			replyTarget = { id: message.id, username: message.username, text: message.text || "" };
			editTarget = null;
			contextLabel.textContent = `Respondiendo a ${message.username}`;
			contextText.textContent = String(message.text || "Adjunto").slice(0, 120);
		} else if (mode === "edit") {
			editTarget = { id: message.id, text: message.text || "" };
			replyTarget = null;
			contextLabel.textContent = "Editando mensaje";
			contextText.textContent = String(message.text || "").slice(0, 120);
			if (input) {
				input.value = message.text || "";
				input.focus();
				if (counter) counter.textContent = String(input.value.length);
			}
		}
		if (contextBar) contextBar.hidden = false;
	}
	function clearContext() {
		replyTarget = null;
		editTarget = null;
		if (contextBar) contextBar.hidden = true;
		if (contextLabel) contextLabel.textContent = "";
		if (contextText) contextText.textContent = "";
	}
	function jumpToMessage(id) {
		const target = box.querySelector(`[data-chat-id="${CSS.escape(String(id))}"]`);
		if (!target) {
			showError("Ese mensaje no está en la ventana actual. Usa “Cargar anteriores”.");
			return;
		}
		target.scrollIntoView({ behavior: "smooth", block: "center" });
		target.classList.add("flash");
		setTimeout(() => target.classList.remove("flash"), 1200);
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
	function makeMessage(message, grouped = false) {
		const article = document.createElement("article");
		const own = String(message.username).toLowerCase() === currentUser.toLowerCase();
		article.className = `chat-message${own ? " own" : ""}${grouped ? " grouped" : ""}${message.pinned ? " pinned" : ""}`;
		article.dataset.chatMessage = "";
		article.dataset.chatId = String(message.id);
		article.dataset.chatSeq = String(message.seq);
		messageStore.set(String(message.id), message);

		if (!own && !grouped) {
			article.appendChild(makeUserAvatar(message.username, message.icon, "chat-msg-avatar"));
		} else if (!own) {
			const spacer = document.createElement("span");
			spacer.className = "chat-msg-avatar-spacer";
			article.appendChild(spacer);
		}

		const bubble = document.createElement("div");
		bubble.className = "chat-bubble";
		const reply = makeReplyQuote(message);
		if (reply) bubble.appendChild(reply);
		const meta = document.createElement("div");
		meta.className = "chat-meta";
		if (!own && !grouped) {
			const author = document.createElement("span");
			author.className = "chat-author";
			author.textContent = String(message.username);
			meta.appendChild(author);
		}
		const badge = roleBadge(message.role, message.roles);
		if (badge) meta.appendChild(badge);
		if (message.pinned) {
			const pin = document.createElement("span");
			pin.className = "chat-pin-badge";
			pin.title = "Mensaje fijado";
			pin.textContent = "📌";
			meta.appendChild(pin);
		}
		const time = document.createElement("time");
		time.dateTime = String(message.at);
		time.textContent = timeText(message.at);
		meta.appendChild(time);
		if (message.editedAt) {
			const edited = document.createElement("span");
			edited.className = "chat-edited";
			edited.title = `Editado ${timeText(message.editedAt)}`;
			edited.textContent = "editado";
			meta.appendChild(edited);
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
		bubble.appendChild(makeTools(message));
		article.appendChild(bubble);
		return article;
	}
	function clearMessages() {
		for (const el of box.querySelectorAll("[data-chat-message]")) el.remove();
		seen.clear();
		messageStore.clear();
		lastSeq = 0;
		ensureEmpty();
	}
	function appendMessages(messages) {
		let added = false;
		const existing = [...box.querySelectorAll("[data-chat-message]")];
		let previous = existing[existing.length - 1] || null;
		let previousAt = previous?.querySelector("time")?.dateTime || "";
		let previousUser =
			previous?.querySelector(".chat-author")?.textContent ||
			(previous?.classList.contains("own") ? currentUser : "");
		for (const message of messages || []) {
			if (!message || !message.id || seen.has(String(message.id))) continue;
			if (Number(message.seq) <= lastSeq) continue;
			if (previousAt && dayLabel(previousAt) !== dayLabel(message.at)) {
				box.appendChild(makeDaySeparator(message.at));
				previousAt = "";
				previousUser = "";
			}
			const grouped =
				!!previousAt &&
				String(previousUser).toLowerCase() === String(message.username).toLowerCase() &&
				new Date(message.at).getTime() - new Date(previousAt).getTime() < 5 * 60_000 &&
				!message.replyTo;
			seen.add(String(message.id));
			const article = makeMessage(message, grouped);
			box.appendChild(article);
			previous = article;
			previousAt = message.at;
			previousUser = message.username;
			lastSeq = Math.max(lastSeq, Number(message.seq) || 0);
			added = true;
		}
		if (added) removeEmpty();
		return added;
	}
	function insertUnreadDivider() {
		if (!readSeq) return;
		const firstUnread = [...box.querySelectorAll("[data-chat-message]")].find(
			(element) => Number(element.dataset.chatSeq) > readSeq,
		);
		if (!firstUnread || box.querySelector(".chat-unread-divider")) return;
		const divider = document.createElement("div");
		divider.className = "chat-unread-divider";
		divider.innerHTML = "<span>Mensajes nuevos</span>";
		firstUnread.before(divider);
	}
	async function loadOlder() {
		if (loadingOlder) return;
		const first = box.querySelector("[data-chat-message]");
		const oldest = Number(first?.dataset.chatSeq) || 0;
		if (!oldest) return;
		loadingOlder = true;
		if (loadOlderButton) loadOlderButton.disabled = true;
		const previousHeight = box.scrollHeight;
		const previousTop = box.scrollTop;
		try {
			const data = await request(
				`/api/chat/messages?channel=${encodeURIComponent(channelId)}&before=${oldest}`,
			);
			const fragment = document.createDocumentFragment();
			const existingFirst = box.querySelector("[data-chat-message]");
			let previousAt = "";
			let previousUser = "";
			const messages = data.messages || [];
			for (let i = 0; i < messages.length; i++) {
				const message = messages[i];
				if (seen.has(String(message.id))) continue;
				if (previousAt && dayLabel(previousAt) !== dayLabel(message.at)) {
					fragment.appendChild(makeDaySeparator(message.at));
					previousAt = "";
					previousUser = "";
				}
				const grouped =
					!!previousAt &&
					String(previousUser).toLowerCase() === String(message.username).toLowerCase() &&
					new Date(message.at).getTime() - new Date(previousAt).getTime() < 5 * 60_000 &&
					!message.replyTo;
				fragment.appendChild(makeMessage(message, grouped));
				seen.add(String(message.id));
				previousAt = message.at;
				previousUser = message.username;
			}
			if (existingFirst) existingFirst.before(fragment);
			else box.appendChild(fragment);
			hasMore = !!data.hasMore;
			if (loadOlderButton) loadOlderButton.hidden = !hasMore;
			box.scrollTop = previousTop + (box.scrollHeight - previousHeight);
			removeEmpty();
		} catch (error) {
			showError(error.message);
		} finally {
			loadingOlder = false;
			if (loadOlderButton) loadOlderButton.disabled = false;
		}
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
			if (data.readSeq !== undefined && !readSeq) readSeq = Number(data.readSeq) || 0;
			renderPinned(data.pinned);
			renderTyping(data.typing);
			hasMore = !!data.hasMore;
			if (loadOlderButton) loadOlderButton.hidden = !hasMore;
			updateOnline(data.online, data.onlineIcons);
			if (Number(data.maxLength) > 0) maxLength = Number(data.maxLength);
			if (input && Number(input.maxLength) !== maxLength) input.maxLength = maxLength;
			if (counter) counter.textContent = String((input?.value || "").length);
			if (rebuilt) insertUnreadDivider();
			if (stick) scrollBottom(true);
			else if (rebuilt) box.scrollTop = previousTop;
			markRead();
			readSeq = Math.max(readSeq, lastSeq);
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
	function syncMobileChannels() {
		const select = document.getElementById("chat-mobile-channel");
		if (!select) return;
		select.textContent = "";
		for (const channel of channelsCache) {
			const option = document.createElement("option");
			option.value = channel.id;
			option.textContent = `${channel.name}${channel.unread ? ` (${channel.unread})` : ""}`;
			select.appendChild(option);
		}
		select.value = channelId;
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
		syncMobileChannels();
		updateHeader();
	}
	function switchChannel(value) {
		channelId = value || "general";
		clearContext();
		messageStore.clear();
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
		syncMobileChannels();
		seen.clear();
		lastSeq = 0;
		revision = "0";
		for (const el of box.querySelectorAll("[data-chat-message]")) el.remove();
		ensureEmpty();
		clearError();
		forceScroll = true;
		refresh();
	}
	function uploadFile(file, onProgress) {
		return new Promise((resolve, reject) => {
			const xhr = new XMLHttpRequest();
			xhr.open("POST", "/api/chat/upload");
			xhr.setRequestHeader("Content-Type", "application/octet-stream");
			xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
			xhr.setRequestHeader("X-File-Type", file.type || "application/octet-stream");
			xhr.setRequestHeader("Accept", "application/json");
			xhr.upload.onprogress = (event) => {
				if (event.lengthComputable && onProgress) {
					onProgress(Math.round((event.loaded / event.total) * 100));
				}
			};
			xhr.onload = () => {
				let data = {};
				try { data = JSON.parse(xhr.responseText || "{}"); } catch {}
				if (xhr.status >= 200 && xhr.status < 300) resolve(data);
				else {
					const error = new Error(
						data.error === "invalid-type"
							? "Tipo de archivo no permitido."
							: data.error === "quota" || data.error === "user_quota"
								? "Has alcanzado la cuota de adjuntos."
								: data.error === "disk"
									? "No hay espacio suficiente en el servidor."
									: "No se pudo subir el archivo.",
					);
					error.data = data;
					reject(error);
				}
			};
			xhr.onerror = () => reject(new Error("No se pudo subir el archivo."));
			xhr.send(file);
		});
	}
	async function uploadAndSend(text) {
		if (editTarget) {
			const data = await request(
				`/api/chat/messages/${encodeURIComponent(editTarget.id)}/edit`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ text, channel: channelId }),
				},
			);
			clearContext();
			return data;
		}
		let attachment = "";
		if (selectedFile) {
			if (selectedFile.size > 5 * 1024 * 1024) throw new Error("El archivo supera 5 MB.");
			if (uploadProgress) uploadProgress.hidden = false;
			if (uploadBar) uploadBar.style.width = "0%";
			try {
				const data = await uploadFile(selectedFile, (percent) => {
					if (uploadBar) uploadBar.style.width = `${percent}%`;
				});
				attachment = data.upload.id;
			} finally {
				if (uploadProgress) uploadProgress.hidden = true;
				if (uploadBar) uploadBar.style.width = "0%";
			}
		}
		const data = await request("/api/chat/messages", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				text,
				channel: channelId,
				attachment,
				reply: replyTarget?.id || "",
			}),
		});
		clearContext();
		return data;
	}

	const mobileChannel = document.getElementById("chat-mobile-channel");
	mobileChannel?.addEventListener("change", () => switchChannel(mobileChannel.value));

	if (channelList) {
		channelList.addEventListener("click", (event) => {
			const item = event.target.closest("[data-channel-id]");
			if (item) switchChannel(item.dataset.channelId);
		});
	}
	if (input) {
		input.addEventListener("input", () => {
			if (counter) counter.textContent = String(input.value.length);
			if (input.value.trim() && Date.now() - lastTypingAt > 2500) {
				lastTypingAt = Date.now();
				request("/api/chat/typing", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ channel: channelId }),
				}).catch(() => {});
			}
		});
		input.addEventListener("keydown", (event) => {
			if (event.key === "Enter" && !event.shiftKey) {
				event.preventDefault();
				form?.requestSubmit();
			}
		});
	}
	function selectFile(file) {
		if (!file) return;
		if (file.size > 5 * 1024 * 1024) {
			showError("El archivo supera 5 MB.");
			return;
		}
		selectedFile = file;
		if (fileName) fileName.textContent = `${file.name} · ${Math.ceil(file.size / 1024)} KB`;
	}
	if (fileInput) {
		fileInput.addEventListener("change", () => {
			selectFile(fileInput.files?.[0] || null);
		});
	}
	input?.addEventListener("paste", (event) => {
		const items = [...(event.clipboardData?.items || [])];
		const image = items.find((item) => item.kind === "file" && item.type.startsWith("image/"));
		if (!image) return;
		const file = image.getAsFile();
		if (file) {
			event.preventDefault();
			selectFile(file);
			input.focus();
		}
	});
	const main = document.querySelector(".chat-main");
	if (main) {
		let dragDepth = 0;
		main.addEventListener("dragenter", (event) => {
			if (!event.dataTransfer?.types?.includes("Files")) return;
			event.preventDefault();
			dragDepth += 1;
			main.classList.add("dragover");
		});
		main.addEventListener("dragover", (event) => {
			if (event.dataTransfer?.types?.includes("Files")) event.preventDefault();
		});
		main.addEventListener("dragleave", () => {
			dragDepth = Math.max(0, dragDepth - 1);
			if (!dragDepth) main.classList.remove("dragover");
		});
		main.addEventListener("drop", (event) => {
			if (!event.dataTransfer?.files?.length) return;
			event.preventDefault();
			dragDepth = 0;
			main.classList.remove("dragover");
			selectFile(event.dataTransfer.files[0]);
			input?.focus();
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
		const replyButton = event.target.closest("[data-chat-reply]");
		if (replyButton) {
			const article = replyButton.closest("[data-chat-message]");
			const id = replyButton.dataset.chatReply;
			const stored = messageStore.get(String(id));
			const username =
				stored?.username ||
				article?.querySelector(".chat-author")?.textContent ||
				(article?.classList.contains("own") ? currentUser : "");
			const text =
				stored?.text || article?.querySelector(".chat-text")?.textContent || "";
			setContext("reply", { id, username, text });
			input?.focus();
			return;
		}
		const editButton = event.target.closest("[data-chat-edit]");
		if (editButton) {
			const article = editButton.closest("[data-chat-message]");
			const id = editButton.dataset.chatEdit;
			const stored = messageStore.get(String(id));
			const text =
				stored?.text || article?.querySelector(".chat-text")?.textContent || "";
			setContext("edit", { id, text });
			return;
		}
		const pinButton = event.target.closest("[data-chat-pin]");
		if (pinButton) {
			const id = pinButton.dataset.chatPin;
			const unpin = pinButton.dataset.pinned === "1";
			pinButton.disabled = true;
			try {
				const data = await request(
					`/api/chat/messages/${encodeURIComponent(id)}/${unpin ? "unpin" : "pin"}`,
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ channel: channelId }),
					},
				);
				if (data.message) replaceMessage(data.message);
				renderPinned(data.pinned);
			} catch (error) {
				showError(error.message);
				pinButton.disabled = false;
			}
			return;
		}
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
				await refresh();
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
	bindDialog("chat-friends", "chat-friends-dialog");
	const friendSearch = document.getElementById("friend-search");
	const friendResults = document.getElementById("friend-results");
	const friendSearchHint = document.getElementById("friend-search-hint");
	const friendSearchEmpty = document.getElementById("friend-search-empty");
	if (friendSearch && friendResults) {
		const applyFriendSearch = () => {
			const query = friendSearch.value.trim().toLowerCase();
			let visible = 0;
			for (const row of friendResults.querySelectorAll(".friend-result")) {
				const matches = !!query && row.dataset.friendName.includes(query);
				row.hidden = !matches;
				if (matches) visible += 1;
			}
			friendResults.hidden = !query;
			if (friendSearchHint) friendSearchHint.hidden = !!query;
			if (friendSearchEmpty) friendSearchEmpty.hidden = !query || visible > 0;
		};
		friendSearch.addEventListener("input", applyFriendSearch);
		applyFriendSearch();
		document.getElementById("chat-friends")?.addEventListener("click", () => {
			setTimeout(() => friendSearch.focus(), 30);
		});
	}
	document.querySelectorAll("[data-close-dialog]").forEach((button) => {
		button.addEventListener("click", () => button.closest("dialog")?.close());
	});
	contextCancel?.addEventListener("click", () => {
		const wasEditing = !!editTarget;
		clearContext();
		if (wasEditing && input) {
			input.value = "";
			if (counter) counter.textContent = "0";
		}
	});
	loadOlderButton?.addEventListener("click", loadOlder);
	pinnedBar?.addEventListener("click", (event) => {
		const chip = event.target.closest("[data-chat-jump]");
		if (chip) jumpToMessage(chip.dataset.chatJump);
	});
	let searchTimer = null;
	async function runSearch() {
		if (!searchInput || !searchResults) return;
		const query = searchInput.value.trim();
		searchResults.textContent = "";
		if (query.length < 2) {
			const hint = document.createElement("p");
			hint.className = "muted";
			hint.textContent = "Escribe al menos 2 caracteres.";
			searchResults.appendChild(hint);
			return;
		}
		const currentOnly = searchCurrent?.checked ? channelId : "";
		try {
			const data = await request(
				`/api/chat/search?q=${encodeURIComponent(query)}&channel=${encodeURIComponent(currentOnly)}`,
			);
			const channels = new Map(
				(data.channels || []).map((channel) => [channel.id, channel]),
			);
			for (const message of data.messages || []) {
				const button = document.createElement("button");
				button.type = "button";
				button.className = "chat-search-result";
				button.dataset.chatResult = String(message.id);
				button.dataset.chatChannel = String(message.channelId);
				const head = document.createElement("div");
				head.className = "chat-search-result-head";
				const author = document.createElement("strong");
				author.textContent = message.username;
				const channel = document.createElement("span");
				channel.className = "badge";
				channel.textContent =
					channels.get(message.channelId)?.name || message.channelId;
				const time = document.createElement("time");
				time.textContent = timeText(message.at);
				head.append(author, channel, time);
				const text = document.createElement("p");
				text.textContent = String(message.text || "Adjunto").slice(0, 180);
				button.append(head, text);
				searchResults.appendChild(button);
			}
			if (!data.messages?.length) {
				const empty = document.createElement("p");
				empty.className = "muted";
				empty.textContent = "Sin resultados.";
				searchResults.appendChild(empty);
			}
		} catch (error) {
			const empty = document.createElement("p");
			empty.className = "msg error";
			empty.textContent = error.message;
			searchResults.appendChild(empty);
		}
	}
	searchOpen?.addEventListener("click", () => {
		searchDialog?.showModal();
		setTimeout(() => searchInput?.focus(), 30);
		if (searchInput && !searchInput.value) runSearch();
	});
	searchInput?.addEventListener("input", () => {
		clearTimeout(searchTimer);
		searchTimer = setTimeout(runSearch, 180);
	});
	searchCurrent?.addEventListener("change", runSearch);
	searchResults?.addEventListener("click", (event) => {
		const item = event.target.closest("[data-chat-result]");
		if (!item) return;
		const targetChannel = item.dataset.chatChannel;
		const messageId = item.dataset.chatResult;
		searchDialog?.close();
		if (targetChannel && targetChannel !== channelId) {
			switchChannel(targetChannel);
			setTimeout(() => jumpToMessage(messageId), 500);
		} else {
			jumpToMessage(messageId);
		}
	});

	async function createDm(username) {
		if (!username) return;
		try {
			await request("/api/chat/channels/dm", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ username }),
			});
			document.getElementById("chat-dm-dialog")?.close();
			await refreshChannels();
			const dm = channelsCache.find(
				(channel) =>
					channel.type === "dm" &&
					channel.name.toLowerCase() === String(username).toLowerCase(),
			);
			if (dm) switchChannel(dm.id);
		} catch (error) {
			showError(error.message);
		}
	}
	const dmSearch = document.getElementById("chat-dm-search");
	const dmResults = document.getElementById("chat-dm-results");
	const dmHint = document.getElementById("chat-dm-hint");
	const dmEmpty = document.getElementById("chat-dm-empty");
	if (dmSearch && dmResults) {
		const applyDmSearch = () => {
			const query = dmSearch.value.trim().toLowerCase();
			let visible = 0;
			for (const row of dmResults.querySelectorAll(".dm-result")) {
				const matches = !!query && row.dataset.dmName.includes(query);
				row.hidden = !matches;
				if (matches) visible += 1;
			}
			dmResults.hidden = !query;
			if (dmHint) dmHint.hidden = !!query;
			if (dmEmpty) dmEmpty.hidden = !query || visible > 0;
		};
		dmSearch.addEventListener("input", applyDmSearch);
		applyDmSearch();
		dmResults.addEventListener("click", (event) => {
			const row = event.target.closest("[data-dm-user]");
			if (row) createDm(row.dataset.dmUser);
		});
		document.getElementById("chat-new-dm")?.addEventListener("click", () => {
			setTimeout(() => dmSearch.focus(), 30);
		});
	}
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
	setInterval(refresh, 5000);
	setInterval(refreshChannels, 15000);
	insertUnreadDivider();
	markRead();
	refresh();
	refreshChannels();
	scrollBottom(true);
})();
