const Execution = require('../models/Execution');
const Agent = require('../models/Agent');
const sheetService = require('../services/sheetService');
const path = require('path');

// Get all executions for the authenticated client
exports.getMyExecutions = async (req, res) => {
    try {
        const { from, to, status, agentId } = req.query;

        // Get all agent IDs owned by this client
        const clientAgents = await Agent.find({ client_id: req.clientId }).select('_id');
        const agentIds = clientAgents.map(agent => agent._id);

        if (agentIds.length === 0) {
            return res.json({
                success: true,
                count: 0,
                executions: [],
            });
        }

        // Build query
        const query = { agent_id: { $in: agentIds } };

        // Add filters
        if (agentId) {
            // Verify this agent belongs to the client
            if (!agentIds.some(id => id.toString() === agentId)) {
                return res.status(403).json({ error: 'Unauthorized access to agent' });
            }
            query.agent_id = agentId;
        }

        if (status) {
            query.status = status;
        }

        if (from || to) {
            query.started_at = {};
            if (from) query.started_at.$gte = new Date(from);
            if (to) query.started_at.$lte = new Date(to);
        }

        // Fetch executions with agent details
        const executions = await Execution.find(query)
            .populate('agent_id', 'name bolna_agent_id')
            .sort({ started_at: -1 })
            .limit(100); // Limit to prevent large responses

        res.json({
            success: true,
            count: executions.length,
            executions,
        });
    } catch (error) {
        console.error('Get executions error:', error);
        res.status(500).json({ error: 'Failed to fetch executions' });
    }
};

// Get single execution by ID
exports.getExecutionById = async (req, res) => {
    try {
        const { executionId } = req.params;

        // Fetch execution with agent details
        const execution = await Execution.findById(executionId)
            .populate('agent_id', 'name bolna_agent_id client_id');

        if (!execution) {
            return res.status(404).json({ error: 'Execution not found' });
        }

        // Verify client owns this execution's agent
        if (execution.agent_id.client_id.toString() !== req.clientId.toString()) {
            return res.status(403).json({ error: 'Unauthorized access' });
        }

        res.json({ success: true, execution });
    } catch (error) {
        console.error('Get execution error:', error);
        res.status(500).json({ error: 'Failed to fetch execution' });
    }
};

