const jwt = require('jsonwebtoken');
const Client = require('../models/Client');

const authMiddleware = async (req, res, next) => {
    try {
        // Get token from header
        const token = req.header('Authorization')?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({ error: 'No authentication token provided' });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Find client
        const client = await Client.findById(decoded.clientId);

        if (!client) {
            return res.status(401).json({ error: 'Invalid authentication token' });
        }

        // Attach client to request
        req.client = client;
        req.clientId = client._id;

        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(401).json({ error: 'Authentication failed' });
    }
};

module.exports = authMiddleware;
