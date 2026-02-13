/**
 * Google OAuth Routes
 */

const express = require('express');
const router = express.Router();
const googleAuthController = require('../controllers/googleAuthController');
const authMiddleware = require('../middleware/auth');

// Initiate OAuth flow (needs auth to know which user is connecting)
router.get('/google', authMiddleware, googleAuthController.initiateOAuth);

// OAuth callback (public endpoint for Google redirect)
router.get('/google/callback', googleAuthController.handleCallback);

// Save Sheet ID (needs auth)
router.post('/google/sheet-id', authMiddleware, googleAuthController.saveSheetId);

// Disconnect Google account (needs auth)
router.delete('/google/disconnect', authMiddleware, googleAuthController.disconnect);

// Get connection status (needs auth)
router.get('/google/status', authMiddleware, googleAuthController.getStatus);

module.exports = router;
