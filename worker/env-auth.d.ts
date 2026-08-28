/**
 * Auth secrets and ops fill-ins.
 *
 * SESSION_SECRET, MAGIC_LINK_SIGNING_KEY, RESEND_API_KEY: wrangler secret put.
 * RESEND_FROM, DOFOOD_EMAIL: ops paste at deploy — do not invent in git.
 * Declaration merge with wrangler-generated Env. All optional so missing
 * values fail closed (no token / 401) rather than inventing AUTH=off.
 */
interface Env {
	SESSION_SECRET?: string;
	MAGIC_LINK_SIGNING_KEY?: string;
	RESEND_API_KEY?: string;
	RESEND_FROM?: string;
	DOFOOD_EMAIL?: string;
}
