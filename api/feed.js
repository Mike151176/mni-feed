module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const URLS = {
    malaga: 'https://www.mikenaumannimmobilien.com/de/browser/s1?quick_search%5BfullLoc%5D=%7B%22c%22%3A%5B290672%5D%7D',
    marbella: 'https://www.mikenaumannimmobilien.com/de/browser/s1?quick_search%5BfullLoc%5D=%7B%22c%22%3A%5B290691%5D%7D',
    estepona: 'https://www.mikenaumannimmobilien.com/de/browser/s1?quick_search%5BfullLoc%5D=%7B%22c%22%3A%5B290516%5D%7D',
    malagaprovincia: 'https://www.mikenaumannimmobilien.com/de/browser/s1?quick_search%5BfullLoc%5D=%7B%22p%22%3A%5B29%5D%7D'
  };

  const city = String(req.query.city || 'malaga').toLowerCase();
  const TARGET_URL = URLS[city] || URLS.malaga;

  const fetchText = async (url) => {
    const r = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0'
      }
    });
    return await r.text();
  };

  const BASE = 'https://www.mikenaumannimmobilien.com';

  const extractLinks = (html) => {
    const links = new Set();
    const regex = /href="([^"]*\/de\/[^"]*\/s2)"/gi;

    let m;
    while ((m = regex.exec(html)) !== null) {
      let url = m[1];
      if (!url.startsWith('http')) url = BASE + url;
      links.add(url);
    }

    return [...links];
  };

  const clean = (str = '') =>
    str.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

  const parseDetail = async (url) => {
    try {
      const html = await fetchText(url);

      const titleMatch =
        html.match(/<title>(.*?)<\/title>/i) ||
        html.match(/<h1.*?>(.*?)<\/h1>/i);

      const title = clean(titleMatch ? titleMatch[1] : 'Immobilie');

      const priceMatch = html.match(/([\d\.]+)\s?€/);
      const price = priceMatch ? parseInt(priceMatch[1].replace(/\./g, '')) : 0;

      const imgMatch = html.match(/property_\d+.*?\.jpg/);
      const image = imgMatch
        ? 'https://mikenaumannimmobilien.com/' + imgMatch[0]
        : '';

      return {
        title,
        price,
        location: city,
        url,
        image,
        beds: 0,
        baths: 0,
        size: 0,
        description: title
      };
    } catch {
      return null;
    }
  };

  try {
    const listHtml = await fetchText(TARGET_URL);
    const links = extractLinks(listHtml).slice(0, 50);

    const results = [];

    for (const url of links) {
      const item = await parseDetail(url);
      if (item) results.push(item);
    }

    res.status(200).json(results);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
