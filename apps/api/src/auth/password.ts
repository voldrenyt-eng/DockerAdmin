import {
  type ScryptOptions,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";

const SCRYPT_PREFIX = "scrypt";
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_PARAMS = {
  cost: 16384,
  blockSize: 8,
  parallelization: 1,
} as const;

const deriveKey = async (
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey);
    });
  });

export const hashPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(16);
  const derivedKey = await deriveKey(password, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_PARAMS.cost,
    p: SCRYPT_PARAMS.parallelization,
    r: SCRYPT_PARAMS.blockSize,
  });

  return [
    SCRYPT_PREFIX,
    String(SCRYPT_PARAMS.cost),
    String(SCRYPT_PARAMS.blockSize),
    String(SCRYPT_PARAMS.parallelization),
    salt.toString("hex"),
    derivedKey.toString("hex"),
  ].join("$");
};

export const verifyPassword = async (
  password: string,
  passwordHash: string,
): Promise<boolean> => {
  const parts = passwordHash.split("$");

  if (parts.length !== 6 || parts[0] !== SCRYPT_PREFIX) {
    return false;
  }

  const [_, costValue, blockSizeValue, parallelizationValue, saltHex, keyHex] =
    parts;

  if (
    !costValue ||
    !blockSizeValue ||
    !parallelizationValue ||
    !saltHex ||
    !keyHex
  ) {
    return false;
  }

  const cost = Number(costValue);
  const blockSize = Number(blockSizeValue);
  const parallelization = Number(parallelizationValue);

  if (
    !Number.isInteger(cost) ||
    !Number.isInteger(blockSize) ||
    !Number.isInteger(parallelization)
  ) {
    return false;
  }

  try {
    const salt = Buffer.from(saltHex, "hex");
    const expectedKey = Buffer.from(keyHex, "hex");

    if (expectedKey.length === 0 || salt.length === 0) {
      return false;
    }

    const derivedKey = await deriveKey(password, salt, expectedKey.length, {
      N: cost,
      p: parallelization,
      r: blockSize,
    });

    if (derivedKey.length !== expectedKey.length) {
      return false;
    }

    return timingSafeEqual(derivedKey, expectedKey);
  } catch {
    return false;
  }
};
