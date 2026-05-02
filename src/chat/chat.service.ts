import { Injectable } from '@nestjs/common';

import { RetrievalService } from '../retrieval/retrieval.service';
import type { AiConfig } from '../shared/app-config.service';
import { AppConfigService } from '../shared/app-config.service';
import type { ChatCompletionProvider } from '../shared/hugging-face.service';
import { HuggingFaceService } from '../shared/hugging-face.service';
import { KnowledgeStore } from '../storage/knowledge-store.service';
import type { ChatRespondRequest, ChatRespondResponse } from './chat.dto';
import { PromptBuilderService } from './prompt-builder.service';
import type { RetrievedContext } from './prompt-builder.service';

@Injectable()
export class ChatService {
  private readonly config: AiConfig;

  constructor(
    private readonly retrieval: RetrievalService,
    private readonly provider: ChatCompletionProvider,
    private readonly promptBuilder: PromptBuilderService,
    private readonly store: KnowledgeStore,
    config: AppConfigService | AiConfig,
  ) {
    this.config = 'value' in config ? config.value : config;
  }

  async respond(input: ChatRespondRequest): Promise<ChatRespondResponse> {
    const startedAt = Date.now();
    const sessionId = await this.store.upsertChatSession({
      sessionId: input.sessionId,
      tenantId: input.tenantId,
      channel: input.channel,
      customerId: input.customerId,
      metadata: input.metadata,
    });
    let contexts: RetrievedContext[];

    try {
      contexts = await this.retrieval.retrieve({
        tenantId: input.tenantId,
        channel: input.channel,
        customerId: input.customerId,
        message: input.message,
      });
    } catch {
      return this.storeAndReturn({
        sessionId,
        question: input.message,
        answer:
          'Maaf, sistem AI sedang belum bisa membaca konteks percakapan dengan stabil. Saya rekomendasikan percakapan ini diteruskan ke tim sales/CS.',
        confidence: 0,
        handoffRecommended: true,
        sourceMessageIds: [],
        safetyFlags: ['PROVIDER_ERROR'],
        latencyMs: Date.now() - startedAt,
        promptMetadata: { retrievalFailed: true },
      });
    }

    if (contexts.length === 0) {
      return this.storeAndReturn({
        sessionId,
        question: input.message,
        answer:
          'Saya belum menemukan konteks yang cukup dari history chat untuk menjawab dengan akurat. Saya bisa bantu teruskan ke tim sales/CS agar informasinya tepat.',
        confidence: 0,
        handoffRecommended: true,
        sourceMessageIds: [],
        safetyFlags: ['NO_CONTEXT'],
        latencyMs: Date.now() - startedAt,
        promptMetadata: { retrievedChunks: 0 },
      });
    }

    const prompt = this.promptBuilder.build({
      message: input.message,
      contexts,
    });

    try {
      const answer = await this.provider.complete(prompt.messages);
      const confidence = this.calculateConfidence(contexts);
      const safetyFlags = this.detectSafetyFlags(answer);
      const handoffRecommended =
        prompt.defaultHandoffRecommended ||
        confidence < this.config.minConfidence ||
        safetyFlags.length > 0;

      return this.storeAndReturn({
        sessionId,
        question: input.message,
        answer,
        confidence,
        handoffRecommended,
        sourceMessageIds: this.uniqueSourceIds(contexts),
        safetyFlags,
        latencyMs: Date.now() - startedAt,
        promptMetadata: {
          retrievedChunks: contexts.length,
          contextChunkIds: contexts.map((context) => context.chunkId),
        },
      });
    } catch {
      return this.storeAndReturn({
        sessionId,
        question: input.message,
        answer:
          'Maaf, sistem AI sedang belum bisa memproses jawaban dengan stabil. Saya rekomendasikan percakapan ini diteruskan ke tim sales/CS.',
        confidence: 0,
        handoffRecommended: true,
        sourceMessageIds: this.uniqueSourceIds(contexts),
        safetyFlags: ['PROVIDER_ERROR'],
        latencyMs: Date.now() - startedAt,
        promptMetadata: {
          retrievedChunks: contexts.length,
          contextChunkIds: contexts.map((context) => context.chunkId),
        },
      });
    }
  }

  private async storeAndReturn(input: {
    sessionId: string;
    question: string;
    answer: string;
    confidence: number;
    handoffRecommended: boolean;
    sourceMessageIds: string[];
    safetyFlags: string[];
    latencyMs: number;
    promptMetadata: Record<string, unknown>;
  }): Promise<ChatRespondResponse> {
    const responseLogId = await this.store.createResponseLog({
      sessionId: input.sessionId,
      question: input.question,
      answer: input.answer,
      modelName: this.config.chatModel,
      confidence: input.confidence,
      handoffRecommended: input.handoffRecommended,
      sourceMessageIds: input.sourceMessageIds,
      safetyFlags: input.safetyFlags,
      latencyMs: input.latencyMs,
      promptMetadata: input.promptMetadata,
    });

    return {
      responseLogId,
      answer: input.answer,
      confidence: input.confidence,
      handoffRecommended: input.handoffRecommended,
      sourceMessageIds: input.sourceMessageIds,
      safetyFlags: input.safetyFlags,
      model: this.config.chatModel,
    };
  }

  private calculateConfidence(contexts: RetrievedContext[]): number {
    const maxScore = Math.max(...contexts.map((context) => context.score));

    if (!Number.isFinite(maxScore)) {
      return 0;
    }

    return Math.max(0, Math.min(0.95, Number(maxScore.toFixed(2))));
  }

  private uniqueSourceIds(contexts: RetrievedContext[]): string[] {
    return Array.from(
      new Set(contexts.flatMap((context) => context.sourceMessageIds)),
    );
  }

  private detectSafetyFlags(answer: string): string[] {
    const normalized = answer.toLowerCase();
    const flags: string[] = [];

    if (
      normalized.includes('pasti profit') ||
      normalized.includes('profit pasti') ||
      normalized.includes('dijamin profit')
    ) {
      flags.push('UNSAFE_PROFIT_CLAIM');
    }

    if (
      normalized.includes('harus buy') ||
      normalized.includes('harus sell') ||
      normalized.includes('wajib buy') ||
      normalized.includes('wajib sell')
    ) {
      flags.push('PERSONAL_TRADING_ADVICE');
    }

    return flags;
  }
}

export const chatProviders = [
  PromptBuilderService,
  {
    provide: ChatService,
    useFactory: (
      retrieval: RetrievalService,
      hf: HuggingFaceService,
      promptBuilder: PromptBuilderService,
      store: KnowledgeStore,
      config: AppConfigService,
    ) => new ChatService(retrieval, hf, promptBuilder, store, config),
    inject: [
      RetrievalService,
      HuggingFaceService,
      PromptBuilderService,
      KnowledgeStore,
      AppConfigService,
    ],
  },
];
