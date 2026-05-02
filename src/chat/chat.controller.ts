import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';

import { AiServiceKeyGuard } from '../shared/ai-auth.guard';
import type { ChatRespondRequest } from './chat.dto';
import { ChatService } from './chat.service';

@Controller('v1/chat')
@UseGuards(AiServiceKeyGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('respond')
  respond(@Body() body: ChatRespondRequest) {
    if (!body.tenantId || !body.channel || !body.customerId || !body.message) {
      throw new BadRequestException(
        'tenantId, channel, customerId, and message are required',
      );
    }

    return this.chatService.respond(body);
  }
}
