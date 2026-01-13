const mongoose = require('mongoose');

const executionSchema = new mongoose.Schema({
    bolna_execution_id: {
        type: String,
        required: true,
        unique: true,
    },
    agent_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Agent',
        required: true,
    },

    // Call details
    conversation_time: {
        type: Number, // in seconds
        default: 0,
    },
    total_cost: {
        type: Number,
        default: 0,
    },
    status: {
        type: String,
        enum: ['pending', 'in_progress', 'completed', 'failed', 'cancelled'],
        default: 'pending',
    },

    // Telephony fields
    telephony_provider: String,
    from_number: String,
    to_number: String,
    call_sid: String,

    // Data extracted from conversation
    extracted_data: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
    },

    // Conversation transcript
    transcript: {
        type: String,
        default: '',
    },

    // Raw metadata from Bolna
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
    },

    // Raw logs (optional, can be large)
    raw_logs: {
        type: String,
        default: '',
    },

    // Timestamps
    started_at: {
        type: Date,
        default: null,
    },
    ended_at: {
        type: Date,
        default: null,
    },
}, {
    timestamps: true, // createdAt and updatedAt
});

// Indexes for faster queries
executionSchema.index({ agent_id: 1 });
executionSchema.index({ bolna_execution_id: 1 });
executionSchema.index({ status: 1 });
executionSchema.index({ started_at: -1 }); // Most recent first
executionSchema.index({ createdAt: -1 }); // Most recent first

// Compound index for filtering by agent and date
executionSchema.index({ agent_id: 1, started_at: -1 });

const Execution = mongoose.model('Execution', executionSchema);

module.exports = Execution;
