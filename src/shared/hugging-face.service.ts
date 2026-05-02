import { Injectable } from '@nestjs/common';
import { InferenceClient } from '@huggingface/inference';

import type { AiConfig } from './app-config.service';
import { AppConfigService } from './app-config.service';

export interface ChatPromptMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface EmbeddingProvider {
  embed(input: string): Promise<number[]>;
}

export interface ChatCompletionProvider {
  complete(messages: ChatPromptMessage[]): Promise<string>;
}

@Injectable()
export class HuggingFaceService
  implements EmbeddingProvider, ChatCompletionProvider
{
  private readonly client: InferenceClient;

  private readonly config: AiConfig;

  constructor(configService: AppConfigService) {
    this.config = configService.value;
    this.client = new InferenceClient(this.config.hfToken);
  }

  async embed(input: string): Promise<number[]> {
    this.assertConfigured();
    const result = await this.withTimeout(
      this.client.featureExtraction({
        model: this.config.embeddingModel,
        provider: this.config.hfProvider,
        inputs: input,
        normalize: true,
        truncate: true,
      } as never),
      'Hugging Face embedding request timed out',
    );

    return this.flattenEmbedding(result);
  }

  async complete(messages: ChatPromptMessage[]): Promise<string> {
    this.assertConfigured();
    const completion = await this.withTimeout(
      this.client.chatCompletion({
        model: this.config.chatModel,
        provider: this.config.hfProvider,
        messages,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
      } as never),
      'Hugging Face chat request timed out',
    );

    const content = completion.choices?.[0]?.message?.content;

    if (!content || content.trim() === '') {
      throw new Error('Hugging Face returned an empty chat response');
    }

    return content.trim();
  }

  private assertConfigured(): void {
    if (!this.config.hfToken) {
      throw new Error('HF_TOKEN is not configured');
    }
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    message: string,
  ): Promise<T> {
    let timeout: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(
        () => reject(new Error(message)),
        this.config.requestTimeoutMs,
      );
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  private flattenEmbedding(value: unknown): number[] {
    if (!Array.isArray(value)) {
      throw new Error('Hugging Face embedding response is not an array');
    }

    if (value.every((item) => typeof item === 'number')) {
      return value;
    }

    if (value.every((item) => Array.isArray(item))) {
      const rows = value as number[][];
      const firstRow = rows.find((row) =>
        row.every((item) => typeof item === 'number'),
      );

      if (firstRow) {
        return firstRow;
      }
    }

    throw new Error('Unsupported Hugging Face embedding response shape');
  }
}
