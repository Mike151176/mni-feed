module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const BASE = 'https://www.mikenaumannimmobilien.com';

  const REGION_URLS = {
    malaga:
      'https://www.mikenaumannimmobilien.com/de/browser/s1?quick_search%5BfullLoc%5D=%7B%22p%22%3A%5B%5D%2C%22c%22%3A%5B290672%5D%2C%22d%22%3A%5B%5D%2C%22q%22%3A%5B%5D%2C%22text%22%3A%22M%C3%A1laga%22%7D',

    marbella:
      'https://www.mikenaumannimmobilien.com/de/browser/s1?quick_search%5BfullLoc%5D=%7B%22p%22%3A%5B%5D%2C%22c%22%3A%5B290648%5D%2C%22d%22%3A%5B%5D%2C%22q%22%3A%5B%5D%2C%22text%22%3A%22Marbella%22%7D',

    estepona:
      'https://www.mikenaumannimmobilien.com/de/browser/s1?quick_search%5BfullLoc%5D=%7B%22p%22%3A%5B%5D%2C%22c%22%3A%5B290697%5D%2C%22d%22%3A%5B%5D%2C%22q%22%3A%5B%5D%2C%22text%22%3A%22Estepona%22%7D',

    malagaprovincia:
      'https://www.mikenaumannimmobilien.com/de/immobilien/s1/5588'
  };

  const REGION_NAMES = {
    malaga: 'Málaga',
    marbella: 'Marbella',
    estepona: 'Estepona',
    malagaprovincia: 'Málaga Provinz'
  };

  const city = String(req.query.city || 'malaga').toLowerCase();
  const LIST_URL = REGION_URLS[city] || REGION_URLS.malaga;
  const REGION_NAME = REGION_NAMES[city] || REGION_NAMES.malaga;

  const decodeHtml = (str = '') =>
    String(str)
      .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
      .trim();

  const stripTags = (str = '') =>
    decodeHtml(str)
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const normalize = (str = '') =>
    stripTags(str)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  const toAbs = (url = '') => {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    if (url.startsWith('//')) return 'https:' + url;
    return BASE + (url.startsWith('/') ? url : '/' + url);
  };

  const fetchText = async (url) => {
    const response = await fetch(url, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36',
        accept: 'text/html,application/xhtml+xml'
      }
    });
    return await response.text();
  };

  const extractListingLinks = (html) => {
    const links = new Set();
    const patterns = [
      /href="([^"]*\/de\/[^"]*\/s2)"/gi,
      /href="([^"]*\/de\/[^"]*zum-verkauf[^"]*\/s2)"/gi
    ];

    patterns.forEach((pattern) => {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        const url = toAbs(match[1]);
        if (/\/de\//i.test(url) && /\/s2$/i.test(url)) {
          links.add(url);
        }
      }
    });

    return [...links];
  };

  const titleFromUrl = (url) => {
    const slug = url.split('/de/')[1]?.split('/s2')[0] || '';
    return slug
      .replace(/\/\d+$/, '')
      .replace(/-zum-verkauf-in-[^/]+/gi, '')
      .replace(/-zu-verkauf-in-[^/]+/gi, '')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (m) => m.toUpperCase())
      .trim();
  };

  const inferType = (title, url) => {
    const text = `${title} ${url}`.toLowerCase();
    if (text.includes('apartment') || text.includes('appartment')) return 'Apartment';
    if (text.includes('penthouse')) return 'Penthouse';
    if (text.includes('villa')) return 'Villa';
    if (text.includes('finca')) return 'Finca';
    if (text.includes('townhouse') || text.includes('adosado')) return 'Townhouse';
    if (text.includes('studio')) return 'Studio';
    return 'Immobilie';
  };

  const pickImage = (html) => {
    const patterns = [
      /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i,
      /<meta[^>]+name="twitter:image"[^>]+content="([^"]+)"/i,
      /<img[^>]+src="([^"]*property_[^"]+\.(?:jpg|jpeg|png|webp))"/i,
      /<img[^>]+data-src="([^"]*property_[^"]+\.(?:jpg|jpeg|png|webp))"/i
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) return toAbs(decodeHtml(match[1]));
    }

    return '';
  };

  const pickDescription = (html, fallbackTitle) => {
    const meta =
      html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i) ||
      html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i);

    const text = stripTags(meta ? meta[1] : '');
    if (!text || /verwendung von cookies/i.test(text)) return fallbackTitle;
    return text;
  };

  const parseDetail = (url, html, locationName) => {
    const rawTitle =
      html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i) ||
      html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ||
      html.match(/<title>([\s\S]*?)<\/title>/i);

    let title = stripTags(rawTitle ? rawTitle[1] : '');
    if (!title || /verwendung von cookies/i.test(title)) {
      title = titleFromUrl(url);
    }

    title = title
      .replace(/\s*\|\s*Mike Naumann Immobilien.*$/i, '')
      .replace(/\s*-\s*Mike Naumann Immobilien.*$/i, '')
      .trim();

    const priceMatch =
      html.match(/(\d{1,3}(?:\.\d{3})+)\s*€/i) ||
      html.match(/(\d{3,7})\s*€/i);

    const price = priceMatch ? Number(priceMatch[1].replace(/\./g, '')) : 0;

    const bedsMatch =
      html.match(/(\d+)\s*(?:Schlafzimmer|bedrooms|habitaciones|hab\.)/i);
    const bathsMatch =
      html.match(/(\d+)\s*(?:Badezimmer|bathrooms|baños)/i);
    const m2Match = html.match(/(\d+)\s*m(?:²|2)/i);

    return {
      title,
      price,
      location: locationName,
      type: inferType(title, url),
      beds: bedsMatch ? Number(bedsMatch[1]) : 0,
      baths: bathsMatch ? Number(bathsMatch[1]) : 0,
      size: m2Match ? Number(m2Match[1]) : 0,
      url,
      image: pickImage(html),
      description: pickDescription(html, title)
    };
  };

  const isMalagaProvinceUrl = (url) => {
    const text = normalize(url);
    return (
      text.includes('/archidona/') ||
      text.includes('/benahavis/') ||
      text.includes('/benalmadena/') ||
      text.includes('/casares/') ||
      text.includes('/estepona/') ||
      text.includes('/fuengirola/') ||
      text.includes('/malaga/') ||
      text.includes('/manilva/') ||
      text.includes('/marbella/') ||
      text.includes('/mijas/') ||
      text.includes('/nerja/') ||
      text.includes('/ojen/') ||
      text.includes('/rincon-de-la-victoria/') ||
      text.includes('/torremolinos/') ||
      text.includes('/velez-malaga/') ||
      text.includes('/frigiliana/') ||
      text.includes('/competa/') ||
      text.includes('/antequera/') ||
      text.includes('/canete-la-real/') ||
      text.includes('/villanueva-de-algaidas/') ||
      text.includes('/moraleda-de-zafayona/')
    );
  };

  try {
    const listHtml = await fetchText(LIST_URL);
    const links = extractListingLinks(listHtml);

    let filteredLinks = links;

    if (city === 'malagaprovincia') {
      filteredLinks = links.filter(isMalagaProvinceUrl);
    }

    const uniqueLinks = [...new Set(filteredLinks.length ? filteredLinks : links)].slice(0, 80);

    const properties = [];
    for (const url of uniqueLinks) {
      try {
        const detailHtml = await fetchText(url);
        const item = parseDetail(url, detailHtml, REGION_NAME);
        properties.push(item);
      } catch (err) {}
    }

    res.setHeader('Content-Type', 'application/json');
    res.status(200).json(properties);
  } catch (error) {
    res.status(500).json({
      error: 'Website scrape error',
      message: error.message
    });
  }
};
