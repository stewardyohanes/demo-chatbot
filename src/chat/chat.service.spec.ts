import { ChatService } from './chat.service';
import type { PromptBuilderService } from './prompt-builder.service';
import type { AiConfig } from '../shared/app-config.service';
import type { ChatCompletionProvider } from '../shared/hugging-face.service';
import type { RetrievalService } from '../retrieval/retrieval.service';
import type { KnowledgeStore } from '../storage/knowledge-store.service';

describe('ChatService', () => {
  const config = {
    chatModel: 'Qwen/Qwen2.5-7B-Instruct-1M:preferred',
    minConfidence: 0.55,
  } as AiConfig;

  const promptBuilder = {
    build: jest.fn().mockReturnValue({
      messages: [
        { role: 'system', content: 'system prompt' },
        { role: 'user', content: 'user prompt' },
      ],
      defaultHandoffRecommended: false,
    }),
  } as unknown as PromptBuilderService;

  it('recommends human handoff without calling Hugging Face when no context is found', async () => {
    const complete = jest.fn();
    const retrieval = {
      retrieve: jest.fn().mockResolvedValue([]),
    } as unknown as RetrievalService;
    const provider = {
      complete,
    } as unknown as ChatCompletionProvider;
    const store = {
      upsertChatSession: jest.fn().mockResolvedValue('session-1'),
      createResponseLog: jest.fn().mockResolvedValue('response-1'),
    } as unknown as KnowledgeStore;
    const service = new ChatService(
      retrieval,
      provider,
      promptBuilder,
      store,
      config,
    );

    const response = await service.respond({
      tenantId: 'astronacci',
      channel: 'whatsapp',
      customerId: '628111',
      message: 'Harga paketnya berapa?',
    });

    expect(complete).not.toHaveBeenCalled();
    expect(response).toEqual(
      expect.objectContaining({
        confidence: 0,
        handoffRecommended: true,
        sourceMessageIds: [],
        model: config.chatModel,
      }),
    );
    expect(response.answer).toContain('belum menemukan konteks');
  });

  it('returns a safe fallback and stores a response log when Hugging Face fails', async () => {
    const createResponseLog = jest.fn().mockResolvedValue('response-1');
    const retrieval = {
      retrieve: jest.fn().mockResolvedValue([
        {
          chunkId: 'chunk-1',
          text: 'Sales menjelaskan program edukasi trading.',
          sourceMessageIds: ['wamid-1'],
          score: 0.8,
        },
      ]),
    } as unknown as RetrievalService;
    const provider = {
      complete: jest.fn().mockRejectedValue(new Error('HF timeout')),
    } as unknown as ChatCompletionProvider;
    const store = {
      upsertChatSession: jest.fn().mockResolvedValue('session-1'),
      createResponseLog,
    } as unknown as KnowledgeStore;
    const service = new ChatService(
      retrieval,
      provider,
      promptBuilder,
      store,
      config,
    );

    const response = await service.respond({
      tenantId: 'astronacci',
      channel: 'whatsapp',
      customerId: '628111',
      message: 'Programnya apa?',
    });

    expect(response.handoffRecommended).toBe(true);
    expect(response.safetyFlags).toContain('PROVIDER_ERROR');
    expect(createResponseLog).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        handoffRecommended: true,
        sourceMessageIds: ['wamid-1'],
      }),
    );
  });
});
