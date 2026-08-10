import { Global, Module } from '@nestjs/common';
import { ActorResolverService } from './actor-resolver.service';

@Global()
@Module({
  providers: [ActorResolverService],
  exports: [ActorResolverService],
})
export class CommonModule {}
