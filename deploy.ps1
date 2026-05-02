# ─── НАСТРОЙКИ ────────────────────────────────────────────────────────────────
$repoPath = "C:\Users\dopemoney\telegram-bot"  # замени на свой путь
$githubUser = "dxpemxney"                   # замени
$githubToken = "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"               # замени
$commitMessage = "update"
# ──────────────────────────────────────────────────────────────────────────────

Set-Location $repoPath

# Вшиваем токен в remote чтобы push не спрашивал пароль
$remoteUrl = git remote get-url origin
if ($remoteUrl -notmatch "https://.+@") {
    $newUrl = $remoteUrl -replace "https://", "https://${githubUser}:${githubToken}@"
    git remote set-url origin $newUrl
}

git add .
git commit -m $commitMessage
git push

Write-Host ""
Write-Host "✅ Задеплоено! Railway подхватит изменения автоматически." -ForegroundColor Green
