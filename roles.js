export const ROLE_LEVELS = Object.freeze({
	user: 1,
	designer: 2,
	pentester: 2,
	qa: 2,
	moderator: 3,
	admin: 4,
	creator: 5,
});

export const ROLE_LABELS = Object.freeze({
	user: "usuario",
	designer: "diseñador gráfico",
	pentester: "pentester",
	qa: "QA / bugs",
	moderator: "moderador",
	admin: "administrador",
	creator: "creador",
});

export const SPECIALIST_ROLES = Object.freeze(["designer", "pentester", "qa"]);

export function roleLevel(role) {
	return ROLE_LEVELS[String(role || "")] || 0;
}

export function isKnownRole(role) {
	return Object.prototype.hasOwnProperty.call(ROLE_LEVELS, String(role || ""));
}

function rolesOf(input) {
	if (Array.isArray(input)) return input.map(String).filter(Boolean);
	if (input && typeof input === "object") {
		if (Array.isArray(input.roles)) return input.roles.map(String).filter(Boolean);
		if (input.role) return [String(input.role)];
	}
	return input ? [String(input)] : [];
}

const STAFF_ROLES = new Set(["moderator", "admin", "creator"]);

export function normalizeRoleList(input) {
	const roles = rolesOf(input).filter(isKnownRole);
	const unique = [...new Set(roles)];
	if (!unique.length) return ["user"];
	// Moderador, administrador y creador no son usuarios normales: su rol
	// sustituye al de usuario en lugar de sumarse a él.
	if (unique.some((role) => STAFF_ROLES.has(role))) {
		return unique.filter((role) => role !== "user");
	}
	return unique.includes("user") ? unique : ["user", ...unique];
}

export function highestRole(input) {
	const roles = normalizeRoleList(input);
	return roles.sort((a, b) => roleLevel(b) - roleLevel(a))[0] || "user";
}

export function hasRole(input, role) {
	return rolesOf(input).some((value) => value === String(role));
}

export function hasAnyRole(input, roles) {
	const wanted = new Set((roles || []).map(String));
	return rolesOf(input).some((value) => wanted.has(value));
}

export function isAdminRole(input) {
	return hasAnyRole(input, ["admin", "creator"]);
}

export function isStaffRole(input) {
	return hasAnyRole(input, ["admin", "creator", "moderator"]);
}

export function isSpecialistRole(input) {
	return hasAnyRole(input, SPECIALIST_ROLES);
}

export function isReportsRole(input) {
	return hasAnyRole(input, ["designer", "pentester", "qa", "creator"]);
}

export function canCreateInvites(input) {
	const roles =
		Array.isArray(input?.roles) && input.roles.length
			? input.roles.map(String).filter(Boolean)
			: input?.role
				? [String(input.role)]
				: [];
	return roles.length > 0 && !roles.includes("user");
}

export function canAssignRole(actorRole, role) {
	const target = String(role || "");
	if (target === "creator") return false;
	if (!isKnownRole(target)) return false;
	const actor = highestRole(actorRole);
	if (actor === "creator") return true;
	if (actor === "admin") {
		return ["user", "moderator", "designer", "pentester", "qa"].includes(target);
	}
	return false;
}

export function canManageRole(actorRole, targetRole) {
	const target = String(targetRole || "");
	if (target === "creator") return false;
	const actor = highestRole(actorRole);
	if (actor === "creator") return true;
	if (actor === "admin") {
		return ["user", "moderator", "designer", "pentester", "qa"].includes(target);
	}
	if (actor === "moderator") return target === "user";
	return false;
}

export function canViewRole(actorRole, targetRole) {
	const actor = highestRole(actorRole);
	if (actor === "creator") return true;
	return roleLevel(actor) > roleLevel(targetRole);
}
