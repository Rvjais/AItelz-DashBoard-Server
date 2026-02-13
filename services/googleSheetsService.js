/**
 * Google Sheets API Service
 * Handles OAuth authentication and Sheet operations
 */

const { google } = require('googleapis');
const encryptionService = require('./encryptionService');

class GoogleSheetsService {
    constructor() {
        this.clientId = process.env.GOOGLE_CLIENT_ID;
        this.clientSecret = process.env.GOOGLE_CLIENT_SECRET;
        this.redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/auth/google/callback';

        if (!this.clientId || !this.clientSecret) {
            console.warn('⚠️  Google OAuth credentials not configured. Google Sheets integration will not work.');
        }
    }

    /**
     * Create OAuth2 client
     */
    createOAuthClient() {
        return new google.auth.OAuth2(
            this.clientId,
            this.clientSecret,
            this.redirectUri
        );
    }

    /**
     * Generate OAuth URL for user authorization
     * @returns {string} Authorization URL
     */
    getAuthUrl() {
        const oauth2Client = this.createOAuthClient();

        const scopes = [
            'https://www.googleapis.com/auth/spreadsheets',
        ];

        return oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: scopes,
            prompt: 'consent', // Force consent to get refresh token
        });
    }

    /**
     * Exchange authorization code for tokens
     * @param {string} code - Authorization code from OAuth callback
     * @returns {Promise<Object>} Tokens object
     */
    async getTokensFromCode(code) {
        const oauth2Client = this.createOAuthClient();
        const { tokens } = await oauth2Client.getToken(code);
        return tokens;
    }

    /**
     * Create authenticated Sheets API client from stored tokens
     * @param {Object} client - Client document with OAuth tokens
     * @returns {Object} Google Sheets API client
     */
    async createSheetsClient(client) {
        // Refresh token if needed
        await this.refreshTokenIfNeeded(client);

        // Decrypt tokens
        const accessToken = encryptionService.decrypt(client.google_access_token);
        const refreshToken = encryptionService.decrypt(client.google_refresh_token);

        if (!accessToken) {
            throw new Error('Failed to decrypt access token');
        }

        const oauth2Client = this.createOAuthClient();
        oauth2Client.setCredentials({
            access_token: accessToken,
            refresh_token: refreshToken,
        });

        return google.sheets({ version: 'v4', auth: oauth2Client });
    }

    /**
     * Refresh access token if expired or about to expire
     * @param {Object} client - Client document
     */
    async refreshTokenIfNeeded(client) {
        if (!client.google_token_expiry) {
            return;
        }

        // Refresh if token expires in less than 5 minutes
        const expiryTime = new Date(client.google_token_expiry);
        const now = new Date();
        const fiveMinutes = 5 * 60 * 1000;

        if (expiryTime - now < fiveMinutes) {
            console.log('🔄 Refreshing Google access token...');

            const refreshToken = encryptionService.decrypt(client.google_refresh_token);
            if (!refreshToken) {
                throw new Error('No refresh token available');
            }

            const oauth2Client = this.createOAuthClient();
            oauth2Client.setCredentials({
                refresh_token: refreshToken,
            });

            const { credentials } = await oauth2Client.refreshAccessToken();

            // Update client with new tokens
            client.google_access_token = encryptionService.encrypt(credentials.access_token);
            if (credentials.expiry_date) {
                client.google_token_expiry = new Date(credentials.expiry_date);
            }
            await client.save();

            console.log('✅ Access token refreshed');
        }
    }

    /**
     * Validate that we can access the specified Sheet
     * @param {Object} client - Client document
     * @returns {Promise<Object>} Sheet metadata
     */
    async validateSheetAccess(client) {
        const sheets = await this.createSheetsClient(client);

        const response = await sheets.spreadsheets.get({
            spreadsheetId: client.google_sheet_id,
        });

        return {
            title: response.data.properties.title,
            url: response.data.spreadsheetUrl,
        };
    }

    /**
     * Create or update header row in Sheet
     * @param {Object} client - Client document
     * @param {Array<string>} headers - Array of header names
     * @returns {Promise<boolean>} Success status
     */
    async createHeaders(client, headers) {
        const sheets = await this.createSheetsClient(client);

        try {
            // Get the first sheet
            const spreadsheet = await sheets.spreadsheets.get({
                spreadsheetId: client.google_sheet_id,
            });

            const firstSheet = spreadsheet.data.sheets[0];
            const sheetId = firstSheet.properties.sheetId;

            // Clear existing content (optional - you may want to skip this)
            // await sheets.spreadsheets.values.clear({
            //     spreadsheetId: client.google_sheet_id,
            //     range: 'A1:ZZ',
            // });

            // Write headers to first row
            await sheets.spreadsheets.values.update({
                spreadsheetId: client.google_sheet_id,
                range: 'A1',
                valueInputOption: 'RAW',
                resource: {
                    values: [headers],
                },
            });

            // Format header row
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId: client.google_sheet_id,
                resource: {
                    requests: [
                        {
                            repeatCell: {
                                range: {
                                    sheetId: sheetId,
                                    startRowIndex: 0,
                                    endRowIndex: 1,
                                },
                                cell: {
                                    userEnteredFormat: {
                                        backgroundColor: {
                                            red: 1.0,
                                            green: 0.42,
                                            blue: 0.21,
                                        },
                                        textFormat: {
                                            foregroundColor: {
                                                red: 1.0,
                                                green: 1.0,
                                                blue: 1.0,
                                            },
                                            bold: true,
                                        },
                                    },
                                },
                                fields: 'userEnteredFormat(backgroundColor,textFormat)',
                            },
                        },
                        {
                            updateSheetProperties: {
                                properties: {
                                    sheetId: sheetId,
                                    gridProperties: {
                                        frozenRowCount: 1,
                                    },
                                },
                                fields: 'gridProperties.frozenRowCount',
                            },
                        },
                    ],
                },
            });

            console.log('✅ Headers created in Google Sheet');
            return true;
        } catch (error) {
            console.error('❌ Failed to create headers:', error.message);
            throw error;
        }
    }

    /**
     * Append a row of data to the Sheet
     * @param {Object} client - Client document
     * @param {Array} values - Array of values to append
     * @returns {Promise<boolean>} Success status
     */
    async appendRow(client, values) {
        const sheets = await this.createSheetsClient(client);

        try {
            await sheets.spreadsheets.values.append({
                spreadsheetId: client.google_sheet_id,
                range: 'A:A',
                valueInputOption: 'RAW',
                insertDataOption: 'INSERT_ROWS',
                resource: {
                    values: [values],
                },
            });

            console.log('✅ Row appended to Google Sheet');
            return true;
        } catch (error) {
            console.error('❌ Failed to append row:', error.message);
            throw error;
        }
    }
}

module.exports = new GoogleSheetsService();
