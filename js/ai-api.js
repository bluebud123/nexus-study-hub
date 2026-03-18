// ═══════════════════════════════════════════════════
//  Nexus — AI API Client (Bring Your Own Key)
//  Supports: Anthropic Claude, OpenAI, Google Gemini
// ═══════════════════════════════════════════════════

export const AiAPI = {

  // Call the AI with a prompt using the user's stored key + provider
  async ask(systemPrompt, userPrompt) {
    const { aiProvider, aiApiKey } = (window.Store?.get() || {});
    if (!aiApiKey) throw new Error('No API key configured. Add one in Settings → AI.');
    const provider = aiProvider || 'anthropic';

    if (provider === 'anthropic') return this._anthropic(aiApiKey, systemPrompt, userPrompt);
    if (provider === 'openai')    return this._openai(aiApiKey, systemPrompt, userPrompt);
    if (provider === 'gemini')    return this._gemini(aiApiKey, systemPrompt, userPrompt);
    throw new Error(`Unknown provider: ${provider}`);
  },

  async _anthropic(key, system, user) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || res.statusText); }
    const data = await res.json();
    return data.content?.[0]?.text || '';
  },

  async _openai(key, system, user) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 600,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      }),
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || res.statusText); }
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  },

  async _gemini(key, system, user) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${system}\n\n${user}` }] }],
        generationConfig: { maxOutputTokens: 600 },
      }),
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error?.message || res.statusText); }
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  },
};
