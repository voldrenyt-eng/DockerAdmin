import type { PrismaClient } from "@prisma/client";

export type AuthUserRecord = {
  email: string;
  id: string;
  passwordHash: string;
  role: "ADMIN";
};

export type StoredRefreshTokenRecord = {
  createdAt: Date;
  expiresAt: Date;
  id: string;
  revokedAt: Date | null;
  tokenHash: string;
  updatedAt: Date;
  userId: string;
};

export type AuthRepository = {
  createRefreshToken: (input: {
    expiresAt: Date;
    tokenHash: string;
    userId: string;
  }) => Promise<void>;
  findRefreshTokenByHash: (
    tokenHash: string,
  ) => Promise<StoredRefreshTokenRecord | null>;
  findUserByEmail: (email: string) => Promise<AuthUserRecord | null>;
  findUserById: (id: string) => Promise<AuthUserRecord | null>;
  revokeRefreshToken: (id: string, revokedAt: Date) => Promise<void>;
};

type AuthRepositorySeed = {
  refreshTokens?: StoredRefreshTokenRecord[];
  users?: AuthUserRecord[];
};

const cloneRefreshToken = (
  record: StoredRefreshTokenRecord,
): StoredRefreshTokenRecord => ({
  ...record,
  createdAt: new Date(record.createdAt),
  expiresAt: new Date(record.expiresAt),
  revokedAt: record.revokedAt ? new Date(record.revokedAt) : null,
  updatedAt: new Date(record.updatedAt),
});

const cloneUser = (record: AuthUserRecord): AuthUserRecord => ({
  ...record,
});

export const createAuthRepository = (
  seed: AuthRepositorySeed = {},
): AuthRepository => {
  const refreshTokens = (seed.refreshTokens ?? []).map(cloneRefreshToken);
  const users = (seed.users ?? []).map(cloneUser);

  return {
    async createRefreshToken(input) {
      const now = new Date();

      refreshTokens.push({
        createdAt: now,
        expiresAt: new Date(input.expiresAt),
        id: `rt_${refreshTokens.length + 1}`,
        revokedAt: null,
        tokenHash: input.tokenHash,
        updatedAt: now,
        userId: input.userId,
      });
    },
    async findRefreshTokenByHash(tokenHash) {
      const record = refreshTokens.find(
        (entry) => entry.tokenHash === tokenHash,
      );

      return record ? cloneRefreshToken(record) : null;
    },
    async findUserByEmail(email) {
      const record = users.find((entry) => entry.email === email);

      return record ? cloneUser(record) : null;
    },
    async findUserById(id) {
      const record = users.find((entry) => entry.id === id);

      return record ? cloneUser(record) : null;
    },
    async revokeRefreshToken(id, revokedAt) {
      const record = refreshTokens.find((entry) => entry.id === id);

      if (!record) {
        return;
      }

      record.revokedAt = new Date(revokedAt);
      record.updatedAt = new Date(revokedAt);
    },
  };
};

export const createPrismaAuthRepository = (
  prisma: PrismaClient,
): AuthRepository => ({
  async createRefreshToken(input) {
    await prisma.refreshToken.create({
      data: {
        expiresAt: input.expiresAt,
        tokenHash: input.tokenHash,
        userId: input.userId,
      },
    });
  },
  async findRefreshTokenByHash(tokenHash) {
    const record = await prisma.refreshToken.findUnique({
      where: {
        tokenHash,
      },
    });

    if (!record) {
      return null;
    }

    return {
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      id: record.id,
      revokedAt: record.revokedAt,
      tokenHash: record.tokenHash,
      updatedAt: record.updatedAt,
      userId: record.userId,
    };
  },
  async findUserByEmail(email) {
    const record = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (!record) {
      return null;
    }

    return {
      email: record.email,
      id: record.id,
      passwordHash: record.passwordHash,
      role: record.role,
    };
  },
  async findUserById(id) {
    const record = await prisma.user.findUnique({
      where: {
        id,
      },
    });

    if (!record) {
      return null;
    }

    return {
      email: record.email,
      id: record.id,
      passwordHash: record.passwordHash,
      role: record.role,
    };
  },
  async revokeRefreshToken(id, revokedAt) {
    await prisma.refreshToken.update({
      data: {
        revokedAt,
      },
      where: {
        id,
      },
    });
  },
});
