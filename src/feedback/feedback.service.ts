import { Injectable } from '@nestjs/common';

import { KnowledgeStore } from '../storage/knowledge-store.service';
import type {
  CreateFeedbackRequest,
  CreateFeedbackResponse,
} from './feedback.dto';

@Injectable()
export class FeedbackService {
  constructor(private readonly store: KnowledgeStore) {}

  async createFeedback(
    input: CreateFeedbackRequest,
  ): Promise<CreateFeedbackResponse> {
    const id = await this.store.createFeedback(input);

    return { id };
  }
}
