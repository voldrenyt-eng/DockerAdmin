import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

type AccessTokenClaims = {
  email: string;
  exp: number;
  iat: number;
  jti: string;
  role: "ADMIN";
  sub: string;
  typ: "access";
};

const ACCESS_TOKEN_HEADER = {
  alg: "HS256",
  typ: "JWT",
} as const;

const accessTokenClaimsSchema = z.object({
  email: z.string().email(),
  exp: z.number().int().positive(),
  iat: z.number().int().nonnegative(),
  jti: z.string().min(1),
  role: z.literal("ADMIN"),
  sub: z.string().min(1),
  typ: z.literal("access"),
});

const encodeBase64Url = (value: string): string => {
  return Buffer.from(value, "utf8").toString("base64url");
};

const decodeBase64Url = (value: string): string | null => {
  try {
    return Buffer.from(value, "base64url").toString("utf8");
  } catch {
    return null;
  }
};

const signValue = (value: string, secret: string): string => {
  return createHmac("sha256", secret).update(value).digest("base64url");
};

const compareSignatures = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
};

export const createAccessToken = (
  claims: Omit<AccessTokenClaims, "exp" | "iat" | "jti" | "typ">,
  secret: string,
  now: Date,
  ttlSeconds: number,
): string => {
  const payload: AccessTokenClaims = {
    ...claims,
    exp: Math.floor(now.getTime() / 1000) + ttlSeconds,
    iat: Math.floor(now.getTime() / 1000),
    jti: randomBytes(16).toString("hex"),
    typ: "access",
  };
  const encodedHeader = encodeBase64Url(JSON.stringify(ACCESS_TOKEN_HEADER));
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const value = `${encodedHeader}.${encodedPayload}`;
  const signature = signValue(value, secret);

  return `${value}.${signature}`;
};

export const verifyAccessToken = (
  token: string,
  secret: string,
  now: Date,
): AccessTokenClaims | null => {
  const parts = token.split(".");

  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, signature] = parts;

  if (!encodedHeader || !encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = signValue(
    `${encodedHeader}.${encodedPayload}`,
    secret,
  );

  if (!compareSignatures(expectedSignature, signature)) {
    return null;
  }

  const decodedHeader = decodeBase64Url(encodedHeader);
  const decodedPayload = decodeBase64Url(encodedPayload);

  if (!decodedHeader || !decodedPayload) {
    return null;
  }

  try {
    const header = JSON.parse(decodedHeader) as typeof ACCESS_TOKEN_HEADER;

    if (header.alg !== "HS256" || header.typ !== "JWT") {
      return null;
    }

    const parsedPayload = accessTokenClaimsSchema.safeParse(
      JSON.parse(decodedPayload),
    );

    if (!parsedPayload.success) {
      return null;
    }

    if (parsedPayload.data.exp <= Math.floor(now.getTime() / 1000)) {
      return null;
    }

    return parsedPayload.data;
  } catch {
    return null;
  }
};

export const createRefreshToken = (): string => {
  return randomBytes(32).toString("base64url");
};

export const hashRefreshToken = (
  refreshToken: string,
  secret: string,
): string => {
  return `rt1$${createHmac("sha256", secret)
    .update(refreshToken)
    .digest("hex")}`;
};
