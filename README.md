# Daily Agenda

Daily Agenda appends the calendar events of a periodic note's day, week, month, quarter or year to the end of that note, one line per event. It works on desktop and on mobile.

Open a periodic note and run **Sync agenda with current note** from the command palette. In any other note the command says no date was found. It reads every enabled account, writes a line for each event through the matching template and adds the lines at the end of the note. Running it again adds only the events whose line is not in the note yet. A line counts as present when the note has the same text, whether its checkbox is ticked or not, so an event renamed or moved in the calendar is added as a new line.

## Periodic notes

Under **Periodic notes → Read from**, choose where the folders and name formats of your periodic notes come from: the Periodic Notes plugin, the core Daily notes plugin, or your own formats. **Automatic** tries them in that order.

## Accounts

Add an account with the **+** next to **Accounts** and give it a name such as "Work". The name is what `{{account}}` writes.

### iCloud

1. Sign in at [account.apple.com](https://account.apple.com), open **Sign-In and Security → App-Specific Passwords** and create a password for Obsidian.
2. Set the account's kind to **iCloud**, enter your Apple ID and pick or create a secret holding the app-specific password.
3. Leave the server URL as `https://caldav.icloud.com`.

Every iCloud calendar that holds events is read.

### Google

Google lets the plugin read your calendars only through an OAuth client you create once in your own Google Cloud project.

1. In the [Google Cloud console](https://console.cloud.google.com/), create a project and enable the **Google Calendar API** under **APIs & Services → Library**.
2. Configure the **OAuth consent screen** with the user type **External** and add yourself as a user. While the app's publishing status is **Testing**, Google lets refresh tokens expire after 7 days, so you would have to sign in again every week. Choose **Publish app** to move it to **In production**. For personal use the app stays unverified, and Google shows an "unverified app" warning once when you sign in.
3. Under [Credentials](https://console.cloud.google.com/apis/credentials), create an **OAuth client ID** of type **Web application** and add exactly this **Authorized redirect URI**: `https://carlesba.github.io/obsidian-daily-agenda/oauth/`
4. Set the account's kind to **Google**, paste the client ID, and pick or create a secret holding the client secret.
5. Choose **Sign in with Google**, allow read-only access to your calendars, and let the browser send you back to Obsidian.

Once signed in, the account page shows the Google account's address and one toggle per calendar. Your primary calendar and the calendars shown in Google Calendar start switched on. Use **Refresh calendars** after adding a calendar in Google, and **Sign out** to forget the sign-in.

### Any iCal address

1. Copy the calendar's iCal address. In Google Calendar, for example, open **Settings**, pick the calendar under **Settings for my calendars**, open **Integrate calendar** and copy the **Secret address in iCal format**.
2. Set the account's kind to **iCal URL** and pick or create a secret holding that address.

The secret address lets anyone read the calendar, so it is kept in Obsidian's secret storage rather than in the plugin's settings. Add one account per calendar.

## Security

Signing in to Google uses the authorization code flow with PKCE (S256). The code verifier stays in the plugin's memory and is never written to disk. Each sign-in carries a random `state` nonce that is accepted once and only within 10 minutes. The redirect page, served from this repository's `docs/oauth/`, loads nothing external, forwards only `code`, `state` and `error` to the fixed address `obsidian://daily-agenda`, and redirects nowhere else. The client secret and the refresh token are kept in Obsidian's keychain, not in `data.json`, and access tokens live only in memory. The plugin asks only for the read-only calendar scope. The `state` also carries the vault's name so that the redirect reopens the right vault, which means Google sees that name.

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

Calendars stored only on the device, such as a local calendar on a phone, are not supported yet. Only iCloud and Google accounts and iCal addresses can be read.
