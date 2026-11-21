import { PrismaClient } from '@prisma/client';

/**
 * Cliente da aplicação: conecta com o papel "cafe_app" (sem BYPASSRLS).
 * Use sempre por meio de comTransacao(); fora dela nenhuma linha de negócio é visível.
 */
const global = globalThis as unknown as { prismaApp?: PrismaClient };

export const prisma = global.prismaApp ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') global.prismaApp = prisma;
