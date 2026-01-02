const http = require('http');

// Test payment rejection email
function testPaymentRejection() {
    console.log('Testing payment rejection email...');

    // Use the same registration ID
    const registrationId = '38780e31-f7b3-43e0-b38f-3d2e7c1fcf33';

    // Test updating status to "Payment Rejected"
    const postData = JSON.stringify({
        status: 'Payment Rejected',
        admin_notes: 'The payment proof document is unclear. Please provide a clearer bank transfer receipt showing the transaction reference number and amount.'
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
                console.log('✅ Payment rejection status update successful!');
                console.log('Check server logs for rejection email...');
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

testPaymentRejection();