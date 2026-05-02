import { Module } from '@nestjs/common';

import { AppBootstrapService } from './app-bootstrap.service';
import { ChatController } from './chat/chat.controller';
import { chatProviders } from './chat/chat.service';
import { DatabaseService } from './database/database.service';
import { FeedbackController } from './feedback/feedback.controller';
import { FeedbackService } from './feedback/feedback.service';
import { HealthController } from './health/health.controller';
import { IngestionController } from './ingestion/ingestion.controller';
import { ingestionProviders } from './ingestion/ingestion.service';
import { PlaygroundController } from './playground/playground.controller';
import { retrievalProviders } from './retrieval/retrieval.service';
import { AiServiceKeyGuard } from './shared/ai-auth.guard';
import { AppConfigService } from './shared/app-config.service';
import { HuggingFaceService } from './shared/hugging-face.service';
import { KnowledgeStore } from './storage/knowledge-store.service';

@Module({
  imports: [],
  controllers: [
    HealthController,
    IngestionController,
    ChatController,
    FeedbackController,
    PlaygroundController,
  ],
  providers: [
    AppConfigService,
    DatabaseService,
    KnowledgeStore,
    HuggingFaceService,
    AiServiceKeyGuard,
    FeedbackService,
    AppBootstrapService,
    ...ingestionProviders,
    ...retrievalProviders,
    ...chatProviders,
  ],
})
export class AppModule {}
