$repoPath = "C:\Users\dopemoney\telegram-bot"
$commitMessage = "update"

Set-Location $repoPath
git add .
git commit -m $commitMessage
git push

Write-Host ""
Write-Host "Задеплоено!" -ForegroundColor Green