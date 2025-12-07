/**
 * GIF Service - Tenor API integration
 * Provides GIF search functionality
 *
 * Requires TENOR_API_KEY environment variable (Google Cloud API key with Tenor API enabled)
 * Get one at: https://console.cloud.google.com/apis/library/tenor.googleapis.com
 */

// Tenor API key - required for functionality
const TENOR_API_KEY = process.env.TENOR_API_KEY;
const TENOR_CLIENT_KEY = 'ravenloom';

class GifService {
  static checkApiKey() {
    if (!TENOR_API_KEY) {
      console.warn('TENOR_API_KEY not set - GIF functionality disabled');
      return false;
    }
    return true;
  }

  static async search(query, limit = 20) {
    if (!this.checkApiKey()) {
      return []; // Return empty array if API key not configured
    }

    try {
      const params = new URLSearchParams({
        q: query,
        key: TENOR_API_KEY,
        client_key: TENOR_CLIENT_KEY,
        limit: limit.toString(),
        media_filter: 'gif,tinygif'
      });

      const response = await fetch(`https://tenor.googleapis.com/v2/search?${params}`);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        console.error(`Tenor API error: ${response.status}`, errorBody);
        // Return empty array on error instead of throwing
        return [];
      }

      const data = await response.json();

      return data.results.map(gif => ({
        id: gif.id,
        title: gif.title || gif.content_description || '',
        url: gif.media_formats.gif?.url || gif.media_formats.mediumgif?.url || gif.url,
        previewUrl: gif.media_formats.tinygif?.url || gif.media_formats.nanogif?.url,
        width: gif.media_formats.gif?.dims?.[0] || 0,
        height: gif.media_formats.gif?.dims?.[1] || 0
      }));
    } catch (error) {
      console.error('Tenor search error:', error);
      throw error;
    }
  }

  static async getTrending(limit = 20) {
    if (!this.checkApiKey()) {
      return []; // Return empty array if API key not configured
    }

    try {
      const params = new URLSearchParams({
        key: TENOR_API_KEY,
        client_key: TENOR_CLIENT_KEY,
        limit: limit.toString(),
        media_filter: 'gif,tinygif'
      });

      const response = await fetch(`https://tenor.googleapis.com/v2/featured?${params}`);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        console.error(`Tenor API error: ${response.status}`, errorBody);
        return [];
      }

      const data = await response.json();

      return data.results.map(gif => ({
        id: gif.id,
        title: gif.title || gif.content_description || '',
        url: gif.media_formats.gif?.url || gif.media_formats.mediumgif?.url || gif.url,
        previewUrl: gif.media_formats.tinygif?.url || gif.media_formats.nanogif?.url,
        width: gif.media_formats.gif?.dims?.[0] || 0,
        height: gif.media_formats.gif?.dims?.[1] || 0
      }));
    } catch (error) {
      console.error('Tenor trending error:', error);
      throw error;
    }
  }

  static async getCategories() {
    if (!this.checkApiKey()) {
      return [];
    }

    try {
      const params = new URLSearchParams({
        key: TENOR_API_KEY,
        client_key: TENOR_CLIENT_KEY
      });

      const response = await fetch(`https://tenor.googleapis.com/v2/categories?${params}`);

      if (!response.ok) {
        return [];
      }

      const data = await response.json();

      return data.tags.map(cat => ({
        name: cat.searchterm,
        imageUrl: cat.image
      }));
    } catch (error) {
      console.error('Tenor categories error:', error);
      throw error;
    }
  }
}

export default GifService;
