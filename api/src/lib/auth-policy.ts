const STRONG_PASSWORD_MIN_LENGTH = 10;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateStrongPassword(password: string): string | null {
  if (password.length < STRONG_PASSWORD_MIN_LENGTH) {
    return "Password must be at least 10 characters";
  }
  if (!/[a-z]/.test(password)) {
    return "Password must include a lowercase letter";
  }
  if (!/[A-Z]/.test(password)) {
    return "Password must include an uppercase letter";
  }
  if (!/\d/.test(password)) {
    return "Password must include a number";
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return "Password must include a symbol";
  }
  return null;
}
