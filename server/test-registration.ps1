# Test registration with PowerShell
$uri = "http://localhost:3000/api/register"

# Create form data
$form = @{
    middle_temple_member = "Yes"
    bmts_member_interest = "Yes"
    title = "Mr."
    first_name = "Test"
    last_name = "User"
    company = "Test Company"
    po_box = "P.O. Box 123"
    city = "Nassau"
    telephone = "+1-242-555-0123"
    email = "test@example.com"
    practice_track = "Civil"
    payment_method = "Bank Transfer"
    consent = "on"
}

# Create a test file for payment proof
$testFile = "test-payment.txt"
"This is a test payment proof document" | Out-File -FilePath $testFile -Encoding UTF8

try {
    Write-Host "Testing registration submission..."
    
    # Submit the form
    $response = Invoke-WebRequest -Uri $uri -Method POST -Form $form -InFile @{payment_proof = $testFile}
    
    Write-Host "Response Status: $($response.StatusCode)"
    Write-Host "Response Content: $($response.Content)"
    
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ Registration submitted successfully!"
    } else {
        Write-Host "❌ Registration failed with status: $($response.StatusCode)"
    }
    
} catch {
    Write-Host "❌ Error during registration test: $($_.Exception.Message)"
} finally {
    # Clean up test file
    if (Test-Path $testFile) {
        Remove-Item $testFile
    }
}