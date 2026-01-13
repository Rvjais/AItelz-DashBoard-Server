const express = require('express');
const router = express.Router();
const executionController = require('../controllers/executionController');
const bolnaService = require('../services/bolnaService');
const authMiddleware = require('../middleware/auth');

// All routes require authentication
router.use(authMiddleware);

router.get('/', executionController.getMyExecutions);
router.get('/stats', executionController.getExecutionStats);
router.get('/export/doctor-data', executionController.exportDoctorData);
router.get('/export/files', executionController.listExportedFiles);
router.get('/:executionId', executionController.getExecutionById);

// Manual sync endpoint - triggers immediate sync from Bolna
router.post('/sync', async (req, res) => {
    try {
        console.log('🔄 Manual sync triggered by user:', req.client.email);
        const syncedCount = await bolnaService.syncAllExecutions();
        res.json({
            success: true,
            message: 'Sync completed successfully',
            synced: syncedCount
        });
    } catch (error) {
        console.error('Manual sync error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Sync failed'
        });
    }
});

module.exports = router;
