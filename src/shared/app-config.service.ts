import { Injectable } from '@nestjs/common';

export interface AiConfig {
  nodeEnv: string;
  port: number;
  serviceKey?: string;
  databaseUrl?: string;
  databaseSsl: boolean;
  hfToken?: string;
  hfProvider?: string;
  chatModel: string;
  embeddingModel: string;
  maxTokens: number;
  temperature: number;
  requestTimeoutMs: number;
  retrievalTopK: number;
  minConfidence: number;
  chunkSizeMessages: number;
}

@Injectable()
export class AppConfigService {
  get value(): AiConfig {
    return {
      nodeEnv: this.getString('NODE_ENV', 'development'),
      port: this.getNumber('PORT', 3000),
      serviceKey: this.getOptionalString('AI_SERVICE_KEY'),
      databaseUrl: this.getOptionalString('DATABASE_URL'),
      databaseSsl: this.getBoolean('DATABASE_SSL', false),
      hfToken: this.getOptionalString('HF_TOKEN'),
      hfProvider: this.getOptionalString('HF_PROVIDER'),
      chatModel: this.getString(
        'HF_CHAT_MODEL',
        'Qwen/Qwen2.5-7B-Instruct-1M:preferred',
      ),
      embeddingModel: this.getString(
        'HF_EMBEDDING_MODEL',
        'thenlper/gte-large',
      ),
      maxTokens: this.getNumber('HF_MAX_TOKENS', 450),
      temperature: this.getNumber('HF_TEMPERATURE', 0.2),
      requestTimeoutMs: this.getNumber('HF_REQUEST_TIMEOUT_MS', 10000),
      retrievalTopK: this.getNumber('RETRIEVAL_TOP_K', 5),
      minConfidence: this.getNumber('MIN_CONFIDENCE', 0.55),
      chunkSizeMessages: this.getNumber('CHUNK_SIZE_MESSAGES', 8),
    };
  }

  get databaseConfigured(): boolean {
    return Boolean(this.value.databaseUrl);
  }

  get hfConfigured(): boolean {
    return Boolean(this.value.hfToken);
  }

  get requiresServiceKey(): boolean {
    return (
      this.value.nodeEnv === 'production' || Boolean(this.value.serviceKey)
    );
  }

  private getOptionalString(key: string): string | undefined {
    const value = process.env[key];

    if (!value || value.trim() === '') {
      return undefined;
    }

    return value.trim();
  }

  private getString(key: string, fallback: string): string {
    return this.getOptionalString(key) ?? fallback;
  }

  private getNumber(key: string, fallback: number): number {
    const value = this.getOptionalString(key);

    if (!value) {
      return fallback;
    }

    const parsed = Number(value);

    if (Number.isNaN(parsed)) {
      throw new Error(`${key} environment variable must be a number`);
    }

    return parsed;
  }

  private getBoolean(key: string, fallback: boolean): boolean {
    const value = this.getOptionalString(key);

    if (!value) {
      return fallback;
    }

    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  }
}
