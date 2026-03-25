export default async function handler(req, res) {
  const FEED_URL = 'https://feedout.resales-online.com/1025084/kyero-plus/kyero/3.0/1861/Mike-Naumann-Immobilien-Kyero-Plus.xml';

  try {
    const response = await fetch(FEED_URL);
    const text = await response.text();

    return res.status(200).json({
      success: true,
      preview: text.substring(0, 2000)
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
