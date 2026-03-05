' Stop Nexus Server
Set WshShell = CreateObject("WScript.Shell")

On Error Resume Next
WshShell.Run "cmd /c for /f ""tokens=5"" %a in ('netstat -aon ^| findstr "":3456 "" ^| findstr ""LISTENING""') do taskkill /PID %a /F", 0, True
On Error GoTo 0

MsgBox "Nexus server stopped.", vbInformation, "Nexus"
