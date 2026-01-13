const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const Client = require('../models/Client');
const { sendPasswordResetEmail } = require('../services/emailService');

// Register new client
exports.register = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // Validate input
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        // Check if client already exists
        const existingClient = await Client.findOne({ email });
        if (existingClient) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        // Hash password
        const password_hash = await bcrypt.hash(password, 10);

        // Create client
        const client = new Client({
            name,
            email,
            password_hash,
        });

        await client.save();

        // Generate JWT token
        const token = jwt.sign(
            { clientId: client._id },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(201).json({
            message: 'Registration successful',
            token,
            client: {
                id: client._id,
                name: client.name,
                email: client.email,
            },
        });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
};

// Login client
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        // Find client
        const client = await Client.findOne({ email });
        if (!client) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, client.password_hash);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Generate JWT token
        const token = jwt.sign(
            { clientId: client._id },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            message: 'Login successful',
            token,
            client: {
                id: client._id,
                name: client.name,
                email: client.email,
            },
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
};

// Get current client profile
exports.getProfile = async (req, res) => {
    try {
        const client = await Client.findById(req.clientId).select('-password_hash');
        res.json({ client });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ error: 'Failed to get profile' });
    }
};

// Forgot Password - Send reset email
exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        // Validate email
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        // Find user by email
        const client = await Client.findOne({ email: email.toLowerCase() });

        if (!client) {
            // Don't reveal if user exists for security
            return res.status(200).json({
                message: 'If that email exists, a reset link has been sent'
            });
        }

        // Generate secure random token
        const resetToken = crypto.randomBytes(32).toString('hex');

        // Hash token before saving to database
        const hashedToken = crypto
            .createHash('sha256')
            .update(resetToken)
            .digest('hex');

        // Save hashed token and expiry (1 hour from now)
        client.resetPasswordToken = hashedToken;
        client.resetPasswordExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
        await client.save();

        // Send email with unhashed token
        await sendPasswordResetEmail(email, resetToken);

        res.status(200).json({
            message: 'Password reset email sent successfully'
        });

    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ error: 'Failed to process request' });
    }
};

// Reset Password - Update password with token
exports.resetPassword = async (req, res) => {
    try {
        const { token } = req.params;
        const { password } = req.body;

        // Validate inputs
        if (!password || password.length < 6) {
            return res.status(400).json({
                error: 'Password must be at least 6 characters'
            });
        }

        // Hash the token from URL to compare with database
        const hashedToken = crypto
            .createHash('sha256')
            .update(token)
            .digest('hex');

        // Find user with valid token that hasn't expired
        const client = await Client.findOne({
            resetPasswordToken: hashedToken,
            resetPasswordExpires: { $gt: Date.now() }, // Token not expired
        });

        if (!client) {
            return res.status(400).json({
                error: 'Invalid or expired reset token'
            });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Update password and clear reset token fields
        client.password_hash = hashedPassword;
        client.resetPasswordToken = null;
        client.resetPasswordExpires = null;
        await client.save();

        res.status(200).json({
            message: 'Password reset successful. You can now login.'
        });

    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'Failed to reset password' });
    }
};
