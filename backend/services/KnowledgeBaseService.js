/**
 * KnowledgeBaseService - Manages linked external sources (Google Drive folders, etc.)
 * for team knowledge bases
 */

import db from '../db.js';
import GoogleDriveService from './GoogleDriveService.js';

class KnowledgeBaseService {

  /**
   * Get all knowledge base sources for a team
   */
  static async getSources(teamId) {
    const result = await db.query(`
      SELECT kbs.*, u.email, u.display_name, u.avatar_url
      FROM knowledge_base_sources kbs
      LEFT JOIN users u ON kbs.added_by = u.id
      WHERE kbs.team_id = $1
      ORDER BY kbs.created_at DESC
    `, [teamId]);

    return result.rows.map(row => this.formatSource(row));
  }

  /**
   * Get documents for a team, optionally filtered by source
   */
  static async getDocuments(teamId, sourceId = null) {
    let query = `
      SELECT * FROM knowledge_base_documents
      WHERE team_id = $1
    `;
    const params = [teamId];

    if (sourceId) {
      query += ` AND source_id = $2`;
      params.push(sourceId);
    }

    query += ` ORDER BY title ASC`;

    const result = await db.query(query, params);
    return result.rows.map(row => this.formatDocument(row));
  }

  /**
   * Check if a source (folder/file) is already in the knowledge base
   */
  static async isInKnowledgeBase(teamId, provider, sourceId) {
    const result = await db.query(`
      SELECT id FROM knowledge_base_sources
      WHERE team_id = $1 AND provider = $2 AND source_id = $3
    `, [teamId, provider, sourceId]);

    return result.rows.length > 0;
  }

  /**
   * Add a folder or file to the knowledge base
   */
  static async addSource(teamId, userId, input) {
    const { provider, sourceType, sourceId, sourceName, sourcePath, sourceMimeType, sourceUrl } = input;

    // Check if already exists
    const existing = await this.isInKnowledgeBase(teamId, provider, sourceId);
    if (existing) {
      throw new Error('This item is already in your knowledge base');
    }

    const result = await db.query(`
      INSERT INTO knowledge_base_sources
        (team_id, provider, source_type, source_id, source_name, source_path, source_mime_type, source_url, added_by, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
      RETURNING *
    `, [teamId, provider, sourceType, sourceId, sourceName, sourcePath, sourceMimeType, sourceUrl, userId]);

    const source = this.formatSource(result.rows[0]);

    // Trigger initial sync in background (don't await)
    this.syncSource(teamId, source.id, userId).catch(err => {
      console.error('Background sync failed:', err);
    });

    return source;
  }

  /**
   * Remove a source from the knowledge base
   */
  static async removeSource(teamId, sourceId) {
    // This will cascade delete related documents
    const result = await db.query(`
      DELETE FROM knowledge_base_sources
      WHERE id = $1 AND team_id = $2
      RETURNING id
    `, [sourceId, teamId]);

    return result.rows.length > 0;
  }

