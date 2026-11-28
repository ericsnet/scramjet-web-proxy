(() => {
	if (window.__landingMotionLoaded) return;
	window.__landingMotionLoaded = true;
	window.__landingMotion = true;

	const root = document.documentElement;
	const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
	const gsap = window.gsap;

	if (!gsap || reduced) {
		root.classList.remove("motion-ready");
		return;
	}

	const left = [
		".hero .brand-mark",
		"#hero-title",
		".hero .subtitle",
		"#sj-form",
		"#quick-links",
		".hero .notice",
	].flatMap((selector) => [...document.querySelectorAll(selector)]);
	const side = document.querySelector(".hero-side");
	const tabs = document.getElementById("landing-tab-bar");

	if (!left.length && !side) {
		root.classList.remove("motion-ready");
		return;
	}

	gsap.set(left, { y: 14, opacity: 0 });
	if (side) gsap.set(side, { x: 18, opacity: 0 });
	if (tabs && !tabs.hidden) gsap.set(tabs, { y: 8, opacity: 0 });

	const tl = gsap.timeline({
		defaults: { ease: "power3.out" },
		onComplete: () => {
			gsap.set([...left, side, tabs].filter(Boolean), { clearProps: "transform" });
			root.classList.remove("motion-ready");
		},
	});

	if (tabs && !tabs.hidden) {
		tl.to(tabs, { y: 0, opacity: 1, duration: 0.4 });
	}
	if (left.length) {
		tl.to(
			left,
			{ y: 0, opacity: 1, duration: 0.52, stagger: 0.06 },
			tabs && !tabs.hidden ? "-=0.2" : 0,
		);
	}
	if (side) {
		tl.to(side, { x: 0, opacity: 1, duration: 0.58 }, "-=0.38");
	}

	// Si una pestaña vuelve desde bfcache, no repetir la entrada.
	window.addEventListener(
		"pageshow",
		(event) => {
			if (event.persisted) {
				tl.progress(1).kill();
				root.classList.remove("motion-ready");
			}
		},
		{ once: true },
	);
})();
