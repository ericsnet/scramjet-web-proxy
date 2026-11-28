(() => {
	if (window.__customSelect) return;
	window.__customSelect = true;

	const instances = new Set();
	let openInstance = null;
	let seq = 0;

	const isNative = (select) =>
		select instanceof HTMLSelectElement &&
		!select.multiple &&
		(!select.size || select.size <= 1) &&
		!select.dataset.native &&
		!select.closest(".cselect");

	function optionText(option) {
		return String(option?.textContent || "").replace(/\s+/g, " ").trim();
	}

	function selectedText(select) {
		const option = select.selectedOptions?.[0] || select.options[select.selectedIndex];
		return optionText(option) || "Selecciona una opción";
	}

	function enhance(select) {
		if (!isNative(select) || instances.has(select)) return;
		instances.add(select);

		const id = select.id || `cselect-${++seq}`;
		const originalClass = select.className;
		select.classList.add("cselect-native");
		select.setAttribute("tabindex", "-1");

		const wrapper = document.createElement("div");
		wrapper.className = `cselect${originalClass ? ` ${originalClass}` : ""}`;
		if (select.disabled) wrapper.classList.add("is-disabled");

		const button = document.createElement("button");
		button.type = "button";
		button.className = "cselect-button";
		button.setAttribute("aria-haspopup", "listbox");
		button.setAttribute("aria-expanded", "false");
		button.setAttribute("aria-controls", `${id}-menu`);
		button.disabled = select.disabled;
		const label = select.getAttribute("aria-label") || select.getAttribute("title") || "";
		if (label) button.setAttribute("aria-label", label);

		const labelEl = document.createElement("span");
		labelEl.className = "cselect-label";
		const chevron = document.createElement("span");
		chevron.className = "cselect-chevron";
		chevron.setAttribute("aria-hidden", "true");
		chevron.innerHTML =
			'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
		button.append(labelEl, chevron);

		const menu = document.createElement("div");
		menu.className = "cselect-menu";
		menu.id = `${id}-menu`;
		menu.setAttribute("role", "listbox");
		if (label) menu.setAttribute("aria-label", label);

		select.parentNode.insertBefore(wrapper, select);
		wrapper.append(select, button, menu);

		let optionEls = [];
		let activeIndex = -1;
		let typeBuffer = "";
		let typeTimer = 0;

		function setActive(index) {
			if (!optionEls.length) return;
			activeIndex = (index + optionEls.length) % optionEls.length;
			for (let i = 0; i < optionEls.length; i += 1) {
				const active = i === activeIndex;
				optionEls[i].classList.toggle("is-active", active);
				if (active) {
					button.setAttribute("aria-activedescendant", optionEls[i].id);
					const item = optionEls[i];
					const top = item.offsetTop;
					const bottom = top + item.offsetHeight;
					if (top < menu.scrollTop) menu.scrollTop = top;
					else if (bottom > menu.scrollTop + menu.clientHeight) {
						menu.scrollTop = bottom - menu.clientHeight;
					}
				}
			}
		}

		function rebuild() {
			menu.replaceChildren();
			optionEls = [];
			const groups = [];
			for (const child of select.children) {
				if (child.tagName === "OPTGROUP") {
					const groupLabel = document.createElement("div");
					groupLabel.className = "cselect-group";
					groupLabel.textContent = child.label;
					menu.appendChild(groupLabel);
					for (const option of child.children) groups.push(option);
				} else if (child.tagName === "OPTION") {
					groups.push(child);
				}
			}
			for (const option of groups) {
				const item = document.createElement("button");
				item.type = "button";
				item.className = "cselect-option";
				item.setAttribute("role", "option");
				item.id = `${id}-option-${optionEls.length}`;
				item.textContent = optionText(option);
				item.disabled = option.disabled;
				item.dataset.value = option.value;
				if (option.selected) item.classList.add("is-selected");
				item.setAttribute("aria-selected", option.selected ? "true" : "false");
				item.addEventListener("click", () => commit(option.value));
				menu.appendChild(item);
				optionEls.push(item);
			}
			sync();
		}

		function sync() {
			button.disabled = select.disabled;
			wrapper.classList.toggle("is-disabled", select.disabled);
			labelEl.textContent = selectedText(select);
			labelEl.title = labelEl.textContent;
			for (const item of optionEls) {
				const selected = item.dataset.value === select.value;
				item.classList.toggle("is-selected", selected);
				item.setAttribute("aria-selected", selected ? "true" : "false");
			}
		}

		function place() {
			if (!wrapper.classList.contains("is-open")) return;
			const buttonRect = button.getBoundingClientRect();
			const width = Math.min(Math.max(buttonRect.width, 180), window.innerWidth - 16);
			menu.style.position = "fixed";
			menu.style.width = `${width}px`;
			menu.style.minWidth = "0";
			menu.style.maxHeight = `${Math.min(280, window.innerHeight - 24)}px`;
			const menuHeight = menu.offsetHeight;
			const spaceBelow = window.innerHeight - buttonRect.bottom - 8;
			const spaceAbove = buttonRect.top - 8;
			const top =
				menuHeight > spaceBelow && spaceAbove > spaceBelow
					? Math.max(8, buttonRect.top - menuHeight - 6)
					: Math.min(window.innerHeight - menuHeight - 8, buttonRect.bottom + 6);
			const left = Math.min(
				Math.max(8, buttonRect.left),
				Math.max(8, window.innerWidth - width - 8),
			);
			menu.style.top = `${Math.max(8, top)}px`;
			menu.style.left = `${left}px`;
		}

		function onScroll(event) {
			if (event.target instanceof Node && menu.contains(event.target)) return;
			close();
		}

		function close() {
			wrapper.classList.remove("is-open", "drop-up");
			menu.removeAttribute("style");
			button.setAttribute("aria-expanded", "false");
			button.removeAttribute("aria-activedescendant");
			activeIndex = -1;
			if (openInstance === instance) openInstance = null;
			document.removeEventListener("pointerdown", outside, true);
			window.removeEventListener("resize", close);
			window.removeEventListener("scroll", onScroll, true);
		}

		function outside(event) {
			if (!wrapper.contains(event.target)) close();
		}

		function open() {
			if (select.disabled) return;
			if (openInstance && openInstance !== instance) openInstance.close();
			openInstance = instance;
			rebuild();
			wrapper.classList.add("is-open");
			button.setAttribute("aria-expanded", "true");
			const selected = [...select.options].findIndex((option) => option.selected && !option.disabled);
			setActive(selected >= 0 ? selected : optionEls.findIndex((item) => !item.disabled));
			place();
			document.addEventListener("pointerdown", outside, true);
			window.addEventListener("resize", close);
			window.addEventListener("scroll", onScroll, true);
		}

		function commit(value) {
			select.value = value;
			select.dispatchEvent(new Event("input", { bubbles: true }));
			select.dispatchEvent(new Event("change", { bubbles: true }));
			queueMicrotask(sync);
			close();
			button.focus();
		}

		function move(delta) {
			if (!wrapper.classList.contains("is-open")) {
				open();
				return;
			}
			if (activeIndex < 0) {
				setActive(0);
				return;
			}
			setActive(activeIndex + delta);
		}

		const instance = { open, close };

		button.addEventListener("click", () => {
			if (wrapper.classList.contains("is-open")) close();
			else open();
		});

		button.addEventListener("keydown", (event) => {
			const key = event.key;
			if (key === "ArrowDown" || key === "ArrowUp") {
				event.preventDefault();
				move(key === "ArrowDown" ? 1 : -1);
			} else if (key === "Home" || key === "End") {
				if (!wrapper.classList.contains("is-open")) return;
				event.preventDefault();
				setActive(key === "Home" ? 0 : optionEls.length - 1);
			} else if (key === "Enter" || key === " ") {
				event.preventDefault();
				if (!wrapper.classList.contains("is-open")) open();
				else if (optionEls[activeIndex]) optionEls[activeIndex].click();
			} else if (key === "Escape") {
				if (!wrapper.classList.contains("is-open")) return;
				event.preventDefault();
				close();
			} else if (key === "Tab") {
				close();
			} else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
				typeBuffer = `${typeBuffer}${key.toLowerCase()}`.slice(-24);
				clearTimeout(typeTimer);
				typeTimer = setTimeout(() => (typeBuffer = ""), 600);
				if (!wrapper.classList.contains("is-open")) open();
				const match = optionEls.findIndex((item) =>
					item.textContent.toLowerCase().startsWith(typeBuffer),
				);
				if (match >= 0) setActive(match);
			}
		});

		select.addEventListener("change", sync);
		select.addEventListener("focus", sync);
		select.addEventListener("invalid", () => button.focus());

		if (select.id) {
			document.querySelectorAll(`label[for="${CSS.escape(select.id)}"]`).forEach((labelElm) => {
				labelElm.addEventListener("click", (event) => {
					event.preventDefault();
					button.focus();
					if (!select.disabled) open();
				});
			});
		}

		new MutationObserver(() => {
			rebuild();
			if (wrapper.classList.contains("is-open")) place();
		}).observe(select, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ["disabled"],
		});

		rebuild();
	}

	function init() {
		for (const select of document.querySelectorAll("select")) enhance(select);
		const observer = new MutationObserver((records) => {
			for (const record of records) {
				for (const node of record.addedNodes) {
					if (!(node instanceof Element)) continue;
					if (node.matches?.("select")) enhance(node);
					for (const nested of node.querySelectorAll?.("select") || []) enhance(nested);
				}
			}
		});
		observer.observe(document.body, { childList: true, subtree: true });
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", init, { once: true });
	} else {
		init();
	}
})();
