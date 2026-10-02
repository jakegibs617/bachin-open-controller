set launcherPath to POSIX path of (path to me)
set repoPathCommand to "target=" & quoted form of launcherPath & "; case \"$target\" in *.app/) cd \"$target/..\" ;; *) cd \"$(dirname \"$target\")/..\" ;; esac; pwd"
set repoPath to do shell script repoPathCommand
set launchCommand to "export PATH=\"/opt/homebrew/bin:/usr/local/bin:$PATH\"; export ELECTRON_ENABLE_LOGGING=1; export ELECTRON_ENABLE_STACK_DUMPING=1; unset ELECTRON_RUN_AS_NODE; cd " & quoted form of repoPath & " && clear && echo 'Starting Bachin Open Controller from the latest local source with import logs...' && npm run dev 2>&1 | tee /tmp/bachin-open-controller-dev.log"

tell application "Terminal"
	activate
	do script launchCommand
end tell
