"use strict";
/**
 * Phase 3: resonance signature extraction + compatibility embeddings for thoughts.
 * Call processNewThought(thoughtId) asynchronously after creating a thought (do not block the POST response).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeQualityScore = exports.extractUnderlyingQuestion = exports.extractResonanceSignature = exports.reprocessFailedJobs = exports.processNewThought = void 0;
var service_1 = require("./service");
Object.defineProperty(exports, "processNewThought", { enumerable: true, get: function () { return service_1.processNewThought; } });
Object.defineProperty(exports, "reprocessFailedJobs", { enumerable: true, get: function () { return service_1.reprocessFailedJobs; } });
Object.defineProperty(exports, "extractResonanceSignature", { enumerable: true, get: function () { return service_1.extractResonanceSignature; } });
Object.defineProperty(exports, "extractUnderlyingQuestion", { enumerable: true, get: function () { return service_1.extractUnderlyingQuestion; } });
Object.defineProperty(exports, "computeQualityScore", { enumerable: true, get: function () { return service_1.computeQualityScore; } });
