/**
 * Google OAuth Routes
 */

const express = require('express');
const router = express.Router();
const googleAuthController = require('../controllers/googleAuthController');
const authMiddleware = require('../middleware/auth');

// All routes require authentication
router.use(authMiddleware);

// Initiate OAuth flow
router.get('/google', googleAuthController.initiateOAuth);

// OAuth callback (Note: This might not need authentication since it's a callback)
router.get('/google/callback', googleAuthController.handleCallback);

// Save Sheet ID
router.post('/google/sheet-id', googleAuthController.saveSheetId);

// Disconnect Google account
router.delete('/google/disconnect', googleAuthController.disconnect);

// Get connection status
router.get('/google/status', googleAuthController.getStatus);

module.exports = router;
