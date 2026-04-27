import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { AppUser, UserRole } from "../types.js";

const DEFAULT_JWT_SECRET = "change-me-in-production";

export interface AuthTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  businessIds: string[];
  iat: number;
  exp: number;
}

const toBase64Url = (value: string | Buffer) => Buffer.from(value).toString("base64url");

const fromBase64Url = (value: string) => Buffer.from(value, "base64url").toString("utf8");

const getJwtSecret = () => process.env.JWT_SECRET || DEFAULT_JWT_SECRET;

export const hashPasswordSync = (password: string) => {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
};

export const verifyPassword = (password: string, storedHash: string) => {
  const [algorithm, salt, hash] = storedHash.split("$");
  if (algorithm !== "scrypt" || !salt || !hash) {
    return false;
  }

  const derived = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");

  if (expected.length !== derived.length) {
    return false;
  }

  return timingSafeEqual(expected, derived);
};

export const signToken = (
  user: Pick<AppUser, "id" | "email" | "role" | "businessIds">,
  expiresInSeconds = 60 * 60 * 24 * 7
) => {
  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: "HS256",
    typ: "JWT"
  };
  const payload: AuthTokenPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    businessIds: user.businessIds,
    iat: now,
    exp: now + expiresInSeconds
  };

  const unsigned = `${toBase64Url(JSON.stringify(header))}.${toBase64Url(JSON.stringify(payload))}`;
  const signature = createHmac("sha256", getJwtSecret()).update(unsigned).digest("base64url");
  return `${unsigned}.${signature}`;
};

export const verifyToken = (token: string) => {
  const [headerEncoded, payloadEncoded, signature] = token.split(".");
  if (!headerEncoded || !payloadEncoded || !signature) {
    throw new Error("Malformed token");
  }

  const unsigned = `${headerEncoded}.${payloadEncoded}`;
  const expectedSignature = createHmac("sha256", getJwtSecret()).update(unsigned).digest();
  const receivedSignature = Buffer.from(signature, "base64url");

  if (expectedSignature.length !== receivedSignature.length || !timingSafeEqual(expectedSignature, receivedSignature)) {
    throw new Error("Invalid token signature");
  }

  const payload = JSON.parse(fromBase64Url(payloadEncoded)) as AuthTokenPayload;
  if (payload.exp * 1000 <= Date.now()) {
    throw new Error("Token expired");
  }

  return payload;
};
