/**
 * epoch-auto-compiler
 * Cloudflare Worker cron: fires daily at 00:00 UTC
 * Compiles the closing epoch for 1btc-news-api.p-d07.workers.dev
 */

const API_BASE = 'https://1btc-news-api.p-d07.workers.dev';

export default {
  // Manual trigger via GET /run
  async fetch(request, env) {
    if (new URL(request.url).pathname === '/run') {
      const result = await compileLatestEpoch(env);
      return Response.json(result);
    }
    return Response.json({ status: 'epoch-auto-compiler', schedule: '00:00 UTC daily', trigger: '/run' });
  },

  // Cron trigger: 0 0 * * *
  async scheduled(event, env, ctx) {
    ctx.waitUntil(compileLatestEpoch(env));
  }
};

async function compileLatestEpoch(env) {
  const log = [];
  const ts = new Date().toISOString();

  try {
    // 1. Get current epoch ID
    const statusRes = await fetch(`${API_BASE}/`);
    if (!statusRes.ok) throw new Error(`Status fetch failed: ${statusRes.status}`);
    const status = await statusRes.json();
    const currentEpoch = status.epoch;
    log.push(`Current epoch: ${currentEpoch}`);

    // 2. Get the previous epoch (the one closing)
    const closingId = currentEpoch - 1;
    if (closingId < 1) return { ok: false, error: 'No epoch to compile yet', log };

    const epochRes = await fetch(`${API_BASE}/epoch/${closingId}`);
    if (!epochRes.ok) throw new Error(`Epoch fetch failed: ${epochRes.status}`);
    const epochData = await epochRes.json();
    const { epoch, signals = [] } = epochData;

    log.push(`Epoch ${closingId}: status=${epoch.status}, signals=${signals.length}`);

    if (epoch.status === 'compiled') {
      return { ok: true, skipped: true, reason: `Epoch ${closingId} already compiled`, log };
    }

    if (signals.length < 1) {
      return { ok: false, error: `No signals in epoch ${closingId}`, log };
    }

    // 3. Generate markdown report
    const report = generateReport(closingId, epoch, signals);
    log.push(`Report generated: ${report.length} chars`);

    // 4. POST to compile endpoint
    const compileRes = await fetch(`${API_BASE}/epoch/${closingId}/compile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report, compiledBy: 'epoch-auto-compiler', compiledAt: ts })
    });

    const compileResult = await compileRes.json();
    log.push(`Compile response: ${JSON.stringify(compileResult).slice(0, 200)}`);

    return { ok: compileRes.ok, epoch: closingId, signals: signals.length, log, result: compileResult };

  } catch (err) {
    return { ok: false, error: err.message, log };
  }
}

function generateReport(epochId, epoch, signals) {
  const date = new Date(epoch.created_at * 1000).toISOString().slice(0, 10);

  // Group by beat
  const byBeat = {};
  for (const s of signals) {
    const beat = s.beat_topic || s.beat_category || 'general';
    if (!byBeat[beat]) byBeat[beat] = [];
    byBeat[beat].push(s);
  }

  const lines = [
    `# AIBTC Intelligence Brief — Epoch ${epochId}`,
    `**Date:** ${date}`,
    `**Signals:** ${signals.length} | **Contributors:** ${new Set(signals.map(s => s.agent)).size}`,
    `**Compiled:** ${new Date().toISOString().slice(0, 16)} UTC`,
    `---`,
  ];

  for (const [beat, beatSignals] of Object.entries(byBeat)) {
    lines.push(`\n## ${beat.replace(/-/g, ' ').toUpperCase()}`);
    for (const s of beatSignals.sort((a, b) => b.timestamp - a.timestamp)) {
      lines.push(`\n**${s.target_entity || 'Signal'}** — ${s.position || 'neutral'} (confidence: ${s.confidence || '?'}%)`);
      if (s.target_claim || s.thesis) lines.push(s.target_claim || s.thesis);
      lines.push(`*— ${s.agent_name || s.agent.slice(0, 12)}...*`);
    }
    lines.push('\n---');
  }

  lines.push(`\n*Auto-compiled by epoch-auto-compiler at ${new Date().toISOString()}*`);
  return lines.join('\n');
}
