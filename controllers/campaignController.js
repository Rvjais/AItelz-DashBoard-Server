const Campaign = require('../models/Campaign');
const googleSheetsService = require('../services/googleSheetsService');
const Client = require('../models/Client');
const Agent = require('../models/Agent'); // Added to ensure model is loaded

// Get all campaigns for the authenticated client
exports.getMyCampaigns = async (req, res) => {
    try {
        const campaigns = await Campaign.find({ client_id: req.clientId }).populate('agent_id', 'name bolna_agent_id');
        res.json({
            success: true,
            count: campaigns.length,
            campaigns,
        });
    } catch (error) {
        console.error('Get campaigns error:', error);
        res.status(500).json({ error: 'Failed to fetch campaigns' });
    }
};

// Get single campaign by ID
exports.getCampaignById = async (req, res) => {
    try {
        const { id } = req.params;
        const campaign = await Campaign.findOne({ _id: id, client_id: req.clientId }).populate('agent_id', 'name bolna_agent_id');

        if (!campaign) {
            return res.status(404).json({ error: 'Campaign not found' });
        }

        res.json({ success: true, campaign });
    } catch (error) {
        console.error('Get campaign error:', error);
        res.status(500).json({ error: 'Failed to fetch campaign' });
    }
};

// Create a new campaign
exports.createCampaign = async (req, res) => {
    try {
        const {
            agent_id,
            name,
            google_sheet_url,
            phone_column_name,
            execution_column_name,
            retry_interval_minutes,
            max_retries,
            scheduled_at,
            active_hours,
            dial_delay
        } = req.body;

        if (!agent_id || !name || !google_sheet_url || !phone_column_name) {
            return res.status(400).json({ error: 'agent_id, name, google_sheet_url, and phone_column_name are required' });
        }

        const match = google_sheet_url.match(new RegExp('/d/([a-zA-Z0-9-_]+)'));
        const sheetId = match ? match[1] : google_sheet_url;

        if (!sheetId) {
            return res.status(400).json({ error: 'Invalid Google Sheet URL' });
        }

        const client = await Client.findById(req.clientId);
        if (!client) {
            return res.status(403).json({ error: 'Client not found' });
        }

        if (!client.google_authorized) {
            return res.status(403).json({ error: 'You need to connect your Google Account first' });
        }

        const campaign = new Campaign({
            client_id: req.clientId,
            agent_id,
            name,
            google_sheet_id: sheetId,
            google_sheet_url,
            phone_column_name,
            execution_column_name: execution_column_name || 'executions',
            retry_interval_minutes: retry_interval_minutes || 30,
            max_retries: max_retries !== undefined ? max_retries : 3,
            status: 'active',
            scheduled_at: scheduled_at || new Date(),
            active_hours: active_hours || { start: '00:00', end: '23:59' },
            dial_delay: dial_delay || 0
        });

        await campaign.save();

        res.status(201).json({
            success: true,
            message: 'Campaign created successfully',
            campaign,
        });
    } catch (error) {
        console.error('Create campaign error:', error);
        res.status(500).json({ error: 'Failed to create campaign' });
    }
};

// Update campaign status
exports.updateCampaignStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // active, paused, completed

        if (!['active', 'paused', 'completed'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const campaign = await Campaign.findOneAndUpdate(
            { _id: id, client_id: req.clientId },
            { status, updated_at: new Date() },
            { new: true }
        );

        if (!campaign) {
            return res.status(404).json({ error: 'Campaign not found' });
        }

        res.json({
            success: true,
            message: `Campaign status updated to ${status}`,
            campaign,
        });
    } catch (error) {
        console.error('Update campaign status error:', error);
        res.status(500).json({ error: 'Failed to update campaign status' });
    }
};

// Delete campaign
exports.deleteCampaign = async (req, res) => {
    try {
        const { id } = req.params;

        const campaign = await Campaign.findOneAndDelete({
            _id: id,
            client_id: req.clientId,
        });

        if (!campaign) {
            return res.status(404).json({ error: 'Campaign not found' });
        }

        res.json({
            success: true,
            message: 'Campaign deleted successfully',
        });
    } catch (error) {
        console.error('Delete campaign error:', error);
        res.status(500).json({ error: 'Failed to delete campaign' });
    }
};
