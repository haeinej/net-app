import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq, and, isNull, inArray, desc, gte, sql } from "drizzle-orm";
import { db, users, thoughts, manualBoosts } from "../db";
import { invalidateFeedCache } from "../feed/service";

function hasValidInternalKey(request: FastifyRequest): boolean {
  const configuredKey = process.env.INTERNAL_METRICS_KEY?.trim();
  if (!configuredKey) return false;
  const headerValue = request.headers["x-internal-metrics-key"];
  const providedKey = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (!providedKey) return false;

  const expected = Buffer.from(configuredKey);
  const received = Buffer.from(providedKey);
  if (expected.length !== received.length) return false;

  return timingSafeEqual(expected, received);
}

async function ensureInternalAccess(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<FastifyReply | void> {
  if (!hasValidInternalKey(request)) {
    return reply.status(404).send();
  }
}

export async function internalMatchmakerRoutes(
  app: FastifyInstance
): Promise<void> {
  // 1. Serve HTML page (no auth)
  app.get("/api/internal/matchmaker", async (_request, reply) => {
    return reply.type("text/html; charset=utf-8").send(renderMatchmakerHtml());
  });

  // 2. Recent thoughts
  app.get<{
    Querystring: { hours?: string; limit?: string };
  }>(
    "/api/internal/matchmaker/thoughts",
    { preHandler: ensureInternalAccess },
    async (request, reply) => {
      const hoursVal = Math.min(
        168,
        Math.max(1, parseInt(request.query.hours ?? "48", 10) || 48)
      );
      const limitVal = Math.min(
        500,
        Math.max(1, parseInt(request.query.limit ?? "100", 10) || 100)
      );
      const cutoff = new Date(Date.now() - hoursVal * 60 * 60 * 1000);

      const rows = await db
        .select({
          id: thoughts.id,
          sentence: thoughts.sentence,
          context: thoughts.context,
          photoUrl: thoughts.photoUrl,
          imageUrl: thoughts.imageUrl,
          qualityScore: thoughts.qualityScore,
          createdAt: thoughts.createdAt,
          userId: thoughts.userId,
          userName: users.name,
          userPhotoUrl: users.photoUrl,
          userConcentration: users.concentration,
        })
        .from(thoughts)
        .leftJoin(users, eq(thoughts.userId, users.id))
        .where(
          and(isNull(thoughts.deletedAt), gte(thoughts.createdAt, cutoff))
        )
        .orderBy(desc(thoughts.createdAt))
        .limit(limitVal);

      return reply.send({ thoughts: rows });
    }
  );

  // 3. All users
  app.get(
    "/api/internal/matchmaker/users",
    { preHandler: ensureInternalAccess },
    async (_request, reply) => {
      const rows = await db
        .select({
          id: users.id,
          name: users.name,
          photoUrl: users.photoUrl,
          concentration: users.concentration,
        })
        .from(users)
        .orderBy(users.name);

      return reply.send({ users: rows });
    }
  );

  // 4. Create boost
  app.post<{
    Body: {
      targetUserId: string;
      thoughtId: string;
      createdBy: string;
      reason?: string;
    };
  }>(
    "/api/internal/matchmaker/boost",
    { preHandler: ensureInternalAccess },
    async (request, reply) => {
      const { targetUserId, thoughtId, createdBy, reason } = request.body;

      if (!targetUserId || !thoughtId || !createdBy) {
        return reply
          .status(400)
          .send({ error: "targetUserId, thoughtId, and createdBy are required" });
      }

      // Validate user exists
      const [targetUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, targetUserId))
        .limit(1);
      if (!targetUser) {
        return reply.status(404).send({ error: "Target user not found" });
      }

      // Validate thought exists
      const [thought] = await db
        .select({ id: thoughts.id, userId: thoughts.userId })
        .from(thoughts)
        .where(and(eq(thoughts.id, thoughtId), isNull(thoughts.deletedAt)))
        .limit(1);
      if (!thought) {
        return reply.status(404).send({ error: "Thought not found" });
      }

      // Prevent self-boost
      if (thought.userId === targetUserId) {
        return reply
          .status(400)
          .send({ error: "Cannot boost a thought to its own author" });
      }

      // Check for duplicate pending boost
      const [existing] = await db
        .select({ id: manualBoosts.id })
        .from(manualBoosts)
        .where(
          and(
            eq(manualBoosts.targetUserId, targetUserId),
            eq(manualBoosts.thoughtId, thoughtId),
            isNull(manualBoosts.consumedAt)
          )
        )
        .limit(1);
      if (existing) {
        return reply
          .status(409)
          .send({ error: "A pending boost for this thought+user already exists" });
      }

      // Insert boost
      const [boost] = await db
        .insert(manualBoosts)
        .values({
          targetUserId,
          thoughtId,
          createdBy: createdBy.trim(),
          reason: reason?.trim() || null,
        })
        .returning();

      // Invalidate feed cache for target user
      await invalidateFeedCache(targetUserId);

      return reply.send({ boost });
    }
  );

  // 5. List boosts
  app.get<{
    Querystring: { status?: string; limit?: string };
  }>(
    "/api/internal/matchmaker/boosts",
    { preHandler: ensureInternalAccess },
    async (request, reply) => {
      const status = request.query.status ?? "all";
      const limitVal = Math.min(
        200,
        Math.max(1, parseInt(request.query.limit ?? "50", 10) || 50)
      );

      const conditions = [];
      if (status === "pending") {
        conditions.push(isNull(manualBoosts.consumedAt));
      } else if (status === "consumed") {
        conditions.push(sql`${manualBoosts.consumedAt} IS NOT NULL`);
      }

      const rows = await db
        .select({
          id: manualBoosts.id,
          targetUserId: manualBoosts.targetUserId,
          thoughtId: manualBoosts.thoughtId,
          createdBy: manualBoosts.createdBy,
          reason: manualBoosts.reason,
          consumedAt: manualBoosts.consumedAt,
          createdAt: manualBoosts.createdAt,
          thoughtSentence: thoughts.sentence,
          targetUserName: users.name,
        })
        .from(manualBoosts)
        .leftJoin(thoughts, eq(manualBoosts.thoughtId, thoughts.id))
        .leftJoin(users, eq(manualBoosts.targetUserId, users.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(manualBoosts.createdAt))
        .limit(limitVal);

      return reply.send({ boosts: rows });
    }
  );

  // 6. Cancel (delete) a pending boost
  app.delete<{
    Params: { id: string };
  }>(
    "/api/internal/matchmaker/boost/:id",
    { preHandler: ensureInternalAccess },
    async (request, reply) => {
      const { id } = request.params;

      const [boost] = await db
        .select({
          id: manualBoosts.id,
          consumedAt: manualBoosts.consumedAt,
        })
        .from(manualBoosts)
        .where(eq(manualBoosts.id, id))
        .limit(1);

      if (!boost) {
        return reply.status(404).send({ error: "Boost not found" });
      }

      if (boost.consumedAt !== null) {
        return reply
          .status(400)
          .send({ error: "Cannot cancel an already-consumed boost" });
      }

      await db.delete(manualBoosts).where(eq(manualBoosts.id, id));

      return reply.send({ deleted: true });
    }
  );
}

/* -------------------------------------------------------------------------- */
/*  HTML Page                                                                 */
/* -------------------------------------------------------------------------- */

function renderMatchmakerHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>ohm. matchmaker</title>
<style>
  :root {
    --bg: #0C0C0A;
    --card: #1A1A16;
    --text: #E8E4DE;
    --muted: #6A6A68;
    --accent: #EB4101;
    --accent-soft: rgba(235,65,1,0.15);
    --border: rgba(255,255,255,0.06);
    --success: #7B9C5B;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.5;
    min-height: 100vh;
  }
  /* Top bar */
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 24px;
    border-bottom: 1px solid var(--border);
    background: var(--card);
    position: sticky;
    top: 0;
    z-index: 100;
  }
  .topbar h1 {
    font-size: 18px;
    font-weight: 600;
    letter-spacing: -0.3px;
  }
  .topbar h1 span { color: var(--accent); }
  .key-input {
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 13px;
    width: 260px;
  }
  .key-input::placeholder { color: var(--muted); }
  /* Layout */
  .main { display: flex; gap: 20px; padding: 20px 24px; }
  .col-left { flex: 0 0 65%; min-width: 0; }
  .col-right {
    flex: 0 0 calc(35% - 20px);
    position: sticky;
    top: 80px;
    align-self: flex-start;
    max-height: calc(100vh - 100px);
    overflow-y: auto;
  }
  .section-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 12px;
  }
  /* Thought cards */
  .thought-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px 16px;
    margin-bottom: 10px;
    cursor: pointer;
    transition: border-color 0.15s;
  }
  .thought-card:hover { border-color: rgba(235,65,1,0.3); }
  .thought-card.selected { border-color: var(--accent); background: var(--accent-soft); }
  .thought-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
  }
  .avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    object-fit: cover;
    background: var(--border);
    flex-shrink: 0;
  }
  .user-info { flex: 1; min-width: 0; }
  .user-name { font-size: 13px; font-weight: 600; }
  .badge {
    display: inline-block;
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 4px;
    background: var(--accent-soft);
    color: var(--accent);
    margin-left: 6px;
    vertical-align: middle;
  }
  .thought-sentence { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
  .thought-context {
    font-size: 12px;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .thought-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 8px;
    font-size: 11px;
    color: var(--muted);
  }
  .quality-badge {
    padding: 1px 6px;
    border-radius: 4px;
    font-weight: 600;
    font-size: 10px;
  }
  .quality-high { background: rgba(123,156,91,0.2); color: var(--success); }
  .quality-mid { background: rgba(200,180,50,0.2); color: #c8b432; }
  .quality-low { background: rgba(200,60,60,0.2); color: #c83c3c; }
  .select-btn {
    background: var(--accent-soft);
    color: var(--accent);
    border: none;
    padding: 4px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }
  .select-btn:hover { background: var(--accent); color: #fff; }
  /* Boost panel */
  .boost-panel {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 18px;
  }
  .boost-panel label {
    display: block;
    font-size: 12px;
    color: var(--muted);
    margin-bottom: 4px;
    margin-top: 12px;
  }
  .boost-panel label:first-of-type { margin-top: 0; }
  .preview-box {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 12px;
    font-size: 13px;
    min-height: 60px;
    color: var(--muted);
    margin-bottom: 4px;
  }
  .preview-box.has-content { color: var(--text); }
  .user-search {
    width: 100%;
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 8px 10px;
    border-radius: 6px;
    font-size: 13px;
    margin-bottom: 4px;
  }
  .user-search::placeholder { color: var(--muted); }
  .user-list {
    max-height: 180px;
    overflow-y: auto;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
  }
  .user-option {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    cursor: pointer;
    font-size: 13px;
    border-bottom: 1px solid var(--border);
  }
  .user-option:last-child { border-bottom: none; }
  .user-option:hover { background: var(--accent-soft); }
  .user-option.selected { background: var(--accent-soft); color: var(--accent); }
  .user-option img {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    object-fit: cover;
    background: var(--border);
  }
  .input-field {
    width: 100%;
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 8px 10px;
    border-radius: 6px;
    font-size: 13px;
    font-family: inherit;
  }
  .input-field::placeholder { color: var(--muted); }
  textarea.input-field { resize: vertical; min-height: 60px; }
  .boost-btn {
    width: 100%;
    margin-top: 16px;
    background: var(--accent);
    color: #fff;
    border: none;
    padding: 10px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
  }
  .boost-btn:hover { opacity: 0.9; }
  .boost-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  /* Boosts section */
  .boosts-section { padding: 20px 24px; }
  .boosts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  th {
    text-align: left;
    padding: 8px 10px;
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.4px;
    border-bottom: 1px solid var(--border);
  }
  td {
    padding: 8px 10px;
    border-bottom: 1px solid var(--border);
    vertical-align: top;
  }
  .cancel-btn {
    background: transparent;
    color: var(--accent);
    border: 1px solid var(--accent);
    padding: 3px 10px;
    border-radius: 5px;
    font-size: 11px;
    cursor: pointer;
    font-weight: 600;
  }
  .cancel-btn:hover { background: var(--accent-soft); }
  .empty-state {
    color: var(--muted);
    font-size: 13px;
    padding: 20px;
    text-align: center;
  }
  .status-pending { color: #c8b432; }
  .status-consumed { color: var(--success); }
  .loading { color: var(--muted); font-size: 13px; padding: 20px; text-align: center; }
</style>
</head>
<body>

<div class="topbar">
  <h1>ohm<span>.</span> matchmaker</h1>
  <input class="key-input" id="apiKey" type="password" placeholder="API key" />
</div>

<div class="main">
  <div class="col-left">
    <div class="section-title">Recent Thoughts</div>
    <div id="thoughtsList" class="loading">Loading...</div>
  </div>
  <div class="col-right">
    <div class="section-title">Create Boost</div>
    <div class="boost-panel">
      <label>Selected Thought</label>
      <div class="preview-box" id="selectedPreview">Select a thought from the left</div>

      <label>Target User</label>
      <input class="user-search" id="userSearch" placeholder="Search users..." />
      <div class="user-list" id="userList"></div>

      <label>Created By</label>
      <input class="input-field" id="createdBy" value="founder" placeholder="founder" />

      <label>Reason</label>
      <textarea class="input-field" id="reason" placeholder="Why are you boosting this?"></textarea>

      <button class="boost-btn" id="boostBtn" disabled>Boost</button>
    </div>
  </div>
</div>

<div class="boosts-section">
  <div class="boosts-grid">
    <div>
      <div class="section-title">Active Boosts (Pending)</div>
      <div id="pendingBoosts" class="loading">Loading...</div>
    </div>
    <div>
      <div class="section-title">Boost History (Consumed)</div>
      <div id="consumedBoosts" class="loading">Loading...</div>
    </div>
  </div>
</div>

<script>
(function() {
  const BASE = '/api/internal/matchmaker';
  let allUsers = [];
  let selectedThought = null;
  let selectedTargetUserId = null;

  const $key = document.getElementById('apiKey');
  const $thoughtsList = document.getElementById('thoughtsList');
  const $selectedPreview = document.getElementById('selectedPreview');
  const $userSearch = document.getElementById('userSearch');
  const $userList = document.getElementById('userList');
  const $createdBy = document.getElementById('createdBy');
  const $reason = document.getElementById('reason');
  const $boostBtn = document.getElementById('boostBtn');
  const $pendingBoosts = document.getElementById('pendingBoosts');
  const $consumedBoosts = document.getElementById('consumedBoosts');

  // Persist API key
  const stored = sessionStorage.getItem('matchmaker_key');
  if (stored) $key.value = stored;
  $key.addEventListener('input', function() {
    sessionStorage.setItem('matchmaker_key', $key.value);
  });

  function getKey() { return $key.value.trim(); }

  function headers() {
    return { 'x-internal-metrics-key': getKey(), 'Content-Type': 'application/json' };
  }

  async function api(path, opts) {
    const res = await fetch(BASE + path, { headers: headers(), ...opts });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Request failed: ' + res.status);
    }
    return res.json();
  }

  function timeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    const days = Math.floor(hrs / 24);
    return days + 'd ago';
  }

  function truncate(str, len) {
    if (!str) return '';
    return str.length > len ? str.slice(0, len) + '...' : str;
  }

  function qualityClass(score) {
    if (score == null) return '';
    if (score >= 0.7) return 'quality-high';
    if (score >= 0.4) return 'quality-mid';
    return 'quality-low';
  }

  function escapeHtml(s) {
    if (!s) return '';
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // Render thoughts
  function renderThoughts(items) {
    if (!items.length) {
      $thoughtsList.innerHTML = '<div class="empty-state">No thoughts found</div>';
      return;
    }
    $thoughtsList.innerHTML = items.map(t => {
      const isSelected = selectedThought && selectedThought.id === t.id;
      const qClass = qualityClass(t.qualityScore);
      const qLabel = t.qualityScore != null ? t.qualityScore.toFixed(2) : '-';
      return '<div class="thought-card' + (isSelected ? ' selected' : '') + '" data-id="' + t.id + '">'
        + '<div class="thought-header">'
        + (t.userPhotoUrl ? '<img class="avatar" src="' + escapeHtml(t.userPhotoUrl) + '" />' : '<div class="avatar"></div>')
        + '<div class="user-info"><span class="user-name">' + escapeHtml(t.userName || 'Unknown') + '</span>'
        + (t.userConcentration ? '<span class="badge">' + escapeHtml(t.userConcentration) + '</span>' : '')
        + '</div>'
        + '<button class="select-btn" data-id="' + t.id + '">' + (isSelected ? 'Selected' : 'Select') + '</button>'
        + '</div>'
        + '<div class="thought-sentence">' + escapeHtml(t.sentence) + '</div>'
        + (t.context ? '<div class="thought-context">' + escapeHtml(truncate(t.context, 120)) + '</div>' : '')
        + '<div class="thought-meta">'
        + '<span class="quality-badge ' + qClass + '">Q: ' + qLabel + '</span>'
        + '<span>' + timeAgo(t.createdAt) + '</span>'
        + '</div>'
        + '</div>';
    }).join('');
  }

  // Render user list
  function renderUsers(filter) {
    const q = (filter || '').toLowerCase();
    const filtered = q ? allUsers.filter(u => (u.name || '').toLowerCase().includes(q)) : allUsers;
    $userList.innerHTML = filtered.slice(0, 50).map(u => {
      const isSel = selectedTargetUserId === u.id;
      return '<div class="user-option' + (isSel ? ' selected' : '') + '" data-uid="' + u.id + '">'
        + (u.photoUrl ? '<img src="' + escapeHtml(u.photoUrl) + '" />' : '<div style="width:24px;height:24px;border-radius:50%;background:var(--border)"></div>')
        + '<span>' + escapeHtml(u.name || 'Unknown')
        + (u.concentration ? ' <span class="badge">' + escapeHtml(u.concentration) + '</span>' : '')
        + '</span></div>';
    }).join('');
    if (!filtered.length) {
      $userList.innerHTML = '<div class="empty-state">No users found</div>';
    }
  }

  // Render boosts table
  function renderBoostsTable(items, container, showCancel) {
    if (!items.length) {
      container.innerHTML = '<div class="empty-state">No boosts</div>';
      return;
    }
    let html = '<table><thead><tr><th>Thought</th><th>Target</th><th>By</th><th>Reason</th><th>Created</th>';
    if (showCancel) html += '<th></th>';
    html += '</tr></thead><tbody>';
    items.forEach(b => {
      html += '<tr>'
        + '<td>' + escapeHtml(truncate(b.thoughtSentence, 60)) + '</td>'
        + '<td>' + escapeHtml(b.targetUserName || b.targetUserId) + '</td>'
        + '<td>' + escapeHtml(b.createdBy) + '</td>'
        + '<td>' + escapeHtml(truncate(b.reason, 40) || '-') + '</td>'
        + '<td>' + timeAgo(b.createdAt) + '</td>';
      if (showCancel) {
        html += '<td><button class="cancel-btn" data-bid="' + b.id + '">Cancel</button></td>';
      }
      html += '</tr>';
    });
    html += '</tbody></table>';
    container.innerHTML = html;
  }

  function updateBoostBtn() {
    $boostBtn.disabled = !(selectedThought && selectedTargetUserId && $createdBy.value.trim());
  }

  // Event: select thought
  $thoughtsList.addEventListener('click', function(e) {
    const btn = e.target.closest('.select-btn');
    const card = e.target.closest('.thought-card');
    const target = btn || card;
    if (!target) return;
    const id = target.dataset.id || (card && card.dataset.id);
    if (!id) return;

    // Find the thought data
    const items = window.__thoughts || [];
    const found = items.find(t => t.id === id);
    if (!found) return;

    selectedThought = found;
    $selectedPreview.className = 'preview-box has-content';
    $selectedPreview.innerHTML = '<strong>' + escapeHtml(found.sentence) + '</strong>'
      + '<br><span style="color:var(--muted);font-size:12px">by ' + escapeHtml(found.userName || 'Unknown') + '</span>';
    renderThoughts(items);
    updateBoostBtn();
  });

  // Event: search users
  $userSearch.addEventListener('input', function() {
    renderUsers($userSearch.value);
  });

  // Event: select user
  $userList.addEventListener('click', function(e) {
    const opt = e.target.closest('.user-option');
    if (!opt) return;
    selectedTargetUserId = opt.dataset.uid;
    renderUsers($userSearch.value);
    updateBoostBtn();
  });

  $createdBy.addEventListener('input', updateBoostBtn);

  // Event: boost
  $boostBtn.addEventListener('click', async function() {
    if (!selectedThought || !selectedTargetUserId) return;
    $boostBtn.disabled = true;
    $boostBtn.textContent = 'Boosting...';
    try {
      await api('/boost', {
        method: 'POST',
        body: JSON.stringify({
          targetUserId: selectedTargetUserId,
          thoughtId: selectedThought.id,
          createdBy: $createdBy.value.trim(),
          reason: $reason.value.trim() || undefined,
        }),
      });
      // Reset
      selectedThought = null;
      selectedTargetUserId = null;
      $selectedPreview.className = 'preview-box';
      $selectedPreview.textContent = 'Select a thought from the left';
      $reason.value = '';
      $userSearch.value = '';
      renderUsers('');
      renderThoughts(window.__thoughts || []);
      await loadBoosts();
    } catch (err) {
      alert('Boost failed: ' + err.message);
    } finally {
      $boostBtn.textContent = 'Boost';
      updateBoostBtn();
    }
  });

  // Event: cancel boost
  document.addEventListener('click', async function(e) {
    const btn = e.target.closest('.cancel-btn');
    if (!btn) return;
    const bid = btn.dataset.bid;
    if (!bid || !confirm('Cancel this boost?')) return;
    try {
      await api('/boost/' + bid, { method: 'DELETE' });
      await loadBoosts();
    } catch (err) {
      alert('Cancel failed: ' + err.message);
    }
  });

  // Data loading
  async function loadThoughts() {
    try {
      const data = await api('/thoughts?hours=48&limit=100');
      window.__thoughts = data.thoughts;
      renderThoughts(data.thoughts);
    } catch (err) {
      $thoughtsList.innerHTML = '<div class="empty-state">Failed to load: ' + escapeHtml(err.message) + '</div>';
    }
  }

  async function loadUsers() {
    try {
      const data = await api('/users');
      allUsers = data.users;
      renderUsers('');
    } catch (err) {
      $userList.innerHTML = '<div class="empty-state">Failed to load users</div>';
    }
  }

  async function loadBoosts() {
    try {
      const [pending, consumed] = await Promise.all([
        api('/boosts?status=pending&limit=50'),
        api('/boosts?status=consumed&limit=50'),
      ]);
      renderBoostsTable(pending.boosts, $pendingBoosts, true);
      renderBoostsTable(consumed.boosts, $consumedBoosts, false);
    } catch (err) {
      $pendingBoosts.innerHTML = '<div class="empty-state">Failed to load</div>';
      $consumedBoosts.innerHTML = '<div class="empty-state">Failed to load</div>';
    }
  }

  function init() {
    if (!getKey()) {
      const entered = prompt('Enter API key for ohm matchmaker:');
      if (entered) {
        $key.value = entered;
        sessionStorage.setItem('matchmaker_key', entered);
      }
    }
    loadThoughts();
    loadUsers();
    loadBoosts();
  }

  init();
})();
</script>
</body>
</html>`;
}
