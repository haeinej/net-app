import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { evaluateRankingPromotion, getFeedMetrics } from "../feed/analytics";
import { getFeedWithDebug } from "../feed";
import {
  activateRankingConfig,
  getActiveRankingConfig,
  getRankingConfigByVersion,
  getRankingConfigOverview,
  listRankingConfigAudits,
  recordRankingConfigAudit,
  upsertRankingConfig,
} from "../feed/runtime-config";

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

function parseWindowDays(value: string | undefined): number {
  const parsed = parseInt(value ?? "7", 10);
  return Number.isFinite(parsed) ? Math.min(30, Math.max(1, parsed)) : 7;
}

function parseMinimumImpressions(value: string | undefined): number {
  const parsed = parseInt(value ?? "200", 10);
  return Number.isFinite(parsed) ? Math.min(5000, Math.max(25, parsed)) : 200;
}

function buildAuditContext(
  request: FastifyRequest,
  input?: {
    actor?: string;
    reason?: string | null;
    source?: string | null;
    metadata?: unknown;
  }
) {
  return {
    actor: input?.actor?.trim() || null,
    reason: input?.reason?.trim() || null,
    source: input?.source?.trim() || "board",
    metadata: input?.metadata ?? null,
    requestIp: request.ip ?? null,
    userAgent: request.headers["user-agent"]?.toString() ?? null,
  };
}

function renderBoardHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ohm. feed board</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f5efe6;
        --card: #fff9f2;
        --ink: #241c16;
        --muted: #75685f;
        --line: rgba(36, 28, 22, 0.12);
        --accent: #ef5a11;
        --accent-soft: rgba(239, 90, 17, 0.12);
        --green: #68733d;
        --red: #a03b2f;
        --shadow: 0 18px 40px rgba(36, 28, 22, 0.08);
        font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: radial-gradient(circle at top, #fffaf6 0%, var(--bg) 58%);
        color: var(--ink);
      }
      .wrap {
        max-width: 1400px;
        margin: 0 auto;
        padding: 32px 24px 64px;
      }
      .hero {
        display: flex;
        justify-content: space-between;
        gap: 24px;
        align-items: end;
        margin-bottom: 24px;
      }
      h1 {
        margin: 0 0 8px;
        font-size: 40px;
        line-height: 1;
      }
      .sub {
        color: var(--muted);
        max-width: 720px;
        font-size: 15px;
      }
      .row,
      .grid {
        display: grid;
        gap: 16px;
      }
      .row {
        grid-template-columns: repeat(12, minmax(0, 1fr));
      }
      .grid.metrics {
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      }
      .panel {
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: 24px;
        box-shadow: var(--shadow);
        padding: 20px;
      }
      .span-4 { grid-column: span 4; }
      .span-5 { grid-column: span 5; }
      .span-6 { grid-column: span 6; }
      .span-7 { grid-column: span 7; }
      .span-8 { grid-column: span 8; }
      .span-12 { grid-column: span 12; }
      .metric {
        padding: 16px;
        border-radius: 18px;
        background: white;
        border: 1px solid var(--line);
      }
      .metric label {
        display: block;
        color: var(--muted);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        margin-bottom: 8px;
      }
      .metric strong {
        font-size: 28px;
        line-height: 1.05;
      }
      h2 {
        margin: 0 0 14px;
        font-size: 22px;
      }
      h3 {
        margin: 0 0 10px;
        font-size: 16px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
      }
      th, td {
        text-align: left;
        padding: 10px 8px;
        border-bottom: 1px solid var(--line);
        vertical-align: top;
      }
      th {
        color: var(--muted);
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      input, select, textarea, button {
        font: inherit;
      }
      input, select, textarea {
        width: 100%;
        border-radius: 14px;
        border: 1px solid var(--line);
        background: white;
        padding: 12px 14px;
        color: var(--ink);
      }
      textarea {
        min-height: 220px;
        resize: vertical;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 13px;
      }
      .controls {
        display: grid;
        grid-template-columns: 2fr 1fr 1fr 1fr;
        gap: 12px;
        align-items: end;
      }
      .controls.small {
        grid-template-columns: 2fr 2fr 1fr 1fr;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      button {
        border: 0;
        border-radius: 999px;
        padding: 12px 18px;
        background: var(--accent);
        color: white;
        font-weight: 700;
        cursor: pointer;
      }
      button.secondary {
        background: white;
        color: var(--ink);
        border: 1px solid var(--line);
      }
      button.success { background: var(--green); }
      button.danger { background: var(--red); }
      .pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border-radius: 999px;
        padding: 6px 10px;
        font-size: 12px;
        background: var(--accent-soft);
        color: var(--accent);
      }
      .muted { color: var(--muted); }
      .stack {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .config-card {
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 14px;
        background: white;
      }
      .config-card.active {
        border-color: rgba(239, 90, 17, 0.45);
        background: #fff3ec;
      }
      pre {
        white-space: pre-wrap;
        word-break: break-word;
        border-radius: 18px;
        padding: 16px;
        background: #1d1a18;
        color: #f6efe8;
        overflow: auto;
        font-size: 12px;
        line-height: 1.45;
      }
      .status {
        min-height: 24px;
        font-size: 13px;
      }
      @media (max-width: 1024px) {
        .span-4, .span-5, .span-6, .span-7, .span-8, .span-12 { grid-column: span 12; }
        .controls, .controls.small { grid-template-columns: 1fr; }
        .hero { flex-direction: column; align-items: start; }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="hero">
        <div>
          <h1>Feed Board</h1>
          <div class="sub">
            This is the internal control surface for the ranking system. We use it to see what users were actually shown, how those decisions translated into real conversation outcomes, and to safely tune the live feed against the mission.
          </div>
        </div>
        <div class="pill">internal only</div>
      </div>

      <div class="panel span-12" style="margin-bottom:16px;">
        <div class="controls">
          <div>
            <label>Internal key</label>
            <input id="keyInput" type="password" placeholder="x-internal-metrics-key" />
          </div>
          <div>
            <label>Window (days)</label>
            <select id="daysInput">
              <option value="1">1 day</option>
              <option value="3">3 days</option>
              <option value="7" selected>7 days</option>
              <option value="14">14 days</option>
              <option value="30">30 days</option>
            </select>
          </div>
          <div>
            <label>&nbsp;</label>
            <button id="loadBoardButton" class="success" type="button">Load board</button>
          </div>
          <div>
            <label>&nbsp;</label>
            <button id="refreshButton" class="secondary" type="button">Refresh</button>
          </div>
        </div>
        <div id="status" class="status muted" style="margin-top:12px;">Enter the internal key to load live metrics and controls.</div>
      </div>

      <div class="row">
        <div class="panel span-8">
          <h2>Mission outcomes</h2>
          <div id="overallMetrics" class="grid metrics"></div>
        </div>
        <div class="panel span-4">
          <h2>Composition</h2>
          <div id="compositionMetrics" class="grid metrics"></div>
        </div>
      </div>

      <div class="row" style="margin-top:16px;">
        <div class="panel span-4">
          <h2>By bucket</h2>
          <div id="bucketTable"></div>
        </div>
        <div class="panel span-4">
          <h2>By stage</h2>
          <div id="stageTable"></div>
        </div>
        <div class="panel span-4">
          <h2>By phase</h2>
          <div id="phaseTable"></div>
        </div>
      </div>

      <div class="row" style="margin-top:16px;">
        <div class="panel span-6">
          <h2>By config version</h2>
          <div id="configVersionTable"></div>
        </div>
        <div class="panel span-6">
          <h2>Score summary</h2>
          <div id="scoreSummary"></div>
        </div>
      </div>

      <div class="row" style="margin-top:16px;">
        <div class="panel span-5">
          <h2>Configs</h2>
          <div id="configList" class="stack"></div>
        </div>
        <div class="panel span-7">
          <h2>Create or update config</h2>
          <div class="controls small" style="margin-bottom:12px;">
            <div>
              <label>Version</label>
              <input id="configVersionInput" placeholder="example: mission-v2" />
            </div>
            <div>
              <label>Name</label>
              <input id="configNameInput" placeholder="Readable label" />
            </div>
            <div>
              <label>Activate now</label>
              <select id="configActivateInput">
                <option value="false" selected>No</option>
                <option value="true">Yes</option>
              </select>
            </div>
            <div>
              <label>&nbsp;</label>
              <button id="saveConfigButton" type="button">Save config</button>
            </div>
          </div>
          <div style="margin-bottom:12px;">
            <label>Notes</label>
            <input id="configNotesInput" placeholder="What this config is trying to improve" />
          </div>
          <div>
            <label>Config patch (JSON)</label>
            <textarea id="configJsonInput" placeholder='{
  "defaultWeights": { "qWeight": 0.45 },
  "bucketRatios": {
    "new": { "resonance": 0.55, "adjacent": 0.35, "wildcard": 0.10 }
  }
}'></textarea>
          </div>
        </div>
      </div>

      <div class="row" style="margin-top:16px;">
        <div class="panel span-5">
          <h2>Promotion gate</h2>
          <div class="controls small" style="margin-bottom:12px;">
            <div>
              <label>Operator</label>
              <input id="operatorActorInput" placeholder="your name" />
            </div>
            <div>
              <label>Reason</label>
              <input id="operatorReasonInput" placeholder="what we are trying to improve" />
            </div>
            <div>
              <label>Min impressions</label>
              <input id="promotionMinImpressionsInput" type="number" min="25" max="5000" value="200" />
            </div>
            <div>
              <label>Force promote</label>
              <select id="promotionForceInput">
                <option value="false" selected>No</option>
                <option value="true">Yes</option>
              </select>
            </div>
          </div>
          <div class="muted" style="margin-bottom:12px;">
            Use <strong>Promote</strong> from a config card after the candidate clears the mission gate. Use <strong>Activate</strong> only when you intentionally want to override the gate.
          </div>
          <pre id="promotionOutput">No promotion check yet.</pre>
        </div>
        <div class="panel span-7">
          <h2>Audit history</h2>
          <div id="auditTable"></div>
        </div>
      </div>

      <div class="row" style="margin-top:16px;">
        <div class="panel span-12">
          <h2>Per-user compare</h2>
          <div class="controls small" style="margin-bottom:12px;">
            <div>
              <label>Viewer ID</label>
              <input id="viewerIdInput" placeholder="user uuid" />
            </div>
            <div>
              <label>Candidate version</label>
              <input id="candidateVersionInput" placeholder="mission-v2" />
            </div>
            <div>
              <label>Limit</label>
              <input id="compareLimitInput" type="number" min="1" max="100" value="20" />
            </div>
            <div>
              <label>&nbsp;</label>
              <button id="compareButton" class="secondary" type="button">Compare feeds</button>
            </div>
          </div>
          <pre id="compareOutput">No compare run yet.</pre>
        </div>
      </div>
    </div>

    <script>
      var state = { metrics: null, configs: null, audits: null };

      function getKey() {
        return document.getElementById("keyInput").value.trim();
      }

      function setStatus(message, isError) {
        var node = document.getElementById("status");
        node.textContent = message;
        node.style.color = isError ? "var(--red)" : "var(--muted)";
      }

      async function fetchInternal(path, options) {
        var key = getKey();
        if (!key) {
          throw new Error("Internal key is required");
        }
        var headers = Object.assign(
          { "x-internal-metrics-key": key },
          (options && options.headers) || {}
        );
        var response = await fetch(path, Object.assign({}, options || {}, { headers: headers }));
        if (!response.ok) {
          var errorContentType = response.headers.get("content-type") || "";
          if (errorContentType.includes("application/json")) {
            var payload = await response.json();
            var message = payload && (payload.error || payload.reason);
            throw new Error(message || JSON.stringify(payload));
          }
          var text = await response.text();
          throw new Error(text || ("Request failed: " + response.status));
        }
        var contentType = response.headers.get("content-type") || "";
        return contentType.includes("application/json") ? response.json() : response.text();
      }

      function numberText(value, digits) {
        if (value == null || Number.isNaN(value)) return "—";
        return Number(value).toFixed(digits == null ? 2 : digits);
      }

      function percentText(value) {
        if (value == null || Number.isNaN(value)) return "—";
        return numberText(value * 100, 1) + "%";
      }

      function metricCard(label, value, mode) {
        var rendered = mode === "percent" ? percentText(value) : numberText(value, 0);
        return '<div class="metric"><label>' + label + '</label><strong>' + rendered + '</strong></div>';
      }

      function renderMetrics(metrics) {
        var overall = metrics.overall || {};
        document.getElementById("overallMetrics").innerHTML = [
          metricCard("Qualified reply rate", overall.qualified_reply_rate, "percent"),
          metricCard("Reply accept rate", overall.reply_accept_rate, "percent"),
          metricCard("Conversation depth 3", overall.conversation_depth_3_rate, "percent"),
          metricCard("Conversation depth 10", overall.conversation_depth_10_rate, "percent"),
          metricCard("Crossing approval", overall.crossing_approval_rate, "percent"),
          metricCard("Crossing autopost", overall.crossing_autopost_rate, "percent"),
          metricCard("Repeat author exposure", overall.repeat_author_exposure_rate, "percent"),
          metricCard("Impressions", overall.impressions, "count")
        ].join("");

        document.getElementById("compositionMetrics").innerHTML = [
          metricCard("Thought serves", metrics.composition && metrics.composition.thought, "count"),
          metricCard("Crossing serves", metrics.composition && metrics.composition.crossing, "count")
        ].join("");

        document.getElementById("bucketTable").innerHTML = renderGroupTable(metrics.by_bucket);
        document.getElementById("stageTable").innerHTML = renderGroupTable(metrics.by_stage);
        document.getElementById("phaseTable").innerHTML = renderGroupTable(metrics.by_phase);
        document.getElementById("configVersionTable").innerHTML = renderGroupTable(metrics.by_config_version);
        document.getElementById("scoreSummary").innerHTML = renderScoreSummary(metrics.score_summary);
      }

      function renderAudits(audits) {
        var entries = Array.isArray(audits) ? audits : [];
        if (!entries.length) {
          document.getElementById("auditTable").innerHTML = '<div class="muted">No audit events yet.</div>';
          return;
        }
        var rows = entries.map(function(entry) {
          var metadata = entry.metadata ? escapeHtml(JSON.stringify(entry.metadata)) : "—";
          return "<tr>" +
            "<td><strong>" + escapeHtml(entry.action || "—") + "</strong><div class=\"muted\">" + escapeHtml(entry.outcome || "—") + "</div></td>" +
            "<td>" + escapeHtml(entry.config_version || "—") + "</td>" +
            "<td>" + escapeHtml(entry.previous_active_version || "—") + "</td>" +
            "<td>" + escapeHtml(entry.actor || "—") + "</td>" +
            "<td>" + escapeHtml(entry.reason || "—") + "</td>" +
            "<td>" + escapeHtml(entry.created_at || "—") + "</td>" +
            "<td><div class=\"muted\">" + metadata + "</div></td>" +
            "</tr>";
        }).join("");
        document.getElementById("auditTable").innerHTML =
          "<table><thead><tr><th>Action</th><th>Config</th><th>Prev active</th><th>Actor</th><th>Reason</th><th>Time</th><th>Metadata</th></tr></thead><tbody>" +
          rows +
          "</tbody></table>";
      }

      function renderGroupTable(groups) {
        var entries = Object.entries(groups || {});
        if (!entries.length) return '<div class="muted">No data yet.</div>';
        var rows = entries.map(function(entry) {
          var key = entry[0];
          var value = entry[1] || {};
          return "<tr>" +
            "<td><strong>" + key + "</strong></td>" +
            "<td>" + percentText(value.qualified_reply_rate) + "</td>" +
            "<td>" + percentText(value.reply_accept_rate) + "</td>" +
            "<td>" + percentText(value.conversation_depth_10_rate) + "</td>" +
            "<td>" + percentText(value.crossing_approval_rate) + "</td>" +
            "<td>" + percentText(value.crossing_autopost_rate) + "</td>" +
            "<td>" + numberText(value.impressions, 0) + "</td>" +
            "</tr>";
        }).join("");
        return "<table><thead><tr><th>Group</th><th>Reply</th><th>Accept</th><th>Depth 10</th><th>Crossing</th><th>Autopost</th><th>Impr.</th></tr></thead><tbody>" + rows + "</tbody></table>";
      }

      function renderScoreSummary(summary) {
        if (!summary || !summary.overall) return '<div class="muted">No score data yet.</div>';
        var overall = summary.overall;
        var buckets = summary.by_bucket || {};
        var parts = [];
        parts.push(renderScoreBlock("Overall", overall));
        Object.entries(buckets).forEach(function(entry) {
          parts.push(renderScoreBlock(entry[0], entry[1]));
        });
        return parts.join("");
      }

      function renderScoreBlock(label, block) {
        function line(name, group) {
          return "<tr><td>" + name + "</td><td>" + numberText(group.avg, 3) + "</td><td>" + numberText(group.min, 3) + "</td><td>" + numberText(group.max, 3) + "</td></tr>";
        }
        return '<div style="margin-bottom:14px;"><h3>' + label + '</h3><table><thead><tr><th>Signal</th><th>Avg</th><th>Min</th><th>Max</th></tr></thead><tbody>' +
          line("Q", block.Q || {}) +
          line("D", block.D || {}) +
          line("F", block.F || {}) +
          line("R", block.R || {}) +
          line("Final", block.final_rank || {}) +
          '</tbody></table></div>';
      }

      function renderConfigs(overview) {
        var list = (overview && overview.configs) || [];
        if (!list.length) {
          document.getElementById("configList").innerHTML = '<div class="muted">No configs yet.</div>';
          return;
        }
        document.getElementById("configList").innerHTML = list.map(function(config) {
          var activeClass = config.is_active ? "config-card active" : "config-card";
          var actionHtml = config.is_active
            ? '<span class="pill">active</span>'
            : '<div class="actions">' +
                '<button type="button" class="secondary" data-check-version="' + config.version + '">Check</button>' +
                '<button type="button" class="success" data-promote-version="' + config.version + '">Promote</button>' +
                '<button type="button" class="secondary" data-activate-version="' + config.version + '">Activate</button>' +
              '</div>';
          return '<div class="' + activeClass + '">' +
            '<div style="display:flex;justify-content:space-between;gap:12px;align-items:start;margin-bottom:8px;">' +
              '<div><strong>' + escapeHtml(config.name) + '</strong><div class="muted">' + escapeHtml(config.version) + '</div></div>' +
              '<div>' + actionHtml + '</div>' +
            '</div>' +
            '<div class="muted" style="margin-bottom:8px;">' + escapeHtml(config.notes || "No notes") + '</div>' +
            '<pre style="margin:0;">' + escapeHtml(JSON.stringify(config.config, null, 2)) + '</pre>' +
          '</div>';
        }).join("");

        Array.from(document.querySelectorAll("[data-activate-version]")).forEach(function(node) {
          node.addEventListener("click", function() {
            activateConfig(node.getAttribute("data-activate-version"));
          });
        });
        Array.from(document.querySelectorAll("[data-check-version]")).forEach(function(node) {
          node.addEventListener("click", function() {
            runPromotionCheck(node.getAttribute("data-check-version"));
          });
        });
        Array.from(document.querySelectorAll("[data-promote-version]")).forEach(function(node) {
          node.addEventListener("click", function() {
            promoteConfig(node.getAttribute("data-promote-version"));
          });
        });
      }

      function escapeHtml(value) {
        return String(value)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
      }

      function getOperatorPayload(extraMetadata) {
        return {
          actor: document.getElementById("operatorActorInput").value.trim() || undefined,
          reason: document.getElementById("operatorReasonInput").value.trim() || undefined,
          source: "board",
          metadata: extraMetadata || undefined
        };
      }

      async function loadBoard() {
        setStatus("Loading board...", false);
        try {
          var days = document.getElementById("daysInput").value;
          var results = await Promise.all([
            fetchInternal("/api/internal/feed/metrics?days=" + encodeURIComponent(days)),
            fetchInternal("/api/internal/feed/configs"),
            fetchInternal("/api/internal/feed/config-audits?limit=50")
          ]);
          state.metrics = results[0];
          state.configs = results[1];
          state.audits = results[2];
          renderMetrics(state.metrics);
          renderConfigs(state.configs);
          renderAudits(state.audits);
          setStatus("Board loaded.", false);
        } catch (error) {
          setStatus(error.message || String(error), true);
        }
      }

      async function saveConfig() {
        try {
          var version = document.getElementById("configVersionInput").value.trim();
          if (!version) throw new Error("Version is required");
          var rawJson = document.getElementById("configJsonInput").value.trim();
          var parsedConfig = rawJson ? JSON.parse(rawJson) : {};
          var body = {
            name: document.getElementById("configNameInput").value.trim() || undefined,
            notes: document.getElementById("configNotesInput").value.trim() || null,
            activate: document.getElementById("configActivateInput").value === "true",
            config: parsedConfig,
            actor: document.getElementById("operatorActorInput").value.trim() || undefined,
            reason: document.getElementById("operatorReasonInput").value.trim() || undefined,
            source: "board"
          };
          await fetchInternal("/api/internal/feed/configs/" + encodeURIComponent(version), {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body)
          });
          setStatus("Config saved.", false);
          await loadBoard();
        } catch (error) {
          setStatus(error.message || String(error), true);
        }
      }

      async function activateConfig(version) {
        if (!version) return;
        try {
          await fetchInternal("/api/internal/feed/configs/" + encodeURIComponent(version) + "/activate", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(getOperatorPayload({ mode: "override_activate" }))
          });
          setStatus("Config activated.", false);
          await loadBoard();
        } catch (error) {
          setStatus(error.message || String(error), true);
        }
      }

      async function runPromotionCheck(version) {
        if (!version) return;
        try {
          var days = document.getElementById("daysInput").value;
          var minImpressions = document.getElementById("promotionMinImpressionsInput").value.trim() || "200";
          var query = "/api/internal/feed/configs/" + encodeURIComponent(version) +
            "/promotion-check?days=" + encodeURIComponent(days) +
            "&min_impressions=" + encodeURIComponent(minImpressions);
          var result = await fetchInternal(query);
          document.getElementById("promotionOutput").textContent = JSON.stringify(result, null, 2);
          setStatus("Promotion check complete.", false);
        } catch (error) {
          setStatus(error.message || String(error), true);
        }
      }

      async function promoteConfig(version) {
        if (!version) return;
        try {
          var days = document.getElementById("daysInput").value;
          var minImpressions = document.getElementById("promotionMinImpressionsInput").value.trim() || "200";
          var force = document.getElementById("promotionForceInput").value === "true";
          var result = await fetchInternal("/api/internal/feed/configs/" + encodeURIComponent(version) + "/promote", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(Object.assign(getOperatorPayload({ min_impressions: Number(minImpressions), days: Number(days) }), {
              days: Number(days),
              min_impressions: Number(minImpressions),
              force: force
            }))
          });
          document.getElementById("promotionOutput").textContent = JSON.stringify(result, null, 2);
          setStatus(result && result.promoted ? "Config promoted." : "Promotion blocked by gate.", !result || !result.promoted);
          await loadBoard();
        } catch (error) {
          setStatus(error.message || String(error), true);
        }
      }

      async function runCompare() {
        try {
          var viewerId = document.getElementById("viewerIdInput").value.trim();
          var version = document.getElementById("candidateVersionInput").value.trim();
          var limit = document.getElementById("compareLimitInput").value.trim() || "20";
          if (!viewerId || !version) {
            throw new Error("Viewer ID and candidate version are required");
          }
          var query = "/api/internal/feed/compare?viewer_id=" + encodeURIComponent(viewerId) +
            "&candidate_version=" + encodeURIComponent(version) +
            "&limit=" + encodeURIComponent(limit);
          var result = await fetchInternal(query);
          document.getElementById("compareOutput").textContent = JSON.stringify(result, null, 2);
          setStatus("Compare complete.", false);
        } catch (error) {
          setStatus(error.message || String(error), true);
        }
      }

      document.getElementById("loadBoardButton").addEventListener("click", loadBoard);
      document.getElementById("refreshButton").addEventListener("click", loadBoard);
      document.getElementById("saveConfigButton").addEventListener("click", saveConfig);
      document.getElementById("compareButton").addEventListener("click", runCompare);
    </script>
  </body>
