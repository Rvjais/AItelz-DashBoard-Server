const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const extractionFieldsController = require('../controllers/extractionFieldsController');

// All routes require authentication
router.use(auth);

// GET /api/extraction-fields - Get all fields for the user
router.get('/', extractionFieldsController.getAllFields);

// POST /api/extraction-fields - Create a new field
router.post('/', extractionFieldsController.createField);

// PUT /api/extraction-fields/:id - Update a field
router.put('/:id', extractionFieldsController.updateField);

// DELETE /api/extraction-fields/:id - Delete a field
router.delete('/:id', extractionFieldsController.deleteField);

// PUT /api/extraction-fields/bulk-update - Update field order
router.put('/bulk/update-order', extractionFieldsController.bulkUpdateOrder);

// POST /api/extraction-fields/sync-headers - Manually sync headers
router.post('/sync/headers', extractionFieldsController.syncHeaders);

module.exports = router;
