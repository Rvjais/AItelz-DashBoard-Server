const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
    },
    password_hash: {
        type: String,
        required: true,
    },
    // Optional: OAuth integration
    oauth_provider: {
        type: String,
        enum: ['google', 'github', null],
        default: null,
    },
    oauth_id: {
        type: String,
        default: null,
    },
    // Password reset fields
    resetPasswordToken: {
        type: String,
        default: null,
    },
    resetPasswordExpires: {
        type: Date,
        default: null,
    },
    // Google Sheets Integration
    google_sheet_id: {
        type: String,
        default: null,
    },
    google_access_token: {
        type: String,  // Encrypted
        default: null,
    },
    google_refresh_token: {
        type: String,  // Encrypted
        default: null,
    },
    google_token_expiry: {
        type: Date,
        default: null,
    },
    google_authorized: {
        type: Boolean,
        default: false,
    },
}, {
    timestamps: true, // Automatically adds createdAt and updatedAt
});

// Index for faster email lookups
clientSchema.index({ email: 1 });

const Client = mongoose.model('Client', clientSchema);

module.exports = Client;
