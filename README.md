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

## CRM Integration Later

Keep this service standalone until answer quality is acceptable. The CRM backend can later call it behind a per-channel feature flag: `RULE`, `AI_DRAFT`, or `AI`, after the existing `wamid` dedupe and before the legacy rule chatbot path.
