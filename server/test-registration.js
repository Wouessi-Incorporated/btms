const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

async function testRegistration() {
    console.log('Testing registration with email...');

    // Create a dummy file for payment proof
    const testFilePath = path.join(__dirname, 'test-payment.txt');
    fs.writeFileSync(testFilePath, 'This is a test payment proof document');

    const form = new FormData();
    form.append('middle_temple_member', 'Yes');
    form.append('bmts_member_interest', 'Yes');
    form.append('title', 'Mr.');
    form.append('first_name', 'Test');
    form.append('last_name', 'User');
    form.append('company', 'Test Company');
    form.append('po_box', 'P.O. Box 123');
    form.append('city', 'Nassau');
    form.append('telephone', '+1-242-555-0123');
    form.append('email', 'test@example.com');
    form.append('practice_track', 'Civil');
    form.append('payment_method', 'Bank Transfer');
    form.append('consent', 'on');
    form.append('payment_proof', fs.createReadStream(testFilePath), 'test-payment.txt');

    try {
        const response = await fetch('http://localhost:3000/api/register', {
            method: 'POST',
            body: form
        });

        const result = await response.json();
        console.log('Registration response:', result);

        if (response.ok) {
            console.log('✅ Registration submitted successfully!');
            console.log('Registration ID:', result.registration_id);
        } else {
            console.error('❌ Registration failed:', result.message);
        }

    } catch (error) {
        console.error('❌ Test failed:', error.message);
    } finally {
        // Clean up test file
        if (fs.existsSync(testFilePath)) {
            fs.unlinkSync(testFilePath);
        }
    }
}

testRegistration().then(() => {
    console.log('Registration test completed');
    process.exit(0);
}).catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});