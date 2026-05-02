import { Injectable } from '@nestjs/common';

import type { RetrievedContext } from '../chat/prompt-builder.service';
import type { AiConfig } from '../shared/app-config.service';
import { AppConfigService } from '../shared/app-config.service';
import type { EmbeddingProvider } from '../shared/hugging-face.service';
import { HuggingFaceService } from '../shared/hugging-face.service';
import { KnowledgeStore } from '../storage/knowledge-store.service';

export interface RetrieveInput {
  tenantId: string;
  channel: string;
  customerId: string;
  message: string;
}

@Injectable()
export class RetrievalService {
  private readonly config: AiConfig;

  constructor(
    private readonly store: KnowledgeStore,
    private readonly embeddingProvider: EmbeddingProvider,
    config: AppConfigService | AiConfig,
  ) {
    this.config = 'value' in config ? config.value : config;
  }

  async retrieve(input: RetrieveInput): Promise<RetrievedContext[]> {
    const embedding = await this.embeddingProvider.embed(input.message);

    return this.store.searchKnowledge({
      tenantId: input.tenantId,
      channel: input.channel,
      customerId: input.customerId,
      embedding,
      limit: this.config.retrievalTopK,
    });
  }
}

export const retrievalProviders = [
  {
    provide: RetrievalService,
    useFactory: (
      store: KnowledgeStore,
      hf: HuggingFaceService,
      config: AppConfigService,
    ) => new RetrievalService(store, hf, config),
    inject: [KnowledgeStore, HuggingFaceService, AppConfigService],
  },
];
