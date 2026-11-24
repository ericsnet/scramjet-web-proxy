export const ROLE_LEVELS = Object.freeze({
	user: 1,
	moderator: 2,
	admin: 3,
	creator: 4,
});

export const ROLE_LABELS = Object.freeze({
	user: "usuario",
	moderator: "moderador",
	admin: "administrador",
	creator: "creador",
});

export function roleLevel(role) {
	return ROLE_LEVELS[String(role || "")] || 0;
}

export function isAdminRole(role) {
	return role === "admin" || role === "creator";
}

export function isStaffRole(role) {
	return ["admin", "creator", "moderator"].includes(role);
}

export function canAssignRole(actorRole, role) {
	if (role === "creator") return false; // el creador es único
	if (actorRole === "creator") return ["user", "moderator", "admin"].includes(role);
	if (actorRole === "admin") return ["user", "moderator"].includes(role);
	return false;
}

export function canManageRole(actorRole, targetRole) {
	if (targetRole === "creator") return false;
	if (actorRole === "creator") return true;
	if (actorRole === "admin") return ["user", "moderator"].includes(targetRole);
	if (actorRole === "moderator") return targetRole === "user";
	return false;
}

export function canViewRole(actorRole, targetRole) {
	if (actorRole === "creator") return true;
	return roleLevel(actorRole) > roleLevel(targetRole);
}
