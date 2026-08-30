$path = (Resolve-Path "src/lib/gemini.ts").Path
$lines = [System.IO.File]::ReadAllLines($path)
$kept = $lines[0..477]
[System.IO.File]::WriteAllLines($path, $kept, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "Done. Lines written: $($kept.Count)"
