// Vercel Serverless Function: /api/fetch-comps
// Searches the web (via Google Custom Search) for sales of a specific card,
// then uses Gemini to extract prices and dates from the results.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const googleKey = process.env.GOOGLE_API_KEY;
  const cseId = process.env.GOOGLE_CSE_ID;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!googleKey) {
    res.status(500).json({ error: 'Server is missing GOOGLE_API_KEY. Add it in Vercel project settings.' });
    return;
  }
  if (!cseId) {
    res.status(500).json({ error: 'Server is missing GOOGLE_CSE_ID. Add it in Vercel project settings.' });
    return;
  }
  if (!geminiKey) {
    res.status(500).json({ error: 'Server is missing GEMINI_API_KEY.' });
    return;
  }

  try {
    const { card } = req.body || {};
    if (!card || !card.player) {
      res.status(400).json({ error: 'Missing card details' });
      return;
    }

    // Build a focused search query
    const parts = [
      card.year,
      card.set,
      card.player,
      card.cardNumber ? `#${card.cardNumber}` : '',
      card.parallel,
      card.condition && card.condition !== 'Raw' ? card.condition : '',
    ].filter(Boolean);

    const query = `${parts.join(' ')} sold`.trim();

    // Google Custom Search JSON API — free tier: 100 queries/day, hard-capped (no auto-bill)
    const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${googleKey}&cx=${cseId}&q=${encodeURIComponent(query)}&num=10`;

    const searchRes = await fetch(searchUrl);

    if (!searchRes.ok) {
      const errText = await searchRes.text();
      console.error('Google CSE error:', searchRes.status, errText);
      let userMsg;
      if (searchRes.status === 429) userMsg = 'Daily search limit reached (100/day). Try again tomorrow.';
      else if (searchRes.status === 403) userMsg = 'Search API access denied. Check that Custom Search API is enabled in Google Cloud Console.';
      else userMsg = `Search returned ${searchRes.status}. Check your Google API key and Search Engine ID.`;
      res.status(502).json({ error: userMsg });
      return;
    }

    const searchData = await searchRes.json();
    const results = searchData.items || [];

    if (results.length === 0) {
      res.status(200).json({ ok: true, comps: [], query, message: 'No search results found for this card.' });
      return;
    }

    // Build context for Gemini
    const resultsText = results
      .slice(0, 10)
      .map(
        (r, i) =>
          `[${i + 1}] Title: ${r.title}\nURL: ${r.link}\nSnippet: ${r.snippet || ''}\n`,
      )
      .join('\n');

    const today = new Date().toISOString().slice(0, 10);

    const prompt = `You are analyzing web search results to find recent eBay sale prices for a specific sports card.

The card we're looking for:
- Player: ${card.player}
- Year: ${card.year || 'unknown'}
- Set: ${card.set}
- Card Number: ${card.cardNumber || 'any'}
- Parallel: ${card.parallel || 'base (no parallel)'}
- Condition: ${card.condition}

Search results to analyze:
${resultsText}

Extract every sold price you can identify that clearly matches the card above. BE STRICT about condition matching (Raw and PSA 10 have very different prices — don't mix them).

Return JSON in this exact format:
{
  "comps": [
    {
      "price": 123.45,
      "date": "2024-12-15",
      "title": "the listing title for context",
      "confidence": "high"
    }
  ]
}

Rules:
- price: number in USD, no $ sign, no commas
- date: YYYY-MM-DD format. If "3 days ago" or similar, calculate from today (${today}). If no date is shown at all, use ${today}.
- confidence: "high" if the listing clearly matches all card details including condition, "medium" if some details are unclear, "low" if it's a questionable match
- Skip any result without a visible price
- Skip any result that's clearly a different card (different parallel, different grade, different player)
- Skip active/current listings — only include sold/completed sales
- If no valid sold comps found, return {"comps": []}`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;

    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2000,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini error:', geminiRes.status, errText);
      res.status(502).json({
        error: `Gemini returned ${geminiRes.status}. ${geminiRes.status === 503 ? 'AI servers busy — try again in a moment.' : 'Check your Gemini API key.'}`,
      });
      return;
    }

    const geminiData = await geminiRes.json();
    const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      res.status(502).json({ error: 'AI returned no content.' });
      return;
    }

    // Robust parsing
    const tryParse = (s) => {
      try {
        return JSON.parse(s);
      } catch {
        return null;
      }
    };
    let parsed = tryParse(text.trim());
    if (!parsed) {
      const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
      parsed = tryParse(cleaned);
    }
    if (!parsed) {
      const first = text.indexOf('{');
      const last = text.lastIndexOf('}');
      if (first !== -1 && last !== -1 && last > first) {
        parsed = tryParse(text.slice(first, last + 1));
      }
    }

    if (!parsed || !Array.isArray(parsed.comps)) {
      console.error('Parse failed:', text.slice(0, 400));
      res.status(502).json({ error: 'AI response could not be parsed.' });
      return;
    }

    const comps = parsed.comps
      .filter((c) => typeof c.price === 'number' && c.price > 0 && c.price < 1000000)
      .map((c) => ({
        price: Math.round(c.price * 100) / 100,
        date: /^\d{4}-\d{2}-\d{2}$/.test(c.date) ? c.date : today,
        title: typeof c.title === 'string' ? c.title.slice(0, 200) : '',
        confidence: ['high', 'medium', 'low'].includes(c.confidence) ? c.confidence : 'medium',
      }))
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    res.status(200).json({ ok: true, comps, query, resultCount: results.length });
  } catch (e) {
    console.error('Handler error:', e);
    res.status(500).json({ error: 'Server error: ' + (e.message || 'unknown') });
  }
}
