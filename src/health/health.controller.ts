import { Controller, Get } from '@nestjs/common';

import { AppConfigService } from '../shared/app-config.service';
import { KnowledgeStore } from '../storage/knowledge-store.service';

@Controller()
export class HealthController {
  constructor(
    private readonly config: AppConfigService,
    private readonly store: KnowledgeStore,
  ) {}

  @Get()
  root() {
    return this.health();
  }

  @Get('health')
  async health() {
    return {
      status: 'ok',
      service: 'crm-ai-chatbot-service',
      database: await this.store.healthCheck(),
      huggingFace: this.config.hfConfigured ? 'configured' : 'not_configured',
      model: {
        chat: this.config.value.chatModel,
        embedding: this.config.value.embeddingModel,
      },
    };
  }
}
