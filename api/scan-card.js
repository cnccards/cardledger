// Vercel Serverless Function: /api/scan-card
// Uses Google Gemini (free tier) to identify sports cards from photos.
// API key lives safely on Vercel's server, never in the browser.

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

    // Parse data URL: "data:image/jpeg;base64,XXXXXX"
    const match = imageDataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) {
      res.status(400).json({ error: 'Invalid image format' });
      return;
    }
    const mediaType = match[1];
    const base64Data = match[2];

    const prompt = `You are a sports card identification expert. Analyze this image of a sports card and extract these details. Return ONLY a JSON object (no markdown, no code fences, no explanation), with exactly these fields:

{
  "player": "full player name, or empty string if unclear",
  "year": 2018,
  "set": "card set/brand name like 'Topps Chrome' or 'Panini Prizm', or empty string",
  "cardNumber": "card number as printed (the # on the card), or empty string",
  "parallel": "parallel/insert variant if any (Refractor, Silver Prizm, etc.), or empty string",
  "condition": "one of: Raw, PSA 10, PSA 9, PSA 8, BGS 10, BGS 9.5, BGS 9, SGC 10, SGC 9.5, CGC 10, Other. Use Raw if not in a graded slab. Look for slab labels.",
  "confidence": "one of: high, medium, low",
  "notes": "any extra observations like 'rookie card', 'autograph', 'numbered /99', or empty string"
}

The "year" field must be a number (or null if unclear), all others are strings. Be conservative — if you can't read a field clearly, leave it blank rather than guessing.`;

    // Gemini API endpoint - using gemini-flash-latest (free tier, vision-capable)
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;

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
          maxOutputTokens: 500,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!apiResponse.ok) {
      const errText = await apiResponse.text();
      console.error('Gemini API error:', apiResponse.status, errText);
      res.status(502).json({
        error: `Gemini API returned ${apiResponse.status}. Check your API key and that it's enabled at aistudio.google.com.`,
      });
      return;
    }

    const data = await apiResponse.json();

    // Gemini response shape: data.candidates[0].content.parts[0].text
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.error('Unexpected Gemini response:', JSON.stringify(data).slice(0, 500));
      res.status(502).json({ error: 'Gemini returned no text content' });
      return;
    }

    // Strip markdown fences just in case (responseMimeType should prevent these, but defensive)
    let raw = text.trim();
    raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.error('Parse failed for:', raw);
      res.status(502).json({ error: 'Could not parse AI response as JSON' });
      return;
    }

    res.status(200).json({ ok: true, card: parsed });
  } catch (e) {
    console.error('Handler error:', e);
    res.status(500).json({ error: 'Server error: ' + (e.message || 'unknown') });
  }
}
