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

When a thread finishes a turn, its copy of Thread Status notes whether the end of the reply asks you something ("Want me to…?", "Tell me which…"). It saves that note in the plugin's own store (Claude Code keeps it with your plugin data), and every thread's panel reads those notes. A thread only shows up there after it has finished a turn with the plugin installed.

## What it reads, writes and hooks

- **Reads** the desktop app's session files (`claude-code-sessions/<account>/<org>/local_*.json` under the app's data folder). It reads them only; it never changes them.
- **Writes no files.** It keeps one note per thread in the plugin's own store: the time and the closing words of that thread's last answer, kept only when they ask you something. Notes older than 3 days are removed.
- **Adds** the `/threads` command, which opens the panel. Its `command.run` hook only answers `/threads` and leaves every other command alone.
- **Hooks** `turn.start` and `turn.complete` to write the note above, and `session.start` to open the panel. It changes nothing about the turn.
- Sends nothing over the network.

## Notes

- The desktop app's session files aren't a published format, so a future app update could change what the panel can see. If a section looks wrong, open an issue.
- Threads in the terminal version of Claude Code have no desktop session files, so they don't show up in the panel.

## Privacy

See [PRIVACY.md](PRIVACY.md). In short: everything stays on your computer and nothing is sent anywhere.

## License

MIT
