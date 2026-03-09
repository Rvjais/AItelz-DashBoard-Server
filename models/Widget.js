const mongoose = require('mongoose');

const widgetSchema = new mongoose.Schema({
    client_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Client',
        required: true,
    },
    agent_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Agent',
        required: true,
    },
    name: {
        type: String, // Internal name for the user to identify the widget
        required: true,
        default: 'My Widget'
    },
    // Customization Settings
    theme_color: {
        type: String,
        default: '#f97316' // Matches the app's orange accent
    },
    text_color: {
        type: String,
        default: '#ffffff'
    },
    bg_color: {
        type: String,
        default: '#ffffff'
    },
    button_text: {
        type: String,
        default: 'Get a Call'
    },
    modal_title: {
        type: String,
        default: 'Request an Instant Call'
    },
    modal_subtitle: {
        type: String,
        default: 'Enter your phone number below and our AI agent will call you immediately.'
    },
    success_message: {
        type: String,
        default: 'Thank you! Our AI agent will call you shortly.'
    },
    position: {
        type: String,
        enum: ['bottom-right', 'bottom-left'],
        default: 'bottom-right'
    },
    border_radius: {
        type: Number,
        default: 10
    },
    // Security Settings
    allowed_domains: {
        type: [String],
        default: [], // If empty, allow all (good for dev, risky for prod)
    },
    is_active: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

module.exports = mongoose.model('Widget', widgetSchema);
