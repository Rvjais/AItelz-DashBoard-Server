const mongoose = require('mongoose');

const agentSchema = new mongoose.Schema({
    bolna_agent_id: {
        type: String,
        required: true,
        unique: true,
    },
    name: {
        type: String,
        required: true,
        trim: true,
    },
    client_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Client',
        required: true,
    },
    description: {
        type: String,
        default: '',
    },
    // Additional agent configuration
    config: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
    },
}, {
    timestamps: true,
});

// Indexes for faster queries
agentSchema.index({ client_id: 1 });
agentSchema.index({ bolna_agent_id: 1 });

const Agent = mongoose.model('Agent', agentSchema);

module.exports = Agent;
