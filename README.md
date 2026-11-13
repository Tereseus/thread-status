# Thread Status

A panel beside the chat in the Claude desktop app that shows, at a glance:

- 🙋 **Needs you**: threads that ended their turn asking you something, and threads waiting on your approval
- ⚙ **Working**: threads in the middle of a turn, and for how long
- ✅ **Recently done**: threads that finished in the last day
- 🕒 **Scheduled jobs**: when each one last ran, and whether it's running now

It opens by itself in every thread. To open it again after closing it, type `/threads`.

It reads only the desktop app's own files on your computer. It sends nothing anywhere and needs nothing else installed. It works on Windows, macOS and Linux.

## Install

In the desktop app: click **+** next to the prompt box, then **Plugins**, **Add marketplace**, and enter `Tereseus/thread-status`. Then add the **thread-status** plugin.

In Claude Code in a terminal:

```
/plugin install thread-status --marketplace Tereseus/thread-status
```

From a shell:

```
claude plugin install thread-status --marketplace Tereseus/thread-status
```

Then type `/reload-plugins` in any open thread, or start a new one.

## How "needs you" works

When a thread finishes a turn, its copy of Thread Status notes whether the end of the reply asks you something ("Want me to…?", "Tell me which…"). It saves that note in `~/.claude/thread-status/asks/`, and every thread's panel reads those notes. A thread only shows up there after it has finished a turn with the plugin installed.

## Notes

- The desktop app's session files aren't a published format, so a future app update could change what the panel can see. If a section looks wrong, open an issue.
- Threads in the terminal version of Claude Code have no desktop session files, so they don't show up in the panel.

## License

MIT
