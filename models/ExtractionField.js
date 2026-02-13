const mongoose = require('mongoose');

const extractionFieldSchema = new mongoose.Schema({
    // Field name (e.g., "Name", "Email", "Product_Interest")
    field_name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 50,
        validate: {
            validator: function(v) {
                // Only allow alphanumeric and underscores
                return /^[a-zA-Z0-9_]+$/.test(v);
            },
            message: 'Field name can only contain letters, numbers, and underscores'
        }
    },

    // AI extraction instruction
    description: {
        type: String,
        required: true,
        trim: true,
        maxlength: 500,
    },

    // User who owns this field
    client_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Client',
        required: true,
    },

    // Display order (for sorting in UI)
    order: {
        type: Number,
        default: 0,
    },

    // Whether this field is active
    is_active: {
        type: Boolean,
        default: true,
    },
}, {
    timestamps: true, // createdAt and updatedAt
});

// Compound index: ensure unique field names per user
extractionFieldSchema.index({ client_id: 1, field_name: 1 }, { unique: true });

// Index for faster queries
extractionFieldSchema.index({ client_id: 1, is_active: 1 });
extractionFieldSchema.index({ client_id: 1, order: 1 });

const ExtractionField = mongoose.model('ExtractionField', extractionFieldSchema);

module.exports = ExtractionField;
