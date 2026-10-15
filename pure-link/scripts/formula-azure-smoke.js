#!/usr/bin/env node
// Live smoke test for the Microsoft Foundry / Azure OpenAI formula provider.
//
// Usage (run from pure-link/):
//   AZURE_OPENAI_ENDPOINT=... AZURE_OPENAI_API_KEY=... AZURE_OPENAI_DEPLOYMENT=... \
//     node scripts/formula-azure-smoke.js
//
// The three environment names match theproduction Wrangler secret names. The
// script never prints or logs any configuration value; it only reports the
// sanitized outcome. One single inference request is sent per run.

import { runAzureOpenAIFormulaProvider } from '../src/formula-provider.js';

const CONFIG = {
  endpoint: process.env.AZURE_OPENAI_ENDPOINT,
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  deployment: process.env.AZURE_OPENAI_DEPLOYMENT,
};

if (!CONFIG.endpoint?.trim() || !CONFIG.apiKey?.trim() || !CONFIG.deployment?.trim()) {
  console.log(JSON.stringify({ ok: false, reason: 'configuration incomplete', missing: [
    !CONFIG.endpoint?.trim() && 'AZURE_OPENAI_ENDPOINT',
    !CONFIG.apiKey?.trim() && 'AZURE_OPENAI_API_KEY',
    !CONFIG.deployment?.trim() && 'AZURE_OPENAI_DEPLOYMENT',
  ].filter(Boolean) }));
  process.exit(1);
}

try {
  const startedAt = Date.now();
  const result = await runAzureOpenAIFormulaProvider({
    ...CONFIG,
    description: 'The mass–energy equivalence relation between mass m and energy E.',
  });
  const { latex, needs_context } = result.output;
  const contractValid = Object.keys(result.output).sort().join(',') === 'latex,needs_context'
    && typeof latex === 'string'
    && typeof needs_context === 'boolean';

  console.log(JSON.stringify({
    ok: contractValid && !needs_context,
    provider: result.provider,
    deployment: result.model,
    latex: contractValid ? latex : null,
    durationMs: Date.now() - startedAt,
  }, null, 2));
  process.exit(contractValid && !needs_context ? 0 : 1);
} catch (error) {
  console.log(JSON.stringify({
    ok: false,
    name: error?.name ?? 'unknown',
    category: error?.category ?? null,
    status: typeof error?.status === 'number' ? error.status : null,
  }));
  process.exit(1);
}
