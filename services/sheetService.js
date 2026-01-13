/**
 * Service to save extracted data to CSV/Excel sheets
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

class SheetService {
    constructor() {
        // Directory to store exported sheets
        this.exportDir = path.join(__dirname, '../../exports');

        // In Vercel/Serverless environment, use /tmp
        if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
            this.exportDir = '/tmp/exports';
        }

        try {
            this.ensureExportDir();
        } catch (error) {
            console.warn(`⚠️ Failed to create export directory at ${this.exportDir}, using fallback path.`);
            // Fallback to OS temp directory
            this.exportDir = path.join(require('os').tmpdir(), 'voice-agent-exports');
            this.ensureExportDir();
        }
    }

    /**
     * Ensure export directory exists
     */
    ensureExportDir() {
        if (!fs.existsSync(this.exportDir)) {
            fs.mkdirSync(this.exportDir, { recursive: true });
        }
    }

    /**
     * Save extracted doctor data to CSV file
     * @param {Array} dataArray - Array of extracted doctor information objects
     * @param {string} filename - Optional filename (default: doctor_data_YYYY-MM-DD.csv)
     * @returns {string} Path to saved file
     */
    saveToCSV(dataArray, filename = null) {
        if (!Array.isArray(dataArray) || dataArray.length === 0) {
            throw new Error('Data array is required and must not be empty');
        }

        // Generate filename if not provided
        if (!filename) {
            const date = new Date().toISOString().split('T')[0];
            filename = `doctor_data_${date}.csv`;
        }

        // Ensure .csv extension
        if (!filename.endsWith('.csv')) {
            filename += '.csv';
        }

        const filePath = path.join(this.exportDir, filename);

        // CSV Headers
        const headers = [
            'Doctor Name',
            'Clinic/Hospital Name',
            'Phone Number',
            'Email ID',
            'City',
            'Call Date',
            'Call Time',
            'Execution ID'
        ];

        // Convert data to CSV rows
        const csvRows = [headers.join(',')];

        dataArray.forEach(item => {
            const row = [
                this.escapeCSV(item.doctor_name || ''),
                this.escapeCSV(item.clinic_hospital_name || ''),
                this.escapeCSV(item.phone_number || ''),
                this.escapeCSV(item.email_id || ''),
                this.escapeCSV(item.city || ''),
                item.call_date || '',
                item.call_time || '',
                item.execution_id || ''
            ];
            csvRows.push(row.join(','));
        });

        // Write to file
        const csvContent = csvRows.join('\n');
        fs.writeFileSync(filePath, csvContent, 'utf8');

        console.log(`✅ Saved ${dataArray.length} records to ${filePath}`);
        return filePath;
    }

    /**
     * Append data to existing CSV file or create new one
     * @param {Object} data - Single doctor information object
     * @param {string} filename - CSV filename
     * @returns {string} Path to file
     */
    appendToCSV(data, filename = 'doctor_data.csv') {
        if (!filename.endsWith('.csv')) {
            filename += '.csv';
        }

        const filePath = path.join(this.exportDir, filename);
        const headers = [
            'Doctor Name',
            'Clinic/Hospital Name',
            'Phone Number',
            'Email ID',
            'City',
            'Call Date',
            'Call Time',
            'Execution ID'
        ];

        // Check if file exists
        const fileExists = fs.existsSync(filePath);

        if (!fileExists) {
            // Create new file with headers
            fs.writeFileSync(filePath, headers.join(',') + '\n', 'utf8');
        }

        // Append data row
        const row = [
            this.escapeCSV(data.doctor_name || ''),
            this.escapeCSV(data.clinic_hospital_name || ''),
            this.escapeCSV(data.phone_number || ''),
            this.escapeCSV(data.email_id || ''),
            this.escapeCSV(data.city || ''),
            data.call_date || '',
            data.call_time || '',
            data.execution_id || ''
        ];

        fs.appendFileSync(filePath, row.join(',') + '\n', 'utf8');
        return filePath;
    }

    /**
     * Escape CSV values (handle commas, quotes, newlines)
     */
    escapeCSV(value) {
        if (!value) return '';

        const stringValue = String(value);

        // If value contains comma, quote, or newline, wrap in quotes and escape quotes
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
            return `"${stringValue.replace(/"/g, '""')}"`;
        }

        return stringValue;
    }

    /**
     * Get all CSV files in export directory
     * @returns {Array} Array of file info objects
     */
    listCSVFiles() {
        if (!fs.existsSync(this.exportDir)) {
            return [];
        }

        const files = fs.readdirSync(this.exportDir)
            .filter(file => file.endsWith('.csv'))
            .map(file => {
                const filePath = path.join(this.exportDir, file);
                const stats = fs.statSync(filePath);
                return {
                    filename: file,
                    path: filePath,
                    size: stats.size,
                    created: stats.birthtime,
                    modified: stats.mtime
                };
            })
            .sort((a, b) => b.modified - a.modified); // Most recent first

        return files;
    }

    /**
     * Read CSV file and return as array of objects
     * @param {string} filename - CSV filename
     * @returns {Array} Array of data objects
     */
    readCSV(filename) {
        if (!filename.endsWith('.csv')) {
            filename += '.csv';
        }

        const filePath = path.join(this.exportDir, filename);

        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filename}`);
        }

        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());

        if (lines.length === 0) {
            return [];
        }

        // Parse headers
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));

        // Parse data rows
        const data = [];
        for (let i = 1; i < lines.length; i++) {
            const values = this.parseCSVLine(lines[i]);
            const row = {};
            headers.forEach((header, index) => {
                row[header] = values[index] || '';
            });
            data.push(row);
        }

        return data;
    }

    /**
     * Parse a CSV line handling quoted values
     */
    parseCSVLine(line) {
        const values = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];

            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    // Escaped quote
                    current += '"';
                    i++;
                } else {
                    // Toggle quote state
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                // End of value
                values.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }

        // Add last value
        values.push(current.trim());

        return values;
    }

    /**
     * Delete a CSV file
     * @param {string} filename - CSV filename
     * @returns {boolean} Success status
     */
    deleteCSV(filename) {
        if (!filename.endsWith('.csv')) {
            filename += '.csv';
        }

        const filePath = path.join(this.exportDir, filename);

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            return true;
        }

        return false;
    }

    /**
     * Send extracted data to Google Apps Script Webhook
     * @param {Object} data - Data to send
     * @returns {Promise<boolean>} Success status
     */
    async sendToGoogleAppsScript(data) {
        try {
            const scriptUrl = process.env.GOOGLE_SCRIPT_URL;

            if (!scriptUrl) {
                console.warn('⚠️ GOOGLE_SCRIPT_URL not set in environment variables. Skipping Google Sheet upload.');
                return false;
            }

            // Ensure we have data
            if (!data) {
                return false;
            }

            console.log('📤 Sending data to Google Sheets via Webhook...');

            const response = await axios.post(scriptUrl, data, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.data && response.data.status === 'success') {
                console.log('✅ Successfully sent data to Google Sheet');
                return true;
            } else {
                console.error('❌ Google Apps Script returned error:', response.data);
                return false;
            }
        } catch (error) {
            console.error('❌ Failed to send data to Google Apps Script:', error.message);
            return false;
        }
    }
}

module.exports = new SheetService();

