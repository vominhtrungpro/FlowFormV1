import { Module } from '@nestjs/common';
import { LimsLookupController } from './lims-lookup.controller';

@Module({
  controllers: [LimsLookupController],
})
export class LimsLookupModule {}
