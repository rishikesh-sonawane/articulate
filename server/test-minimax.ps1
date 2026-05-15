$body = @{
    model = "minimax-m2.5-free"
    max_tokens = 100
    messages = @(
        @{
            role = "user"
            content = "hello"
        }
    )
} | ConvertTo-Json -Depth 5

$response = Invoke-RestMethod `
    -Uri "https://opencode.ai/zen/v1/messages" `
    -Method POST `
    -Headers @{
        "x-api-key" = "$($env:apiKey)"
        "anthropic-version" = "2023-06-01"
    } `
    -ContentType "application/json" `
    -Body $body

$response