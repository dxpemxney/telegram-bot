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
