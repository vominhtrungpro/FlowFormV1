import { Controller, Get } from '@nestjs/common';
import { MasterDataService } from './master-data.service';

@Controller('api/master')
export class MasterDataController {
  constructor(private masterData: MasterDataService) {}

  @Get('plants')
  plants() {
    return this.masterData.plants();
  }
}
