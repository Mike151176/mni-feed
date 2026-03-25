module.exports = async (req, res) => {
  const LIST_URL =
    "https://www.mikenaumannimmobilien.com/de/browser/s1?quick_search%5BpropertyTypes%5D=%7B%22g1%22%3A%7B%22tp%22%3A%5B%5D%2C%22tpe%22%3A%5B%5D%2C%22c%22%3Afalse%7D%2C%22g2%22%3A%7B%22tp%22%3A%5B%5D%2C%22tpe%22%3A%5B%5D%2C%22c%22%3Afalse%7D%2C%22g4%22%3A%7B%22tp%22%3A%5B%5D%2C%22tpe%22%3A%5B%5D%2C%22c%22%3Afalse%7D%2C%22g8%22%3A%7B%22tp%22%3A%5B%5D%2C%22tpe%22%3A%5B%5D%2C%22c%22%3Afalse%7D%2C%22g16%22%3A%7B%22tp%22%3A%5B%5D%2C%22tpe%22%3A%5B%5D%2C%22c%22%3Afalse%7D%2C%22text%22%3A%22%22%7D&quick_search%5BfullLoc%5D=%7B%22p%22%3A%5B%5D%2C%22c%22%3A%5B290672%5D%2C%22d%22%3A%5B%5D%2C%22q%22%3A%5B%5D%2C%22text%22%3A%22M%C3%A1laga%22%7D&quick_search%5B_token%5D=BPD70yIFxFFZAUxmX_vu_loN4ufvEKsOsXopp5EeV7I";

  const BASE = "https://www.mikenaumannimmobilien.com";

  const decodeHtml = (str = "") =>
    String(str)
      .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
      .trim();

  const stripTags = (str = "") =>
    decodeHtml(str)
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const toAbs = (url = "") => {
    if (!url) return "";
    if (url.startsWith("http")) return url;
    if (url.startsWith("//")) return "https:" + url;
    return BASE + (url.startsWith("/") ? url : "/" + url);
  };

  const fetchText = async (url) => {
    const response = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36",
        accept: "text/html,application/xhtml+xml"
      }
    });
    return await response.text();
  };

  const extractListingLinks = (html) => {
    const links = new Set();
    const pattern = /href="([^"]*\/de\/[^"]*zum-verkauf-in-malaga\/[^"]*\/s2)"/gi;

    let match;
    while ((match = pattern.exec(html)) !== null) {
      links.add(toAbs(match[1]));
    }

    return [...links];
  };

  const titleFromUrl = (url) => {
    const slug = url.split("/de/")[1]?.split("/s2")[0] || "";
    return slug
      .replace(/-zum-verkauf-in-malaga/gi, "")
      .replace(/-/g, " ")
      .replace(/\b\w/g, (m) => m.toUpperCase())
      .trim();
  };

  const inferType = (title, url) => {
    const text = `${title} ${url}`.toLowerCase();
    if (text.includes("apartment") || text.includes("appartment")) return "Apartment";
    if (text.includes("penthouse")) return "Penthouse";
    if (text.includes("villa")) return "Villa";
    if (text.includes("finca")) return "Finca";
    if (text.includes("townhouse") || text.includes("adosado")) return "Townhouse";
    return "Immobilie";
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

    return "";
  };

  const pickDescription = (html, fallbackTitle) => {
    const meta =
      html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i) ||
      html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i);

    const text = stripTags(meta ? meta[1] : "");
    if (!text || /verwendung von cookies/i.test(text)) return fallbackTitle;
    return text;
  };

  const parseDetail = (url, html) => {
    const rawTitle =
      html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i) ||
      html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ||
      html.match(/<title>([\s\S]*?)<\/title>/i);

    let title = stripTags(rawTitle ? rawTitle[1] : "");
    if (!title || /verwendung von cookies/i.test(title)) {
      title = titleFromUrl(url);
    }

    title = title
      .replace(/\s*\|\s*Mike Naumann Immobilien.*$/i, "")
      .replace(/\s*-\s*Mike Naumann Immobilien.*$/i, "")
      .trim();

    const priceMatch =
      html.match(/(\d{1,3}(?:\.\d{3})+)\s*€/i) ||
      html.match(/(\d{3,7})\s*€/i);

    const price = priceMatch ? Number(priceMatch[1].replace(/\./g, "")) : 0;

    const bedsMatch =
      html.match(/(\d+)\s*(?:Schlafzimmer|bedrooms|habitaciones|hab\.)/i);
    const bathsMatch =
      html.match(/(\d+)\s*(?:Badezimmer|bathrooms|baños)/i);
    const m2Match = html.match(/(\d+)\s*m(?:²|2)/i);

    return {
      title,
      price,
      location: "Málaga",
      type: inferType(title, url),
      beds: bedsMatch ? Number(bedsMatch[1]) : 0,
      baths: bathsMatch ? Number(bathsMatch[1]) : 0,
      size: m2Match ? Number(m2Match[1]) : 0,
      url,
      image: pickImage(html),
      description: pickDescription(html, title)
    };
  };

  try {
    const listHtml = await fetchText(LIST_URL);
    const links = extractListingLinks(listHtml);
    const uniqueLinks = [...new Set(links)].slice(0, 24);

    const properties = [];
    for (const url of uniqueLinks) {
      try {
        const detailHtml = await fetchText(url);
        const item = parseDetail(url, detailHtml);
        if (item.title) properties.push(item);
      } catch (err) {
        // broken detail pages skippen
      }
    }

    res.setHeader("Content-Type", "application/json");
    res.status(200).json(properties);
  } catch (error) {
    res.status(500).json({
      error: "Website scrape error",
      message: error.message
    });
  }
};
