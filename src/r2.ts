import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export interface R2ClientConfig {
	accountId: string;
	accessKeyId: string;
	secretAccessKey: string;
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

	constructor(config: R2ClientConfig) {
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
					ContentType: options.contentType,
					IfNoneMatch: "*",
					Key: options.key,
				})
			);
		} catch (error) {
			if (getHttpStatusCode(error) === 412) {
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

function getHttpStatusCode(error: unknown): number | undefined {
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
