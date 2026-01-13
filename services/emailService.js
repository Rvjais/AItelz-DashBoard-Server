const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.zoho.com',
    port: process.env.EMAIL_PORT || 465,
    secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for other ports
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
    },
});

// Function to send password reset email
const sendPasswordResetEmail = async (email, resetToken) => {
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/?token=${resetToken}`;

    // Check if email is configured - if not, just log the URL for development
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
        console.log('\n');
        console.log('═══════════════════════════════════════════════════════');
        console.log('⚠️  EMAIL NOT CONFIGURED - Development Mode');
        console.log('═══════════════════════════════════════════════════════');
        console.log('📧 Password reset requested for:', email);
        console.log('🔑 Reset URL (copy this to your browser):');
        console.log('\n   ' + resetUrl);
        console.log('\n');
        console.log('💡 To enable email sending, add to backend/.env:');
        console.log('   EMAIL_USER=your.email@gmail.com');
        console.log('   EMAIL_PASSWORD=your-app-password');
        console.log('   FRONTEND_URL=http://localhost:5173');
        console.log('═══════════════════════════════════════════════════════');
        console.log('\n');
        return; // Skip actual email sending in dev mode
    }

    const mailOptions = {
        from: `"Voice Dashboard" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Password Reset Request - Voice Dashboard',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #000000; margin: 0;">Voice Dashboard</h1>
                </div>
                
                <div style="background-color: #f5f5f5; padding: 30px; border-radius: 8px;">
                    <h2 style="color: #000000; margin-top: 0;">Password Reset Request</h2>
                    <p style="color: #666666; font-size: 16px; line-height: 1.6;">
                        You requested to reset your password for Voice Dashboard.
                    </p>
                    <p style="color: #666666; font-size: 16px; line-height: 1.6;">
                        Click the button below to reset your password:
                    </p>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${resetUrl}" 
                           style="display: inline-block; padding: 14px 28px; background-color: #000000; 
                                  color: #ffffff; text-decoration: none; border-radius: 8px; 
                                  font-weight: 600; font-size: 16px;">
                            Reset Password
                        </a>
                    </div>
                    
                    <p style="color: #666666; font-size: 14px; line-height: 1.6;">
                        Or copy and paste this link in your browser:
                    </p>
                    <p style="word-break: break-all; color: #999999; font-size: 14px; 
                              background-color: #ffffff; padding: 10px; border-radius: 4px;">
                        ${resetUrl}
                    </p>
                    
                    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e5e5;">
                        <p style="color: #999999; font-size: 14px; margin: 5px 0;">
                            <strong>⏰ This link will expire in 1 hour.</strong>
                        </p>
                        <p style="color: #999999; font-size: 14px; margin: 5px 0;">
                            If you didn't request this, please ignore this email and your password will remain unchanged.
                        </p>
                    </div>
                </div>
                
                <div style="text-align: center; margin-top: 30px;">
                    <p style="color: #999999; font-size: 12px;">
                        © ${new Date().getFullYear()} Voice Dashboard. All rights reserved.
                    </p>
                </div>
            </div>
        `,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('✅ Password reset email sent to:', email);
    } catch (error) {
        console.error('❌ Error sending email:', error.message);
        console.log('\n🔑 Reset URL (use this instead):', resetUrl, '\n');
        throw new Error('Failed to send reset email');
    }
};

module.exports = {
    sendPasswordResetEmail,
};
