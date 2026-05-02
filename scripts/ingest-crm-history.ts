import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Pool } from 'pg';

import {
  CrmMessageRow,
  type CrmHistoryMapperOptions,
  mapCrmMessageToIngestItem,
} from '../src/crm-import/crm-history.mapper';
import type { IngestMessagesRequest } from '../src/ingestion/ingestion.dto';

interface CrmChatRow {
  chat_id: string;
  customer_phone: string;
  channel_id?: string | null;
  channel_name?: string | null;
  channel_department_id?: string | null;
  name?: string | null;
  from_user?: string | null;
  chat_status?: string | null;
  session_id?: string | null;
  session_status?: string | null;
  start_chat?: Date | string | null;
  end_chat?: Date | string | null;
  last_reply_time?: Date | string | null;
}

interface IngestResult {
  conversationId: string;
  received: number;
  insertedMessages: number;
  skippedMessages: number;
  chunksCreated: number;
}

loadDotEnv();

if (process.argv.includes('--help')) {
  printHelp();
  process.exit(0);
}

const crmDatabaseUrl = requiredEnv('CRM_DATABASE_URL');
const aiServiceBaseUrl = getEnv('AI_SERVICE_BASE_URL', 'http://localhost:3002');
const tenantId = getEnv('CRM_INGEST_TENANT_ID', 'astronacci');
const defaultChannel = getEnv('CRM_INGEST_CHANNEL', 'whatsapp');
const limitChats = getNumberEnv('CRM_INGEST_LIMIT_CHATS', 50);
const since = optionalEnv('CRM_INGEST_SINCE');
const customerPhone = optionalEnv('CRM_INGEST_CUSTOMER_PHONE');
const dryRun = getBooleanEnv('CRM_INGEST_DRY_RUN', false);
const delayMs = getNumberEnv('CRM_INGEST_DELAY_MS', 0);
const includeBotMessages = getBooleanEnv('CRM_INGEST_INCLUDE_BOT', false);
const excludeSystemMessages = getBooleanEnv('CRM_INGEST_EXCLUDE_SYSTEM', true);
const allowedMessageTypes = getListEnv('CRM_INGEST_MESSAGE_TYPES', ['TEXT']);
const exportJsonlPath = optionalEnv('CRM_EXPORT_JSONL_PATH');
const aiServiceKey = dryRun
  ? optionalEnv('AI_SERVICE_KEY')
  : requiredEnv('AI_SERVICE_KEY');
const mapperOptions: CrmHistoryMapperOptions = {
  includeBotMessages,
  allowedMessageTypes,
  excludeSystemMessages,
};

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: crmDatabaseUrl });

  try {
    const chats = await loadChats(pool);
    let totalPrepared = 0;
    let totalMessages = 0;
    let totalInserted = 0;
    let totalChunks = 0;

    console.log(`Found ${chats.length} CRM chats to ingest`);
    console.log(
      `Filters: types=${allowedMessageTypes.join(',') || 'all'}, includeBot=${includeBotMessages}, excludeSystem=${excludeSystemMessages}`,
    );

    if (exportJsonlPath) {
      console.log(`Export JSONL: ${resolve(exportJsonlPath)}`);
    }

    for (const [index, chat] of chats.entries()) {
      const messages = await loadMessages(pool, chat.chat_id);
      const ingestMessages = messages
        .map((message) => mapCrmMessageToIngestItem(message, mapperOptions))
        .filter((message): message is NonNullable<typeof message> =>
          Boolean(message),
        );

      if (ingestMessages.length === 0) {
        console.log(
          `[${index + 1}/${chats.length}] skip chat ${chat.chat_id}: no text messages`,
        );
        continue;
      }

      const payload: IngestMessagesRequest = {
        tenantId,
        channel: defaultChannel,
        customerId: chat.customer_phone,
        crmChatId: chat.chat_id,
        metadata: {
          crmChannelId: chat.channel_id,
          crmChannelName: chat.channel_name,
          crmChannelDepartmentId: chat.channel_department_id,
          crmChatName: chat.name,
          crmFromUser: chat.from_user,
          crmChatStatus: chat.chat_status,
          latestChatBotSession: chat.session_id
            ? {
                id: chat.session_id,
                status: chat.session_status,
                startChat: toIso(chat.start_chat),
                endChat: toIso(chat.end_chat),
                lastReplyTime: toIso(chat.last_reply_time),
              }
            : undefined,
        },
        messages: ingestMessages,
      };

      totalPrepared += ingestMessages.length;

      if (exportJsonlPath) {
        appendJsonlPayload(exportJsonlPath, payload);
      }

      if (dryRun) {
        console.log(
          `[${index + 1}/${chats.length}] dry-run chat ${chat.chat_id}: ${ingestMessages.length} messages`,
        );
        continue;
      }

      const result = await postIngest(payload);
      totalMessages += result.received;
      totalInserted += result.insertedMessages;
      totalChunks += result.chunksCreated;

      console.log(
        `[${index + 1}/${chats.length}] ingested chat ${chat.chat_id}: messages=${result.received}, inserted=${result.insertedMessages}, chunks=${result.chunksCreated}`,
      );

      if (delayMs > 0) {
        await delay(delayMs);
      }
    }

    console.log(
      `Done. prepared=${totalPrepared}, received=${totalMessages}, inserted=${totalInserted}, chunks=${totalChunks}`,
    );
  } finally {
    await pool.end();
  }
}

