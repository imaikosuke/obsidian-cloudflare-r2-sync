import { readAwsSdkRequestHttpStatus } from "./r2";

/** User-facing grouping for SDK / TLS / TCP failures toward r2. */
export type R2ErrorInsightCategory =
	| "auth"
	| "bucket_or_key"
	| "permission"
	| "timeout"
	| "network"
	| "throttling"
	| "certificate"
	| "cors"
	| "unknown";

export interface R2ErrorInsight {
	category: R2ErrorInsightCategory;
	headline: string;
	hint: string;
	rawCode?: string;
	httpStatus?: number;
}

function readResponseStatus(error: unknown): number | undefined {
	if (typeof error !== "object" || error === null || !("$response" in error)) {
		return undefined;
	}

	const response = (
		error as { $response?: { statusCode?: number } | undefined }
	).$response;

	if (
		response === undefined ||
		typeof response.statusCode !== "number"
	) {
		return undefined;
	}

	return response.statusCode;
}

export function resolveR2HttpStatus(error: unknown): number | undefined {
	return (
		readAwsSdkRequestHttpStatus(error) ?? readResponseStatus(error)
	);
}

function canonicalCode(raw: string | undefined): string | undefined {
	if (raw === undefined) {
		return undefined;
	}

	const trimmed = raw.trim();
	const colonIdx = trimmed.indexOf(":");
	const tail = colonIdx >= 0 ? trimmed.slice(colonIdx + 1).trim() : trimmed;

	const withoutNs = tail.includes("#") ? tail.split("#")[1]?.trim() : tail;

	return withoutNs.trim() !== "" ? withoutNs.trim().toUpperCase() : undefined;
}

function mergeErrorStrings(error: unknown): {
	canonicalUpper: string | undefined;
	messageLower: string;
	nameUpper: string | undefined;
	s3XmlCodeUpper: string | undefined;
} {
	let nameUpper: string | undefined;
	let rawMessage = "";
	let s3XmlCodeUpper: string | undefined;

	if (error instanceof Error) {
		const trimmedName = error.name.trim();
		if (trimmedName !== "" && trimmedName !== "Error") {
			nameUpper = trimmedName.replace(/\s+/g, "").toUpperCase();
		}

		rawMessage = error.message;
	}

	if (typeof error === "object" && error !== null) {
		const o = error as Record<string, unknown>;
		if (typeof o.Code === "string") {
			s3XmlCodeUpper = canonicalCode(o.Code);
		}

		const msg = (o as { message?: unknown }).message;
		if (typeof msg === "string" && rawMessage === "") {
			rawMessage = msg;
		}
	}

	const messageLower = `${nameUpper ?? ""} ${s3XmlCodeUpper ?? ""} ${rawMessage}`.toLowerCase();

	return {
		canonicalUpper: s3XmlCodeUpper ?? nameUpper,
		messageLower,
		nameUpper,
		s3XmlCodeUpper,
	};
}

const AUTH_CODES = new Set([
	"INVALIDACCESSKEYID",
	"SIGNATUREDOESNOTMATCH",
	"INCOMPLETESIGNATURE",
	"INVALIDSECURITY",
	"INVALIDTOKEN",
	"EXPIREDTOKEN",
	"CREDENTIALSERROR",
]);

const BUCKET_CODES = new Set(["NOSUCHBUCKET", "NOSUCHKEY", "NOTFOUND"]);

const THROTTLE_CODES = new Set(["SLOWDOWN", "TOOMANYREQUESTS"]);

function networkLike(messageLower: string): boolean {
	return (
		messageLower.includes("econnreset") ||
		messageLower.includes("econnrefused") ||
		messageLower.includes("enotfound") ||
		messageLower.includes("enetunreach") ||
		messageLower.includes("ehostunreach") ||
		messageLower.includes("epipe") ||
		messageLower.includes("socket hang up") ||
		messageLower.includes("network error") ||
		messageLower.includes("fetch failed") ||
		messageLower.includes("aggregateerror") ||
		messageLower.includes("networkingerror")
	);
}

function timeoutLike(messageLower: string, codeUpper: string | undefined): boolean {
	return (
		codeUpper === "TIMEOUT" ||
		codeUpper === "REQUESTTIMEOUT" ||
		codeUpper === "ETIMEDOUT" ||
		messageLower.includes("etimedout") ||
		messageLower.includes("esockettimedout") ||
		messageLower.includes("timed out") ||
		messageLower.includes("timeout") ||
		messageLower.includes("econnaborted")
	);
}

function certificateLike(messageLower: string): boolean {
	return (
		messageLower.includes("certificate") ||
		messageLower.includes("cert_") ||
		messageLower.includes("ssl") ||
		messageLower.includes("tls") ||
		messageLower.includes("unable to verify") ||
		messageLower.includes("self signed")
	);
}

