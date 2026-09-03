import { PrismaPg } from "@prisma/adapter-pg";

import { env } from "../config/env";
import { PrismaClient } from "../generated/prisma/client";

const prismaAdapter = new PrismaPg(env.DATABASE_URL);

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: prismaAdapter,
  });

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
