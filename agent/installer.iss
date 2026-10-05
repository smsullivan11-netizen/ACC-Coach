; Windows installer of the ACC Coach desktop app (Inno Setup 6). Built by agent\build.ps1.
; Per-user install (no administrator rights), in %LOCALAPPDATA%\Programs\ACC Coach.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif

[Setup]
AppId={{6B2E9F3A-4C1D-4E8B-9A57-ACC0C0AC0A01}
AppName=ACC Coach
AppVersion={#AppVersion}
AppPublisher=PCGR
DefaultDirName={localappdata}\Programs\ACC Coach
DisableDirPage=yes
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=dist
OutputBaseFilename=ACC-Coach-Setup
SetupIconFile=build\icon.ico
UninstallDisplayIcon={app}\ACC Coach.exe
UninstallDisplayName=ACC Coach
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
; Same mutex as the app: the installer asks to close a running ACC Coach before updating it
AppMutex=ACCCoachAgent
CloseApplications=yes

[Files]
Source: "dist\ACC Coach\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{userprograms}\ACC Coach"; Filename: "{app}\ACC Coach.exe"

[Run]
Filename: "{app}\ACC Coach.exe"; Description: "Start ACC Coach"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "taskkill.exe"; Parameters: "/IM ""ACC Coach.exe"" /F"; Flags: runhidden; RunOnceId: "StopApp"

[Registry]
; The app adds itself to "start with Windows"; the uninstaller removes that entry
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: none; ValueName: "ACC Coach"; Flags: uninsdeletevalue dontcreatekey
