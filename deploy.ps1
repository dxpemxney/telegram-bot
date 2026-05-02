# ─── НАСТРОЙКИ ────────────────────────────────────────────────────────────────
$repoPath = "C:\Users\dopemoney\telegram-bot"
$githubUser = "dxpemxney"
$githubToken = "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"
$commitMessage = "update"
# ──────────────────────────────────────────────────────────────────────────────

Set-Location $repoPath

# Всегда обновляем URL с актуальным токеном
git remote set-url origin "https://${githubUser}:${githubToken}@github.com/${githubUser}/telegram-bot.git"

git add .
git commit -m $commitMessage
git push

Write-Host ""
Write-Host "Задеплоено! Railway подхватит изменения автоматически." -ForegroundColor Green
