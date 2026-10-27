# Daily Agenda

Daily Agenda appends the calendar events of a periodic note's day, week, month, quarter or year to the end of that note, one line per event. It works on desktop and on mobile.

Open a periodic note and run **Append agenda** from the command palette. The command only shows up when the open note is a periodic note. It reads every enabled account, writes a line for each event through the matching template and adds the lines at the end of the note. Running it again appends the events again, because nothing is tracked.

## Periodic notes

Under **Periodic notes → Read from**, choose where the folders and name formats of your periodic notes come from: the Periodic Notes plugin, the core Daily notes plugin, or your own formats. **Automatic** tries them in that order.

## Accounts

Add an account with the **+** next to **Accounts** and give it a name such as "Work". The name is what `{{account}}` writes.

### iCloud

1. Sign in at [account.apple.com](https://account.apple.com), open **Sign-In and Security → App-Specific Passwords** and create a password for Obsidian.
2. Set the account's kind to **iCloud**, enter your Apple ID and pick or create a secret holding the app-specific password.
3. Leave the server URL as `https://caldav.icloud.com`.

Every iCloud calendar that holds events is read.

### Google Calendar, or any iCal address

1. In Google Calendar, open **Settings**, pick the calendar under **Settings for my calendars**, open **Integrate calendar** and copy the **Secret address in iCal format**.
2. Set the account's kind to **iCal URL** and pick or create a secret holding that address.

The secret address lets anyone read the calendar, so it is kept in Obsidian's secret storage rather than in the plugin's settings. Add one account per calendar.

## Templates

Each template has a period, a kind (timed or all-day events), an account and a line. For every event, the enabled templates whose period, kind and account match are candidates. The one that names the most of period and account wins, and a tie goes to the template higher in the list. Events without a matching template are skipped.

The plugin starts with two templates for any period and any account:

```
- [ ] 🗓️ **{{start:HH:mm}}**–**{{end:HH:mm}}** ({{account}}) {{title}}
- [ ] 🗓️ ({{account}}) {{title}}
```

Lines are ordered by start time, and each day's all-day events come first.

| Placeholder | Writes |
| --- | --- |
| `{{title}}` | The event's title |
| `{{account}}` | The account's name |
| `{{calendar}}` | The calendar's name, or the account's name when the calendar has none |
| `{{start}}`, `{{start:FMT}}` | The start time, as `HH:mm` unless a format is given |
| `{{end}}`, `{{end:FMT}}` | The end time, as `HH:mm` unless a format is given. An all-day event ends on its last day |
| `{{date}}`, `{{date:FMT}}` | The start date, as `YYYY-MM-DD` unless a format is given |
| `{{location}}` | The location |
| `{{description}}` | The description, on one line |
| `{{url}}` | The event's URL |
| `{{organizer}}` | The organiser's name, or their email address |
| `{{attendees}}` | The attendees' names or email addresses, separated by commas |
| `{{status}}` | The event's status, such as `CONFIRMED` or `TENTATIVE` |

`FMT` is a [Moment format](https://momentjs.com/docs/#/displaying/format/), as in `{{start:h:mm a}}` or `{{date:ddd D MMM}}`. Anything else between double braces is written as typed. Cancelled events are left out.

## Limits

Calendars stored only on the device, such as a local calendar on a phone, are not supported yet. Only iCloud accounts and iCal addresses can be read.
