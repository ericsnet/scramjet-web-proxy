// Dominios de publicidad, analítica y sincronización de cookies.
// Se bloquean por host y subdominios; no incluye APIs esenciales como
// googleapis.com, gstatic.com, accounts.google.com ni los CDN de los juegos.
export const AD_HOSTS = Object.freeze([
	"doubleclick.net",
	"googlesyndication.com",
	"googleadservices.com",
	"googletagmanager.com",
	"googletagservices.com",
	"google-analytics.com",
	"adservice.google.com",
	"ogads-pa.clients6.google.com",
	"adtrafficquality.google",
	"amazon-adsystem.com",
	"pubmatic.com",
	"rubiconproject.com",
	"criteo.com",
	"criteo.net",
	"taboola.com",
	"outbrain.com",
	"scorecardresearch.com",
	"quantserve.com",
	"adnxs.com",
	"adsrvr.org",
	"bidswitch.net",
	"casalemedia.com",
	"contextweb.com",
	"spotxchange.com",
	"sharethrough.com",
	"smartadserver.com",
	"sitescout.com",
	"tribalfusion.com",
	"yieldmo.com",
	"richaudience.com",
	"a-mo.net",
	"lkqd.net",
	"ad.gt",
	"everesttech.net",
	"ay.delivery",
	"bidtheatre.com",
	"blismedia.com",
	"company-target.com",
	"adsafeprotected.com",
	"moatads.com",
	"doubleverify.com",
	"confiant.com",
	"hotjar.com",
	"clarity.ms",
	"bat.bing.com",
	"connect.facebook.net",
	"analytics.tiktok.com",
	"ads.tiktok.com",
	"ads-api.tiktok.com",
	"business-api.tiktok.com",
	"t.poki.io",
	// Redes publicitarias y de identidad habituales.
	"adroll.com",
	"adform.net",
	"teads.tv",
	"3lift.com",
	"33across.com",
	"agkn.com",
	"crwdcntrl.net",
	"demdex.net",
	"krxd.net",
	"ml314.com",
	"mathtag.com",
	"omtrdc.net",
	"tapad.com",
	"bluekai.com",
	"exelator.com",
	"rlcdn.com",
	"pippio.com",
	"serving-sys.com",
	"sizmek.com",
	"innovid.com",
	"freewheel.tv",
	"stickyadstv.com",
	"yieldlab.net",
	"smartclip.net",
	"advertising.com",
	"yieldmanager.com",
	"adtech.de",
	"adtechus.com",
	"atwola.com",
	"tacoda.net",
	"revsci.net",
	"nexac.com",
	"aggregateknowledge.com",
	"bkrtx.com",
	"2o7.net",
	// Analítica que no aporta nada a la página.
	"chartbeat.com",
	"parsely.com",
	"hotjar.io",
	"segment.io",
	"mixpanel.com",
	"amplitude.com",
	"googleoptimize.com",
]);

const AD_PATTERNS = [
	/^(?:mon|mcs|starling)[a-z0-9-]*\.tiktokv?\.(?:com|eu)$/i,
];

const AD_HOST_SET = new Set(AD_HOSTS);

function normalizeHost(value) {
	return String(value || "").toLowerCase().replace(/\.$/, "");
}

export function isAdHost(hostname) {
	const host = normalizeHost(hostname);
	if (!host) return false;
	// Recorremos las etiquetas del dominio en vez de comparar la lista entera
	// para cada petición: con muchas webs abiertas esto ahorra CPU.
	let candidate = host;
	while (candidate) {
		if (AD_HOST_SET.has(candidate)) return true;
		const dot = candidate.indexOf(".");
		if (dot < 0) break;
		candidate = candidate.slice(dot + 1);
	}
	return AD_PATTERNS.some((pattern) => pattern.test(host));
}
