# c - Claude Code Session Manager

Track and manage Claude Code sessions with metadata, resource linking, and tmux integration.

## Installation

```bash
# Build
cd ~/workspace/c && npm run build

# Symlink to ~/bin (avoids nvm lazy-load conflicts)
ln -sf ~/workspace/c/dist/index.js ~/bin/c
```

## Commands

### List Sessions
```
c                     Live + closed sessions (default view)
c list --all          All sessions including done/archived
c list --done         Done sessions only
c list --archived     Archived sessions only
c waiting             Sessions waiting on user input
```

### Session Details
```
c show <id>           Full session detail (accepts UUID prefix or humanhash)
c resume <id>         Resume session (runs `claude -r <id>`)
```

### Lifecycle
```
c done <id>           Mark session as done
c archive <id>        Mark session as archived
c reopen <id>         Reopen a closed/done/archived session
```

### Linking Resources
```
c link --pr <url>     Link a GitHub PR
c link --jira <key>   Link a JIRA ticket (e.g., MAC-1234)
c link --branch <name> Link a git branch
c unlink --pr         Remove PR link
c unlink --jira       Remove JIRA link
```

### Tagging & Metadata
```
c tag <tag>           Add tag to session
c untag <tag>         Remove tag
c title "..."         Set session title (overrides humanhash in display)
c meta key=value      Set arbitrary metadata
```

### Queries
```
c prs                 List all sessions with linked PRs
c jira                List all sessions with linked JIRA tickets
c find <query>        Search by title, tag, branch, humanhash
```

### Cleanup
```
c clean               Show orphaned sessions/resources
c clean --prune       Delete orphaned resources
```

### tmux Integration
```
c tmux-status         Status bar output (add to status-right)
c tmux-pick           fzf picker to select and resume a session
```

## Session ID Formats

- `125bb1df` — UUID prefix (any unique prefix works)
- `three-georgia-xray-jig` — Humanhash (auto-generated from session ID)
- `"Fix scrolling"` — User-provided title (set via `c title`)

## Hooks

Add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {"hooks": [{"type": "command", "command": "c hook session-start", "async": true}]}
    ],
    "Stop": [
      {"hooks": [{"type": "command", "command": "c hook session-end", "async": true}]}
    ],
    "PreToolUse": [
      {
        "matcher": "AskUserQuestion",
        "hooks": [{"type": "command", "command": "c hook notification-waiting", "async": true}]
      }
    ],
    "UserPromptSubmit": [
      {"hooks": [{"type": "command", "command": "c hook user-prompt", "async": true}]}
    ],
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{"type": "command", "command": "c hook post-bash", "async": true}]
      }
    ]
  }
}
```

## Data Storage

- Index: `~/.c/index.toml`
- Format: TOML with session metadata, resources, tags, and custom fields