</html>`;
}

export async function internalFeedMetricsRoutes(
  app: FastifyInstance
): Promise<void> {
  app.get("/api/internal/feed/board", async (_request, reply) => {
    return reply.type("text/html; charset=utf-8").send(renderBoardHtml());
  });

  app.get<{
    Querystring: { days?: string };
  }>(
    "/api/internal/feed/metrics",
    { preHandler: ensureInternalAccess },
    async (request, reply) => {
      const days = parseWindowDays(request.query.days);
      const metrics = await getFeedMetrics(days);
      return reply.send(metrics);
    }
  );

  app.get<{
    Querystring: { limit?: string };
  }>(
    "/api/internal/feed/config-audits",
    { preHandler: ensureInternalAccess },
    async (request, reply) => {
      const parsedLimit = parseInt(request.query.limit ?? "50", 10);
      const limit = Number.isFinite(parsedLimit)
        ? Math.min(200, Math.max(1, parsedLimit))
        : 50;
      const audits = await listRankingConfigAudits(limit);
      return reply.send(audits);
    }
  );

  app.get(
    "/api/internal/feed/configs",
    { preHandler: ensureInternalAccess },
    async (_request, reply) => {
      const overview = await getRankingConfigOverview();
      return reply.send(overview);
    }
  );

  app.put<{
    Params: { version: string };
    Body: {
      name?: string;
      notes?: string | null;
      config?: unknown;
      activate?: boolean;
      actor?: string;
      reason?: string | null;
      source?: string | null;
    };
  }>(
    "/api/internal/feed/configs/:version",
    { preHandler: ensureInternalAccess },
    async (request, reply) => {
    try {
      const snapshot = await upsertRankingConfig({
        version: request.params.version,
        name: request.body?.name,
        notes: request.body?.notes,
        config: request.body?.config,
        activate: request.body?.activate,
        audit: buildAuditContext(request, {
          actor: request.body?.actor,
          reason: request.body?.reason,
          source: request.body?.source,
        }),
      });
      return reply.send(snapshot);
    } catch (error) {
      return reply
        .status(400)
        .send({ error: error instanceof Error ? error.message : "invalid config" });
    }
    }
  );

  app.post<{
    Params: { version: string };
    Body: {
      actor?: string;
      reason?: string | null;
      source?: string | null;
    };
  }>(
    "/api/internal/feed/configs/:version/activate",
    { preHandler: ensureInternalAccess },
    async (request, reply) => {
      const snapshot = await activateRankingConfig(request.params.version, {
        auditAction: "activate",
        audit: buildAuditContext(request, {
          actor: request.body?.actor,
          reason: request.body?.reason,
          source: request.body?.source,
        }),
      });
      if (!snapshot) {
        return reply.status(404).send({ error: "config not found" });
      }
      return reply.send(snapshot);
    }
  );

  app.get<{
    Params: { version: string };
    Querystring: {
      days?: string;
      baseline_version?: string;
      min_impressions?: string;
    };
  }>(
    "/api/internal/feed/configs/:version/promotion-check",
    { preHandler: ensureInternalAccess },
    async (request, reply) => {
      const active = await getActiveRankingConfig();
      const evaluation = await evaluateRankingPromotion({
        candidateVersion: request.params.version,
        baselineVersion:
          request.query.baseline_version?.trim() || active.version,
        days: parseWindowDays(request.query.days),
        minimumImpressions: parseMinimumImpressions(
          request.query.min_impressions
        ),
      });
      return reply.send(evaluation);
    }
  );

  app.post<{
    Params: { version: string };
    Body: {
      days?: number;
      baseline_version?: string;
      min_impressions?: number;
      force?: boolean;
      actor?: string;
      reason?: string | null;
      source?: string | null;
    };
  }>(
    "/api/internal/feed/configs/:version/promote",
    { preHandler: ensureInternalAccess },
    async (request, reply) => {
      const active = await getActiveRankingConfig();
      const evaluation = await evaluateRankingPromotion({
        candidateVersion: request.params.version,
        baselineVersion:
          request.body?.baseline_version?.trim() || active.version,
        days: Math.min(30, Math.max(1, request.body?.days ?? 7)),
        minimumImpressions: Math.min(
          5000,
          Math.max(25, request.body?.min_impressions ?? 200)
        ),
      });
      const audit = buildAuditContext(request, {
        actor: request.body?.actor,
        reason: request.body?.reason,
        source: request.body?.source,
        metadata: {
          evaluation,
          force: Boolean(request.body?.force),
        },
      });

      if (evaluation.decision !== "promote" && !request.body?.force) {
        const candidate = await getRankingConfigByVersion(request.params.version);
        if (candidate) {
          await recordRankingConfigAudit({
            configVersion: candidate.version,
            action: "promote",
            outcome: "blocked",
            previousActiveVersion: active.version,
            configSnapshot: candidate,
            audit: {
              ...audit,
              metadata: {
                evaluation,
                event: "promotion_blocked",
              },
              reason:
                audit.reason ??
                `Promotion blocked: ${evaluation.reason}`,
              source: audit.source ?? "board",
            },
          });
        }
        return reply.send({
          promoted: false,
          evaluation,
        });
      }

      const snapshot = await activateRankingConfig(request.params.version, {
        auditAction: "promote",
        auditOutcome: request.body?.force ? "forced" : "success",
        audit,
      });
      if (!snapshot) {
        return reply.status(404).send({ error: "config not found" });
      }
      return reply.send({
        promoted: true,
        evaluation,
        snapshot,
      });
    }
  );

  app.get<{
    Querystring: {
      viewer_id?: string;
      candidate_version?: string;
      limit?: string;
      offset?: string;
    };
  }>(
    "/api/internal/feed/compare",
    { preHandler: ensureInternalAccess },
    async (request, reply) => {
    const viewerId = request.query.viewer_id?.trim();
    const candidateVersion = request.query.candidate_version?.trim();
    if (!viewerId || !candidateVersion) {
      return reply.status(400).send({
        error: "viewer_id and candidate_version are required",
      });
    }

    const limit = Math.min(100, Math.max(1, parseInt(request.query.limit ?? "20", 10) || 20));
    const offset = Math.max(0, parseInt(request.query.offset ?? "0", 10) || 0);

    const [activeConfig, candidateConfig] = await Promise.all([
      getActiveRankingConfig(),
      getRankingConfigByVersion(candidateVersion),
    ]);
    if (!candidateConfig) {
      return reply.status(404).send({ error: "candidate config not found" });
    }

    const [currentItems, candidateItems] = await Promise.all([
      getFeedWithDebug(viewerId, limit, offset, {
        config: activeConfig.config,
        configVersion: activeConfig.version,
        skipCache: true,
        disableServeLogging: true,
      }),
      getFeedWithDebug(viewerId, limit, offset, {
        config: candidateConfig.config,
        configVersion: candidateConfig.version,
        skipCache: true,
        disableServeLogging: true,
      }),
    ]);

    return reply.send({
      viewer_id: viewerId,
      current: {
        version: activeConfig.version,
        name: activeConfig.name,
        items: currentItems,
      },
      candidate: {
        version: candidateConfig.version,
        name: candidateConfig.name,
        items: candidateItems,
      },
    });
    }
  );
}
