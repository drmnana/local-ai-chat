#define MyAppName "Local Chat Viewer"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Maher"
#define MyAppExeName "local-chat-viewer.exe"

[Setup]
AppId={{A6EDE9B4-9976-48B4-A13F-1AE9236E1085}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=..\dist\installer
OutputBaseFilename=LocalChatViewerSetup
Compression=lzma
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "..\dist\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\dist\claude-reply.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\dist\start-trigger.ps1"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\setup-prerequisites.ps1"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist

[Dirs]
Name: "{userappdata}\Local Chat Viewer\logs"
Name: "{userappdata}\Local Chat Viewer\logs\trash"

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional icons:"; Flags: unchecked

[Run]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\setup-prerequisites.ps1"""; Description: "Set up prerequisites now (Node.js, Claude Code, Codex CLI)"; Flags: postinstall skipifsilent unchecked; Check: FileExists(ExpandConstant('{app}\setup-prerequisites.ps1'))
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName}"; Flags: nowait postinstall skipifsilent
