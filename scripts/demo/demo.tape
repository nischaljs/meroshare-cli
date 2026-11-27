# The terminal demo in the README (docs/media/demo.gif).
# Run it through scripts/demo/record.sh, which starts the fake MeroShare first.

Output docs/media/demo.gif

Set Shell bash
Set FontFamily "JetBrainsMono Nerd Font Mono"
Set FontSize 13
Set Width 1180
Set Height 660
Set Padding 18
Set LineHeight 1.15
Set TypingSpeed 55ms
Set Framerate 12
Set PlaybackSpeed 1
Set Theme "Catppuccin Mocha"
Set WindowBar Colorful
Set CursorBlink false

Hide
Type "source $DEMO_ENV && export PS1='$ ' && clear"
Enter
Sleep 500ms
Show

# 1. one look at every family account
Type "ipo doctor"
Sleep 400ms
Enter
Wait+Screen@20s /need attention/
Sleep 5s

# 2. fix the blocked account: a new password, after a typed yes
Hide
Type "clear"
Enter
Sleep 300ms
Show
Type "ipo fix Ram"
Sleep 400ms
Enter
Wait+Screen@20s /Generate a strong one/
Sleep 1.5s
Enter
Wait+Screen@20s /to go ahead/
Sleep 1s
Type "yes"
Sleep 600ms
Enter
Wait+Screen@20s /Password changed/
Sleep 3.5s

# 3. apply from every account in one go
Hide
Type "clear"
Enter
Sleep 300ms
Show
Type "ipo apply"
Sleep 400ms
Enter
Wait+Screen@20s /Apply for Demo/
Sleep 2.5s
Enter
Wait+Screen@20s /Kitta for/
Sleep 1s
Enter
Wait+Screen@20s /Press Enter to apply/
Sleep 1.2s
Enter
Wait+Screen@30s /Results/
Sleep 6s
