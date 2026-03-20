const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');

// Public routes
router.post('/register', authController.register);
router.post('/login', authController.login);

// Password reset routes
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password/:token', authController.resetPassword);

// Protected routes
router.get('/profile', authMiddleware, authController.getProfile);

// API Key management
router.post('/api-key', authMiddleware, authController.saveApiKey);
router.get('/api-key/status', authMiddleware, authController.getApiKeyStatus);
router.delete('/api-key', authMiddleware, authController.deleteApiKey);

module.exports = router;
