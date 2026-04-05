"use strict";
/**
 * Phase 6: engagement tracking and analytics (internal).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENGAGEMENT_EVENT_TYPES = exports.getUserEngagementProfile = exports.getThoughtFunnel = exports.isValidEventType = exports.trackEngagementEvents = exports.engagementRoutes = void 0;
var routes_1 = require("./routes");
Object.defineProperty(exports, "engagementRoutes", { enumerable: true, get: function () { return routes_1.engagementRoutes; } });
var track_1 = require("./track");
Object.defineProperty(exports, "trackEngagementEvents", { enumerable: true, get: function () { return track_1.trackEngagementEvents; } });
Object.defineProperty(exports, "isValidEventType", { enumerable: true, get: function () { return track_1.isValidEventType; } });
var analytics_1 = require("./analytics");
Object.defineProperty(exports, "getThoughtFunnel", { enumerable: true, get: function () { return analytics_1.getThoughtFunnel; } });
Object.defineProperty(exports, "getUserEngagementProfile", { enumerable: true, get: function () { return analytics_1.getUserEngagementProfile; } });
var types_1 = require("./types");
Object.defineProperty(exports, "ENGAGEMENT_EVENT_TYPES", { enumerable: true, get: function () { return types_1.ENGAGEMENT_EVENT_TYPES; } });
