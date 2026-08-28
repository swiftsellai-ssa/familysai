/**
 * KD-15 mailer.
 *
 * Default MAILER=resend (wrangler vars). MAILER=log is allowed only when
 * SIGNUPS_OPEN=dogfood (local wrangler tail). Production waitlist must not
 * use log mode. Do not invent a Resend from-address.
 */

export type MailerEnv = {
	MAILER: string;
	SIGNUPS_OPEN: string;
	RESEND_API_KEY?: string;
	RESEND_FROM?: string;
};

export function mailerRejectedAtBoot(env: MailerEnv): boolean {
	return env.MAILER === "log" && env.SIGNUPS_OPEN !== "dogfood";
}

export function mailerLogAllowed(env: MailerEnv): boolean {
	return env.MAILER === "log" && env.SIGNUPS_OPEN === "dogfood";
}

export function resendConfigured(env: MailerEnv): boolean {
	const key = typeof env.RESEND_API_KEY === "string" ? env.RESEND_API_KEY.trim() : "";
	const from = typeof env.RESEND_FROM === "string" ? env.RESEND_FROM.trim() : "";
	return key.length > 0 && from.length > 0;
}

/** Ready to deliver a magic-link URL (log tail or Resend). */
export function canSendMagicLink(env: MailerEnv): boolean {
	if (mailerRejectedAtBoot(env)) return false;
	if (env.MAILER === "log") return mailerLogAllowed(env);
	if (env.MAILER === "resend") return resendConfigured(env);
	return false;
}

export async function sendMagicLinkEmail(
	env: MailerEnv,
	args: { to: string; url: string; parentId: string },
): Promise<boolean> {
	if (mailerLogAllowed(env)) {
		console.log(
			JSON.stringify({ evt: "auth.magic_issued", parent_id: args.parentId }),
		);
		console.log(args.url);
		return true;
	}
	if (env.MAILER !== "resend") {
		console.log(JSON.stringify({ evt: "auth.mailer_failed", reason: "unknown_mailer" }));
		return false;
	}
	if (!resendConfigured(env)) {
		console.log(
			JSON.stringify({
				evt: "auth.mailer_failed",
				reason: "resend_from_or_key_missing",
			}),
		);
		return false;
	}
	try {
		const res = await fetch("https://api.resend.com/emails", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${env.RESEND_API_KEY!.trim()}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				from: env.RESEND_FROM!.trim(),
				to: [args.to],
				subject: "Your Family Kit sign-in link",
				text: `Open this link to sign in (expires in 15 minutes):\n\n${args.url}\n`,
			}),
		});
		if (!res.ok) {
			console.log(JSON.stringify({ evt: "auth.mailer_failed", reason: "resend_http" }));
			return false;
		}
		return true;
	} catch {
		console.log(JSON.stringify({ evt: "auth.mailer_failed", reason: "resend_error" }));
		return false;
	}
}
