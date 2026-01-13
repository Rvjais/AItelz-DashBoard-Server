const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const sheetService = require('../services/sheetService');

async function testWebhook() {
    console.log('🧪 Testing Google Apps Script Webhook...');

    // Check for URL
    if (!process.env.GOOGLE_SCRIPT_URL) {
        console.error('❌ GOOGLE_SCRIPT_URL is missing in backend/.env');
        console.log('   Please deploy the Apps Script and add the URL to your .env file.');
        return;
    }
    console.log(`   URL: ${process.env.GOOGLE_SCRIPT_URL}`);

    // Sample data
    const sampleData = {
        doctor_name: 'Dr. Test Usage',
        clinic_hospital_name: 'Test Setup Clinic',
        phone_number: '123-456-7890',
        email_id: 'test@example.com',
        city: 'Test City',
        call_date: new Date().toISOString().split('T')[0],
        call_time: new Date().toISOString(),
        execution_id: 'test-execution-' + Date.now()
    };

    console.log('\n📦 Sending sample data:', sampleData);

    try {
        const success = await sheetService.sendToGoogleAppsScript(sampleData);

        if (success) {
            console.log('\n✅ Test PASSED! Check your Google Sheet.');
        } else {
            console.log('\n❌ Test FAILED. Check console logs for details.');
        }
    } catch (error) {
        console.error('\n❌ Unexpected error:', error);
    }
}

testWebhook();
