import { PromptBuilderService } from './prompt-builder.service';

describe('PromptBuilderService', () => {
  it('builds an Indonesian guarded prompt from retrieved CRM context', () => {
    const service = new PromptBuilderService();

    const prompt = service.build({
      message: 'Apakah program ini pasti profit?',
      contexts: [
        {
          chunkId: 'chunk-1',
          text: 'Customer bertanya kelas Astronacci. Sales menjelaskan ada kelas edukasi trading dan konsultasi dengan tim sales.',
          sourceMessageIds: ['wamid-1', 'wamid-2'],
          score: 0.86,
        },
      ],
    });

    expect(prompt.messages[0].role).toBe('system');
    expect(prompt.messages[0].content).toContain('Bahasa Indonesia');
    expect(prompt.messages[0].content).toContain('jangan menjanjikan profit');
    expect(prompt.messages[1].content).toContain('[Source: wamid-1, wamid-2]');
    expect(prompt.messages[1].content).toContain(
      'Apakah program ini pasti profit?',
    );
  });

  it('creates a no-context prompt that forces clarification instead of guessing', () => {
    const service = new PromptBuilderService();

    const prompt = service.build({
      message: 'Berapa harga paket terbaru?',
      contexts: [],
    });

    expect(prompt.messages[1].content).toContain(
      'Tidak ada konteks CRM yang relevan',
    );
    expect(prompt.defaultHandoffRecommended).toBe(true);
  });
});
