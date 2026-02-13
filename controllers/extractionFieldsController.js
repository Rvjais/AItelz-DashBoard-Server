const ExtractionField = require('../models/ExtractionField');

class ExtractionFieldsController {
    /**
     * Get all extraction fields for the authenticated user
     */
    async getAllFields(req, res) {
        try {
            const clientId = req.user.id;

            const fields = await ExtractionField.find({ client_id: clientId })
                .sort({ order: 1, createdAt: 1 })
                .select('-__v');

            res.json({
                success: true,
                count: fields.length,
                fields,
            });
        } catch (error) {
            console.error('Error fetching extraction fields:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch extraction fields',
            });
        }
    }

    /**
     * Create a new extraction field
     */
    async createField(req, res) {
        try {
            const clientId = req.user.id;
            const { field_name, description, is_active } = req.body;

            // Validation
            if (!field_name || !description) {
                return res.status(400).json({
                    success: false,
                    error: 'Field name and description are required',
                });
            }

            // Validate field name format
            if (!/^[a-zA-Z0-9_]+$/.test(field_name)) {
                return res.status(400).json({
                    success: false,
                    error: 'Field name can only contain letters, numbers, and underscores',
                });
            }

            // Check for duplicate field name
            const existingField = await ExtractionField.findOne({
                client_id: clientId,
                field_name: field_name,
            });

            if (existingField) {
                return res.status(400).json({
                    success: false,
                    error: `Field "${field_name}" already exists`,
                });
            }

            // Get the highest order number and increment
            const maxOrderField = await ExtractionField.findOne({ client_id: clientId })
                .sort({ order: -1 })
                .select('order');

            const order = maxOrderField ? maxOrderField.order + 1 : 0;

            // Create new field
            const field = await ExtractionField.create({
                field_name,
                description,
                client_id: clientId,
                order,
                is_active: is_active !== undefined ? is_active : true,
            });

            // If user has Google Sheets connected, update headers
            const Client = require('../models/Client');
            const client = await Client.findById(clientId);

            if (client && client.google_authorized && client.google_sheet_id) {
                try {
                    const googleSheetsService = require('../services/googleSheetsService');

                    // Get all active fields to build headers
                    const allFields = await ExtractionField.find({
                        client_id: clientId,
                        is_active: true,
                    }).sort({ order: 1 });

                    const headers = [
                        ...allFields.map(f => f.field_name),
                        'Call_Date',
                        'Call_Time',
                        'Execution_ID',
                        'Agent_Name',
                    ];

                    await googleSheetsService.createHeaders(client, headers);
                    console.log('✅ Google Sheets headers updated');
                } catch (error) {
                    console.error('⚠️  Failed to update Google Sheets headers:', error.message);
                    // Don't fail the field creation
                }
            }

            res.status(201).json({
                success: true,
                message: 'Extraction field created successfully',
                field,
            });
        } catch (error) {
            console.error('Error creating extraction field:', error);

            // Handle mongoose validation errors
            if (error.name === 'ValidationError') {
                return res.status(400).json({
                    success: false,
                    error: Object.values(error.errors).map(e => e.message).join(', '),
                });
            }

            res.status(500).json({
                success: false,
                error: 'Failed to create extraction field',
            });
        }
    }

    /**
     * Update an extraction field
     */
    async updateField(req, res) {
        try {
            const clientId = req.user.id;
            const fieldId = req.params.id;
            const { field_name, description, is_active } = req.body;

            // Find field and verify ownership
            const field = await ExtractionField.findOne({
                _id: fieldId,
                client_id: clientId,
            });

            if (!field) {
                return res.status(404).json({
                    success: false,
                    error: 'Extraction field not found',
                });
            }

            // If changing field name, check for duplicates
            if (field_name && field_name !== field.field_name) {
                // Validate field name format
                if (!/^[a-zA-Z0-9_]+$/.test(field_name)) {
                    return res.status(400).json({
                        success: false,
                        error: 'Field name can only contain letters, numbers, and underscores',
                    });
                }

                const existingField = await ExtractionField.findOne({
                    client_id: clientId,
                    field_name: field_name,
                    _id: { $ne: fieldId },
                });

                if (existingField) {
                    return res.status(400).json({
                        success: false,
                        error: `Field "${field_name}" already exists`,
                    });
                }

                field.field_name = field_name;
            }

            // Update other fields
            if (description !== undefined) field.description = description;
            if (is_active !== undefined) field.is_active = is_active;

            await field.save();

            res.json({
                success: true,
                message: 'Extraction field updated successfully',
                field,
            });
        } catch (error) {
            console.error('Error updating extraction field:', error);

            if (error.name === 'ValidationError') {
                return res.status(400).json({
                    success: false,
                    error: Object.values(error.errors).map(e => e.message).join(', '),
                });
            }

            res.status(500).json({
                success: false,
                error: 'Failed to update extraction field',
            });
        }
    }

    /**
     * Delete an extraction field
     */
    async deleteField(req, res) {
        try {
            const clientId = req.user.id;
            const fieldId = req.params.id;

            const field = await ExtractionField.findOneAndDelete({
                _id: fieldId,
                client_id: clientId,
            });

            if (!field) {
                return res.status(404).json({
                    success: false,
                    error: 'Extraction field not found',
                });
            }

            res.json({
                success: true,
                message: 'Extraction field deleted successfully',
            });
        } catch (error) {
            console.error('Error deleting extraction field:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to delete extraction field',
            });
        }
    }

    /**
     * Bulk update field order
     */
    async bulkUpdateOrder(req, res) {
        try {
            const clientId = req.user.id;
            const { fields } = req.body; // Array of { id, order }

            if (!Array.isArray(fields)) {
                return res.status(400).json({
                    success: false,
                    error: 'Fields array is required',
                });
            }

            // Update each field's order
            const updatePromises = fields.map(({ id, order }) => {
                return ExtractionField.updateOne(
                    { _id: id, client_id: clientId },
                    { $set: { order } }
                );
            });

            await Promise.all(updatePromises);

            res.json({
                success: true,
                message: 'Field order updated successfully',
            });
        } catch (error) {
            console.error('Error updating field order:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to update field order',
            });
        }
    }
}

module.exports = new ExtractionFieldsController();
