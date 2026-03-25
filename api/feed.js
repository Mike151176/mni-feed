export default async function handler(req, res) {
  const feedUrl =
    "https://feedout.resales-online.com/1025084/kyero-plus/kyero/3.0/1861/Mike-Naumann-Immobilien-Kyero-Plus.xml";

  const clean = (str = "") =>
    String(str)
      .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
      .trim();

  const normalize = (str = "") =>
    clean(str)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const getTag = (block, tag) => {
    const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
    return match ? clean(match[1]) : "";
  };

  const getFirstImage = (block) => {
    const patterns = [
      /<images>[\s\S]*?<image>[\s\S]*?<url>([\s\S]*?)<\/url>/i,
      /<image>[\s\S]*?<url>([\s\S]*?)<\/url>/i,
      /<photo>([\s\S]*?)<\/photo>/i,
      /<image>(https?:\/\/[\s\S]*?)<\/image>/i
    ];

    for (const pattern of patterns) {
      const match = block.match(pattern);
      if (match && match[1]) return clean(match[1]);
    }
    return "";
  };

  try {
    const response = await fetch(feedUrl);
    const xmlText = await response.text();

    const propertyBlocks = [...xmlText.matchAll(/<property>([\s\S]*?)<\/property>/gi)];

    const properties = propertyBlocks.map((match, index) => {
      const block = match[1];

      const town = getTag(block, "town");
      const area = getTag(block, "area");
      const location = getTag(block, "location");
      const province = getTag(block, "province");
      const region = getTag(block, "region");
      const type = getTag(block, "type") || getTag(block, "property_type");
      const title = getTag(block, "title") || type || `Property ${index + 1}`;
      const description = getTag(block, "description") || getTag(block, "desc");
      const url = getTag(block, "url") || getTag(block, "link");
      const image = getFirstImage(block);

      const locationBlob = normalize(
        [town, area, location, province, region, title, description].join(" ")
      );

      return {
        title,
        price: parseInt(getTag(block, "price").replace(/[^\d]/g, "")) || 0,
        location: [town, area, location, province, region].filter(Boolean).join(", "),
        beds: parseInt(getTag(block, "beds")) || parseInt(getTag(block, "bedrooms")) || 0,
        baths: parseInt(getTag(block, "baths")) || parseInt(getTag(block, "bathrooms")) || 0,
        url: url || "",
        image,
        description,
        locationBlob
      };
    });

    // Málaga-Filter robuster
    const malagaProperties = properties.filter((item) =>
      item.locationBlob.includes("malaga")
    );

    res.status(200).json(
      malagaProperties.map(({ locationBlob, ...item }) => item)
    );
  } catch (error) {
    res.status(500).json({
      error: "Feed error",
      message: error.message
    });
  }
}
