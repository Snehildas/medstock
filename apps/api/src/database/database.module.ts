import { Injectable, Module, type OnModuleDestroy } from "@nestjs/common";
import { createPrismaClient, PrismaClient, readDatabasePoolMax } from "@medstock/database";

@Injectable()
class PrismaLifecycle implements OnModuleDestroy {
  constructor(private readonly prisma: PrismaClient) {}

  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

@Module({
  providers: [
    {
      provide: PrismaClient,
      useFactory: (): PrismaClient => {
        const databaseUrl = process.env.DATABASE_URL;
        if (!databaseUrl) {
          throw new Error("DATABASE_URL is required.");
        }
        return createPrismaClient(databaseUrl, readDatabasePoolMax(process.env.DATABASE_POOL_MAX));
      },
    },
    PrismaLifecycle,
  ],
  exports: [PrismaClient],
})
export class DatabaseModule {}
