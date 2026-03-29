import crypto from "node:crypto";
import { config } from "./config.js";

const sessions = new Map();

function cleanupExpiredSessions() {
  const now = Date.now();

  for (const [sessionId, session] of sessions.entries()) {
    if (session.expiresAt <= now) {
      sessions.delete(sessionId);
    }
  }
}

function signValue(value) {
  return crypto
    .createHmac("sha256", config.sessionSecret)
    .update(value)
    .digest("base64url");
}

export function makeSignedValue(value) {
  return `${value}.${signValue(value)}`;
}

export function verifySignedValue(signedValue) {
  if (!signedValue || typeof signedValue !== "string") {
    return null;
  }

  const lastDotIndex = signedValue.lastIndexOf(".");

  if (lastDotIndex === -1) {
    return null;
  }

  const value = signedValue.slice(0, lastDotIndex);
  const signature = signedValue.slice(lastDotIndex + 1);
  const expectedSignature = signValue(value);

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (signatureBuffer.length !== expectedBuffer.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  return value;
}

export function createSession(data) {
  cleanupExpiredSessions();

  const sessionId = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + config.sessionTtlMs;

  sessions.set(sessionId, {
    ...data,
    createdAt: Date.now(),
    expiresAt
  });

  return {
    expiresAt,
    signedSessionId: makeSignedValue(sessionId)
  };
}

export function getSession(signedSessionId) {
  cleanupExpiredSessions();

  const sessionId = verifySignedValue(signedSessionId);

  if (!sessionId) {
    return null;
  }

  const session = sessions.get(sessionId);

  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(sessionId);
    return null;
  }

  return {
    ...session,
    sessionId
  };
}

export function deleteSession(signedSessionId) {
  const sessionId = verifySignedValue(signedSessionId);

  if (sessionId) {
    sessions.delete(sessionId);
  }
}
