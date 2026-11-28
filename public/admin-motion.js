(() => {
	if (window.__adminMotionLoaded) return;
	window.__adminMotionLoaded = true;
	window.__adminMotion = true;

	const root = document.documentElement;
	const isAdmin = location.pathname === "/admin" || location.pathname.startsWith("/admin/");
	const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
	const gsap = window.gsap;

	if (!isAdmin || !gsap || reduced) {
		root.classList.remove("admin-motion-ready");
		return;
	}

	const targets = [...document.querySelectorAll(".app-content .wrap > *")].filter((element) => {
		if (element.hidden) return false;
		const style = getComputedStyle(element);
		return style.display !== "none" && style.visibility !== "hidden";
	});

	if (!targets.length) {
		root.classList.remove("admin-motion-ready");
		return;
	}

	gsap.set(targets, { y: 10, opacity: 0 });
	const tl = gsap.timeline({
		defaults: { ease: "power3.out" },
		onComplete: () => {
			gsap.set(targets, { clearProps: "transform" });
			root.classList.remove("admin-motion-ready");
		},
	});
	tl.to(targets, { y: 0, opacity: 1, duration: 0.42, stagger: 0.055 });

	window.addEventListener(
		"pageshow",
		(event) => {
			if (event.persisted) {
				tl.progress(1).kill();
				root.classList.remove("admin-motion-ready");
			}
		},
		{ once: true },
	);
})();
