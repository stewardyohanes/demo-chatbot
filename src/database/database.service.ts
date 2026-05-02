import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, QueryResult, QueryResultRow } from 'pg';

import { AppConfigService } from '../shared/app-config.service';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool?: Pool;

  constructor(private readonly config: AppConfigService) {
    const databaseUrl = this.config.value.databaseUrl;

    if (databaseUrl) {
      this.pool = new Pool({
        connectionString: databaseUrl,
        ssl: this.config.value.databaseSsl
          ? { rejectUnauthorized: false }
          : undefined,
      });
    }
  }

  get configured(): boolean {
    return Boolean(this.pool);
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values: unknown[] = [],
  ): Promise<QueryResult<T>> {
    if (!this.pool) {
      throw new Error('DATABASE_URL is not configured');
    }

    return this.pool.query<T>(text, values);
  }

  async initializeSchema(): Promise<void> {
    if (!this.pool) {
      return;
    }

    await this.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await this.query('CREATE EXTENSION IF NOT EXISTS vector');

    await this.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        channel text NOT NULL,
        customer_id text NOT NULL,
        external_chat_id text NOT NULL DEFAULT '',
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, channel, customer_id, external_chat_id)
      )
    `);

    await this.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        external_message_id text NOT NULL,
        sender_role text NOT NULL,
        text text NOT NULL,
        message_timestamp timestamptz,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (conversation_id, external_message_id)
      )
    `);

    await this.query(`
      CREATE TABLE IF NOT EXISTS knowledge_chunks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        text text NOT NULL,
        source_message_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await this.query(`
      CREATE TABLE IF NOT EXISTS knowledge_embeddings (
        chunk_id uuid PRIMARY KEY REFERENCES knowledge_chunks(id) ON DELETE CASCADE,
        embedding vector NOT NULL,
        model_name text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await this.query(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id text NOT NULL,
        channel text NOT NULL,
        customer_id text NOT NULL,
        external_session_id text,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await this.query(`
      CREATE TABLE IF NOT EXISTS chat_response_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id uuid REFERENCES chat_sessions(id) ON DELETE SET NULL,
        question text NOT NULL,
        answer text NOT NULL,
        model_name text NOT NULL,
        confidence numeric NOT NULL,
        handoff_recommended boolean NOT NULL,
        source_message_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
        safety_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
        latency_ms integer NOT NULL,
        prompt_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await this.query(`
      CREATE TABLE IF NOT EXISTS feedback (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        response_log_id uuid NOT NULL REFERENCES chat_response_logs(id) ON DELETE CASCADE,
        rating text NOT NULL,
        corrected_answer text,
        reviewer_notes text,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await this.query(
      'CREATE INDEX IF NOT EXISTS knowledge_chunks_conversation_idx ON knowledge_chunks(conversation_id)',
    );
  }

  async healthCheck(): Promise<'not_configured' | 'ok' | 'error'> {
    if (!this.pool) {
      return 'not_configured';
    }

    try {
      await this.query('SELECT 1');

      return 'ok';
    } catch {
      return 'error';
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }
}
