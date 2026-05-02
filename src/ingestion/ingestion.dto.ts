export type SenderRole = 'customer' | 'agent' | 'bot' | 'system';

export interface IngestMessageItem {
  externalMessageId: string;
  senderRole: SenderRole;
  text?: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

export interface IngestMessagesRequest {
  tenantId: string;
  channel: string;
  customerId: string;
  crmChatId?: string;
  metadata?: Record<string, unknown>;
  messages: IngestMessageItem[];
}

export interface IngestMessagesResponse {
  conversationId: string;
  received: number;
  insertedMessages: number;
  skippedMessages: number;
  chunksCreated: number;
}
