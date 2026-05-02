import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { KnowledgeStore } from './storage/knowledge-store.service';

@Injectable()
export class AppBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(AppBootstrapService.name);

  constructor(private readonly store: KnowledgeStore) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.store.initialize();
    } catch (error) {
      this.logger.error(
        `Database schema initialization failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
