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
