"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeEmail = normalizeEmail;
exports.validateStrongPassword = validateStrongPassword;
const STRONG_PASSWORD_MIN_LENGTH = 10;
function normalizeEmail(email) {
    return email.trim().toLowerCase();
}
function validateStrongPassword(password) {
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
