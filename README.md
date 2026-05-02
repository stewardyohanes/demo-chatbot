# CRM AI Chatbot Service

Standalone NestJS service for an AI chatbot layer over CRM chat history. V1 uses RAG: import historical messages, create embeddings with Hugging Face, retrieve relevant context, then generate a grounded Indonesian response.

## Local Setup

```bash
yarn install
cp .env.example .env
docker compose up -d
yarn start:dev
```

Open `http://localhost:3002/health` or `http://localhost:3002/playground`.

## Environment

- `AI_SERVICE_KEY`: required for protected `/v1/*` endpoints in production. Send as `X-AI-SERVICE-KEY`.
- `DATABASE_URL`: PostgreSQL connection string. Local compose runs pgvector on port `5433`.
- `HF_TOKEN`: Hugging Face token with Inference Providers access.
- `HF_CHAT_MODEL`: default `Qwen/Qwen2.5-7B-Instruct-1M:preferred`.
- `HF_EMBEDDING_MODEL`: default `thenlper/gte-large`.

## API

### `GET /health`

Returns service, database, and Hugging Face configuration status.

### `POST /v1/ingest/messages`

Imports CRM chat history. Duplicate `externalMessageId` values are ignored per conversation.

```json
{
  "tenantId": "astronacci",
  "channel": "whatsapp",
  "customerId": "628xxxx",
  "crmChatId": "crm-chat-id",
  "messages": [
    {
      "externalMessageId": "wamid-1",
      "senderRole": "customer",
      "text": "Halo, saya mau tanya kelas.",
      "timestamp": "2026-05-01T10:00:00.000Z"
    }
  ]
}
```

### `POST /v1/chat/respond`

Generates a grounded response from retrieved CRM context.

```json
{
  "tenantId": "astronacci",
  "channel": "whatsapp",
  "customerId": "628xxxx",
  "message": "Saya mau tanya kelasnya apa saja?"
}
```

### `POST /v1/feedback`

Records answer quality feedback.

```json
{
  "responseLogId": "uuid",
  "rating": "accepted",
  "reviewerNotes": "Jawaban sudah sesuai"
}
```

## Import From Existing CRM Database

Run the AI database and service first:

```bash
docker compose up -d postgres
yarn start:dev
```

In another terminal, configure the old CRM database source in `.env`:

```env
CRM_DATABASE_URL=postgres://postgres:password@localhost:5432/crm_astronacci
AI_SERVICE_BASE_URL=http://localhost:3002
AI_SERVICE_KEY=change-me
CRM_INGEST_LIMIT_CHATS=50
CRM_INGEST_MESSAGE_TYPES=TEXT
CRM_INGEST_INCLUDE_BOT=false
CRM_INGEST_EXCLUDE_SYSTEM=true
```

Start with a dry run:

```bash
CRM_INGEST_DRY_RUN=true yarn ingest:crm
```

Optionally export the exact ingest payloads to JSONL before posting them:

```bash
CRM_INGEST_DRY_RUN=true CRM_EXPORT_JSONL_PATH=exports/crm-history-sample.jsonl yarn ingest:crm
```

Then ingest a small batch:

```bash
CRM_INGEST_DRY_RUN=false CRM_INGEST_LIMIT_CHATS=20 yarn ingest:crm
```

The importer maps:

- `chats.customer_phone` -> `customerId`
- `CRM_INGEST_CHANNEL` -> `channel`
- `chats.id` -> `crmChatId`
- `messages.wamid || messages.id` -> `externalMessageId`
- `messages.from_me=true` -> `senderRole=agent`
- otherwise -> `senderRole=customer`
- `tickets.status/rating/department_id/campaign_id` -> message metadata

By default the importer keeps the first dataset clean:

- includes only `messages.type=TEXT`
- excludes `messages.from_bot=true`, so old vendor bot templates do not become knowledge
- excludes obvious system log texts such as assign/takeover/chatbot-session logs

Useful filters:

```bash
CRM_INGEST_CUSTOMER_PHONE=628xxxx yarn ingest:crm
CRM_INGEST_SINCE=2026-05-01T00:00:00.000Z yarn ingest:crm
CRM_INGEST_LIMIT_CHATS=5 CRM_EXPORT_JSONL_PATH=exports/check.jsonl CRM_INGEST_DRY_RUN=true yarn ingest:crm
```

## CRM Integration Later

Keep this service standalone until answer quality is acceptable. The CRM backend can later call it behind a per-channel feature flag: `RULE`, `AI_DRAFT`, or `AI`, after the existing `wamid` dedupe and before the legacy rule chatbot path.
