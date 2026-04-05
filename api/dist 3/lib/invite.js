"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_INVITES_PER_USER = void 0;
exports.generateInviteCode = generateInviteCode;
exports.isAdminInviteCode = isAdminInviteCode;
const crypto_1 = __importDefault(require("crypto"));
// Excludes ambiguous chars: 0/O, 1/I/L
const CHARSET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
exports.MAX_INVITES_PER_USER = 3;
function generateInviteCode() {
    const bytes = crypto_1.default.randomBytes(CODE_LENGTH);
    let code = "";
    for (let i = 0; i < CODE_LENGTH; i++) {
        code += CHARSET[bytes[i] % CHARSET.length];
    }
    return code;
}
function isAdminInviteCode(code) {
    const adminCode = (process.env.ADMIN_INVITE_CODE ?? "OHMFAM").toUpperCase().trim();
    return code === adminCode;
}
