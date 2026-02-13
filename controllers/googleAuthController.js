/**
 * Google OAuth Controller
 * Handles OAuth flow and Google Sheets connection
 */

const Client = require('../models/Client');
const googleSheetsService = require('../services/googleSheetsService');
const encryptionService = require('../services/encryptionService');

class GoogleAuthController {
    /**
     * Initiate OAuth flow - redirect user to Google
     */
    async initiateOAuth(req, res) {
        try {
            const authUrl = googleSheetsService.getAuthUrl();

            // Store user ID in session or as state parameter
            const state = Buffer.from(JSON.stringify({
                userId: req.clientId.toString()
            })).toString('base64');

            const urlWithState = `${authUrl}&state=${state}`;

            res.json({ authUrl: urlWithState });
        } catch (error) {
            console.error('Error initiating OAuth:', error);
            res.status(500).json({ error: 'Failed to initiate Google authentication' });
        }
    }

    /**
     * Handle OAuth callback from Google
     */
    async handleCallback(req, res) {
        try {
            const { code, state } = req.query;

            if (!code) {
                return res.status(400).send('Authorization code not provided');
            }

            // Decode state to get user ID
            let userId;
            try {
                const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
                userId = stateData.userId;
            } catch (err) {
                return res.status(400).send('Invalid state parameter');
            }

            // Exchange code for tokens
            const tokens = await googleSheetsService.getTokensFromCode(code);

            // Find user and update with encrypted tokens
            const client = await Client.findById(userId);
            if (!client) {
                return res.status(404).send('User not found');
            }

            // Encrypt and store tokens
            client.google_access_token = encryptionService.encrypt(tokens.access_token);
            if (tokens.refresh_token) {
                client.google_refresh_token = encryptionService.encrypt(tokens.refresh_token);
            }
            if (tokens.expiry_date) {
                client.google_token_expiry = new Date(tokens.expiry_date);
            }
            client.google_authorized = true;

            await client.save();

            // Debug logging
            const fs = require('fs');
            fs.appendFileSync('debug_auth.txt', `${new Date().toISOString()} - OAuth Callback success for user ${userId}. Sheet ID is: ${client.google_sheet_id}\n`);

            // Redirect to frontend with success
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
            res.redirect(`${frontendUrl}/dashboard?google_auth=success`);
        } catch (error) {
            console.error('Error in OAuth callback:', error);
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
            res.redirect(`${frontendUrl}/dashboard?google_auth=error`);
        }
    }

    /**
     * Save Google Sheet ID and validate access
     */
    async saveSheetId(req, res) {
        try {
            const { sheetId } = req.body;

            if (!sheetId || typeof sheetId !== 'string') {
                return res.status(400).json({ error: 'Sheet ID is required' });
            }

            // Validate Sheet ID format (should be alphanumeric with possible hyphens/underscores)
            const sheetIdRegex = /^[a-zA-Z0-9_-]+$/;
            if (!sheetIdRegex.test(sheetId)) {
                return res.status(400).json({ error: 'Invalid Sheet ID format' });
            }

            const client = await Client.findById(req.clientId);

            // Debug logging
            const fs = require('fs');
            fs.appendFileSync('debug_auth.txt', `${new Date().toISOString()} - Saving Sheet ID ${sheetId} for client ${req.clientId}\n`);

            // Update Sheet ID regardless of auth status
            client.google_sheet_id = sheetId;
            await client.save();

            fs.appendFileSync('debug_auth.txt', `${new Date().toISOString()} - Saved Sheet ID. Now checking auth: ${client.google_authorized}\n`);

            // Check if user is authorized with Google
            if (!client.google_authorized) {
                return res.status(400).json({
                    error: 'Please connect your Google account first',
                    needsAuth: true
                });
            }

            // Validate we can access the sheet
            try {
                const sheetInfo = await googleSheetsService.validateSheetAccess(client);

                res.json({
                    success: true,
                    message: 'Sheet ID saved and validated',
                    sheetInfo,
                });
            } catch (error) {
                // Save failed, revert
                client.google_sheet_id = null;
                await client.save();

                throw new Error(`Cannot access Sheet: ${error.message}`);
            }
        } catch (error) {
            console.error('Error saving Sheet ID:', error);
            res.status(400).json({ error: error.message || 'Failed to save Sheet ID' });
        }
    }

    /**
     * Disconnect Google account
     */
    async disconnect(req, res) {
        try {
            const client = await Client.findById(req.clientId);

            client.google_sheet_id = null;
            client.google_access_token = null;
            client.google_refresh_token = null;
            client.google_token_expiry = null;
            client.google_authorized = false;

            await client.save();

            res.json({ success: true, message: 'Google account disconnected' });
        } catch (error) {
            console.error('Error disconnecting Google:', error);
            res.status(500).json({ error: 'Failed to disconnect Google account' });
        }
    }

    /**
     * Get connection status
     */
    async getStatus(req, res) {
        try {
            const client = await Client.findById(req.clientId);

            const status = {
                connected: client.google_authorized || false,
                sheetId: client.google_sheet_id || null,
                sheetUrl: client.google_sheet_id
                    ? `https://docs.google.com/spreadsheets/d/${client.google_sheet_id}`
                    : null,
            };

            res.json(status);
        } catch (error) {
            console.error('Error getting Google status:', error);
            res.status(500).json({ error: 'Failed to get connection status' });
        }
    }
}

module.exports = new GoogleAuthController();