async function loadChats(pool: Pool): Promise<CrmChatRow[]> {
  const params: Array<string | number> = [];
  const filters = [
    'c.customer_phone IS NOT NULL',
    "EXISTS (SELECT 1 FROM messages m WHERE m.chat_id = c.id AND m.text IS NOT NULL AND btrim(m.text) <> '')",
  ];

  if (since) {
    params.push(since);
    filters.push(`c.updated_at >= $${params.length}`);
  }

  if (customerPhone) {
    params.push(customerPhone);
    filters.push(`c.customer_phone = $${params.length}`);
  }

  params.push(limitChats);

  const result = await pool.query<CrmChatRow>(
    `
      SELECT
        c.id::text AS chat_id,
        c.customer_phone,
        c.channel_id::text AS channel_id,
        ch.name AS channel_name,
        ch.department_id::text AS channel_department_id,
        c.name,
        c.from_user,
        c.status::text AS chat_status,
        s.id::text AS session_id,
        s.status::text AS session_status,
        s.start_chat,
        s.end_chat,
        s.last_reply_time
      FROM chats c
      LEFT JOIN LATERAL (
        SELECT id, status, start_chat, end_chat, last_reply_time
        FROM chat_bot_session
        WHERE chat_id = c.id
        ORDER BY created_at DESC
        LIMIT 1
      ) s ON true
      LEFT JOIN channels ch ON ch.id = c.channel_id
      WHERE ${filters.join(' AND ')}
      ORDER BY c.updated_at DESC
      LIMIT $${params.length}
    `,
    params,
  );

  return result.rows;
}

async function loadMessages(
  pool: Pool,
  chatId: string,
): Promise<CrmMessageRow[]> {
  const params: unknown[] = [chatId];
  const filters = [
    'm.chat_id = $1',
    'm.text IS NOT NULL',
    "btrim(m.text) <> ''",
  ];

  if (allowedMessageTypes.length > 0) {
    params.push(allowedMessageTypes.map((type) => type.toUpperCase()));
    filters.push(`upper(m.type::text) = ANY($${params.length}::text[])`);
  }

  if (!includeBotMessages) {
    filters.push('COALESCE(m.from_bot, false) = false');
  }

  if (excludeSystemMessages) {
    filters.push(
      "m.text !~* '(ASSIGN|TAKEOVER|ditangani oleh chatbot|masih dalam session chatbot)'",
    );
  }

  const result = await pool.query<CrmMessageRow>(
    `
      SELECT
        m.id::text,
        m.wamid,
        m.type::text,
        m.text,
        m.from_me,
        COALESCE(m.from_bot, false) AS from_bot,
        m.timestamp,
        m.created_at,
        m.ticket_id::text,
        t.status::text AS ticket_status,
        t.rating::text AS ticket_rating,
        t.department_id::text,
        t.campaign_id::text
      FROM messages m
      LEFT JOIN tickets t ON t.id = m.ticket_id
      WHERE ${filters.join(' AND ')}
      ORDER BY
        COALESCE(m.timestamp, extract(epoch from m.created_at)::bigint) ASC,
        m.created_at ASC
    `,
    params,
  );

  return result.rows;
}

