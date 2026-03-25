export default async function handler(req, res) {
  const feedUrl = "https://feedout.resales-online.com/1025084/kyero-plus/kyero/3.0/1861/Mike-Naumann-Immobilien-Kyero-Plus.xml";

  try {
    const response = await fetch(feedUrl);
    const xmlText = await response.text();

    const properties = [];
    const items = xmlText.split("<property>");

    items.forEach((item) => {
      if (!item.includes("</property>")) return;

      const get = (tag) => {
        const match = item.match(new RegExp(`<${tag}>(.*?)</${tag}>`));
        return match ? match[1] : "";
      };

      const location = (get("town") + " " + get("area")).toLowerCase();

      // 👉 Málaga Filter
      if (!location.includes("malaga")) return;

      const imageMatch = item.match(/<image>.*?<url>(.*?)<\/url>/s);
      const image = imageMatch ? imageMatch[1] : "";

      properties.push({
        title: get("type"),
        price: parseInt(get("price")) || 0,
        location: location,
        beds: parseInt(get("beds")) || 0,
        baths: parseInt(get("baths")) || 0,
        url: get("url"),
        image: image,
        description: get("description"),
      });
    });

    res.status(200).json(properties);
  } catch (error) {
    res.status(500).json({ error: "Feed error" });
  }
}
