"use strict";
/**
 * In-memory LRU cache for embeddings (max 1000 entries), keyed by text hash.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LRUCache = void 0;
exports.cacheKey = cacheKey;
const node_crypto_1 = require("node:crypto");
function cacheKey(text, prefix) {
    return (0, node_crypto_1.createHash)("sha256").update(prefix + text).digest("hex").slice(0, 32);
}
/**
 * Simple LRU cache: oldest insertion is evicted when full.
 */
class LRUCache {
    maxSize;
    map = new Map();
    order = [];
    constructor(maxSize) {
        this.maxSize = maxSize;
    }
    get(key) {
        const entry = this.map.get(key);
        if (!entry)
            return undefined;
        // Move to end (most recently used)
        const i = this.order.indexOf(key);
        if (i >= 0) {
            this.order.splice(i, 1);
            this.order.push(key);
        }
        return entry.value;
    }
    set(key, value) {
        if (this.map.has(key)) {
            const i = this.order.indexOf(key);
            if (i >= 0)
                this.order.splice(i, 1);
        }
        else if (this.order.length >= this.maxSize) {
            const oldest = this.order.shift();
            if (oldest != null)
                this.map.delete(oldest);
        }
        this.map.set(key, { value, key });
        this.order.push(key);
    }
}
exports.LRUCache = LRUCache;