async function postIngest(
  payload: IngestMessagesRequest,
): Promise<IngestResult> {
  const response = await fetch(
    `${aiServiceBaseUrl.replace(/\/$/, '')}/v1/ingest/messages`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ai-service-key': requiredValue(aiServiceKey, 'AI_SERVICE_KEY'),
      },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`AI ingest failed: HTTP ${response.status} ${body}`);
  }

  return (await response.json()) as IngestResult;
}

function loadDotEnv(): void {
  const envPath = join(process.cwd(), '.env');

  if (!existsSync(envPath)) {
    return;
  }

  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);

    if (!match || process.env[match[1]] !== undefined) {
      continue;
    }

    process.env[match[1]] = stripQuotes(match[2].trim());
  }
}

function optionalEnv(key: string): string | undefined {
  const value = process.env[key]?.trim();

  return value ? value : undefined;
}

function requiredEnv(key: string): string {
  const value = optionalEnv(key);

  if (!value) {
    throw new Error(`${key} is required`);
  }

  return value;
}

function getEnv(key: string, fallback: string): string {
  return optionalEnv(key) ?? fallback;
}

function getNumberEnv(key: string, fallback: number): number {
  const value = optionalEnv(key);

  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  if (Number.isNaN(parsed)) {
    throw new Error(`${key} must be a number`);
  }

  return parsed;
}

function getListEnv(key: string, fallback: string[]): string[] {
  const value = optionalEnv(key);

  if (!value) {
    return fallback;
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function getBooleanEnv(key: string, fallback: boolean): boolean {
  const value = optionalEnv(key);

  if (!value) {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function requiredValue<T>(value: T | undefined, key: string): T {
  if (value === undefined || value === null || value === '') {
    throw new Error(`${key} is required`);
  }

  return value;
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function toIso(value?: Date | string | null): string | undefined {
  return value ? new Date(value).toISOString() : undefined;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function appendJsonlPayload(
  outputPath: string,
  payload: IngestMessagesRequest,
): void {
  const absolutePath = resolve(outputPath);

  mkdirSync(dirname(absolutePath), { recursive: true });
  appendFileSync(absolutePath, `${JSON.stringify(payload)}\n`, 'utf8');
}

function printHelp(): void {
  console.log(`
Usage:
  yarn ingest:crm

Required env:
  CRM_DATABASE_URL     Source CRM Postgres connection string
  AI_SERVICE_KEY       Secret used by /v1/ingest/messages, not needed for dry-run

Optional env:
  AI_SERVICE_BASE_URL          default http://localhost:3002
  CRM_INGEST_TENANT_ID         default astronacci
  CRM_INGEST_CHANNEL           default whatsapp
  CRM_INGEST_LIMIT_CHATS       default 50
  CRM_INGEST_SINCE             optional ISO date, filters chats by updated_at
  CRM_INGEST_CUSTOMER_PHONE    optional exact customer_phone filter
  CRM_INGEST_MESSAGE_TYPES     comma-separated types, default TEXT
  CRM_INGEST_INCLUDE_BOT       true/false, default false
  CRM_INGEST_EXCLUDE_SYSTEM    true/false, default true
  CRM_INGEST_DRY_RUN           true/false, default false
  CRM_INGEST_DELAY_MS          delay between chats to reduce HF rate pressure
  CRM_EXPORT_JSONL_PATH        optional path to append ingest payload JSONL
`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
