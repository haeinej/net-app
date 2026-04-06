"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadEnv = loadEnv;
const dotenv_1 = __importDefault(require("dotenv"));
const node_path_1 = __importDefault(require("node:path"));
let loaded = false;
function loadEnv() {
    if (loaded)
        return;
    const srcDir = __dirname;
    const apiDir = node_path_1.default.resolve(srcDir, "..");
    dotenv_1.default.config({ path: node_path_1.default.join(apiDir, ".env.local") });
    dotenv_1.default.config({ path: node_path_1.default.join(apiDir, ".env") });
    loaded = true;
}
