import { IngestionService } from './ingestion.service';
import type { AiConfig } from '../shared/app-config.service';
import type { EmbeddingProvider } from '../shared/hugging-face.service';
import type { KnowledgeStore } from '../storage/knowledge-store.service';

describe('IngestionService', () => {
  const config = {
    chunkSizeMessages: 3,
    embeddingModel: 'thenlper/gte-large',
  } as AiConfig;

  it('ingests only new text messages and stores a chunk with source message ids', async () => {
    const createKnowledgeChunk = jest.fn().mockResolvedValue('chunk-1');
    const storeEmbedding = jest.fn().mockResolvedValue(undefined);
    const embed = jest.fn().mockResolvedValue([0.1, 0.2, 0.3]);
    const store = {
      upsertConversation: jest.fn().mockResolvedValue('conversation-1'),
      upsertMessage: jest
        .fn()
        .mockResolvedValueOnce({ id: 'message-1', inserted: true })
        .mockResolvedValueOnce({ id: 'message-2', inserted: true })
        .mockResolvedValueOnce({ id: 'message-duplicate', inserted: false }),
      createKnowledgeChunk,
      storeEmbedding,
    } as unknown as KnowledgeStore;
    const embeddingProvider = {
      embed,
    } as unknown as EmbeddingProvider;
    const service = new IngestionService(store, embeddingProvider, config);

    const result = await service.ingestMessages({
      tenantId: 'astronacci',
      channel: 'whatsapp',
      customerId: '628111',
      crmChatId: 'crm-chat-1',
      messages: [
        {
          externalMessageId: 'wamid-1',
          senderRole: 'customer',
          text: 'Halo, saya mau tanya kelas.',
          timestamp: '2026-05-01T10:00:00.000Z',
        },
        {
          externalMessageId: 'wamid-2',
          senderRole: 'agent',
          text: 'Baik, tim kami bantu jelaskan program edukasinya.',
          timestamp: '2026-05-01T10:01:00.000Z',
        },
        {
          externalMessageId: 'wamid-3',
          senderRole: 'customer',
          text: '   ',
          timestamp: '2026-05-01T10:02:00.000Z',
        },
        {
          externalMessageId: 'wamid-1',
          senderRole: 'customer',
          text: 'Halo, saya mau tanya kelas.',
          timestamp: '2026-05-01T10:00:00.000Z',
        },
      ],
    });

    expect(result).toEqual({
      conversationId: 'conversation-1',
      received: 4,
      insertedMessages: 2,
      skippedMessages: 2,
      chunksCreated: 1,
    });
    expect(createKnowledgeChunk).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conversation-1',
        sourceMessageIds: ['wamid-1', 'wamid-2'],
      }),
    );
    expect(embed).toHaveBeenCalledWith(
      expect.stringContaining('customer: Halo, saya mau tanya kelas.'),
    );
    expect(storeEmbedding).toHaveBeenCalledWith(
      'chunk-1',
      [0.1, 0.2, 0.3],
      'thenlper/gte-large',
    );
  });
});
