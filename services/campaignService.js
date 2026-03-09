const Campaign = require('../models/Campaign');
const Client = require('../models/Client');
const Agent = require('../models/Agent');
const Execution = require('../models/Execution');
const googleSheetsService = require('./googleSheetsService');
const bolnaService = require('./bolnaService');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to convert column index (0-based) to letter (A, B, C...)
function colIndexToLetter(index) {
    let letter = '';
    while (index >= 0) {
        letter = String.fromCharCode((index % 26) + 65) + letter;
        index = Math.floor(index / 26) - 1;
    }
    return letter;
}

class CampaignService {
    // Helper to get current Indian Standard Time (UTC + 5.5)
    getISTDate() {
        const now = new Date();
        return new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
    }

    // Process new rows in active campaigns
    async processActiveCampaigns() {
        console.log(`🔄 [${new Date().toISOString()}] Checking for new rows in active campaigns...`);
        try {
            const campaigns = await Campaign.find({ status: 'active' });
            if (campaigns.length === 0) return;

            for (const campaign of campaigns) {
                try {
                    await this.processCampaign(campaign);
                } catch (error) {
                    console.error(`❌ Failed to process campaign ${campaign.name}:`, error.message);
                }
            }
        } catch (error) {
            console.error('❌ Error processing active campaigns:', error);
        }
    }

    // Process a single campaign
    async processCampaign(campaign) {
        try {
            const istNow = this.getISTDate();

            // 0. Check scheduling (Compare with IST)
            if (campaign.scheduled_at && istNow < new Date(campaign.scheduled_at)) {
                console.log(`⏳ Campaign ${campaign.name} is scheduled for ${campaign.scheduled_at} IST. Current IST: ${istNow.toISOString()}. Skipping...`);
                return;
            }

            // Check active hours (Relative to IST)
            if (!this.isWithinActiveHours(campaign.active_hours)) {
                console.log(`🌙 Campaign ${campaign.name} is outside active hours (${campaign.active_hours?.start} - ${campaign.active_hours?.end}). Skipping...`);
                return;
            }

            const client = await Client.findById(campaign.client_id);
            if (!client || !client.google_authorized) return;

            const agent = await Agent.findById(campaign.agent_id);
            if (!agent) return;

            const sheets = await googleSheetsService.createSheetsClient(client);

            // 1. Get sheet info
            const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: campaign.google_sheet_id });
            const firstSheet = spreadsheet.data.sheets[0];
            const sheetName = firstSheet.properties.title;

            // 2. Read all data
            const rows = await googleSheetsService.readSheetData(client, campaign.google_sheet_id, `'${sheetName}'!A:ZZ`);
            if (!rows || rows.length === 0) {
                return;
            }

            const headers = rows[0];
            const phoneIdx = headers.findIndex(h => h.toLowerCase() === campaign.phone_column_name.toLowerCase());
            let execIdx = headers.findIndex(h => h.toLowerCase() === campaign.execution_column_name.toLowerCase());

            if (phoneIdx === -1) {
                console.error(`❌ Phone column "${campaign.phone_column_name}" not found in sheet`);
                return;
            }

            if (execIdx === -1) {
                // We need to add the execution column header
                execIdx = headers.length;
                const colLetter = colIndexToLetter(execIdx);
                await googleSheetsService.updateSheetCell(client, campaign.google_sheet_id, `'${sheetName}'!${colLetter}1`, campaign.execution_column_name);
                headers[execIdx] = campaign.execution_column_name; // Update local headers array
            }

            let retryIdx = headers.findIndex(h => h.toLowerCase() === (campaign.retries_column_name || 'retries').toLowerCase());
            if (retryIdx === -1) {
                retryIdx = headers.length;
                const colLetter = colIndexToLetter(retryIdx);
                await googleSheetsService.updateSheetCell(client, campaign.google_sheet_id, `'${sheetName}'!${colLetter}1`, campaign.retries_column_name || 'retries');
            }

