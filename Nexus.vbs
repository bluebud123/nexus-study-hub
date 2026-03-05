' Nexus Study Hub Launcher
' Double-click to start Nexus — no terminal window shown

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Get script directory
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

' Check server.js exists
If Not fso.FileExists(scriptDir & "\server.js") Then
    MsgBox "server.js not found!" & vbCrLf & vbCrLf & _
           "Make sure Nexus.vbs is in the same folder as server.js", _
           vbExclamation, "Nexus"
    WScript.Quit
End If

' Check if Node.js is installed
On Error Resume Next
Set nodeCheck = WshShell.Exec("node --version")
nodeVersion = ""
If Err.Number = 0 Then
    nodeVersion = Trim(nodeCheck.StdOut.ReadLine())
End If
On Error GoTo 0

If nodeVersion = "" Then
    result = MsgBox("Node.js is not installed on this computer." & vbCrLf & vbCrLf & _
                    "Nexus needs Node.js to run." & vbCrLf & vbCrLf & _
                    "Click YES to open the download page (choose LTS version)." & vbCrLf & _
                    "After installing, restart your computer and try again.", _
                    vbYesNo + vbExclamation, "Nexus — Node.js Required")
    If result = vbYes Then
        WshShell.Run "https://nodejs.org", 1, False
    End If
    WScript.Quit
End If

' Kill any existing process on port 3456
On Error Resume Next
WshShell.Run "cmd /c for /f ""tokens=5"" %a in ('netstat -aon ^| findstr "":3456 "" ^| findstr ""LISTENING""') do taskkill /PID %a /F", 0, True
On Error GoTo 0

' Wait a moment for port to free
WScript.Sleep 1000

' Start the server (hidden window)
WshShell.Run "cmd /c cd /d """ & scriptDir & """ && node server.js", 0, False

' Wait for server to start
WScript.Sleep 2000

' Check if server is actually running by trying the port
serverReady = False
For i = 1 To 5
    On Error Resume Next
    Set http = CreateObject("MSXML2.XMLHTTP")
    http.Open "GET", "http://localhost:3456", False
    http.Send
    If Err.Number = 0 And http.Status = 200 Then
        serverReady = True
        Exit For
    End If
    On Error GoTo 0
    WScript.Sleep 1000
Next

If serverReady Then
    WshShell.Run "http://localhost:3456", 1, False
Else
    MsgBox "Nexus server failed to start." & vbCrLf & vbCrLf & _
           "Try running this manually in a terminal:" & vbCrLf & _
           "  cd " & scriptDir & vbCrLf & _
           "  node server.js" & vbCrLf & vbCrLf & _
           "Check for error messages.", _
           vbExclamation, "Nexus"
End If
