const Widget = require('../models/Widget');
const Agent = require('../models/Agent');

// Get all widgets for the authenticated client
exports.getWidgets = async (req, res) => {
    try {
        const widgets = await Widget.find({ client_id: req.clientId }).populate('agent_id', 'name');
        res.json({ success: true, widgets });
    } catch (error) {
        console.error('Error fetching widgets:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch widgets' });
    }
};

// Create a new widget
exports.createWidget = async (req, res) => {
    try {
        const {
            agent_id, name, theme_color, text_color, bg_color,
            button_text, modal_title, modal_subtitle, success_message,
            position, border_radius, allowed_domains
        } = req.body;

        // Verify the agent belongs to the client
        const agent = await Agent.findOne({ _id: agent_id, client_id: req.clientId });
        if (!agent) {
            return res.status(404).json({ success: false, error: 'Agent not found or unauthorized' });
        }

        const widget = new Widget({
            client_id: req.clientId,
            agent_id,
            name,
            theme_color,
            text_color,
            bg_color,
            button_text,
            modal_title,
            modal_subtitle,
            success_message,
            position,
            border_radius,
            allowed_domains
        });

        await widget.save();
        res.status(201).json({ success: true, widget });
    } catch (error) {
        console.error('Error creating widget:', error);
        res.status(500).json({ success: false, error: 'Failed to create widget' });
    }
};

// Update an existing widget
exports.updateWidget = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const widget = await Widget.findOne({ _id: id, client_id: req.clientId });
        if (!widget) {
            return res.status(404).json({ success: false, error: 'Widget not found' });
        }

        // Verify agent if it's being updated
        if (updates.agent_id && updates.agent_id !== widget.agent_id.toString()) {
            const agent = await Agent.findOne({ _id: updates.agent_id, client_id: req.clientId });
            if (!agent) {
                return res.status(404).json({ success: false, error: 'Agent not found or unauthorized' });
            }
        }

        // Prevent updating client_id
        delete updates.client_id;

        Object.assign(widget, updates);
        await widget.save();

        res.json({ success: true, widget });
    } catch (error) {
        console.error('Error updating widget:', error);
        res.status(500).json({ success: false, error: 'Failed to update widget' });
    }
};

// Delete a widget
exports.deleteWidget = async (req, res) => {
    try {
        const { id } = req.params;
        const widget = await Widget.findOneAndDelete({ _id: id, client_id: req.clientId });

        if (!widget) {
            return res.status(404).json({ success: false, error: 'Widget not found' });
        }

        res.json({ success: true, message: 'Widget deleted successfully' });
    } catch (error) {
        console.error('Error deleting widget:', error);
        res.status(500).json({ success: false, error: 'Failed to delete widget' });
    }
};
