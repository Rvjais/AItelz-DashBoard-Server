const express = require('express');
const cors = require('cors');
require('dotenv').config();

const connectDB = require('./config/database');
const { startExecutionSync } = require('./jobs/syncExecutions');
const { startCampaignRunner } = require('./jobs/campaignRunner');

// Import routes
const authRoutes = require('./routes/auth');
const agentRoutes = require('./routes/agents');
const executionRoutes = require('./routes/executions');
const extractionFieldsRoutes = require('./routes/extractionFields');
const googleAuthRoutes = require('./routes/googleAuth');
const campaignRoutes = require('./routes/campaigns');
const widgetRoutes = require('./routes/widgets');
const publicWidgetRoutes = require('./routes/public/widgetAuth');

const app = express();
app.set('trust proxy', true);
const PORT = process.env.PORT || 5000;

// ─── STRICT CORS FIX FOR LITESPEED PROXY ────────────────────────────────────
app.use((req, res, next) => {
    // LiteSpeed sometimes duplicates the Origin header in proxy requests (e.g. "url, url")
    let rawOrigin = req.headers.origin || '';

    // Parse out the first origin if it's a comma-separated list
    let origin = rawOrigin.split(',')[0].trim();

    const allowed = ['https://in.aitelz.com', 'https://aitelz.com'];

    // If it's a valid allowed origin, use it. Otherwise, fallback to the default frontend URL.
    if (allowed.includes(origin) || origin.endsWith('aitelz.com')) {
        res.header('Access-Control-Allow-Origin', origin);
    } else {
        res.header('Access-Control-Allow-Origin', 'https://in.aitelz.com');
    }

    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
    res.header('Access-Control-Allow-Credentials', 'true');

    // Respond to Preflight immediately
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Routes
app.get('/', (req, res) => {
    res.json({
        message: 'Voice Dashboard API',
        version: '1.0.0',
        endpoints: {
            auth: '/api/auth',
            agents: '/api/agents',
            executions: '/api/executions',
        },
    });
});

app.use('/api/auth', authRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/executions', executionRoutes);
app.use('/api/extraction-fields', extractionFieldsRoutes);
app.use('/api/auth', googleAuthRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/widgets', widgetRoutes);

// Public API routes (CORS must be handled carefully here, so using the custom proxy headers above)
app.use('/api/public/widget', publicWidgetRoutes);

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
        error: err.message || 'Internal server error',
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Start server
const startServer = async () => {
    try {
        // Connect to MongoDB
        await connectDB();

        // Start cron jobs
        startExecutionSync();
        startCampaignRunner();

        // Start Express server
        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`📊 Dashboard: ${process.env.FRONTEND_URL}`);
            console.log(`🔗 API: http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};

startServer();

module.exports = app;
