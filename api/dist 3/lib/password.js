"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
const node_crypto_1 = require("node:crypto");
const node_util_1 = require("node:util");
const PBKDF2_ITERATIONS = 100000;
const KEY_LEN = 64;
const SALT_LEN = 16;
const pbkdf2Async = (0, node_util_1.promisify)(node_crypto_1.pbkdf2);
async function hashPassword(password) {
    const salt = (0, node_crypto_1.randomBytes)(SALT_LEN).toString("hex");
    const hash = await pbkdf2Async(password, salt, PBKDF2_ITERATIONS, KEY_LEN, "sha256");
    return `${salt}.${hash.toString("hex")}`;
}
async function verifyPassword(password, stored) {
    const [salt, hash] = stored.split(".");
    if (!salt || !hash)
        return false;
    const computed = await pbkdf2Async(password, salt, PBKDF2_ITERATIONS, KEY_LEN, "sha256");
    const storedBuffer = Buffer.from(hash, "hex");
    const computedBuffer = Buffer.from(computed);
    if (storedBuffer.length !== computedBuffer.length)
        return false;
    return (0, node_crypto_1.timingSafeEqual)(storedBuffer, computedBuffer);
}
