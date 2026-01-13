const nodemailer = require('nodemailer');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const tryTransport = async (config) => {
    console.log(`\nTesting: ${config.host}:${config.port} (secure: ${config.secure})`);
    console.log(`User: ${config.auth.user}`);
    console.log(`Password Length: ${config.auth.pass ? config.auth.pass.length : '0'}`);
    console.log(`Password has spaces: ${config.auth.pass && config.auth.pass.includes(' ')}`);

    const transporter = nodemailer.createTransport({
        ...config,
        debug: true
    });
    try {
        await transporter.verify();
        console.log('✅ Connection verification successful!');
        await transporter.sendMail({
            from: `"Test" <${process.env.EMAIL_USER}>`,
            to: process.env.EMAIL_USER,
            subject: 'Test Email',
            text: 'Working!',
        });
        console.log('✅ Email sent!');
        return true;
    } catch (error) {
        console.error(`❌ Failed: ${error.message}`);
        if (error.code) console.error(`Code: ${error.code}`);
        return false;
    }
};

const testEmail = async () => {
    const config1 = {
        host: process.env.EMAIL_HOST || 'smtp.zoho.com',
        port: 465,
        secure: true,
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD }
    };

    if (await tryTransport(config1)) return;

    console.log('\n⚠️  Retrying with Port 587 (TLS)...');
    const config2 = {
        host: process.env.EMAIL_HOST || 'smtp.zoho.com',
        port: 587,
        secure: false, // TLS requires secure: false
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD }
    };

    await tryTransport(config2);
};

testEmail();
