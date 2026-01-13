const cron = require('node-cron');
const bolnaService = require('../services/bolnaService');

// Sync executions every hour
const startExecutionSync = () => {
    // Run every hour: '0 * * * *'
    // For testing, run every 5 minutes: '*/5 * * * *'
    cron.schedule('* * * * *', async () => {
        console.log('⏰ Starting scheduled execution sync...');
        try {
            await bolnaService.syncAllExecutions();
        } catch (error) {
            console.error('Scheduled sync failed:', error);
        }
    });

    console.log('✅ Execution sync cron job started (runs every hour)');
};

module.exports = { startExecutionSync };