  /**
   * Sync a knowledge base source - fetch files and extract content
   */
  static async syncSource(teamId, sourceId, userId) {
    // Get source info
    const sourceResult = await db.query(`
      SELECT * FROM knowledge_base_sources WHERE id = $1 AND team_id = $2
    `, [sourceId, teamId]);

    if (sourceResult.rows.length === 0) {
      throw new Error('Source not found');
    }

    const source = sourceResult.rows[0];

    // Update status to syncing
    await db.query(`
      UPDATE knowledge_base_sources SET status = 'syncing', sync_error = NULL WHERE id = $1
    `, [sourceId]);

    let documentsAdded = 0;
    let documentsUpdated = 0;
    const errors = [];

    try {
      if (source.provider === 'google_drive') {
        // Get user who added this source (for API access)
        const addedByUserId = source.added_by || userId;

        if (source.source_type === 'folder') {
          // List all files in the folder
          const filesResult = await GoogleDriveService.listFiles(addedByUserId, {
            folderId: source.source_id,
            pageSize: 100 // Get up to 100 files
          });

          for (const file of filesResult.files || []) {
            try {
              const result = await this.syncDocument(teamId, sourceId, addedByUserId, file);
              if (result === 'added') documentsAdded++;
              if (result === 'updated') documentsUpdated++;
            } catch (err) {
              console.error(`Error syncing file ${file.name}:`, err.message);
              errors.push(`${file.name}: ${err.message}`);
            }
          }
        } else {
          // Single file - get metadata and sync
          try {
            const metadata = await GoogleDriveService.getFileMetadata(addedByUserId, source.source_id);
            const result = await this.syncDocument(teamId, sourceId, addedByUserId, metadata);
            if (result === 'added') documentsAdded++;
            if (result === 'updated') documentsUpdated++;
          } catch (err) {
            // For single files, if we can't access it, mark as error
            console.error(`Error syncing single file ${source.source_name}:`, err.message);
            errors.push(err.message);
            // Mark single file source as error immediately
            await db.query(`
              UPDATE knowledge_base_sources
              SET status = 'error', sync_error = $2, last_synced_at = NOW()
              WHERE id = $1
            `, [sourceId, err.message]);

            return {
              source: this.formatSource({ ...source, status: 'error', sync_error: err.message }),
              documentsAdded: 0,
              documentsUpdated: 0,
              errors: [err.message]
            };
          }
        }
      }

      // Update source status
      await db.query(`
        UPDATE knowledge_base_sources
        SET status = 'synced',
            last_synced_at = NOW(),
            file_count = $2,
            sync_error = $3
        WHERE id = $1
      `, [sourceId, documentsAdded + documentsUpdated, errors.length > 0 ? errors.join('; ') : null]);

    } catch (err) {
      console.error('Sync error:', err);
      await db.query(`
        UPDATE knowledge_base_sources SET status = 'error', sync_error = $2 WHERE id = $1
      `, [sourceId, err.message]);

      throw err;
    }

    // Get updated source
    const updatedResult = await db.query(`SELECT * FROM knowledge_base_sources WHERE id = $1`, [sourceId]);

    return {
      source: this.formatSource(updatedResult.rows[0]),
      documentsAdded,
      documentsUpdated,
      errors: errors.length > 0 ? errors : null
    };
  }

  /**
   * Sync a single document - extract content and store
   */
  static async syncDocument(teamId, sourceId, userId, fileMetadata) {
    const { id: externalId, name: title, mimeType, webViewLink } = fileMetadata;

    // Check if document already exists
    const existing = await db.query(`
      SELECT id, content_hash FROM knowledge_base_documents
      WHERE team_id = $1 AND external_id = $2
    `, [teamId, externalId]);

    // Skip folders
    if (mimeType === 'application/vnd.google-apps.folder') {
      return 'skipped';
    }

    // Try to extract content (for supported file types)
    let content = null;
    console.log(`[KB Sync] Processing "${title}" (mimeType: ${mimeType})`);

    try {
      // Only extract content from Google Docs, Sheets, etc.
      if (mimeType.startsWith('application/vnd.google-apps.')) {
        console.log(`[KB Sync] Extracting content from Google Apps file: ${mimeType}`);
        content = await GoogleDriveService.getFileContent(userId, externalId, mimeType);
        console.log(`[KB Sync] Extracted ${content?.length || 0} chars from "${title}"`);
      } else {
        console.log(`[KB Sync] Skipping content extraction for non-Google-Apps file: ${mimeType}`);
      }
    } catch (err) {
      console.error(`[KB Sync] Content extraction FAILED for ${title}: ${err.message}`);
    }

    // Calculate content hash for change detection
    const contentHash = content ? this.hashContent(content) : null;

    if (existing.rows.length > 0) {
      // Update if content changed
      if (contentHash !== existing.rows[0].content_hash) {
        await db.query(`
          UPDATE knowledge_base_documents
          SET title = $2, mime_type = $3, external_url = $4, content = $5, content_hash = $6, last_synced_at = NOW()
          WHERE id = $1
        `, [existing.rows[0].id, title, mimeType, webViewLink, content, contentHash]);
        return 'updated';
      }
      return 'unchanged';
    } else {
      // Insert new document
      await db.query(`
        INSERT INTO knowledge_base_documents
          (team_id, source_id, external_id, title, mime_type, external_url, content, content_hash, last_synced_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      `, [teamId, sourceId, externalId, title, mimeType, webViewLink, content, contentHash]);
      return 'added';
    }
  }

