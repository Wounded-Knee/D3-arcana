import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { objectKeyForFragment, objectKeyForTrack } from "./config.js";
import type { ObjectStore, ObjectStoreConfig } from "./types.js";

export class S3CompatibleObjectStore implements ObjectStore {
  private readonly client: S3Client;
  private readonly signingClient: S3Client;

  constructor(private readonly config: ObjectStoreConfig) {
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
      },
    });

    this.signingClient = new S3Client({
      region: config.region,
      endpoint: config.publicEndpoint,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
      },
    });
  }

  objectKeyForTrack(
    conversationId: string,
    callId: string,
    userId: string,
    trackSid: string,
    recordingId: string,
  ): string {
    return objectKeyForTrack(
      conversationId,
      callId,
      userId,
      trackSid,
      recordingId,
    );
  }

  objectKeyForFragment(sessionPrefix: string, callOffsetMs: number): string {
    return objectKeyForFragment(sessionPrefix, callOffsetMs);
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async ensureReady(): Promise<void> {
    try {
      await this.client.send(
        new HeadBucketCommand({ Bucket: this.config.bucket }),
      );
    } catch {
      await this.client.send(
        new CreateBucketCommand({ Bucket: this.config.bucket }),
      );
    }
  }

  async issueReadUrl(
    key: string,
    expiresInSeconds: number,
  ): Promise<string> {
    return getSignedUrl(
      this.signingClient,
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
      }),
      { expiresIn: expiresInSeconds },
    );
  }
}
