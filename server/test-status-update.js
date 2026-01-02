const http = require('http');

// Test admin status update functionality
function testStatusUpdate() {
    console.log('Testing admin status update...');

    // Use the registration ID from the previous test
    const registrationId = '38780e31-f7b3-43e0-b38f-3d2e7c1fcf33';

    // Test updating status to "Payment Verified"
    const postData = JSON.stringify({
        status: 'Payment Verified',
        admin_notes: 'Payment verified successfully via bank transfer. Welcome to the programme!'
    });

    const options = {
        hostname: 'localhost',
        port: 3000,
        path: `/admin/api/registration/${registrationId}/status`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': postData.length,
            'Authorization': 'Basic ' + Buffer.from('admin:change-me-now').toString('base64')
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
                console.log('✅ Status update successful!');
                console.log('Check server logs for email confirmation...');
            } else {
                console.log('❌ Status update failed');
            }
        });
    });

    req.on('error', (err) => {
        console.error('❌ Request error:', err.message);
    });

    req.write(postData);
    req.end();
}

testStatusUpdate();