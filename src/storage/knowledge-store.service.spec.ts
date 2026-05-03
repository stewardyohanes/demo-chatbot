import { KnowledgeStore } from './knowledge-store.service';

describe('KnowledgeStore', () => {
  it('uses the embedding parameter for score and ordering when channel filter is present', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const store = new KnowledgeStore({ query } as never);

    await store.searchKnowledge({
      tenantId: 'astronacci',
      channel: 'whatsapp',
      embedding: [0.1, 0.2, 0.3],
      limit: 5,
    });

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];

    expect(sql).toContain('1 - (ke.embedding <=> $2::vector) AS score');
    expect(sql).toContain('ORDER BY ke.embedding <=> $2::vector');
    expect(sql).toContain('c.channel = $4');
    expect(params).toEqual(['astronacci', '[0.1,0.2,0.3]', 5, 'whatsapp']);
  });
});
