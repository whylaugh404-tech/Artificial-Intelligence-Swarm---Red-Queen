const apiKey = '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';
fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'google/gemini-2.5-flash',
    max_tokens: 2000,
    messages: [{ role: 'user', content: 'Hello' }]
  })
}).then(r => r.json()).then(console.log).catch(console.error);
