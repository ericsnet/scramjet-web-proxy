const counters = {
	requests_total: 0,
	logins_success_total: 0,
	logins_failed_total: 0,
	logins_blocked_total: 0,
	wisp_connections_total: 0,
	blocked_hosts_total: 0,
	quarantine_rejected_total: 0,
};

export function count(name, value = 1) {
	if (Object.prototype.hasOwnProperty.call(counters, name)) {
		counters[name] += value;
	}
}

export function metricsSnapshot() {
	return { ...counters };
}
