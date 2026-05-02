export interface ChatRespondRequest {
  tenantId: string;
  channel: string;
  customerId: string;
  sessionId?: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface ChatRespondResponse {
  responseLogId?: string;
  answer: string;
  confidence: number;
  handoffRecommended: boolean;
  sourceMessageIds: string[];
  safetyFlags: string[];
  model: string;
}
