import {
  CreateBucketCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';

/** S3-compatible object storage: RustFS locally, AWS S3 in production. */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly createBucket: boolean;

  constructor(config: ConfigService<Env, true>) {
    const endpoint = config.get('S3_ENDPOINT', { infer: true });
    this.bucket = config.get('S3_BUCKET', { infer: true });
    this.createBucket = config.get('NODE_ENV', { infer: true }) !== 'production';
    this.client = new S3Client({
      region: config.get('S3_REGION', { infer: true }),
      endpoint: endpoint || undefined,
      forcePathStyle: Boolean(endpoint),
      credentials: config.get('S3_ACCESS_KEY', { infer: true })
        ? {
            accessKeyId: config.get('S3_ACCESS_KEY', { infer: true }),
            secretAccessKey: config.get('S3_SECRET_KEY', { infer: true }),
          }
        : undefined,
    });
  }

  /** In development the bucket is created on startup; production buckets are provisioned. */
  async onModuleInit(): Promise<void> {
    if (!this.createBucket) return;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.logger.log(`Created bucket ${this.bucket}`);
      } catch (err) {
        this.logger.warn(`Object storage unavailable: ${(err as Error).message}`);
      }
    }
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (err) {
      // The database row is the source of truth; an orphaned object is only storage cost.
      this.logger.warn(`Failed to delete ${key}: ${(err as Error).message}`);
    }
  }
}
