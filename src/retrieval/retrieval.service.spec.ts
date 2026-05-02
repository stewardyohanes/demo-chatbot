import { RetrievalService } from './retrieval.service';
import type { AiConfig } from '../shared/app-config.service';
import type { EmbeddingProvider } from '../shared/hugging-face.service';
import type { KnowledgeStore } from '../storage/knowledge-store.service';

describe('RetrievalService', () => {
  it('falls back to tenant-wide knowledge when channel-scoped search has no context', async () => {
    const tenantWideContext = [
      {
        chunkId: 'chunk-1',
        text: 'agent: Program edukasi trading tersedia untuk pemula.',
        sourceMessageIds: ['wamid-1'],
        score: 0.82,
      },
    ];
    const searchKnowledge = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(tenantWideContext);
    const store = {
      searchKnowledge,
    } as unknown as KnowledgeStore;
    const embeddingProvider = {
      embed: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    } as unknown as EmbeddingProvider;
    const service = new RetrievalService(store, embeddingProvider, {
      retrievalTopK: 5,
    } as AiConfig);

    const result = await service.retrieve({
      tenantId: 'astronacci',
      channel: 'whatsapp',
      customerId: 'new-customer',
      message: 'Ada kelas untuk pemula?',
    });

    expect(result).toEqual(tenantWideContext);
    expect(searchKnowledge).toHaveBeenNthCalledWith(1, {
      tenantId: 'astronacci',
      channel: 'whatsapp',
      embedding: [0.1, 0.2, 0.3],
      limit: 5,
    });
    expect(searchKnowledge).toHaveBeenNthCalledWith(2, {
      tenantId: 'astronacci',
      embedding: [0.1, 0.2, 0.3],
      limit: 5,
    });
  });
});
