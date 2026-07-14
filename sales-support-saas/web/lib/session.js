import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

const COOKIE = "sos_session";

function secret() {
  const s = process.env.SESSION_SECRET || "dev-insecure-secret-change-me";
  return new TextEncoder().encode(s);
}

export async function createSession(payload) {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
  cookies().set(COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function getSession() {
  const c = cookies().get(COOKIE);
  if (!c) return null;
  try {
    const { payload } = await jwtVerify(c.value, secret());
    return payload; // { uid, name, email, tenantId, tenantName, role }
  } catch {
    return null;
  }
}

export function clearSession() {
  cookies().delete(COOKIE);
}