            const execColLetter = colIndexToLetter(execIdx);
            const retryColLetter = colIndexToLetter(retryIdx);

            // 3. Process rows
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                const phone = row[phoneIdx];
                const execStatus = row[execIdx];

                // If phone exists and no execution status yet
                if (phone && (!execStatus || execStatus.trim() === '')) {
                    const cleanedPhone = this.formatPhoneNumber(phone);
                    if (!cleanedPhone) continue;

                    console.log(`📞 Campaign ${campaign.name}: Found new number ${cleanedPhone}. Initiating call...`);

                    try {
                        // Update sheet early to prevent duplicate calls if script crashes
                        await googleSheetsService.updateSheetCell(client, campaign.google_sheet_id, `'${sheetName}'!${execColLetter}${i + 1}`, 'Call Pending');

                        const retryIntervals = Array(campaign.max_retries).fill(campaign.retry_interval_minutes);

                        const retryConfig = {
                            enabled: campaign.max_retries > 0,
                            max_retries: Math.min(campaign.max_retries, 3), // AItelz limit is usually 3
                            retry_on_statuses: ['no-answer', 'busy', 'failed', 'error'],
                            retry_intervals_minutes: retryIntervals.slice(0, 3)
                        };

                        await bolnaService.initiateCall(agent.bolna_agent_id, cleanedPhone, retryConfig);

                        // Mark as Call Send and reset retries to 0 for initial call
                        await googleSheetsService.updateSheetCell(client, campaign.google_sheet_id, `'${sheetName}'!${execColLetter}${i + 1}`, 'Call Send');
                        await googleSheetsService.updateSheetCell(client, campaign.google_sheet_id, `'${sheetName}'!${retryColLetter}${i + 1}`, 0);

                        // Respect dial delay
                        if (campaign.dial_delay > 0) {
                            console.log(`⏱️ Waiting ${campaign.dial_delay}s before next call...`);
                            await sleep(campaign.dial_delay * 1000);
                        }
                    } catch (err) {
                        console.error(`❌ Campaign ${campaign.name}: Failed to call ${cleanedPhone}:`, err.message);
                        await googleSheetsService.updateSheetCell(client, campaign.google_sheet_id, `'${sheetName}'!${execColLetter}${i + 1}`, `Failed: ${err.message}`);
                    }
                }
            }

            // 4. Update stats for the dashboard
            let total = 0;
            let pending = 0;
            let completed = 0;

            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                const phone = row[phoneIdx];
                const status = row[execIdx] ? row[execIdx].toLowerCase() : '';

                if (phone && phone.toString().trim() !== '') {
                    total++;
                    if (status === '' || status === 'call pending') {
                        pending++;
                    } else if (status.includes('completed') || status.includes('send')) {
                        completed++;
                    }
                }
            }

            campaign.total_records = total;
            campaign.pending_records = pending;
            campaign.completed_records = completed;
            campaign.last_run_at = new Date();
            await campaign.save();

        } catch (error) {
            console.error(`❌ Campaign ${campaign.name} error:`, error.message);
            throw error;
        }
    }

    // Sync statuses of pending calls from executions db back to the sheet
    async syncCampaignStatuses() {
        const campaigns = await Campaign.find({ status: 'active' });

        for (const campaign of campaigns) {
            try {
                const client = await Client.findById(campaign.client_id);
                if (!client || !client.google_authorized) continue;

                const sheets = await googleSheetsService.createSheetsClient(client);
                const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: campaign.google_sheet_id });
                const sheetName = spreadsheet.data.sheets[0].properties.title;

                const rows = await googleSheetsService.readSheetData(client, campaign.google_sheet_id, `'${sheetName}'!A:ZZ`);
                if (!rows || rows.length < 2) continue;

                const headers = rows[0];
                const phoneIdx = headers.findIndex(h => h.trim().toLowerCase() === campaign.phone_column_name.trim().toLowerCase());
                const execIdx = headers.findIndex(h => h.trim().toLowerCase() === campaign.execution_column_name.trim().toLowerCase());

                if (phoneIdx === -1 || execIdx === -1) continue;

                let retryIdx = headers.findIndex(h => h.trim().toLowerCase() === (campaign.retries_column_name || 'retries').trim().toLowerCase());
                if (retryIdx === -1) {
                    // Try to add it if it's missing during sync
                    retryIdx = headers.length;
                    const colLetter = colIndexToLetter(retryIdx);
                    await googleSheetsService.updateSheetCell(client, campaign.google_sheet_id, `'${sheetName}'!${colLetter}1`, campaign.retries_column_name || 'retries');
                }

                const execColLetter = colIndexToLetter(execIdx);
                const retryColLetter = colIndexToLetter(retryIdx);

                for (let i = 1; i < rows.length; i++) {
                    const row = rows[i];
                    const phone = row[phoneIdx];
                    const status = row[execIdx];

                    // Check if phone exists and status is neither empty nor 'completed'
                    // We want to keep syncing "busy", "failed", etc. because Bolna might be retrying them
                    if (phone && status && !status.toLowerCase().includes('completed')) {
                        const cleanedPhone = this.formatPhoneNumber(phone);
                        if (!cleanedPhone) continue;

                        const latestExecution = await Execution.findOne({
                            agent_id: campaign.agent_id,
                            to_number: cleanedPhone
                        }).sort({ started_at: -1 });

                        if (latestExecution) {
                            let friendlyStatus = status;
                            switch (latestExecution.status.toLowerCase()) {
                                case 'completed':
                                    friendlyStatus = 'Call Completed';
                                    break;
                                case 'no-answer':
                                    friendlyStatus = "Didn't pick it up";
                                    break;
                                case 'busy':
                                    friendlyStatus = 'Number Busy';
                                    break;
                                case 'failed':
                                case 'error':
                                    friendlyStatus = 'Call Failed';
                                    break;
                            }

                            if (friendlyStatus !== status) {
                                await googleSheetsService.updateSheetCell(client, campaign.google_sheet_id, `'${sheetName}'!${execColLetter}${i + 1}`, friendlyStatus);
                            }

                            // Also sync retry count
                            const currentRetryValue = row[retryIdx];
                            const executionRetryCount = latestExecution.retry_attempt || 0;

                            if (parseInt(currentRetryValue) !== executionRetryCount) {
                                await googleSheetsService.updateSheetCell(client, campaign.google_sheet_id, `'${sheetName}'!${retryColLetter}${i + 1}`, executionRetryCount);
                            }
                        }
                    }
                }
            } catch (err) {
                console.error(`❌ Failed to sync statuses for campaign ${campaign.name}:`, err.message);
            }
        }
    }

    /**
     * Check if current time is within campaign active hours
     */
    isWithinActiveHours(hours) {
        if (!hours || !hours.start || !hours.end) return true;

        const istNow = this.getISTDate();
        // Use UTC methods on the offset date to get IST numbers
        const currentTime = istNow.getUTCHours() * 60 + istNow.getUTCMinutes();

        const [startH, startM] = hours.start.split(':').map(Number);
        const [endH, endM] = hours.end.split(':').map(Number);

        const startTime = startH * 60 + startM;
        const endTime = endH * 60 + endM;

        return currentTime >= startTime && currentTime <= endTime;
    }

    /**
     * Format phone number to E.164 (+91...)
     */
    formatPhoneNumber(phone) {
        let cleaned = phone.toString().replace(/\D/g, '');

        if (cleaned.length === 10) {
            return `+91${cleaned}`;
        }

        if (cleaned.length === 12 && cleaned.startsWith('91')) {
            return `+${cleaned}`;
        }

        if (cleaned.length > 5) {
            return `+${cleaned}`;
        }

        return null;
    }
}

module.exports = new CampaignService();
