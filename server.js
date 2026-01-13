const express = require('express');
const cors = require('cors');
require('dotenv').config();

const connectDB = require('./config/database');
const { startExecutionSync } = require('./jobs/syncExecutions');

// Import routes
const authRoutes = require('./routes/auth');
const agentRoutes = require('./routes/agents');
const executionRoutes = require('./routes/executions');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'https://voice-dashboard-client.vercel.app',
    process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.log('⚠️ CORS blocked origin:', origin);
            console.log('✅ Allowed origins:', allowedOrigins);
            callback(null, false); // Reject but don't throw error
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    optionsSuccessStatus: 200
}));
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
