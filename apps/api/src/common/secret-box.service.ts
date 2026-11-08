import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { Env } from '../config/env.js';

const VERSION = 'v1';

/**
 * Encrypts secrets stored in the database (identity and connector signing keys) with
 * AES-256-GCM. Values look like `v1.<iv>.<tag>.<ciphertext>`, all base64url.
 */
@Injectable()
export class SecretBox {
  private readonly key: Buffer;

  constructor(config: ConfigService<Env, true>) {
    const configured = Buffer.from(config.get('ENCRYPTION_KEY', { infer: true }), 'base64');
    if (configured.length === 32) {
      this.key = configured;
    } else {
      // Development only (production refuses to start without a key): a stable derived key.
      new Logger(SecretBox.name).warn('ENCRYPTION_KEY is not set; using a development key.');
      this.key = createHash('sha256').update(`groundline-dev:${config.get('SUPABASE_JWT_SECRET', { infer: true })}`).digest();
    }
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return [VERSION, iv, cipher.getAuthTag(), data].map((p) => (typeof p === 'string' ? p : p.toString('base64url'))).join('.');
  }

  decrypt(sealed: string): string {
    const [version, iv, tag, data] = sealed.split('.');
    if (version !== VERSION || !iv || !tag || !data) throw new Error('Unrecognized secret format');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  }

  /** A new random secret for an organization to sign or verify with. */
  static generate(prefix: string): string {
    return `${prefix}_${randomBytes(32).toString('base64url')}`;
  }
}
