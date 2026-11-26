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
]);

const AD_PATTERNS = [
	/^(?:mon|mcs|starling)[a-z0-9-]*\.tiktokv?\.(?:com|eu)$/i,
];

function normalizeHost(value) {
	return String(value || "").toLowerCase().replace(/\.$/, "");
}

export function isAdHost(hostname) {
	const host = normalizeHost(hostname);
	if (!host) return false;
	if (AD_HOSTS.some((item) => host === item || host.endsWith(`.${item}`))) {
		return true;
	}
	return AD_PATTERNS.some((pattern) => pattern.test(host));
}
