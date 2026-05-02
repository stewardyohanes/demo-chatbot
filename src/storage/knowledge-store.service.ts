import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import type { RetrievedContext } from '../chat/prompt-builder.service';

export interface UpsertConversationInput {
  tenantId: string;
  channel: string;
  customerId: string;
  crmChatId?: string;
  metadata?: Record<string, unknown>;
}

export interface UpsertMessageInput {
  conversationId: string;
  externalMessageId: string;
  senderRole: string;
  text: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

export interface KnowledgeChunkInput {
  conversationId: string;
  text: string;
  sourceMessageIds: string[];
  metadata?: Record<string, unknown>;
}

export interface SearchKnowledgeInput {
  tenantId: string;
  channel?: string;
  embedding: number[];
  limit: number;
}

export interface UpsertChatSessionInput {
  sessionId?: string;
  tenantId: string;
  channel: string;
  customerId: string;
  metadata?: Record<string, unknown>;
}

export interface ResponseLogInput {
  sessionId: string;
  question: string;
  answer: string;
  modelName: string;
  confidence: number;
  handoffRecommended: boolean;
  sourceMessageIds: string[];
  safetyFlags: string[];
  latencyMs: number;
  promptMetadata?: Record<string, unknown>;
}

export interface FeedbackInput {
  responseLogId: string;
  rating: 'accepted' | 'rejected' | 'corrected';
  correctedAnswer?: string;
  reviewerNotes?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class KnowledgeStore {
  constructor(private readonly database: DatabaseService) {}

  async initialize(): Promise<void> {
    await this.database.initializeSchema();
  }

  async healthCheck(): Promise<'not_configured' | 'ok' | 'error'> {
    return this.database.healthCheck();
  }

  async upsertConversation(input: UpsertConversationInput): Promise<string> {
    const result = await this.database.query<{ id: string }>(
      `
        INSERT INTO conversations (
          tenant_id, channel, customer_id, external_chat_id, metadata, updated_at
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, now())
        ON CONFLICT (tenant_id, channel, customer_id, external_chat_id)
        DO UPDATE SET metadata = conversations.metadata || EXCLUDED.metadata,
                      updated_at = now()
        RETURNING id
      `,
      [
        input.tenantId,
        input.channel,
        input.customerId,
        input.crmChatId ?? '',
        JSON.stringify(input.metadata ?? {}),
      ],
    );

    return result.rows[0].id;
  }

  async upsertMessage(
    input: UpsertMessageInput,
  ): Promise<{ id: string; inserted: boolean }> {
    const result = await this.database.query<{ id: string }>(
      `
        INSERT INTO messages (
          conversation_id, external_message_id, sender_role, text, message_timestamp, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
        ON CONFLICT (conversation_id, external_message_id) DO NOTHING
        RETURNING id
      `,
      [
        input.conversationId,
        input.externalMessageId,
        input.senderRole,
        input.text,
        input.timestamp ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    );

    if (result.rows[0]) {
      return { id: result.rows[0].id, inserted: true };
    }

    const existing = await this.database.query<{ id: string }>(
      `
        SELECT id FROM messages
        WHERE conversation_id = $1 AND external_message_id = $2
        LIMIT 1
      `,
      [input.conversationId, input.externalMessageId],
    );

    return { id: existing.rows[0].id, inserted: false };
  }

  async createKnowledgeChunk(input: KnowledgeChunkInput): Promise<string> {
    const result = await this.database.query<{ id: string }>(
      `
        INSERT INTO knowledge_chunks (conversation_id, text, source_message_ids, metadata)
        VALUES ($1, $2, $3::jsonb, $4::jsonb)
        RETURNING id
      `,
      [
        input.conversationId,
        input.text,
        JSON.stringify(input.sourceMessageIds),
        JSON.stringify(input.metadata ?? {}),
      ],
    );

    return result.rows[0].id;
  }

  async storeEmbedding(
    chunkId: string,
    embedding: number[],
    modelName: string,
  ): Promise<void> {
    await this.database.query(
      `
        INSERT INTO knowledge_embeddings (chunk_id, embedding, model_name)
        VALUES ($1, $2::vector, $3)
        ON CONFLICT (chunk_id)
        DO UPDATE SET embedding = EXCLUDED.embedding,
                      model_name = EXCLUDED.model_name,
                      created_at = now()
      `,
      [chunkId, this.toVectorLiteral(embedding), modelName],
    );
  }

  async searchKnowledge(
    input: SearchKnowledgeInput,
  ): Promise<RetrievedContext[]> {
    const params: unknown[] = [
      input.tenantId,
      this.toVectorLiteral(input.embedding),
      input.limit,
    ];
    const filters = ['c.tenant_id = $1'];

    if (input.channel) {
      params.push(input.channel);
      filters.push(`c.channel = $${params.length}`);
    }

    const result = await this.database.query<{
      chunk_id: string;
      text: string;
      source_message_ids: string[] | string;
      score: number | string;
    }>(
      `
        SELECT
          kc.id AS chunk_id,
          kc.text,
          kc.source_message_ids,
          1 - (ke.embedding <=> $4::vector) AS score
        FROM knowledge_chunks kc
        JOIN knowledge_embeddings ke ON ke.chunk_id = kc.id
        JOIN conversations c ON c.id = kc.conversation_id
        WHERE ${filters.join(' AND ')}
        ORDER BY ke.embedding <=> $2::vector
        LIMIT $3
      `,
      params,
    );

    return result.rows.map((row) => ({
      chunkId: row.chunk_id,
      text: row.text,
      sourceMessageIds: this.parseSourceIds(row.source_message_ids),
      score: Number(row.score),
    }));
  }

  async upsertChatSession(input: UpsertChatSessionInput): Promise<string> {
    if (input.sessionId) {
      const existing = await this.database.query<{ id: string }>(
        `
          SELECT id FROM chat_sessions
          WHERE tenant_id = $1
            AND channel = $2
            AND customer_id = $3
            AND external_session_id = $4
          LIMIT 1
        `,
        [input.tenantId, input.channel, input.customerId, input.sessionId],
      );

      if (existing.rows[0]) {
        return existing.rows[0].id;
      }
    }

    const result = await this.database.query<{ id: string }>(
      `
        INSERT INTO chat_sessions (
          tenant_id, channel, customer_id, external_session_id, metadata
        )
        VALUES ($1, $2, $3, $4, $5::jsonb)
        RETURNING id
      `,
      [
        input.tenantId,
        input.channel,
        input.customerId,
        input.sessionId ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    );

    return result.rows[0].id;
  }

  async createResponseLog(input: ResponseLogInput): Promise<string> {
    const result = await this.database.query<{ id: string }>(
      `
        INSERT INTO chat_response_logs (
          session_id, question, answer, model_name, confidence,
          handoff_recommended, source_message_ids, safety_flags,
          latency_ms, prompt_metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10::jsonb)
        RETURNING id
      `,
      [
        input.sessionId,
        input.question,
        input.answer,
        input.modelName,
        input.confidence,
        input.handoffRecommended,
        JSON.stringify(input.sourceMessageIds),
        JSON.stringify(input.safetyFlags),
        input.latencyMs,
        JSON.stringify(input.promptMetadata ?? {}),
      ],
    );

    return result.rows[0].id;
  }

  async createFeedback(input: FeedbackInput): Promise<string> {
    const result = await this.database.query<{ id: string }>(
      `
        INSERT INTO feedback (
          response_log_id, rating, corrected_answer, reviewer_notes, metadata
        )
        VALUES ($1, $2, $3, $4, $5::jsonb)
        RETURNING id
      `,
      [
        input.responseLogId,
        input.rating,
        input.correctedAnswer ?? null,
        input.reviewerNotes ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    );

    return result.rows[0].id;
  }

  private toVectorLiteral(embedding: number[]): string {
    if (embedding.length === 0) {
      throw new Error('Embedding vector cannot be empty');
    }

    return `[${embedding.map((item) => Number(item).toString()).join(',')}]`;
  }

  private parseSourceIds(sourceIds: string[] | string): string[] {
    if (Array.isArray(sourceIds)) {
      return sourceIds;
    }

    return JSON.parse(sourceIds) as string[];
  }
}
