const mongoose = require('mongoose');

const campaignSchema = new mongoose.Schema({
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
        type: String,
        required: true,
    },
    google_sheet_id: {
        type: String,
        required: true,
    },
    google_sheet_url: {
        type: String,
        required: true,
    },
    phone_column_name: {
        type: String,
        required: true,
    },
    execution_column_name: {
        type: String,
        default: 'executions', // The column where we write back status
    },
    retries_column_name: {
        type: String,
        default: 'retries', // The column where we track retry counts
    },
    status: {
        type: String,
        enum: ['active', 'paused', 'completed'],
        default: 'active',
    },
    retry_interval_minutes: {
        type: Number,
        default: 30, // Default 30 minutes
    },
    max_retries: {
        type: Number,
        default: 3, // Default 3 retries
    },
    last_run_at: {
        type: Date,
        default: null,
    },
    total_records: {
        type: Number,
        default: 0,
    },
    pending_records: {
        type: Number,
        default: 0,
    },
    completed_records: {
        type: Number,
        default: 0,
    },
    scheduled_at: {
        type: Date,
        default: Date.now,
    },
    active_hours: {
        start: { type: String, default: '00:00' },
        end: { type: String, default: '23:59' }
    },
    dial_delay: {
        type: Number,
        default: 0, // seconds between calls
    },
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

module.exports = mongoose.model('Campaign', campaignSchema);
