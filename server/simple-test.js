const http = require('http');
const fs = require('fs');
const path = require('path');

// Simple test to submit registration data
function testRegistration() {
    console.log('Testing registration submission...');

    // Use existing PDF test file
    const testFilePath = path.join(__dirname, 'test-payment.pdf');

    // Create multipart form data manually (simplified)
    const boundary = '----formdata-test-' + Math.random().toString(16);
    const formData = [];

    // Add form fields
    const fields = {
        middle_temple_member: 'Yes',
        bmts_member_interest: 'Yes',
        title: 'Mr.',
        first_name: 'Test',
        last_name: 'User',
        company: 'Test Company',
        telephone: '+1-242-555-0123',
        email: 'test@example.com',
        practice_track: 'Civil',
        payment_method: 'Bank Transfer',
        consent: 'on'
    };

    for (const [key, value] of Object.entries(fields)) {
        formData.push(`--${boundary}\r\n`);
        formData.push(`Content-Disposition: form-data; name="${key}"\r\n\r\n`);
        formData.push(`${value}\r\n`);
    }

    // Add file
    const fileContent = fs.readFileSync(testFilePath);
    formData.push(`--${boundary}\r\n`);
    formData.push(`Content-Disposition: form-data; name="payment_proof"; filename="test-payment.pdf"\r\n`);
    formData.push(`Content-Type: application/pdf\r\n\r\n`);
    formData.push(fileContent);
    formData.push(`\r\n--${boundary}--\r\n`);

    const body = Buffer.concat(formData.map(part => Buffer.from(part)));

    const options = {
        hostname: 'localhost',
        port: 3000,
        path: '/api/register',
        method: 'POST',
        headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': body.length
        }
    };

    const req = http.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
            data += chunk;
        });

        res.on('end', () => {
            console.log('Response Status:', res.statusCode);
            console.log('Response Body:', data);

            if (res.statusCode === 200) {
                console.log('✅ Registration submitted successfully!');
                const result = JSON.parse(data);
                console.log('Registration ID:', result.registration_id);
            } else {
                console.log('❌ Registration failed');
            }
        });
    });

    req.on('error', (err) => {
        console.error('❌ Request error:', err.message);
    });

    req.write(body);
    req.end();
}

testRegistration();