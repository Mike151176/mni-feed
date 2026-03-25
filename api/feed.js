export default async function handler(req, res) {
  const FEED_URL = 'HIER_DEINE_XML_URL';

  try {
    const response = await fetch(FEED_URL);
    const text = await response.text();

    return res.status(200).json({
      success: true,
      preview: text.substring(0, 2000) // zeigt ersten Teil vom XML
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
