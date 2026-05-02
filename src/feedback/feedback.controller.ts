import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';

import { AiServiceKeyGuard } from '../shared/ai-auth.guard';
import type { CreateFeedbackRequest } from './feedback.dto';
import { FeedbackService } from './feedback.service';

@Controller('v1/feedback')
@UseGuards(AiServiceKeyGuard)
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post()
  createFeedback(@Body() body: CreateFeedbackRequest) {
    const allowedRatings = ['accepted', 'rejected', 'corrected'];

    if (!body.responseLogId || !allowedRatings.includes(body.rating)) {
      throw new BadRequestException(
        'responseLogId and rating accepted|rejected|corrected are required',
      );
    }

    return this.feedbackService.createFeedback(body);
  }
}
