"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = authenticate;
exports.getUserId = getUserId;
async function authenticate(request, reply) {
    try {
        await request.jwtVerify();
    }
    catch {
        return reply.status(401).send();
    }
}
function getUserId(request) {
    const user = request.user;
    return user?.sub ?? null;
}
