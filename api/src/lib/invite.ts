import crypto from "crypto";

// Excludes ambiguous chars: 0/O, 1/I/L
const CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

export const MAX_INVITES_PER_USER = 3;

export function generateInviteCode(): string {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CHARSET[bytes[i]! % CHARSET.length];
  }
  return code;
}

export function isAdminInviteCode(code: string): boolean {
  const adminCode = (process.env.ADMIN_INVITE_CODE ?? "OHMFAM").toUpperCase().trim();
  return code === adminCode;
}
