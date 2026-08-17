import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './common/prisma.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { HealthController } from './health.controller';
import { NotificationsModule } from './notifications/notifications.module';
import { WorkflowEngineModule } from './workflow-engine/workflow-engine.module';
import { RequestsModule } from './requests/requests.module';
import { SlaModule } from './sla/sla.module';
import { UsersModule } from './users/users.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { FormsModule } from './forms/forms.module';
import { LimsLookupModule } from './lims-lookup/lims-lookup.module';
import { MasterDataModule } from './master-data/master-data.module';
import { TasksModule } from './tasks/tasks.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    CommonModule,
    AuthModule,
    NotificationsModule,
    WorkflowEngineModule,
    RequestsModule,
    SlaModule,
    UsersModule,
    WorkflowsModule,
    FormsModule,
    LimsLookupModule,
    MasterDataModule,
    TasksModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
