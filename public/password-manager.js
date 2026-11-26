(() => {
	const toolbarButton = document.getElementById("vault-toolbar-btn");
	const frame = document.getElementById("sj-frame");
	if (!toolbarButton || !frame) return;

	const CHECK = "inici-vault-check-v1";
	const ITERATIONS = 310000;
	let key = null;
	let salt = "";
	let entries = [];
	let vaultInfo = null;
	let pendingAction = null;
	let currentDoc = null;
	let currentPasswordInput = null;
	let observedDocs = new WeakSet();
	let lastPromptKey = "";
	let vaultDialog = null;
	let bubble = null;
	let saveDialog = null;

	const b64 = (bytes) => {
		let binary = "";
		for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
		return btoa(binary);
	};
	const unb64 = (value) => {
		const binary = atob(String(value || ""));
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
		return bytes;
	};
	const encoder = new TextEncoder();
	const decoder = new TextDecoder();

	async function deriveKey(password, saltValue) {
		const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
		return crypto.subtle.deriveKey(
			{ name: "PBKDF2", salt: unb64(saltValue), iterations: ITERATIONS, hash: "SHA-256" },
			material,
			{ name: "AES-GCM", length: 256 },
			false,
			["encrypt", "decrypt"],
		);
	}
	async function encrypt(keyValue, value) {
		const iv = crypto.getRandomValues(new Uint8Array(12));
		const ciphertext = await crypto.subtle.encrypt(
			{ name: "AES-GCM", iv },
			keyValue,
			encoder.encode(JSON.stringify(value)),
		);
		return { iv: b64(iv), ciphertext: b64(ciphertext) };
	}
	async function decrypt(keyValue, ivValue, cipherValue) {
		const plain = await crypto.subtle.decrypt(
			{ name: "AES-GCM", iv: unb64(ivValue) },
			keyValue,
			unb64(cipherValue),
		);
		return JSON.parse(decoder.decode(plain));
	}
	async function api(url, options = {}) {
		const response = await fetch(url, {
			cache: "no-store",
			...options,
			headers: {
				Accept: "application/json",
				...(options.body ? { "Content-Type": "application/json" } : {}),
				...(options.headers || {}),
			},
		});
		if (response.status === 204) return {};
		const data = await response.json().catch(() => ({}));
		if (!response.ok) {
			const error = new Error(data.error || "No se pudo completar la operación.");
			error.status = response.status;
			throw error;
		}
		return data;
	}

	function toast(text) {
		let el = document.getElementById("pw-toast");
		if (!el) {
			el = document.createElement("div");
			el.id = "pw-toast";
			el.className = "pw-toast";
			el.hidden = true;
			document.body.appendChild(el);
		}
		el.textContent = text;
		el.hidden = false;
		clearTimeout(el._timer);
		el._timer = setTimeout(() => { el.hidden = true; }, 2200);
	}

	function makeDialog(html, className = "pw-dialog") {
		const dialog = document.createElement("dialog");
		dialog.className = className;
		dialog.innerHTML = html;
		document.body.appendChild(dialog);
		dialog.querySelectorAll("[data-pw-close]").forEach((button) => {
			button.addEventListener("click", () => dialog.close());
		});
		return dialog;
	}

	function ensureVaultDialog() {
		if (vaultDialog) return vaultDialog;
		vaultDialog = makeDialog(`
<button type="button" class="pw-dialog-x" data-pw-close aria-label="Cerrar">×</button>
<h2>🔐 Bóveda de contraseñas</h2>
<p class="pw-muted" id="pw-vault-status">Cargando…</p>
<div id="pw-vault-locked">
  <label for="pw-vault-password">Contraseña maestra</label>
  <input id="pw-vault-password" type="password" autocomplete="current-password" placeholder="Contraseña maestra">
  <div class="pw-actions">
    <button type="button" class="pw-btn primary" id="pw-vault-unlock">Desbloquear</button>
    <a class="pw-link" href="/vault" target="_blank" rel="noopener">Gestionar bóveda</a>
  </div>
  <p class="pw-error" id="pw-vault-error" hidden></p>
  <p class="pw-hint">La contraseña maestra no se envía al servidor. Si no tienes bóveda, créala en <a href="/vault" target="_blank" rel="noopener">/vault</a>.</p>
</div>
<div id="pw-vault-unlocked" hidden>
  <p class="pw-ok" id="pw-vault-count"></p>
  <div class="pw-actions">
    <button type="button" class="pw-btn" id="pw-vault-lock">Bloquear bóveda</button>
  </div>
  <p class="pw-hint">Solo se rellena la entrada que elijas. Al cerrar esta página se bloquea.</p>
</div>`);
		vaultDialog.querySelector("#pw-vault-unlock")?.addEventListener("click", unlockFromDialog);
		vaultDialog.querySelector("#pw-vault-password")?.addEventListener("keydown", (event) => {
			if (event.key === "Enter") unlockFromDialog();
		});
		vaultDialog.querySelector("#pw-vault-lock")?.addEventListener("click", () => {
			lockVault();
			vaultDialog.close();
			toast("Bóveda bloqueada.");
		});
		vaultDialog.addEventListener("close", () => {
			pendingAction = null;
		});
		return vaultDialog;
	}

	function updateVaultButton() {
		toolbarButton.textContent = key ? "🔓" : "🔒";
		toolbarButton.title = key ? "Bóveda desbloqueada" : "Bóveda de contraseñas";
	}

	function renderVaultDialog() {
		if (!vaultDialog) return;
		const locked = vaultDialog.querySelector("#pw-vault-locked");
		const unlocked = vaultDialog.querySelector("#pw-vault-unlocked");
		const status = vaultDialog.querySelector("#pw-vault-status");
		if (!vaultInfo) {
			status.textContent = "No hay bóveda configurada.";
			locked.hidden = false;
			unlocked.hidden = true;
			return;
		}
		if (key) {
			status.textContent = "Bóveda desbloqueada en esta pestaña.";
			locked.hidden = true;
			unlocked.hidden = false;
			vaultDialog.querySelector("#pw-vault-count").textContent = `${entries.length} entrada${entries.length === 1 ? "" : "s"} disponible${entries.length === 1 ? "" : "s"}.`;
		} else {
			status.textContent = "Bóveda bloqueada.";
			locked.hidden = false;
			unlocked.hidden = true;
		}
	}

	async function loadVaultInfo() {
		try {
			vaultInfo = await api("/api/vault");
		} catch {
			vaultInfo = null;
		}
	}

	async function unlockFromDialog() {
		const passwordInput = vaultDialog.querySelector("#pw-vault-password");
		const error = vaultDialog.querySelector("#pw-vault-error");
		const password = passwordInput?.value || "";
		error.hidden = true;
		if (!password) {
			error.textContent = "Escribe la contraseña maestra.";
			error.hidden = false;
			return;
		}
		try {
			await loadVaultInfo();
			if (!vaultInfo?.configured) {
				error.textContent = "No hay bóveda configurada. Créala en /vault.";
				error.hidden = false;
				return;
			}
			const candidate = await deriveKey(password, vaultInfo.salt);
			const check = await decrypt(candidate, vaultInfo.check.iv, vaultInfo.check.ciphertext);
			if (check !== CHECK) throw new Error("bad");
			key = candidate;
			salt = vaultInfo.salt;
			entries = [];
			for (const entry of vaultInfo.entries || []) {
				try {
					const value = await decrypt(key, entry.iv, entry.ciphertext);
					entries.push({ ...value, id: entry.id, updatedAt: entry.updatedAt });
				} catch {}
			}
			passwordInput.value = "";
			updateVaultButton();
			renderVaultDialog();
			const action = pendingAction;
			pendingAction = null;
			if (action) {
				vaultDialog.close();
				action();
			}
			toast("Bóveda desbloqueada.");
		} catch {
			error.textContent = "Contraseña maestra incorrecta o bóveda dañada.";
			error.hidden = false;
		}
	}

	function lockVault() {
		key = null;
		salt = "";
		entries = [];
		pendingAction = null;
		updateVaultButton();
		renderVaultDialog();
	}

	function openVaultDialog(action = null) {
		ensureVaultDialog();
		pendingAction = action;
		renderVaultDialog();
		vaultDialog.showModal();
		if (!key) setTimeout(() => vaultDialog.querySelector("#pw-vault-password")?.focus(), 40);
		if (!vaultInfo) {
			loadVaultInfo().then(renderVaultDialog);
		}
	}

	toolbarButton.addEventListener("click", () => openVaultDialog());

	function hostOf(value) {
		try {
			return new URL(value).hostname.replace(/^www\./, "");
		} catch {
			return "";
		}
	}
	function currentFrameUrl() {
		try {
			return frame.contentWindow?.location?.href || "";
		} catch {
			return "";
		}
	}
	function currentHost() {
		return hostOf(currentFrameUrl());
	}

	function findUsernameInput(passwordInput) {
		const form = passwordInput.form || passwordInput.closest("form");
		const root = form || passwordInput.ownerDocument;
		const candidates = [
			'input[autocomplete="username"]',
			'input[type="email"]',
			'input[name*="user" i]',
			'input[name*="email" i]',
			'input[id*="user" i]',
			'input[id*="email" i]',
			'input[type="text"]',
		];
		for (const selector of candidates) {
			const input = root.querySelector(selector);
			if (input && input !== passwordInput && !input.disabled && input.type !== "hidden") return input;
		}
		return null;
	}

	function setNativeValue(input, value) {
		const setter = Object.getOwnPropertyDescriptor(input.ownerDocument.defaultView.HTMLInputElement.prototype, "value")?.set;
		if (setter) setter.call(input, value);
		else input.value = value;
		input.dispatchEvent(new Event("input", { bubbles: true }));
		input.dispatchEvent(new Event("change", { bubbles: true }));
	}

	function matchingEntries(host) {
		return entries.filter((entry) => {
			const entryHost = hostOf(entry.url);
			if (entryHost && host) return entryHost === host || host.endsWith(`.${entryHost}`) || entryHost.endsWith(`.${host}`);
			return true;
		});
	}

	function hideBubble() {
		if (bubble) bubble.hidden = true;
		currentPasswordInput = null;
	}

	function showBubble(passwordInput) {
		currentPasswordInput = passwordInput;
		if (!bubble) {
			bubble = document.createElement("div");
			bubble.className = "pw-bubble";
			document.body.appendChild(bubble);
		}
		bubble.textContent = "";
		const head = document.createElement("div");
		head.className = "pw-bubble-head";
		const title = document.createElement("strong");
		title.textContent = "🔐 Bóveda";
		const close = document.createElement("button");
		close.type = "button";
		close.className = "pw-bubble-close";
		close.textContent = "×";
		close.addEventListener("click", hideBubble);
		head.append(title, close);
		bubble.appendChild(head);
		if (!key) {
			const message = document.createElement("p");
			message.className = "pw-muted";
			message.textContent = "Desbloquea la bóveda para rellenar.";
			const unlock = document.createElement("button");
			unlock.type = "button";
			unlock.className = "pw-btn primary";
			unlock.textContent = "Desbloquear";
			unlock.addEventListener("click", () => {
				hideBubble();
				openVaultDialog(() => showBubble(currentPasswordInput || passwordInput));
			});
			bubble.append(message, unlock);
		} else {
			const host = currentHost();
			const matches = matchingEntries(host);
			if (!entries.length) {
				const message = document.createElement("p");
				message.className = "pw-muted";
				message.textContent = "La bóveda está vacía.";
				bubble.appendChild(message);
			} else if (!matches.length) {
				const message = document.createElement("p");
				message.className = "pw-muted";
				message.textContent = `No hay entradas para ${host || "esta web"}.`;
				bubble.appendChild(message);
			} else {
				for (const entry of matches.slice(0, 6)) {
					const button = document.createElement("button");
					button.type = "button";
					button.className = "pw-bubble-entry";
					const strong = document.createElement("strong");
					strong.textContent = entry.title || entry.username || "Entrada";
					const small = document.createElement("small");
					small.textContent = entry.username || hostOf(entry.url) || "";
					button.append(strong, small);
					button.addEventListener("click", () => fillEntry(entry, passwordInput));
					bubble.appendChild(button);
				}
			}
			const manage = document.createElement("a");
			manage.className = "pw-link";
			manage.href = "/vault";
			manage.target = "_blank";
			manage.rel = "noopener";
			manage.textContent = "Gestionar bóveda";
			bubble.appendChild(manage);
		}
		bubble.hidden = false;
	}

	function fillEntry(entry, passwordInput) {
		const doc = passwordInput.ownerDocument;
		const usernameInput = findUsernameInput(passwordInput);
		if (usernameInput && entry.username) setNativeValue(usernameInput, entry.username);
		const form = passwordInput.form || passwordInput.closest("form");
		const passwords = form ? [...form.querySelectorAll('input[type="password"]')] : [passwordInput];
		for (const input of passwords) {
			if (input.value && input !== passwordInput) continue;
			setNativeValue(input, entry.password || "");
		}
		hideBubble();
		toast("Credenciales rellenadas.");
	}

	function promptKey(data) {
		return `${data.host}|${data.username}|${data.password}`;
	}

	function captureForm(form) {
		if (!form) return;
		const passwords = [...form.querySelectorAll('input[type="password"]')].filter((input) => input.value);
		if (!passwords.length) return;
		const passwordInput = passwords[0];
		const usernameInput = findUsernameInput(passwordInput);
		const username = usernameInput?.value?.trim() || "";
		if (!username) return;
		const url = currentFrameUrl();
		const host = hostOf(url);
		const data = {
			host: host || "esta web",
			url,
			username,
			password: passwordInput.value,
		};
		const keyValue = promptKey(data);
		if (keyValue === lastPromptKey) return;
		const existing = entries.find(
			(entry) =>
				String(entry.username || "").toLowerCase() === username.toLowerCase() &&
				(hostOf(entry.url) === host || !entry.url),
		);
		if (existing && existing.password === data.password) return;
		lastPromptKey = keyValue;
		if (!key) {
			showSaveDialog(data, existing, true);
			return;
		}
		showSaveDialog(data, existing, false);
	}

	function showSaveDialog(data, existing, needsUnlock) {
		if (saveDialog) {
			saveDialog.remove();
			saveDialog = null;
		}
		saveDialog = makeDialog(`
<button type="button" class="pw-dialog-x" data-pw-close aria-label="Cerrar">×</button>
<h2>${needsUnlock ? "🔒 Desbloquea para guardar" : "Guardar contraseña"}</h2>
<p class="pw-muted">${needsUnlock ? "La bóveda está bloqueada. Desbloquéala para guardar esta contraseña." : `¿Guardar la contraseña de <strong id="pw-save-host"></strong>?`}</p>
<div class="pw-save-fields">
  <label>Usuario <input id="pw-save-username" readonly></label>
  <label>Contraseña <input id="pw-save-password" type="password" readonly></label>
</div>
<div class="pw-actions">
  <button type="button" class="pw-btn primary" id="pw-save-confirm">${existing ? "Actualizar" : "Guardar"}</button>
  <button type="button" class="pw-btn" data-pw-close>Ahora no</button>
</div>
<p class="pw-error" id="pw-save-error" hidden></p>`);
		saveDialog.querySelector("#pw-save-host").textContent = data.host;
		saveDialog.querySelector("#pw-save-username").value = data.username;
		saveDialog.querySelector("#pw-save-password").value = data.password;
		saveDialog.querySelector("#pw-save-confirm").addEventListener("click", async () => {
			const button = saveDialog.querySelector("#pw-save-confirm");
			button.disabled = true;
			try {
				if (!key) {
					saveDialog.close();
					openVaultDialog(() => showSaveDialog(data, existing, false));
					return;
				}
				const value = {
					title: existing?.title || data.host,
					category: existing?.category || "general",
					username: data.username,
					url: existing?.url || data.url,
					password: data.password,
					notes: existing?.notes || "",
				};
				const encrypted = await encrypt(key, value);
				const result = await api("/api/vault/entries", {
					method: "POST",
					body: JSON.stringify({
						id: existing?.id || "",
						iv: encrypted.iv,
						ciphertext: encrypted.ciphertext,
					}),
				});
				const entry = { ...value, id: result.entry.id, updatedAt: result.entry.updatedAt };
				const index = entries.findIndex((item) => item.id === entry.id);
				if (index >= 0) entries[index] = entry;
				else entries.push(entry);
				saveDialog.close();
				toast(existing ? "Contraseña actualizada." : "Contraseña guardada.");
			} catch (error) {
				const errorEl = saveDialog.querySelector("#pw-save-error");
				errorEl.textContent = error.message;
				errorEl.hidden = false;
				button.disabled = false;
			}
		});
		saveDialog.showModal();
	}

	function setupFrame() {
		let doc;
		try {
			doc = frame.contentDocument;
		} catch {
			return;
		}
		if (!doc) return;
		currentDoc = doc;
		if (observedDocs.has(doc)) return;
		observedDocs.add(doc);
		doc.addEventListener("focusin", (event) => {
			const target = event.target;
			if (target instanceof doc.defaultView.HTMLInputElement && target.type === "password") {
				showBubble(target);
			}
		}, true);
		doc.addEventListener("submit", (event) => {
			captureForm(event.target);
		}, true);
		doc.addEventListener("click", (event) => {
			const button = event.target.closest?.('button, input[type="submit"]');
			if (!button) return;
			const form = button.form || button.closest("form");
			if (form) setTimeout(() => captureForm(form), 80);
		}, true);
	}

	frame.addEventListener("load", () => {
		setTimeout(setupFrame, 50);
	});
	setTimeout(setupFrame, 1000);
	updateVaultButton();
})();
