"use strict";
/**
 * Persist generated image: download from fal URL, optionally upload to S3/R2.
 * If IMAGE_STORAGE_BUCKET is unset, returns the fal URL as-is (may be temporary).
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.persistImageUrl = persistImageUrl;
const config_1 = require("./config");
async function persistImageUrl(falImageUrl) {
    if (!config_1.imageConfig.storageBucket) {
        return falImageUrl;
    }
    const res = await fetch(falImageUrl);
    if (!res.ok)
        throw new Error(`Failed to download image: ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") ?? "image/png";
    try {
        const { S3Client, PutObjectCommand } = await Promise.resolve().then(() => __importStar(require("@aws-sdk/client-s3")));
        const region = process.env.AWS_REGION ?? "us-east-1";
        const endpoint = process.env.S3_ENDPOINT; // for R2: https://<account>.r2.cloudflarestorage.com
        const client = new S3Client({
            region,
            ...(endpoint && { endpoint }),
            credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
                ? {
                    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                }
                : undefined,
        });
        const key = `thoughts/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.png`;
        await client.send(new PutObjectCommand({
            Bucket: config_1.imageConfig.storageBucket,
            Key: key,
            Body: buffer,
            ContentType: contentType,
        }));
        const base = (config_1.imageConfig.cdnUrl || (endpoint ? `https://${config_1.imageConfig.storageBucket}.r2.cloudflarestorage.com` : `https://${config_1.imageConfig.storageBucket}.s3.${region}.amazonaws.com`)).replace(/\/$/, "");
        return `${base}/${key}`;
    }
    catch {
        return falImageUrl;
    }
}
