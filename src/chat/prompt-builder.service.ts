import { Injectable } from '@nestjs/common';

import type { ChatPromptMessage } from '../shared/hugging-face.service';

export interface RetrievedContext {
  chunkId: string;
  text: string;
  sourceMessageIds: string[];
  score: number;
}

export interface BuildPromptInput {
  message: string;
  contexts: RetrievedContext[];
}

export interface BuiltPrompt {
  messages: ChatPromptMessage[];
  defaultHandoffRecommended: boolean;
}

@Injectable()
export class PromptBuilderService {
  build(input: BuildPromptInput): BuiltPrompt {
    const system = [
      'Kamu adalah AI customer support untuk CRM Astronacci.',
      'Jawab dengan Bahasa Indonesia yang natural, singkat, ramah, dan terasa seperti CS manusia.',
      'Gunakan hanya konteks CRM yang diberikan. Jika konteks tidak cukup, minta klarifikasi atau arahkan ke human sales/CS.',
      'Jangan mengarang harga, promo, jadwal, benefit, atau kebijakan yang tidak ada di konteks.',
      'Untuk topik trading/financial market, jangan menjanjikan profit, jangan memberi instruksi buy/sell personal, dan jangan membuat klaim keuntungan pasti.',
      'Jangan menyebut id source ke customer kecuali diminta internal.',
    ].join('\n');

    const contextText =
      input.contexts.length > 0
        ? input.contexts
            .map(
              (context, index) =>
                `Konteks ${index + 1} [Source: ${context.sourceMessageIds.join(', ')}]\n${context.text}`,
            )
            .join('\n\n')
        : 'Tidak ada konteks CRM yang relevan. Jangan menebak jawaban.';

    return {
      messages: [
        {
          role: 'system',
          content: system,
        },
        {
          role: 'user',
          content: [
            'Konteks CRM:',
            contextText,
            '',
            'Pertanyaan customer:',
            input.message,
            '',
            'Tulis jawaban final untuk customer.',
          ].join('\n'),
        },
      ],
      defaultHandoffRecommended: input.contexts.length === 0,
    };
  }
}