  /**
   * Simple hash for content change detection
   */
  static hashContent(content) {
    if (!content) return null;
    // Simple hash - in production use crypto
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  /**
   * Search knowledge base documents for RAG
   */
  static async searchDocuments(teamId, query, limit = 5) {
    // Extract keywords from query (words 3+ chars, excluding common words)
    const stopWords = ['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'has', 'her', 'was', 'one', 'our', 'out', 'what', 'who', 'how', 'why', 'when', 'where', 'which', 'this', 'that', 'with', 'from', 'about', 'into', 'does', 'tell', 'know'];
    const keywords = query.toLowerCase()
      .split(/\s+/)
      .filter(word => word.length >= 3 && !stopWords.includes(word));

    console.log(`[KB Search] Query: "${query}", Keywords: [${keywords.join(', ')}]`);

    // Build OR conditions for each keyword
    let result;
    if (keywords.length > 0) {
      // Search for any keyword match
      const keywordConditions = keywords.map((_, i) => `title ILIKE $${i + 2} OR content ILIKE $${i + 2}`).join(' OR ');
      const keywordParams = keywords.map(k => `%${k}%`);

      result = await db.query(`
        SELECT id, title, content, external_url, mime_type
        FROM knowledge_base_documents
        WHERE team_id = $1
          AND content IS NOT NULL
          AND (${keywordConditions})
        ORDER BY updated_at DESC
        LIMIT $${keywords.length + 2}
      `, [teamId, ...keywordParams, limit]);

      console.log(`[KB Search] Keyword search found ${result.rows.length} docs`);
    }

    // If no keyword results, fall back to returning ALL documents with content
    if (!result || result.rows.length === 0) {
      console.log(`[KB Search] No keyword matches, returning all docs with content`);
      result = await db.query(`
        SELECT id, title, content, external_url, mime_type
        FROM knowledge_base_documents
        WHERE team_id = $1 AND content IS NOT NULL
        ORDER BY updated_at DESC
        LIMIT $2
      `, [teamId, limit]);
      console.log(`[KB Search] Fallback found ${result.rows.length} docs`);
    }

    return result.rows;
  }

  /**
   * Format database row to GraphQL type
   */
  static formatSource(row) {
    return {
      id: row.id,
      teamId: row.team_id,
      provider: row.provider,
      sourceType: row.source_type,
      sourceId: row.source_id,
      sourceName: row.source_name,
      sourcePath: row.source_path,
      sourceMimeType: row.source_mime_type,
      sourceUrl: row.source_url,
      status: row.status,
      lastSyncedAt: row.last_synced_at,
      syncError: row.sync_error,
      fileCount: row.file_count,
      addedBy: row.added_by ? {
        id: row.added_by,
        email: row.email,
        displayName: row.display_name,
        avatarUrl: row.avatar_url
      } : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  static formatDocument(row) {
    return {
      id: row.id,
      sourceId: row.source_id,
      externalId: row.external_id,
      title: row.title,
      mimeType: row.mime_type,
      externalUrl: row.external_url,
      hasContent: !!row.content,
      lastSyncedAt: row.last_synced_at,
      createdAt: row.created_at
    };
  }
}

export default KnowledgeBaseService;
