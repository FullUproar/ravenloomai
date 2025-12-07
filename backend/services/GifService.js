/**
 * GIF Service - Tenor API integration
 * Provides GIF search functionality
 */

// Tenor API key (free tier - 50 requests/day for anonymous, more with key)
const TENOR_API_KEY = process.env.TENOR_API_KEY || 'AIzaSyABVzHyK0Vz-pKRxBqpZ3K2c_KCv0XspHk';
const TENOR_CLIENT_KEY = 'ravenloom';

class GifService {
  static async search(query, limit = 20) {
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
        throw new Error(`Tenor API error: ${response.status}`);
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
    try {
      const params = new URLSearchParams({
        key: TENOR_API_KEY,
        client_key: TENOR_CLIENT_KEY,
        limit: limit.toString(),
        media_filter: 'gif,tinygif'
      });

      const response = await fetch(`https://tenor.googleapis.com/v2/featured?${params}`);

      if (!response.ok) {
        throw new Error(`Tenor API error: ${response.status}`);
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
    try {
      const params = new URLSearchParams({
        key: TENOR_API_KEY,
        client_key: TENOR_CLIENT_KEY
      });

      const response = await fetch(`https://tenor.googleapis.com/v2/categories?${params}`);

      if (!response.ok) {
        throw new Error(`Tenor API error: ${response.status}`);
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
