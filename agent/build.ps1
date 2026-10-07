# Builds the ACC Coach desktop app (run from anywhere: powershell -File agent\build.ps1 [-Store]):
#  1. PyInstaller -> agent\dist\ACC Coach\ (the program and its Python runtime)
#  2. Inno Setup  -> agent\dist\ACC-Coach-Setup.exe, copied to web\public\downloads\ and
#     web\lib\app-release.ts updated (skipped with -Store)
#  3. MSIX        -> agent\dist\ACC-Coach-<version>.msix for the Microsoft Store (identity from
#     agent\store\identity.json; unsigned: the Store signs it)
# Bump version.py first; then commit and push to publish it on the site, and upload the .msix in Partner Center.
param([switch]$Store)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
$version = (Select-String -Path version.py -Pattern '__version__ = "(.+)"').Matches[0].Groups[1].Value
$py = Join-Path $root ".venv\Scripts\python.exe"

New-Item -ItemType Directory -Force agent\build | Out-Null
& $py -c "import sys; sys.path[:0] = ['agent', '.']; sys.path[:0] = ['agent/store']; from logo import make_logo; make_logo(256, rounded=True).save('agent/build/icon.ico', sizes=[(s, s) for s in (16, 24, 32, 48, 64, 128, 256)], append_images=[make_logo(s, rounded=True) for s in (16, 24, 32, 48, 64, 128)])"

# The MoTeC reader (ldparser, GPL-3.0), plotting and database packages are not part of the app
& $py -m PyInstaller --noconfirm --clean --windowed --name "ACC Coach" `
    --icon (Join-Path $root "agent\build\icon.ico") --paths $root --hidden-import pystray._win32 --add-data "$(Join-Path $root 'agent\assets');assets" `
    --exclude-module matplotlib --exclude-module ldparser --exclude-module psycopg `
    --exclude-module tkinter --exclude-module pandas `
    --distpath agent\dist --workpath agent\build\work --specpath agent\build agent\acc_coach_app.py
if ($LASTEXITCODE) { throw "PyInstaller failed" }

if (-not $Store) {
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
}

# MSIX: the PyInstaller folder + manifest + images + resources.pri (which image for which scale)
$sdk = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin\10.*\x64\makeappx.exe" |
    Sort-Object FullName | Select-Object -Last 1 | Split-Path
$id = Get-Content agent\store\identity.json -Raw | ConvertFrom-Json
$layout = "agent\build\msix"
Remove-Item -Recurse -Force $layout, agent\build\pri -ErrorAction SilentlyContinue
Copy-Item "agent\dist\ACC Coach" $layout -Recurse
& $py agent\store\make_assets.py agent\build\pri\Assets --listing agent\dist\store-logos
if ($LASTEXITCODE) { throw "Store images failed" }
Copy-Item agent\build\pri\Assets "$layout\Assets" -Recurse
$manifest = Get-Content agent\store\AppxManifest.xml -Raw
# MSIX versions have four parts, the last one 0 for the Store: "0.3" -> "0.3.0.0"
$parts = @($version.Split('.')); while ($parts.Count -lt 4) { $parts += '0' }
$msixVersion = ($parts[0..3] -join '.')
$values = @{ NAME = $id.name; PUBLISHER = $id.publisher; PUBLISHER_DISPLAY_NAME = $id.publisher_display_name; VERSION = $msixVersion }
foreach ($k in $values.Keys) { $manifest = $manifest.Replace("`$$k`$", [System.Security.SecurityElement]::Escape($values[$k])) }
[System.IO.File]::WriteAllText((Join-Path $root "$layout\AppxManifest.xml"), $manifest)
& "$sdk\makepri.exe" createconfig /cf agent\build\pri\priconfig.xml /dq en-US /pv 10.0.0 /o | Out-Null
if ($LASTEXITCODE) { throw "makepri createconfig failed" }
# One package, not a bundle: keep every scale in resources.pri (the default config moves scales
# other than 100 % to resource packs, and Windows would then stretch the 100 % images)
$cfg = [xml](Get-Content agent\build\pri\priconfig.xml -Raw)
$cfg.SelectNodes("//packaging") | ForEach-Object { [void]$_.ParentNode.RemoveChild($_) }
$cfg.Save((Join-Path $root "agent\build\pri\priconfig.xml"))
& "$sdk\makepri.exe" new /pr agent\build\pri /cf agent\build\pri\priconfig.xml /mn "$layout\AppxManifest.xml" `
    /of "$layout\resources.pri" /o | Out-Null
if ($LASTEXITCODE) { throw "makepri failed" }
$msix = "agent\dist\ACC-Coach-$version.msix"
& "$sdk\makeappx.exe" pack /d $layout /p $msix /o | Out-Null
if ($LASTEXITCODE) { throw "makeappx failed" }
$mb = [math]::Round((Get-Item $msix).Length / 1MB, 1)
"Built $msix ($mb MB) for $($id.name) / $($id.publisher)"
