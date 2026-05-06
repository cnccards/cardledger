// Vercel Serverless Function: /api/scan-card
// Uses Google Gemini (free tier) to identify sports cards from photos.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: 'Server is missing GEMINI_API_KEY environment variable. Add it in Vercel project settings.',
    });
    return;
  }

  try {
    const { imageDataUrl } = req.body || {};
    if (!imageDataUrl || typeof imageDataUrl !== 'string') {
      res.status(400).json({ error: 'Missing imageDataUrl in request body' });
      return;
    }

    const match = imageDataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) {
      res.status(400).json({ error: 'Invalid image format' });
      return;
    }
    const mediaType = match[1];
    const base64Data = match[2];

    const prompt = `Identify this sports card and return ONLY a JSON object with these exact fields. Do not include any explanation, markdown, or code fences. Just the raw JSON object starting with { and ending with }.

Required fields:
- player (string): full player name, or "" if unclear
- year (number or null): 4-digit year, or null if unclear
- set (string): card brand/set like "Topps Chrome" or "Panini Prizm", or ""
- cardNumber (string): the # printed on the card, or ""
- parallel (string): variant like "Refractor", "Silver Prizm", or ""
- condition (string): one of "Raw", "PSA 10", "PSA 9", "PSA 8", "BGS 10", "BGS 9.5", "BGS 9", "SGC 10", "SGC 9.5", "CGC 10", "Other". Use "Raw" if not in a graded slab.
- confidence (string): "high", "medium", or "low"
- notes (string): observations like "rookie card", "autograph", "/99", or ""

Be conservative — leave fields blank rather than guessing.`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const apiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: mediaType,
                  data: base64Data,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 800,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            properties: {
              player: { type: 'string' },
              year: { type: 'integer', nullable: true },
              set: { type: 'string' },
              cardNumber: { type: 'string' },
              parallel: { type: 'string' },
              condition: { type: 'string' },
              confidence: { type: 'string' },
              notes: { type: 'string' },
            },
            required: ['player', 'set', 'condition', 'confidence'],
          },
        },
      }),
    });

    if (!apiResponse.ok) {
      const errText = await apiResponse.text();
      console.error('Gemini API error:', apiResponse.status, errText);
      res.status(502).json({
        error: `Gemini API returned ${apiResponse.status}. ${apiResponse.status === 503 ? 'Servers busy — try again in a moment.' : 'Check your API key at aistudio.google.com.'}`,
      });
      return;
    }

    const data = await apiResponse.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.error('Unexpected Gemini response:', JSON.stringify(data).slice(0, 500));
      res.status(502).json({ error: 'Gemini returned no text content' });
      return;
    }

    // Robust JSON extraction — try multiple strategies
    const tryParse = (s) => {
      try {
        return JSON.parse(s);
      } catch {
        return null;
      }
    };

    let parsed = tryParse(text.trim());

    // Strategy 2: strip markdown code fences
    if (!parsed) {
      let cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
      parsed = tryParse(cleaned);
    }

    // Strategy 3: extract substring between first { and last }
    if (!parsed) {
      const first = text.indexOf('{');
      const last = text.lastIndexOf('}');
      if (first !== -1 && last !== -1 && last > first) {
        parsed = tryParse(text.slice(first, last + 1));
      }
    }

    if (!parsed) {
      console.error('Could not parse Gemini output:', text.slice(0, 500));
      res.status(502).json({
        error: 'AI gave an unparseable response. Try a clearer photo or scan again.',
      });
      return;
    }

    res.status(200).json({ ok: true, card: parsed });
  } catch (e) {
    console.error('Handler error:', e);
    res.status(500).json({ error: 'Server error: ' + (e.message || 'unknown') });
  }
}
