import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import { AppConfigService } from './app-config.service';

@Injectable()
export class AiServiceKeyGuard implements CanActivate {
  constructor(private readonly config: AppConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const serviceKey = this.config.value.serviceKey;

    if (!this.config.requiresServiceKey) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const header = request.header('x-ai-service-key');

    if (serviceKey && header === serviceKey) {
      return true;
    }

    throw new UnauthorizedException('Invalid AI service key');
  }
}
