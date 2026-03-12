import { pbkdf2, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const PBKDF2_ITERATIONS = 100000;
const KEY_LEN = 64;
const SALT_LEN = 16;
const pbkdf2Async = promisify(pbkdf2);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN).toString("hex");
  const hash = await pbkdf2Async(
    password,
    salt,
    PBKDF2_ITERATIONS,
    KEY_LEN,
    "sha256"
  );

  return `${salt}.${hash.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const [salt, hash] = stored.split(".");

  if (!salt || !hash) return false;

  const computed = await pbkdf2Async(
    password,
    salt,
    PBKDF2_ITERATIONS,
    KEY_LEN,
    "sha256"
  );

  const storedBuffer = Buffer.from(hash, "hex");
  const computedBuffer = Buffer.from(computed);

  if (storedBuffer.length !== computedBuffer.length) return false;

  return timingSafeEqual(storedBuffer, computedBuffer);
}
