Output assets/list-all.gif

Set Shell zsh
Set Width 1200
Set Height 400
Set FontSize 14
Set Theme "Catppuccin Mocha"

Type@0ms "export PATH=__REPO_ROOT__/scripts/demo-bin:${PATH}"
Enter
Sleep 0.5s
Type@0ms "clear"
Enter
Sleep 0.3s

Set TypingSpeed 50ms
Type "c list --all"
Enter
Sleep 4s
Screenshot assets/list-all.png
