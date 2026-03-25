import { PrismaClient, UserRole } from "@prisma/client";
import { z } from "zod";

import { hashPassword } from "../src/auth/password.js";

const SeedAdminEnvSchema = z.object({
  SEED_ADMIN_EMAIL: z.string().email(),
  SEED_ADMIN_PASSWORD: z.string().min(8),
});

const prisma = new PrismaClient();

const main = async () => {
  const parsedEnv = SeedAdminEnvSchema.safeParse(process.env);

  if (!parsedEnv.success) {
    throw new Error(
      "SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set for pnpm db:seed",
    );
  }

  const { SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD } = parsedEnv.data;
  const existingUser = await prisma.user.findUnique({
    where: {
      email: SEED_ADMIN_EMAIL,
    },
  });

  if (existingUser) {
    console.info(`Seed admin already exists for ${SEED_ADMIN_EMAIL}`);
    return;
  }

  const passwordHash = await hashPassword(SEED_ADMIN_PASSWORD);

  await prisma.user.create({
    data: {
      email: SEED_ADMIN_EMAIL,
      passwordHash,
      role: UserRole.ADMIN,
    },
  });

  console.info(`Seed admin created for ${SEED_ADMIN_EMAIL}`);
};

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
