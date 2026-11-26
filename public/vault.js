(() => {
	const app = document.getElementById("vault-app");
	if (!app) return;

	const els = {
		loading: document.getElementById("vault-loading"),
		setup: document.getElementById("vault-setup"),
		newPassword: document.getElementById("vault-new-password"),
		confirmPassword: document.getElementById("vault-confirm-password"),
		setupBtn: document.getElementById("vault-setup-btn"),
		setupError: document.getElementById("vault-setup-error"),
		unlock: document.getElementById("vault-unlock"),
		unlockPassword: document.getElementById("vault-unlock-password"),
		unlockBtn: document.getElementById("vault-unlock-btn"),
		unlockError: document.getElementById("vault-unlock-error"),
		resetLink: document.getElementById("vault-reset-link"),
		content: document.getElementById("vault-content"),
		search: document.getElementById("vault-search"),
		addBtn: document.getElementById("vault-add-btn"),
		lockBtn: document.getElementById("vault-lock-btn"),
		list: document.getElementById("vault-list"),
		empty: document.getElementById("vault-empty"),
		dialog: document.getElementById("vault-dialog"),
		dialogTitle: document.getElementById("vault-dialog-title"),
		entryId: document.getElementById("vault-entry-id"),
		title: document.getElementById("vault-entry-title"),
		category: document.getElementById("vault-entry-category"),
		username: document.getElementById("vault-entry-username"),
		url: document.getElementById("vault-entry-url"),
		password: document.getElementById("vault-entry-password"),
		notes: document.getElementById("vault-entry-notes"),
		dialogError: document.getElementById("vault-dialog-error"),
		saveEntry: document.getElementById("vault-save-entry"),
		togglePassword: document.getElementById("vault-toggle-password"),
		generatePassword: document.getElementById("vault-generate-password"),
		toast: document.getElementById("vault-toast"),
	};

	const CHECK = "inici-vault-check-v1";
	const PBKDF2_ITERATIONS = 310000;
	let salt = "";
	let entries = [];
	let decrypted = [];
	let key = null;
	let autoLockTimer = null;
	let toastTimer = null;

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
		const material = await crypto.subtle.importKey(
			"raw",
			encoder.encode(password),
			"PBKDF2",
			false,
			["deriveKey"],
		);
		return crypto.subtle.deriveKey(
			{
				name: "PBKDF2",
				salt: unb64(saltValue),
				iterations: PBKDF2_ITERATIONS,
				hash: "SHA-256",
			},
			material,
			{ name: "AES-GCM", length: 256 },
			false,
			["encrypt", "decrypt"],
		);
	}

	async function encrypt(keyValue, value) {
		const iv = crypto.getRandomValues(new Uint8Array(12));
		const data = encoder.encode(JSON.stringify(value));
		const ciphertext = await crypto.subtle.encrypt(
			{ name: "AES-GCM", iv },
			keyValue,
			data,
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
			error.data = data;
			throw error;
		}
		return data;
	}

	function showError(el, text) {
		if (!el) return;
		el.textContent = text || "";
		el.hidden = !text;
	}
	function toast(text) {
		if (!els.toast) return;
		els.toast.textContent = text;
		els.toast.hidden = false;
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => { els.toast.hidden = true; }, 2200);
	}
	function showPanel(name) {
		els.loading.hidden = true;
		els.setup.hidden = name !== "setup";
		els.unlock.hidden = name !== "unlock";
		els.content.hidden = name !== "content";
	}
	function resetAutoLock() {
		if (autoLockTimer) clearTimeout(autoLockTimer);
		if (!key) return;
		autoLockTimer = setTimeout(() => {
			lock("Bóveda bloqueada por inactividad.");
		}, 5 * 60 * 1000);
	}
	function lock(message = "Bóveda bloqueada.") {
		key = null;
		decrypted = [];
		entries = [];
		if (autoLockTimer) clearTimeout(autoLockTimer);
		autoLockTimer = null;
		els.list.textContent = "";
		els.empty.hidden = true;
		els.unlockPassword.value = "";
		els.search.value = "";
		showPanel("unlock");
		if (message) toast(message);
	}

	async function loadVault() {
		try {
			const data = await api("/api/vault");
			if (!data.configured) {
				showPanel("setup");
				return;
			}
			salt = data.salt;
			entries = data.entries || [];
			showPanel("unlock");
			els.unlockPassword.focus();
		} catch (error) {
			els.loading.textContent = error.message;
		}
	}

	async function createVault() {
		showError(els.setupError, "");
		const password = els.newPassword.value;
		const confirm = els.confirmPassword.value;
		if (password.length < 12) return showError(els.setupError, "Usa al menos 12 caracteres.");
		if (password !== confirm) return showError(els.setupError, "Las contraseñas no coinciden.");
		if (!crypto.subtle) return showError(els.setupError, "Este navegador no soporta cifrado WebCrypto.");
		els.setupBtn.disabled = true;
		try {
			const saltBytes = crypto.getRandomValues(new Uint8Array(16));
			salt = b64(saltBytes);
			key = await deriveKey(password, salt);
			const check = await encrypt(key, CHECK);
			await api("/api/vault/init", {
				method: "POST",
				body: JSON.stringify({
					salt,
					checkIv: check.iv,
					checkCiphertext: check.ciphertext,
				}),
			});
			entries = [];
			decrypted = [];
			els.newPassword.value = "";
			els.confirmPassword.value = "";
			showPanel("content");
			render();
			resetAutoLock();
			toast("Bóveda creada.");
		} catch (error) {
			key = null;
			showError(els.setupError, error.message);
		} finally {
			els.setupBtn.disabled = false;
		}
	}

	async function unlockVault() {
		showError(els.unlockError, "");
		const password = els.unlockPassword.value;
		if (!password) return showError(els.unlockError, "Escribe tu contraseña maestra.");
		els.unlockBtn.disabled = true;
		try {
			const candidate = await deriveKey(password, salt);
			const info = await api("/api/vault");
			const check = await decrypt(candidate, info.check.iv, info.check.ciphertext);
			if (check !== CHECK) throw new Error("Contraseña maestra incorrecta.");
			key = candidate;
			entries = info.entries || [];
			decrypted = [];
			for (const entry of entries) {
				try {
					const value = await decrypt(key, entry.iv, entry.ciphertext);
					decrypted.push({ ...value, id: entry.id, updatedAt: entry.updatedAt });
				} catch {}
			}
			els.unlockPassword.value = "";
			showPanel("content");
			render();
			resetAutoLock();
		} catch (error) {
			key = null;
			showError(els.unlockError, "Contraseña maestra incorrecta o bóveda dañada.");
		} finally {
			els.unlockBtn.disabled = false;
		}
	}

	function categoryLabel(value) {
		return {
			general: "General",
			email: "Correo",
			social: "Social",
			banking: "Banca",
			work: "Trabajo",
			other: "Otra",
		}[value] || "General";
	}

	function makeButton(label, className, handler, title = "") {
		const button = document.createElement("button");
		button.type = "button";
		button.className = className;
		button.textContent = label;
		if (title) button.title = title;
		button.addEventListener("click", handler);
		return button;
	}

	function render() {
		if (!els.list) return;
		els.list.textContent = "";
		const query = String(els.search?.value || "").trim().toLowerCase();
		const visible = decrypted.filter((entry) => {
			if (!query) return true;
			return [entry.title, entry.username, entry.url, entry.notes, entry.category]
				.some((value) => String(value || "").toLowerCase().includes(query));
		});
		visible.sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""), "es"));
		for (const entry of visible) {
			const card = document.createElement("article");
			card.className = "vault-entry";
			const head = document.createElement("div");
			head.className = "vault-entry-head";
			const title = document.createElement("strong");
			title.textContent = entry.title || "Sin título";
			const badge = document.createElement("span");
			badge.className = "badge";
			badge.textContent = categoryLabel(entry.category);
			head.append(title, badge);
			const meta = document.createElement("div");
			meta.className = "vault-entry-meta";
			if (entry.username) {
				const user = document.createElement("span");
				user.textContent = entry.username;
				meta.appendChild(user);
			}
			if (entry.url) {
				const url = document.createElement("span");
				url.className = "mono";
				url.textContent = entry.url;
				meta.appendChild(url);
			}
			const actions = document.createElement("div");
			actions.className = "vault-entry-actions";
			if (entry.username) {
				actions.appendChild(makeButton("Copiar usuario", "small", () => copy(entry.username, "Usuario copiado.")));
			}
			if (entry.password) {
				actions.appendChild(makeButton("Copiar contraseña", "small primary-small", () => copy(entry.password, "Contraseña copiada.")));
			}
			actions.appendChild(makeButton("Editar", "small", () => openEditor(entry)));
			actions.appendChild(makeButton("Eliminar", "small danger", () => removeEntry(entry)));
			card.append(head, meta, actions);
			if (entry.notes) {
				const notes = document.createElement("p");
				notes.className = "vault-entry-notes";
				notes.textContent = entry.notes;
				card.appendChild(notes);
			}
			els.list.appendChild(card);
		}
		els.empty.hidden = visible.length > 0;
		if (!visible.length) {
			els.empty.textContent = decrypted.length
				? "No hay entradas que coincidan con la búsqueda."
				: "No hay entradas todavía. Añade la primera.";
		}
	}

	function openEditor(entry = null) {
		els.dialogError.hidden = true;
		els.entryId.value = entry?.id || "";
		els.dialogTitle.textContent = entry ? "Editar contraseña" : "Nueva contraseña";
		els.title.value = entry?.title || "";
		els.category.value = entry?.category || "general";
		els.username.value = entry?.username || "";
		els.url.value = entry?.url || "";
		els.password.value = entry?.password || "";
		els.password.type = "password";
		els.notes.value = entry?.notes || "";
		els.dialog.showModal();
		setTimeout(() => els.title.focus(), 30);
	}

	async function saveEntry() {
		els.dialogError.hidden = true;
		const title = els.title.value.trim();
		if (!title) {
			els.dialogError.textContent = "El título es obligatorio.";
			els.dialogError.hidden = false;
			return;
		}
		if (!key) {
			lock("La bóveda está bloqueada.");
			return;
		}
		els.saveEntry.disabled = true;
		try {
			const id = els.entryId.value || "";
			const value = {
				title,
				category: els.category.value,
				username: els.username.value.trim(),
				url: els.url.value.trim(),
				password: els.password.value,
				notes: els.notes.value.trim(),
			};
			const encrypted = await encrypt(key, value);
			const data = await api("/api/vault/entries", {
				method: "POST",
				body: JSON.stringify({ id, iv: encrypted.iv, ciphertext: encrypted.ciphertext }),
			});
			const entry = data.entry;
			const index = entries.findIndex((item) => item.id === entry.id);
			if (index >= 0) entries[index] = entry;
			else entries.push(entry);
			const decryptedIndex = decrypted.findIndex((item) => item.id === entry.id);
			const stored = { ...value, id: entry.id, updatedAt: entry.updatedAt };
			if (decryptedIndex >= 0) decrypted[decryptedIndex] = stored;
			else decrypted.push(stored);
			els.dialog.close();
			render();
			toast(id ? "Entrada actualizada." : "Entrada guardada.");
			resetAutoLock();
		} catch (error) {
			els.dialogError.textContent = error.message;
			els.dialogError.hidden = false;
		} finally {
			els.saveEntry.disabled = false;
		}
	}

	async function removeEntry(entry) {
		if (!confirm(`¿Eliminar "${entry.title || "esta entrada"}"?`)) return;
		try {
			await api(`/api/vault/entries/${encodeURIComponent(entry.id)}/delete`, {
				method: "POST",
				body: "{}",
			});
			entries = entries.filter((item) => item.id !== entry.id);
			decrypted = decrypted.filter((item) => item.id !== entry.id);
			render();
			toast("Entrada eliminada.");
			resetAutoLock();
		} catch (error) {
			toast(error.message);
		}
	}

	async function copy(value, message) {
		try {
			await navigator.clipboard.writeText(String(value || ""));
			toast(message);
		} catch {
			toast("No se pudo copiar al portapapeles.");
		}
	}

	function generatePassword() {
		const length = 20;
		const groups = [
			"abcdefghijklmnopqrstuvwxyz",
			"ABCDEFGHIJKLMNOPQRSTUVWXYZ",
			"0123456789",
			"!@#$%^&*()-_=+[]{};:,.?",
		];
		const all = groups.join("");
		const bytes = crypto.getRandomValues(new Uint32Array(length));
		const chars = [];
		for (let i = 0; i < length; i++) chars.push(all[bytes[i] % all.length]);
		for (let i = 0; i < groups.length; i++) {
			const pos = bytes[i] % length;
			chars[pos] = groups[i][bytes[(i + 4) % length] % groups[i].length];
		}
		els.password.value = chars.join("");
		els.password.type = "text";
		els.togglePassword.textContent = "Ocultar";
		toast("Contraseña generada.");
	}

	async function resetVault() {
		const password = prompt("Para borrar la bóveda, escribe la contraseña de tu cuenta:");
		if (!password) return;
		if (!confirm("Se borrarán todas las contraseñas guardadas. ¿Continuar?")) return;
		try {
			await api("/api/vault/reset", {
				method: "POST",
				body: JSON.stringify({ password }),
			});
			key = null;
			entries = [];
			decrypted = [];
			salt = "";
			showPanel("setup");
			toast("Bóveda eliminada. Puedes crear una nueva.");
		} catch (error) {
			toast(error.status === 403 ? "Contraseña de cuenta incorrecta." : error.message);
		}
	}

	els.setupBtn?.addEventListener("click", createVault);
	els.unlockBtn?.addEventListener("click", unlockVault);
	els.unlockPassword?.addEventListener("keydown", (event) => {
		if (event.key === "Enter") unlockVault();
	});
	els.newPassword?.addEventListener("keydown", (event) => {
		if (event.key === "Enter") els.confirmPassword?.focus();
	});
	els.confirmPassword?.addEventListener("keydown", (event) => {
		if (event.key === "Enter") createVault();
	});
	els.addBtn?.addEventListener("click", () => openEditor());
	els.lockBtn?.addEventListener("click", () => lock());
	els.search?.addEventListener("input", render);
	els.saveEntry?.addEventListener("click", saveEntry);
	els.generatePassword?.addEventListener("click", generatePassword);
	els.togglePassword?.addEventListener("click", () => {
		const hidden = els.password.type === "password";
		els.password.type = hidden ? "text" : "password";
		els.togglePassword.textContent = hidden ? "Ocultar" : "Ver";
	});
	els.resetLink?.addEventListener("click", (event) => {
		event.preventDefault();
		resetVault();
	});
	document.querySelectorAll("[data-vault-close]").forEach((button) => {
		button.addEventListener("click", () => els.dialog.close());
	});
	document.addEventListener("pointerdown", resetAutoLock);
	document.addEventListener("keydown", resetAutoLock);
	loadVault();
})();
