import type { IngestMessageItem } from '../ingestion/ingestion.dto';

export interface CrmMessageRow {
  id: string;
  wamid?: string | null;
  type?: string | null;
  text?: string | null;
  from_me?: boolean | null;
  from_bot?: boolean | null;
  timestamp?: string | number | null;
  created_at?: Date | string | null;
  ticket_id?: string | null;
  ticket_status?: string | null;
  ticket_rating?: string | number | null;
  department_id?: string | null;
  campaign_id?: string | null;
}

export interface CrmHistoryMapperOptions {
  includeBotMessages?: boolean;
  allowedMessageTypes?: string[];
  excludeSystemMessages?: boolean;
}

const DEFAULT_ALLOWED_MESSAGE_TYPES = ['TEXT'];

export function mapCrmMessageToIngestItem(
  row: CrmMessageRow,
  options: CrmHistoryMapperOptions = {},
): IngestMessageItem | undefined {
  const text = row.text?.replace(/\s+/g, ' ').trim();
  const allowedMessageTypes =
    options.allowedMessageTypes ?? DEFAULT_ALLOWED_MESSAGE_TYPES;
  const excludeSystemMessages = options.excludeSystemMessages ?? true;

  if (!text) {
    return undefined;
  }

  if (!options.includeBotMessages && row.from_bot) {
    return undefined;
  }

  if (!isAllowedMessageType(row.type, allowedMessageTypes)) {
    return undefined;
  }

  if (excludeSystemMessages && isSystemLogText(text)) {
    return undefined;
  }

  return {
    externalMessageId: row.wamid || row.id,
    senderRole: row.from_bot ? 'bot' : row.from_me ? 'agent' : 'customer',
    text,
    timestamp: normalizeCrmTimestamp(row.timestamp, row.created_at),
    metadata: {
      crmMessageId: row.id,
      wamid: row.wamid,
      messageType: row.type,
      fromMe: Boolean(row.from_me),
      fromBot: Boolean(row.from_bot),
      crmTicketId: row.ticket_id,
      crmTicketStatus: row.ticket_status,
      crmTicketRating:
        row.ticket_rating === undefined || row.ticket_rating === null
          ? undefined
          : String(row.ticket_rating),
      crmDepartmentId: row.department_id,
      crmCampaignId: row.campaign_id,
    },
  };
}

export function isAllowedMessageType(
  messageType: string | null | undefined,
  allowedMessageTypes: string[],
): boolean {
  if (allowedMessageTypes.length === 0) {
    return true;
  }

  if (!messageType) {
    return false;
  }

  return allowedMessageTypes
    .map((type) => type.trim().toUpperCase())
    .includes(messageType.trim().toUpperCase());
}

export function isSystemLogText(text: string): boolean {
  return [
    /\bASSIGN\b/i,
    /\bTAKEOVER\b/i,
    /ditangani oleh chatbot/i,
    /masih dalam session chatbot/i,
  ].some((pattern) => pattern.test(text));
}

export function normalizeCrmTimestamp(
  timestamp?: string | number | null,
  createdAt?: Date | string | null,
): string | undefined {
  if (timestamp !== undefined && timestamp !== null && timestamp !== '') {
    const numeric = Number(timestamp);

    if (!Number.isNaN(numeric) && numeric > 0) {
      const milliseconds = numeric > 10_000_000_000 ? numeric : numeric * 1000;

      return new Date(milliseconds).toISOString();
    }
  }

  if (createdAt) {
    return new Date(createdAt).toISOString();
  }

  return undefined;
}