export function classifyR2RequestError(error: unknown): R2ErrorInsight {
	const httpStatus = resolveR2HttpStatus(error);
	const { canonicalUpper, messageLower, s3XmlCodeUpper } =
		mergeErrorStrings(error);
	const code = canonicalUpper;

	if (
		messageLower.includes("cors") ||
		messageLower.includes("cross-origin") ||
		messageLower.includes("cross origin")
	) {
		return {
			category: "cors",
			headline: "Cross-origin or CORS policy blocked the request",
			hint: "If this is a browser context, check allowed origins. The S3 API path usually bypasses CORS.",
			httpStatus,
			rawCode: s3XmlCodeUpper ?? code,
		};
	}

	if (timeoutLike(messageLower, code)) {
		return {
			category: "timeout",
			headline: "Request timed out",
			hint: "Retry when the network is stable, or check VPN and firewall rules.",
			httpStatus,
			rawCode: s3XmlCodeUpper ?? code,
		};
	}

	if (certificateLike(messageLower)) {
		return {
			category: "certificate",
			headline: "TLS or certificate validation failed",
			hint: "Check OS trust store, proxy SSL inspection, or corporate MITM rules.",
			httpStatus,
			rawCode: s3XmlCodeUpper ?? code,
		};
	}

	if (networkLike(messageLower)) {
		return {
			category: "network",
			headline: "Could not reach r2",
			hint: "Check internet, DNS, VPN, and that the account ID endpoint is correct.",
			httpStatus,
			rawCode: s3XmlCodeUpper ?? code,
		};
	}

	if (httpStatus === 429 || (code !== undefined && THROTTLE_CODES.has(code))) {
		return {
			category: "throttling",
			headline: "Rate limited or service busy",
			hint: "Wait and retry, or reduce parallel uploads.",
			httpStatus,
			rawCode: s3XmlCodeUpper ?? code,
		};
	}

	if (code !== undefined && AUTH_CODES.has(code)) {
		return {
			category: "auth",
			headline: "Credential or signature problem",
			hint: "Verify access key ID and secret, account ID, and that the token is not expired.",
			httpStatus,
			rawCode: s3XmlCodeUpper ?? code,
		};
	}

	if (httpStatus === 401) {
		return {
			category: "auth",
			headline: "Unauthorized (HTTP 401)",
			hint: "Regenerate r2 API tokens and update both secrets in Obsidian.",
			httpStatus,
			rawCode: s3XmlCodeUpper ?? code,
		};
	}

	if (code !== undefined && BUCKET_CODES.has(code)) {
		return {
			category: "bucket_or_key",
			headline: "Bucket or object not found",
			hint: "Confirm bucket name, object key, and that the bucket exists in this account.",
			httpStatus,
			rawCode: s3XmlCodeUpper ?? code,
		};
	}

	if (httpStatus === 404) {
		return {
			category: "bucket_or_key",
			headline: "Not found (HTTP 404)",
			hint: "Often a wrong bucket name or path. Confirm settings against the Cloudflare dashboard.",
			httpStatus,
			rawCode: s3XmlCodeUpper ?? code,
		};
	}

	if (code === "ACCESSDENIED") {
		return {
			category: "permission",
			headline: "Access denied by r2",
			hint: "Token works but lacks read, write, or delete permission for this bucket.",
			httpStatus,
			rawCode: s3XmlCodeUpper ?? code,
		};
	}

	if (httpStatus === 403) {
		return {
			category: "permission",
			headline: "Forbidden (HTTP 403)",
			hint: "Check bucket policy, token permissions, or invalid signature vs. wrong secret.",
			httpStatus,
			rawCode: s3XmlCodeUpper ?? code,
		};
	}

	if (httpStatus !== undefined && httpStatus >= 500) {
		return {
			category: "unknown",
			headline: `Server error (HTTP ${httpStatus})`,
			hint: "Retry later; if it persists, note the code above for support.",
			httpStatus,
			rawCode: s3XmlCodeUpper ?? code,
		};
	}

	const fallbackMsg =
		error instanceof Error ? error.message : typeof error === "string" ? error : "";

	return {
		category: "unknown",
		headline: fallbackMsg.trim() !== "" ? fallbackMsg.slice(0, 120) : "Unknown error",
		hint: "Note this wording when reporting the issue.",
		httpStatus,
		rawCode: s3XmlCodeUpper ?? code,
	};
}

/** One line suitable for `Notice` (sentence case, truncated by caller if needed). */
export function formatR2ErrorForNotice(error: unknown): string {
	const i = classifyR2RequestError(error);
	const bits: string[] = [i.headline];

	if (i.rawCode) {
		bits.push(`(${i.rawCode})`);
	}

	if (i.httpStatus !== undefined) {
		bits.push(`HTTP ${i.httpStatus}`);
	}

	return `${bits.join(" ")}. ${i.hint}`;
}

export const MAX_DETAILED_NOTICE_LENGTH = 420;

export function truncateForNotice(text: string, max = MAX_DETAILED_NOTICE_LENGTH): string {
	if (text.length <= max) {
		return text;
	}

	return `${text.slice(0, max - 3)}...`;
}
