# Publishes store-pages/ (the Microsoft Store listing's Website and Privacy policy pages) to the public
# repository Xhanet/acc-coach-site, served by GitHub Pages at https://xhanet.github.io/acc-coach-site/.
#
#   powershell -File agent\store\publish-pages.ps1
#
# The public repository holds a single commit with just these files, made under GitHub's noreply
# address: the main repository's commits carry a personal email, which a public repository would show
# to everyone. Each run replaces that commit (force push): the history lives in the main repository.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$src = Join-Path $root "store-pages"
$repo = "https://github.com/Xhanet/acc-coach-site.git"
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("acc-coach-pages-" + [guid]::NewGuid())
New-Item -ItemType Directory $tmp | Out-Null
try {
    Copy-Item -Recurse -Force -Path (Join-Path $src "*") -Destination $tmp
    Copy-Item -Force (Join-Path $src ".nojekyll") $tmp   # dot file: keeps GitHub Pages from running Jekyll
    git -C $tmp init -q -b main
    git -C $tmp add -A
    git -C $tmp -c user.name="Xhanet" -c user.email="278630608+Xhanet@users.noreply.github.com" commit -q -m "ACC Coach public pages (Microsoft Store listing: website and privacy policy)"
    if ($LASTEXITCODE -ne 0) { throw "git commit failed" }
    git -C $tmp push --force $repo main
    if ($LASTEXITCODE -ne 0) { throw "git push failed" }
    Write-Host "Published: https://xhanet.github.io/acc-coach-site/ (live about a minute after the push)"
}
finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
