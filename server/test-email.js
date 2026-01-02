require('dotenv').config();
const nodemailer = require('nodemailer');

// Test email configuration
function createTransport() {
    const host = process.env.SMTP_HOST ? String(process.env.SMTP_HOST).trim() : null;
    const user = process.env.SMTP_USER ? String(process.env.SMTP_USER).trim() : null;
    const pass = process.env.SMTP_PASS ? String(process.env.SMTP_PASS).trim() : null;
    const port = Number(process.env.SMTP_PORT || 587);

    console.log('Email Configuration:');
    console.log('SMTP_HOST:', host);
    console.log('SMTP_USER:', user);
    console.log('SMTP_PASS:', pass ? '***HIDDEN***' : 'NOT SET');
    console.log('SMTP_PORT:', port);

    if (!host || !user || !pass) {
        console.error('Missing email configuration!');
        return null;
    }

    // Validate host format
    if (host.includes('=') || host.includes(' ')) {
        console.error('[Email Config Error] Invalid SMTP_HOST format. Remove any extra characters or spaces.');
        console.error(`[Email Config Error] Current SMTP_HOST value: "${host}"`);
        return null;
    }

    try {
        return nodemailer.createTransport({
            host, port,
            secure: port === 465,
            auth: { user, pass }
        });
    } catch (err) {
        console.error('[Email Config Error] Failed to create email transporter:', err.message);
        return null;
    }
}

async function testEmail() {
    console.log('Testing email configuration...');

    const transporter = createTransport();
    if (!transporter) {
        console.error('Failed to create email transporter');
        return;
    }

    console.log('Email transporter created successfully');

    // Test connection
    try {
        await transporter.verify();
        console.log('✅ SMTP connection verified successfully!');

        // Send test email
        const testEmail = {
            from: process.env.MAIL_FROM || 'bahamasmts@bmts-events.com',
            to: process.env.SMTP_USER, // Send to self for testing
            subject: 'Test Email - BMTS Events System',
            text: 'This is a test email to verify the email system is working correctly.'
        };

        console.log('Sending test email...');
        const result = await transporter.sendMail(testEmail);
        console.log('✅ Test email sent successfully!');
        console.log('Message ID:', result.messageId);

    } catch (error) {
        console.error('❌ Email test failed:', error.message);
        console.error('Error code:', error.code);
        console.error('Error details:', error);
    }
}

testEmail().then(() => {
    console.log('Email test completed');
    process.exit(0);
}).catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});