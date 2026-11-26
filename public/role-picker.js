(() => {
	const pickers = document.querySelectorAll(".role-picker");
	for (const picker of pickers) {
		const boxes = [...picker.querySelectorAll('input[name="roles"]')];
		if (!boxes.length) continue;
		const byValue = (value) => boxes.find((box) => box.value === value);
		const sync = () => {
			if (!boxes.some((box) => box.checked)) {
				const user = byValue("user");
				if (user) user.checked = true;
			}
			const moderator = byValue("moderator");
			const admin = byValue("admin");
			if (moderator) moderator.disabled = false;
			if (admin) admin.disabled = false;
			if (moderator?.checked && admin) {
				admin.checked = false;
				admin.disabled = true;
			} else if (admin?.checked && moderator) {
				moderator.checked = false;
				moderator.disabled = true;
			}
			for (const box of boxes) {
				const option = box.closest(".role-option");
				if (!option) continue;
				option.classList.toggle("selected", box.checked);
				option.classList.toggle("disabled", box.disabled);
			}
		};
		picker.addEventListener("change", sync);
		sync();
	}
})();
