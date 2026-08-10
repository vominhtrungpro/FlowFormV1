import { Controller, Get } from '@nestjs/common';
import { Public } from './common/public.decorator';

@Controller('api/health')
export class HealthController {
  @Public()
  @Get()
  check() {
    return { status: 'ok', time: new Date().toISOString() };
  }
}