// Get execution statistics
exports.getExecutionStats = async (req, res) => {
    try {
        const { from, to } = req.query;

        // Get all agent IDs owned by this client
        const clientAgents = await Agent.find({ client_id: req.clientId }).select('_id');
        const agentIds = clientAgents.map(agent => agent._id);

        if (agentIds.length === 0) {
            return res.json({
                success: true,
                stats: {
                    total_executions: 0,
                    total_cost: 0,
                    total_conversation_time: 0,
                    by_status: {},
                },
            });
        }

        // Build match query
        const match = { agent_id: { $in: agentIds } };

        if (from || to) {
            match.started_at = {};
            if (from) match.started_at.$gte = new Date(from);
            if (to) match.started_at.$lte = new Date(to);
        }

        // Aggregate statistics
        const stats = await Execution.aggregate([
            { $match: match },
            {
                $group: {
                    _id: null,
                    total_executions: { $sum: 1 },
                    total_cost: { $sum: '$total_cost' },
                    total_conversation_time: { $sum: '$conversation_time' },
                },
            },
        ]);

        // Get status breakdown
        const statusBreakdown = await Execution.aggregate([
            { $match: match },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                },
            },
        ]);

        const by_status = {};
        statusBreakdown.forEach(item => {
            by_status[item._id] = item.count;
        });

        res.json({
            success: true,
            stats: {
                total_executions: stats[0]?.total_executions || 0,
                total_cost: stats[0]?.total_cost || 0,
                total_conversation_time: stats[0]?.total_conversation_time || 0,
                by_status,
            },
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
};

// Export extracted doctor data to CSV
exports.exportDoctorData = async (req, res) => {
    try {
        const { from, to, filename } = req.query;

        // Get all agent IDs owned by this client
        const clientAgents = await Agent.find({ client_id: req.clientId }).select('_id');
        const agentIds = clientAgents.map(agent => agent._id);

        if (agentIds.length === 0) {
            return res.status(404).json({ error: 'No agents found' });
        }

        // Build query for executions with extracted doctor info
        const query = {
            agent_id: { $in: agentIds },
            'extracted_data.doctor_info': { $exists: true }
        };

        // Add date filters if provided
        if (from || to) {
            query.started_at = {};
            if (from) query.started_at.$gte = new Date(from);
            if (to) query.started_at.$lte = new Date(to);
        }

        // Fetch executions with extracted data
        const executions = await Execution.find(query)
            .populate('agent_id', 'name')
            .sort({ started_at: -1 });

        if (executions.length === 0) {
            return res.status(404).json({ error: 'No extracted data found' });
        }

        // Prepare data for CSV
        const csvData = executions.map(execution => {
            const doctorInfo = execution.extracted_data?.doctor_info || {};
            return {
                doctor_name: doctorInfo.doctor_name || '',
                clinic_hospital_name: doctorInfo.clinic_hospital_name || '',
                phone_number: doctorInfo.phone_number || '',
                email_id: doctorInfo.email_id || '',
                city: doctorInfo.city || '',
                call_date: execution.started_at ? execution.started_at.toISOString().split('T')[0] : '',
                call_time: execution.started_at ? execution.started_at.toISOString() : '',
                execution_id: execution.bolna_execution_id || execution._id.toString(),
                agent_name: execution.agent_id?.name || '',
            };
        });

        // Generate filename
        let csvFilename = filename;
        if (!csvFilename) {
            const date = new Date().toISOString().split('T')[0];
            csvFilename = `doctor_data_${date}.csv`;
        }

        // Save to CSV
        const filePath = sheetService.saveToCSV(csvData, csvFilename);

        // Send file as download
        res.download(filePath, csvFilename, (err) => {
            if (err) {
                console.error('Error sending file:', err);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Failed to download file' });
                }
            }
        });
    } catch (error) {
        console.error('Export doctor data error:', error);
        res.status(500).json({ error: 'Failed to export data' });
    }
};

// Get list of available CSV files
exports.listExportedFiles = async (req, res) => {
    try {
        const files = sheetService.listCSVFiles();
        res.json({
            success: true,
            files: files.map(file => ({
                filename: file.filename,
                size: file.size,
                created: file.created,
                modified: file.modified,
            })),
        });
    } catch (error) {
        console.error('List exported files error:', error);
        res.status(500).json({ error: 'Failed to list files' });
    }
};

// Sync past executions to Google Sheet
exports.syncPastExecutions = async (req, res) => {
    try {
        const bolnaService = require('../services/bolnaService');
        const Agent = require('../models/Agent');
        const Execution = require('../models/Execution');

        // Get all agent IDs owned by this client
        const clientAgents = await Agent.find({ client_id: req.clientId }).select('_id');
        const agentIds = clientAgents.map(agent => agent._id);

        if (agentIds.length === 0) {
            return res.json({
                success: true,
                count: 0,
                message: 'No agents found to sync'
            });
        }

        // Find executions that have a transcript available but not synced to sheet
        const query = {
            agent_id: { $in: agentIds },
            transcript: { $exists: true, $ne: '' },
            'extracted_data.google_sheet_synced': { $ne: true }
        };

        const executions = await Execution.find(query);
        console.log(`Found ${executions.length} past executions to sync for client ${req.clientId}`);

        let syncedCount = 0;

        // Process in parallel with concurrency limit (e.g., 5 at a time) to avoid rate limits
        const batchSize = 5;
        for (let i = 0; i < executions.length; i += batchSize) {
            const batch = executions.slice(i, i + batchSize);
            await Promise.all(batch.map(async (execution) => {
                try {
                    await bolnaService.processTranscriptForExtraction(execution);
                    syncedCount++;
                } catch (error) {
                    console.error(`Failed to sync execution ${execution._id}:`, error.message);
                }
            }));
        }

        res.json({
            success: true,
            count: syncedCount,
            totalFound: executions.length,
            message: `Synced ${syncedCount} past executions to Google Sheet`
        });
    } catch (error) {
        console.error('Sync past executions error:', error);
        res.status(500).json({ error: 'Failed to sync past executions' });
    }
};
