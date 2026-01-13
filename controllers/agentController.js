const Agent = require('../models/Agent');

// Get all agents for the authenticated client
exports.getMyAgents = async (req, res) => {
    try {
        const agents = await Agent.find({ client_id: req.clientId });

        res.json({
            success: true,
            count: agents.length,
            agents,
        });
    } catch (error) {
        console.error('Get agents error:', error);
        res.status(500).json({ error: 'Failed to fetch agents' });
    }
};

// Get single agent by ID
exports.getAgentById = async (req, res) => {
    try {
        const { agentId } = req.params;

        const agent = await Agent.findOne({
            _id: agentId,
            client_id: req.clientId, // Ensure client owns this agent
        });

        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }

        res.json({ success: true, agent });
    } catch (error) {
        console.error('Get agent error:', error);
        res.status(500).json({ error: 'Failed to fetch agent' });
    }
};

// Create a new agent
exports.createAgent = async (req, res) => {
    try {
        const { bolna_agent_id, name, description, config } = req.body;

        if (!bolna_agent_id || !name) {
            return res.status(400).json({ error: 'bolna_agent_id and name are required' });
        }

        // Check if agent already exists (prevent duplicates)
        const existingAgent = await Agent.findOne({ bolna_agent_id });
        if (existingAgent) {
            // Check if current user already owns this agent
            if (existingAgent.client_id.toString() === req.clientId.toString()) {
                return res.status(400).json({
                    error: 'You have already added this agent. Agent ID already exists in your account.'
                });
            } else {
                return res.status(400).json({
                    error: 'This agent ID is already registered by another user.'
                });
            }
        }

        const agent = new Agent({
            bolna_agent_id,
            name,
            client_id: req.clientId,
            description: description || '',
            config: config || {},
        });

        await agent.save();

        res.status(201).json({
            success: true,
            message: 'Agent created successfully',
            agent,
        });
    } catch (error) {
        console.error('Create agent error:', error);
        res.status(500).json({ error: 'Failed to create agent' });
    }
};

// Update agent
exports.updateAgent = async (req, res) => {
    try {
        const { agentId } = req.params;
        const { name, description, config } = req.body;

        const agent = await Agent.findOneAndUpdate(
            { _id: agentId, client_id: req.clientId },
            { name, description, config },
            { new: true }
        );

        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }

        res.json({
            success: true,
            message: 'Agent updated successfully',
            agent,
        });
    } catch (error) {
        console.error('Update agent error:', error);
        res.status(500).json({ error: 'Failed to update agent' });
    }
};

// Delete agent
exports.deleteAgent = async (req, res) => {
    try {
        const { agentId } = req.params;

        const agent = await Agent.findOneAndDelete({
            _id: agentId,
            client_id: req.clientId,
        });

        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }

        res.json({
            success: true,
            message: 'Agent deleted successfully',
        });
    } catch (error) {
        console.error('Delete agent error:', error);
        res.status(500).json({ error: 'Failed to delete agent' });
    }
};
