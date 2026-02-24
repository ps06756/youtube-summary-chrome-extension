/**
 * Summarize a transcript using either Anthropic or an OpenAI-compatible API.
 *
 * @param {{ provider: 'anthropic'|'openai', apiKey: string, baseUrl?: string }} config
 * @param {string} transcript
 * @returns {Promise<string>} Summary in markdown
 */
async function summarizeTranscript(config, transcript) {
  const MAX_CHARS = 100000;
  const truncated =
    transcript.length > MAX_CHARS
      ? transcript.slice(0, MAX_CHARS) + '\n\n[Transcript truncated due to length]'
      : transcript;

  const systemPrompt =
    'You are a helpful assistant that summarizes YouTube video transcripts. ' +
    'Provide a clear, well-structured summary with the following sections:\n' +
    '1. **Overview** - A 2-3 sentence summary of the video.\n' +
    '2. **Key Points** - Bullet points of the main ideas.\n' +
    '3. **Takeaways** - 2-3 actionable or notable takeaways.\n\n' +
    'Be concise and informative. Use markdown formatting.';

  const userMessage = `Please summarize the following YouTube video transcript:\n\n${truncated}`;

  if (config.provider === 'anthropic') {
    return await callAnthropic(config.apiKey, config.model, systemPrompt, userMessage);
  } else {
    return await callOpenAI(config.apiKey, config.baseUrl, config.model, systemPrompt, userMessage);
  }
}

async function callAnthropic(apiKey, model, systemPrompt, userMessage) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: model || 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      temperature: 1,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`API error (${response.status}): ${err?.error?.message || 'Unknown error'}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

async function callOpenAI(apiKey, baseUrl, model, systemPrompt, userMessage) {
  const url = baseUrl.replace(/\/$/, '') + '/chat/completions';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || 'kimi-k2-0905-preview',
      temperature: 1,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`API error (${response.status}): ${err?.error?.message || 'Unknown error'}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}
