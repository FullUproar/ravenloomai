/**
 * UploadService - Handles file uploads and storage
 * Uses Vercel Blob in production (when configured), local storage otherwise
 */

import db from '../db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Check if Vercel Blob is configured
const USE_BLOB_STORAGE = !!process.env.BLOB_READ_WRITE_TOKEN;

// Lazy load @vercel/blob only when needed
let blobModule = null;
async function getBlobModule() {
  if (!blobModule && USE_BLOB_STORAGE) {
    blobModule = await import('@vercel/blob');
  }
  return blobModule;
}

// Local storage fallback for development
const IS_SERVERLESS = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;
const UPLOAD_DIR = IS_SERVERLESS
  ? '/tmp/uploads'
  : path.join(__dirname, '..', 'uploads');

// Lazy directory creation - only when needed for local storage
let uploadDirCreated = false;
function ensureUploadDir() {
  if (!uploadDirCreated && !fs.existsSync(UPLOAD_DIR)) {
    try {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      uploadDirCreated = true;
    } catch (err) {
      console.error('Failed to create upload directory:', err);
      throw new Error('File upload not available in this environment');
    }
  }
}

// Allowed image types
const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp'
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Generate a unique filename
 */
function generateFilename(originalName, mimeType) {
  const ext = path.extname(originalName) || getExtensionFromMime(mimeType);
  const uniqueId = crypto.randomBytes(16).toString('hex');
  return `${uniqueId}${ext}`;
}

/**
 * Get file extension from mime type
 */
function getExtensionFromMime(mimeType) {
  const map = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp'
  };
  return map[mimeType] || '';
}

/**
 * Save file to Vercel Blob storage
 */
async function saveToBlob(buffer, filename, mimeType) {
  const { put } = await getBlobModule();
  const blob = await put(filename, buffer, {
    access: 'public',
    contentType: mimeType,
  });
  return blob.url;
}

/**
 * Save file to local storage
 */
function saveToLocal(buffer, filename) {
  ensureUploadDir();
  const storagePath = path.join(UPLOAD_DIR, filename);
  fs.writeFileSync(storagePath, buffer);
  const baseUrl = process.env.API_URL || 'http://localhost:4000';
  return {
    url: `${baseUrl}/uploads/${filename}`,
    storagePath
  };
}

/**
 * Save an uploaded file (from base64 or buffer)
 */
export async function saveFile(userId, teamId, { data, originalName, mimeType }) {
  // Validate file type
  if (!ALLOWED_IMAGE_TYPES.includes(mimeType)) {
    throw new Error(`File type not allowed: ${mimeType}`);
  }

  // Decode base64 if needed
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'base64');

  // Validate file size
  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(`File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`);
  }

  // Generate unique filename
  const filename = generateFilename(originalName, mimeType);

  let url, storagePath, storageType;

  if (USE_BLOB_STORAGE) {
    // Use Vercel Blob for production
    console.log('Using Vercel Blob storage');
    url = await saveToBlob(buffer, filename, mimeType);
    storagePath = url; // For blob, storage path is the URL
    storageType = 'blob';
  } else {
    // Use local storage for development
    console.log('Using local file storage');
    const result = saveToLocal(buffer, filename);
    url = result.url;
    storagePath = result.storagePath;
    storageType = 'local';
  }

  // Save to database
  const result = await db.query(
    `INSERT INTO attachments (team_id, uploaded_by, filename, original_name, mime_type, file_size, storage_type, storage_path, url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [teamId, userId, filename, originalName, mimeType, buffer.length, storageType, storagePath, url]
  );

  return mapAttachment(result.rows[0]);
}

/**
 * Associate attachment with a message
 */
export async function attachToMessage(attachmentId, messageId) {
  await db.query(
    `UPDATE attachments SET message_id = $1 WHERE id = $2`,
    [messageId, attachmentId]
  );
  await db.query(
    `UPDATE messages SET has_attachments = TRUE WHERE id = $1`,
    [messageId]
  );
}

/**
 * Associate attachment with a team question answer
 */
export async function attachToQuestion(attachmentId, questionId) {
  await db.query(
    `UPDATE attachments SET team_question_id = $1 WHERE id = $2`,
    [questionId, attachmentId]
  );
}

/**
 * Get attachments for a message
 */
export async function getMessageAttachments(messageId) {
  const result = await db.query(
    `SELECT * FROM attachments WHERE message_id = $1 ORDER BY created_at`,
    [messageId]
  );
  return result.rows.map(mapAttachment);
}

/**
 * Get attachments for a team question
 */
export async function getQuestionAttachments(questionId) {
  const result = await db.query(
    `SELECT * FROM attachments WHERE team_question_id = $1 ORDER BY created_at`,
    [questionId]
  );
  return result.rows.map(mapAttachment);
}

/**
 * Delete an attachment
 */
export async function deleteAttachment(attachmentId, userId) {
  // Get attachment first
  const result = await db.query(
    `SELECT * FROM attachments WHERE id = $1`,
    [attachmentId]
  );

  if (!result.rows[0]) {
    throw new Error('Attachment not found');
  }

  const attachment = result.rows[0];

  // Only allow uploader to delete
  if (attachment.uploaded_by !== userId) {
    throw new Error('Not authorized to delete this attachment');
  }

  // Delete from storage
  if (attachment.storage_type === 'blob') {
    // Delete from Vercel Blob
    try {
      const { del } = await getBlobModule();
      await del(attachment.url);
    } catch (err) {
      console.error('Failed to delete from blob storage:', err);
    }
  } else if (attachment.storage_type === 'local' && fs.existsSync(attachment.storage_path)) {
    // Delete from local storage
    fs.unlinkSync(attachment.storage_path);
  }

  // Delete from database
  await db.query('DELETE FROM attachments WHERE id = $1', [attachmentId]);

  return true;
}

/**
 * Get file path for serving (local storage only)
 */
export function getFilePath(filename) {
  const filePath = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return filePath;
}

// Helper function
function mapAttachment(row) {
  if (!row) return null;
  return {
    id: row.id,
    teamId: row.team_id,
    uploadedBy: row.uploaded_by,
    filename: row.filename,
    originalName: row.original_name,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    storageType: row.storage_type,
    url: row.url,
    messageId: row.message_id,
    teamQuestionId: row.team_question_id,
    width: row.width,
    height: row.height,
    thumbnailUrl: row.thumbnail_url,
    createdAt: row.created_at
  };
}

export default {
  saveFile,
  attachToMessage,
  attachToQuestion,
  getMessageAttachments,
  getQuestionAttachments,
  deleteAttachment,
  getFilePath
};
