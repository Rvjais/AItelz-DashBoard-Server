const campaignService = require('../services/campaignService');

let pollingInterval = null;

const startCampaignRunner = () => {
    console.log('🏁 Starting Outbound Campaign background runner...');

    // First run after 30 seconds
    setTimeout(async () => {
        await campaignService.processActiveCampaigns();
        await campaignService.syncCampaignStatuses();
    }, 30 * 1000);

    // Keep running every 2 minutes
    pollingInterval = setInterval(async () => {
        try {
            await campaignService.processActiveCampaigns();
            await campaignService.syncCampaignStatuses();
        } catch (error) {
            console.error('❌ Error in background campaign runner:', error);
        }
    }, 2 * 60 * 1000);
};

const stopCampaignRunner = () => {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        console.log('🛑 Stopped Outbound Campaign background runner');
    }
};

module.exports = {
    startCampaignRunner,
    stopCampaignRunner
};
