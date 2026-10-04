# Builds the ACC Coach desktop app (run from anywhere: powershell -File agent\build.ps1):
#  1. PyInstaller → agent\dist\ACC Coach\ (the program and its Python runtime)
#  2. Inno Setup  → agent\dist\ACC-Coach-Setup.exe
#  3. copies the installer to web\public\downloads\ and updates web\lib\app-release.ts
# Bump version.py first; then commit and push to publish it on the site.
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
$version = (Select-String -Path version.py -Pattern '__version__ = "(.+)"').Matches[0].Groups[1].Value
$py = Join-Path $root ".venv\Scripts\python.exe"

New-Item -ItemType Directory -Force agent\build | Out-Null
& $py -c "import sys; sys.path[:0] = ['agent', '.']; from acc_coach_app import make_icon; make_icon(256).save('agent/build/icon.ico', sizes=[(s, s) for s in (16, 24, 32, 48, 64, 128, 256)])"

# The MoTeC reader (ldparser, GPL-3.0), plotting and database packages are not part of the app
& $py -m PyInstaller --noconfirm --clean --windowed --name "ACC Coach" `
    --icon (Join-Path $root "agent\build\icon.ico") --paths $root --hidden-import pystray._win32 `
    --exclude-module matplotlib --exclude-module ldparser --exclude-module psycopg `
    --exclude-module tkinter --exclude-module pandas `
    --distpath agent\dist --workpath agent\build\work --specpath agent\build agent\acc_coach_app.py
if ($LASTEXITCODE) { throw "PyInstaller failed" }

& "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe" /Qp "/DAppVersion=$version" agent\installer.iss
if ($LASTEXITCODE) { throw "Inno Setup failed" }

$setup = "agent\dist\ACC-Coach-Setup.exe"
New-Item -ItemType Directory -Force web\public\downloads | Out-Null
Copy-Item $setup web\public\downloads\ -Force
$mb = [math]::Round((Get-Item $setup).Length / 1MB, 1)
$release = (Get-Content web\lib\app-release.ts -Raw) `
    -replace 'version: ".*?"', "version: `"$version`"" `
    -replace 'sizeMb: [\d.]+', "sizeMb: $mb" `
    -replace 'date: ".*?"', "date: `"$(Get-Date -Format yyyy-MM-dd)`""
[System.IO.File]::WriteAllText((Join-Path $root "web\lib\app-release.ts"), $release)
"Built ACC Coach $version -> $setup ($mb MB), copied to web\public\downloads\"
