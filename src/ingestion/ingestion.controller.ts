import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';

import { AiServiceKeyGuard } from '../shared/ai-auth.guard';
import type { IngestMessagesRequest } from './ingestion.dto';
import { IngestionService } from './ingestion.service';

@Controller('v1/ingest')
@UseGuards(AiServiceKeyGuard)
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  @Post('messages')
  ingestMessages(@Body() body: IngestMessagesRequest) {
    if (!body.tenantId || !body.channel || !body.customerId) {
      throw new BadRequestException(
        'tenantId, channel, and customerId are required',
      );
    }

    if (!Array.isArray(body.messages)) {
      throw new BadRequestException('messages must be an array');
    }

    return this.ingestionService.ingestMessages(body);
  }
}
