import { Injectable } from '@nestjs/common';

import type { AiConfig } from '../shared/app-config.service';
import { AppConfigService } from '../shared/app-config.service';
import type { EmbeddingProvider } from '../shared/hugging-face.service';
import { HuggingFaceService } from '../shared/hugging-face.service';
import { KnowledgeStore } from '../storage/knowledge-store.service';
import type {
  IngestMessageItem,
  IngestMessagesRequest,
  IngestMessagesResponse,
} from './ingestion.dto';

interface NormalizedMessage extends IngestMessageItem {
  text: string;
}

@Injectable()
export class IngestionService {
  constructor(
    private readonly store: KnowledgeStore,
    private readonly embeddingProvider: EmbeddingProvider,
    config: AppConfigService | AiConfig,
  ) {
    this.config = 'value' in config ? config.value : config;
  }

  private readonly config: AiConfig;

  async ingestMessages(
    input: IngestMessagesRequest,
  ): Promise<IngestMessagesResponse> {
    const conversationId = await this.store.upsertConversation({
      tenantId: input.tenantId,
      channel: input.channel,
      customerId: input.customerId,
      crmChatId: input.crmChatId,
      metadata: input.metadata,
    });
    const normalizedMessages = input.messages
      .map((message) => this.normalizeMessage(message))
      .filter((message): message is NormalizedMessage => Boolean(message));
    const inserted: NormalizedMessage[] = [];

    for (const message of normalizedMessages) {
      const result = await this.store.upsertMessage({
        conversationId,
        externalMessageId: message.externalMessageId,
        senderRole: message.senderRole,
        text: message.text,
        timestamp: message.timestamp,
        metadata: message.metadata,
      });

      if (result.inserted) {
        inserted.push(message);
      }
    }

    const chunks = this.chunkMessages(inserted);

    for (const chunk of chunks) {
      const chunkId = await this.store.createKnowledgeChunk({
        conversationId,
        text: chunk.text,
        sourceMessageIds: chunk.sourceMessageIds,
        metadata: {
          tenantId: input.tenantId,
          channel: input.channel,
          customerId: input.customerId,
          crmChatId: input.crmChatId,
        },
      });
      const embedding = await this.embeddingProvider.embed(chunk.text);
      await this.store.storeEmbedding(
        chunkId,
        embedding,
        this.config.embeddingModel,
      );
    }

    return {
      conversationId,
      received: input.messages.length,
      insertedMessages: inserted.length,
      skippedMessages: input.messages.length - inserted.length,
      chunksCreated: chunks.length,
    };
  }

  private normalizeMessage(
    message: IngestMessageItem,
  ): NormalizedMessage | undefined {
    const text = message.text?.replace(/\s+/g, ' ').trim();

    if (!text) {
      return undefined;
    }

    return {
      ...message,
      text,
    };
  }

  private chunkMessages(messages: NormalizedMessage[]) {
    const chunks: Array<{ text: string; sourceMessageIds: string[] }> = [];

    for (
      let index = 0;
      index < messages.length;
      index += this.config.chunkSizeMessages
    ) {
      const slice = messages.slice(
        index,
        index + this.config.chunkSizeMessages,
      );
      chunks.push({
        text: slice
          .map((message) => `${message.senderRole}: ${message.text}`)
          .join('\n'),
        sourceMessageIds: slice.map((message) => message.externalMessageId),
      });
    }

    return chunks;
  }
}

export const ingestionProviders = [
  {
    provide: IngestionService,
    useFactory: (
      store: KnowledgeStore,
      hf: HuggingFaceService,
      config: AppConfigService,
    ) => new IngestionService(store, hf, config),
    inject: [KnowledgeStore, HuggingFaceService, AppConfigService],
  },
];
