import type { FastifyRequest, FastifyReply } from "fastify";

export interface AuthUser {
  sub: string;
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    reply.status(401).send();
  }
}

export function getUserId(request: FastifyRequest): string | null {
  const user = request.user as AuthUser | undefined;
  return user?.sub ?? null;
}
