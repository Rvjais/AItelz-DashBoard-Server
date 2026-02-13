/**
 * Encryption utilities for securing sensitive data like OAuth tokens
 */

const crypto = require('crypto');

class EncryptionService {
    constructor() {
        this.algorithm = 'aes-256-gcm';
        // Ensure ENCRYPTION_KEY is 32 bytes (64 hex characters)
        const encryptionKey = process.env.ENCRYPTION_KEY;

        if (!encryptionKey) {
            console.warn('⚠️  ENCRYPTION_KEY not set! Using temporary key. DO NOT USE IN PRODUCTION!');
            // Generate temporary key for development
            this.key = crypto.randomBytes(32);
        } else if (encryptionKey.length !== 64) {
            throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
        } else {
            this.key = Buffer.from(encryptionKey, 'hex');
        }
    }

    /**
     * Encrypt text using AES-256-GCM
     * @param {string} text - Plain text to encrypt
     * @returns {string} Encrypted text in format: iv:authTag:encrypted
     */
    encrypt(text) {
        if (!text) return null;

        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        const authTag = cipher.getAuthTag();

        // Return in format: iv:authTag:encrypted
        return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
    }

    /**
     * Decrypt text that was encrypted with encrypt()
     * @param {string} encryptedText - Encrypted text in format: iv:authTag:encrypted
     * @returns {string} Decrypted plain text
     */
    decrypt(encryptedText) {
        if (!encryptedText) return null;

        try {
            const parts = encryptedText.split(':');
            if (parts.length !== 3) {
                throw new Error('Invalid encrypted text format');
            }

            const iv = Buffer.from(parts[0], 'hex');
            const authTag = Buffer.from(parts[1], 'hex');
            const encrypted = parts[2];

            const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
            decipher.setAuthTag(authTag);

            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');

            return decrypted;
        } catch (error) {
            console.error('Decryption error:', error.message);
            return null;
        }
    }

    /**
     * Generate a new 32-byte encryption key
     * @returns {string} Hex-encoded 32-byte key
     */
    static generateKey() {
        return crypto.randomBytes(32).toString('hex');
    }
}

module.exports = new EncryptionService();
