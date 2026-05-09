import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export const R2_CACHE_PRESETS = {
	yearImmutable: "public, max-age=31536000, immutable",
	year: "public, max-age=31536000",
	day: "public, max-age=86400",
	hour: "public, max-age=3600",
	revalidate: "public, max-age=0, must-revalidate",
} as const;

export type R2CachePreset = keyof typeof R2_CACHE_PRESETS;

/** Same value as `R2_CACHE_PRESETS.yearImmutable`; kept for callers that need the string only. */
export const R2_OBJECT_CACHE_CONTROL = R2_CACHE_PRESETS.yearImmutable;

export function getCacheControlForPreset(preset: R2CachePreset): string {
	return R2_CACHE_PRESETS[preset];
}

export function normalizeR2CachePreset(value: string): R2CachePreset {
	return value in R2_CACHE_PRESETS ? (value as R2CachePreset) : "yearImmutable";
}

export interface R2ClientConfig {
	accountId: string;
	accessKeyId: string;
	secretAccessKey: string;
	cacheControl: string;
}

export interface UploadImageOptions {
	bucketName: string;
	key: string;
	body: ArrayBuffer;
	contentType: string;
}

export interface DeleteImageOptions {
	bucketName: string;
	key: string;
}

export class ObjectAlreadyExistsError extends Error {
	constructor(key: string) {
		super(`Object already exists: ${key}`);
		this.name = "ObjectAlreadyExistsError";
	}
}

export class R2ImageClient {
	private readonly client: S3Client;
	private readonly cacheControl: string;

	constructor(config: R2ClientConfig) {
		this.cacheControl = config.cacheControl;
		this.client = new S3Client({
			credentials: {
				accessKeyId: config.accessKeyId,
				secretAccessKey: config.secretAccessKey,
			},
			endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
			forcePathStyle: true,
			region: "auto",
		});
	}

	async uploadIfAbsent(options: UploadImageOptions): Promise<void> {
		try {
			await this.client.send(
				new PutObjectCommand({
					Body: new Uint8Array(options.body),
					Bucket: options.bucketName,
					CacheControl: this.cacheControl,
					ContentType: options.contentType,
					IfNoneMatch: "*",
					Key: options.key,
				})
			);
		} catch (error) {
			if (readAwsSdkRequestHttpStatus(error) === 412) {
				throw new ObjectAlreadyExistsError(options.key);
			}
			throw error;
		}
	}

	async deleteObject(options: DeleteImageOptions): Promise<void> {
		await this.client.send(
			new DeleteObjectCommand({
				Bucket: options.bucketName,
				Key: options.key,
			})
		);
	}
}

/** HTTP status from AWS SDK v3 errors (S3 / r2), when present. */
export function readAwsSdkRequestHttpStatus(error: unknown): number | undefined {
	if (typeof error !== "object" || error === null || !("$metadata" in error)) {
		return undefined;
	}

	const metadata = error.$metadata;
	if (
		typeof metadata !== "object" ||
		metadata === null ||
		!("httpStatusCode" in metadata)
	) {
		return undefined;
	}

	const { httpStatusCode } = metadata;
	return typeof httpStatusCode === "number" ? httpStatusCode : undefined;
}
