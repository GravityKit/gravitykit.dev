---
title: "Working with dates and time zones in Gravity Forms"
sidebar_label: "Dates and time zones"
description: "A developer guide to dates and time zones when building on Gravity Forms: how each value is stored, which WordPress functions to use, daylight saving, all-day ranges, recurrence, external calendar feeds, ISO 8601 output, front-end JavaScript and testing."
---

# Working with dates and time zones in Gravity Forms

Date bugs are easy to write and hard to see. Most of them pass every test on a server set to UTC and only show up for a customer in Sydney, or in the one week of March when Europe and North America are on different clocks.

This guide collects what GravityKit has learned building calendars, boards, Views and an event field on top of Gravity Forms. Each section names a common mistake, the correct approach, and a test that catches it.

All PHP output below was produced with PHP 8.4 under `date_default_timezone_set( 'UTC' )`, which is what WordPress sets. All JavaScript output was produced with Node 20 under the `TZ` environment variable named in each example.

## The short version

1. Know which clock every value belongs to: UTC, the site, the event, or the viewer.
2. Gravity Forms stores entry dates (`date_created`, `date_updated`) in UTC, and Date and Time field values as wall-clock text with no zone.
3. Convert UTC values for display. Never convert wall-clock values.
4. Use one base per calculation, and name it in the variable.
5. Build query bounds in the zone of the column you compare against.
6. Treat a date with no time as a day, not as midnight.
7. Parse with the format the value was written in.
8. Use named zones (`America/New_York`) and a real time zone library. Never add 86,400 seconds for "tomorrow".
9. Decide once whether an end date is the last day used or the first free day.
10. Test with a site zone far from UTC, a browser zone different from the site's, and fixtures on daylight saving days.

## 1. The four clocks

Every date value belongs to one clock. Most bugs come from reading a value on one clock as if it were on another.

| Clock | What it is | Where it comes from |
|---|---|---|
| UTC | A single moment, the same everywhere | `time()`, `gmdate()`, the `date_created` column |
| Site | The zone set in **Settings > General > Timezone** | `wp_timezone()` |
| Event (or entry) | A zone stored with one entry, such as a conference in Berlin on a New York site | A field value, such as the Timezone input of the Event field |
| Viewer | The zone of the browser looking at the page | JavaScript `Date`, `Intl` with no `timeZone` |

A wall-clock value ("2026-10-03 10:00") is not a moment until you say which clock it is on. "10:00 Berlin" and "10:00 New York" are six hours apart.

Before you write any date code, answer three questions:

- Which clock is the stored value on?
- Which clock should the person reading it see?
- Where does the conversion happen? (Pick one place.)

## 2. How Gravity Forms stores dates

| Value | Stored as | Clock |
|---|---|---|
| Entry `date_created`, `date_updated` | `Y-m-d H:i:s` from MySQL `utc_timestamp()` | UTC |
| Entry note `date_created` | `Y-m-d H:i:s` from `utc_timestamp()` | UTC |
| Date field | `Y-m-d`, whatever the field's display format | None (a calendar day) |
| Time field, 12-hour | `hh:mm am` or `hh:mm pm`, for example `02:30 pm` | None (wall clock) |
| Time field, 24-hour | `HH:MM`, for example `14:30`. `24:00` passes validation. | None (wall clock) |
| Date and Time together | Two separate fields with no link and no zone | Whatever clock the person meant, usually the site |

A few details that matter:

- **The Date field's display format does not change what is stored.** `GF_Field_Date` parses the submitted text with the field's `dateFormat` and saves `Y-m-d` (`GFFormsModel::prepare_date()`). When `dateFormat` is empty, Gravity Forms assumes `mdy`. So an unset format turns `03/04/2026` into March 4, and refuses `25/12/2026` as invalid.
- **The Time field has no date and no zone.** It is a label on a wall clock. In a 24-hour field, `24:00` is accepted; PHP reads `2026-10-03 24:00` as `2026-10-04 00:00`.
- **A Date field plus a Time field is not a moment.** Joining them gives a wall-clock value. You still need a zone, usually `wp_timezone()`.
- **Fields from add-ons can store their own zone.** Read the add-on's source before you assume a format. The GravityKit Event field is described in the [Event field data reference](/gravity-forms-event-field/data-reference/).

### The GravityKit Event field

The Event field (from the **Gravity Forms Event Field** add-on, field type `event`) puts a whole event into one field. Each part is its own input, stored under `{field ID}.{input ID}`:

- **Dates and times at a glance:** `.1` start date and `.2` end date (`Y-m-d`), `.3` All Day Event (`on`), `.4` start time and `.5` end time, `.6` timezone, `.7` to `.10` the repeat rule, `.11` Show As.
- **Times are stored as typed**, in the site's Time Format on the day of saving, and never rewritten. A time has no zone of its own.
- **Each entry has its own zone** in `.6`: an IANA name (`Europe/Berlin`), `UTC`, or a fixed offset such as `UTC+5.5`, which PHP does not read as a zone name.
- **GravityCalendar shows the time as typed**, whatever the event's zone or the viewer's. The `.ics` feed keeps the offset, so calendar apps get the real moment.

The inputs, repeat rule, merge tags, PHP code to read the values and a list of pitfalls are in the [Event field data reference](/gravity-forms-event-field/data-reference/).

## 3. PHP and WordPress basics

### WordPress runs PHP in UTC

`wp-settings.php` calls `date_default_timezone_set( 'UTC' )`. Every PHP date function that uses the default zone (`date()`, `strtotime()`, `mktime()`, `new DateTime()` with no zone) works in UTC, whatever the site's setting and whatever the server's own zone. Do not change it; WordPress and plugins depend on it.

### Which function to use

| Need | Use | Avoid |
|---|---|---|
| The site's zone | `wp_timezone()` (a `DateTimeZone`) | Building one from `get_option( 'gmt_offset' )` |
| The site's zone as text | `wp_timezone_string()`. Returns a name, or `+05:30` style for a manual offset. | `get_option( 'timezone_string' )`, which is empty for offset sites |
| Now, as a moment | `time()` or `new DateTimeImmutable( 'now', new DateTimeZone( 'UTC' ) )` | `current_time( 'timestamp' )` |
| Now, on the site's clock | `current_datetime()` or `current_time( 'mysql' )` | `date( 'Y-m-d' )`, which is UTC |
| Format a moment for a person | `wp_date( $format, $timestamp )` | `date_i18n()` with a shifted timestamp |
| UTC column to site text | `get_date_from_gmt( $utc )` | Adding `gmt_offset * 3600` |
| Site text to UTC column | `get_gmt_from_date( $local )` | Subtracting `gmt_offset * 3600` |
| Parse a typed value | `DateTimeImmutable::createFromFormat( '!Y-m-d H:i', $value, $zone )` | `strtotime()` |

Two traps in that table:

- **`current_time( 'timestamp' )` is not a real timestamp.** It returns `time()` plus the site's current offset, so it names the wrong moment. Comparing it with a real timestamp gives "2 hours from now" for something 2 hours ago. WordPress's own source says: "Don't use non-GMT timestamp, unless you know the difference and really need to."
- **`gmt_offset` is the offset right now, not the offset on the date you are converting.** For a site with a named zone, WordPress filters `gmt_offset` through `wp_timezone_override_offset()`, which reads today's offset. Subtracting it from a January date in July is an hour off:

```text
NY offsets summer/winter: -04:00 -05:00
Jan 15 12:00 local minus summer offset (-4h): 2026-01-15 16:00 UTC; correct: 2026-01-15 17:00 UTC
```

`GFCommon::get_gmt_timestamp()` works this way (`$local_timestamp - ( get_option( 'gmt_offset' ) * 3600 )`), so do not use it for dates in the other half of the daylight saving year. `GFCommon::get_local_timestamp()` returns a shifted timestamp, like `current_time( 'timestamp' )`; it is only safe to pass to a function that formats it without converting again. `GFCommon::format_date()` expects a **UTC** value; never pass it a Date field value.

## 4. Convert UTC values at the point of display

**The mistake.** Reading `date_created` from an entry and printing it, or putting it on a calendar, as if it were site time. Every entry shows shifted by the site's offset, and entries near midnight land on the wrong day.

**The correct approach.** Convert once, where the value is shown, and only for columns that are UTC:

```php
$created_utc  = $entry['date_created'];                    // '2026-10-15 02:30:00'
$created_site = get_date_from_gmt( $created_utc );         // '2026-10-14 22:30:00' in New York
$label        = wp_date( 'F j, Y g:i a', strtotime( $created_utc ) ); // strtotime() reads it as UTC, which is right here
```

If the value then goes somewhere else that also converts (an `.ics` export, a JavaScript calendar in "local" mode), make sure only one of them does.

**Test.** Set the site zone to a large offset (`Australia/Sydney`, `America/Los_Angeles`). Create an entry at a time that falls on a different day in UTC and in site time. Check the day and hour shown everywhere the value appears.

## 5. Leave wall-clock values alone

**The mistake.** Treating a Date or Time field value as a UTC moment and adding the site's offset. A Time field holding `14:30` prints as `10:30` on a New York site. A Date field moves back a day. Passing a Date field value to a helper built for UTC columns, such as `GFCommon::format_date()`, does the same thing.

**The correct approach.** A wall-clock value is already on the clock the person meant. Format it without converting. If you must parse it to reformat it, parse and format in the same zone:

```php
$value = '2026-03-04'; // Date field
$day   = DateTimeImmutable::createFromFormat( '!Y-m-d', $value, wp_timezone() );
echo wp_date( get_option( 'date_format' ), $day->getTimestamp() ); // same zone in and out
```

**Test.** Set the site zone and the server's zone to different values. Enter `14:30` and `2026-03-04` and check they print unchanged in every output: the entry, merge tags, exports, emails and the REST API.

## 6. One base per calculation

**The mistake.** Applying the offset twice, or measuring "now" against the wrong base. A helper that already adds the site offset is fed a value that already has it, so `now`, `yesterday` and `tomorrow` come out hours off, and on the wrong date near midnight. Or a UTC column is compared with `current_time( 'timestamp' )`.

**The correct approach.** Do storage and differences in UTC, display in the site zone, and say which in the variable name:

```php
$created_ts = strtotime( $entry['date_created'] ); // UTC column, real timestamp
$now_ts     = time();                              // real timestamp
$age        = $now_ts - $created_ts;               // seconds, no zone involved

$today_site = current_datetime()->format( 'Y-m-d' ); // site calendar day
```

Variables like `$start_utc`, `$start_site` and `$start_ts` make a mixed comparison visible in review.

**Test.** Pin the site to `America/New_York` and assert against a value built a different way, for example `wp_date()` or a hard-coded string. A test that builds its expected value with the same function as the code under test agrees with the bug.

## 7. Build query ranges in the stored zone

**The mistake.** A visitor picks "July 9" in site time; the code compares it with a UTC column. On a UTC+10 site, the search window starts ten hours late. Relative dates ("today", "-1 day") have the same problem. The opposite bug is converting a value the query layer already converts.

**The correct approach.** Convert both bounds to the column's zone once, at the query boundary. Know what Gravity Forms already does for you:

- `search_criteria['start_date']` and `['end_date']` (used by `GFAPI::get_entries()` and `GF_Query`) are read as **site time** and converted with `get_gmt_from_date()`. An `end_date` with no time (or `00:00:00`) becomes `23:59:59` of that day. Pass site-time values here, not UTC.
- A `field_filters` entry with `key => 'date_created'` and the `=` operator is turned into a site-day range and converted to UTC. Other operators on `date_created` (`>`, `<`) are compared as given, so convert those bounds yourself.
- Date field values are `Y-m-d` text in entry meta. Compare them with `Y-m-d` text from the site's calendar, with no conversion.

```php
$day       = '2026-07-09'; // picked in site time
$start_utc = get_gmt_from_date( $day . ' 00:00:00' );
$end_utc   = get_gmt_from_date( $day . ' 23:59:59' );
// Compare $start_utc and $end_utc with date_created yourself, or pass
// 'start_date' => $day, 'end_date' => $day to search_criteria, not both.
```

**Test.** Use a zone far from UTC. Create entries just inside and just outside the day on both ends (23:59 the day before, 00:00, 23:59, 00:00 the day after, in site time) and check which are returned.

## 8. A date with no time is a day, not midnight

**The mistake.** Parsing `2026-10-15` as a moment. In PHP under WordPress, `strtotime( '2026-10-15' )` is midnight **UTC**, which is the evening before in the Americas. In JavaScript, `new Date( '2026-10-15' )` is also midnight UTC, while `new Date( '2026-10-15T00:00:00' )` is midnight in the **browser's** zone. Each fails in a different hemisphere. The result is due dates that show a day early, "overdue" badges a day too soon, and dates that move back one day each time they are saved.

PHP:

```text
strtotime date-only: 2026-10-15T00:00:00+00:00
  shown in NY: 2026-10-14T20:00:00-04:00
  parsed in NY: 2026-10-15T00:00:00-04:00
```

JavaScript, the same code in four zones:

```text
TZ=America/New_York  new Date("2025-10-09").toDateString()  Wed Oct 08 2025
TZ=Europe/Berlin     new Date("2025-10-09").toDateString()  Thu Oct 09 2025
TZ=Pacific/Auckland  new Date("2025-10-09").toDateString()  Thu Oct 09 2025
TZ=UTC               new Date("2025-10-09").toDateString()  Thu Oct 09 2025

TZ=America/New_York  new Date("2025-10-09T00:00:00").toISOString()  2025-10-09T04:00:00.000Z
TZ=Pacific/Auckland  new Date("2025-10-09T00:00:00").toISOString()  2025-10-08T11:00:00.000Z
```

**The correct approach.** Keep calendar days as `YYYY-MM-DD` strings. Compare them as strings (they sort correctly). When you need arithmetic, do it on a day with no zone:

```php
$due   = '2026-10-15';
$today = current_datetime()->format( 'Y-m-d' );
$is_overdue = $due < $today; // string comparison of calendar days
$next = DateTimeImmutable::createFromFormat( '!Y-m-d', $due, new DateTimeZone( 'UTC' ) )
	->modify( '+1 day' )->format( 'Y-m-d' );
```

```js
// Parse parts, do math in UTC, never read local getters.
const [ y, m, d ] = due.split( '-' ).map( Number );
const next = new Date( Date.UTC( y, m - 1, d + 1 ) ).toISOString().slice( 0, 10 );
```

When the value goes back to the server, send the `YYYY-MM-DD` string you started from, not a `Date` serialized through the browser.

**Test.** Run the same test under `America/New_York`, `Europe/Berlin`, `Pacific/Auckland` and `UTC`. Include a round trip: load, save without changes, load again, and check the date did not move.

## 9. Parse with the format the value was written in

**The mistake.** Using `strtotime()` on text that came from a person or a setting. It guesses, and it guesses differently by separator:

```text
strtotime( '30/11/2025' )  false
strtotime( '04/03/2026' )  2026-04-03   (slash: month first)
strtotime( '04-03-2026' )  2026-03-04   (dash: day first)
strtotime( '2026-10-03 00:00 am' )  false
strtotime( '2026-10-03 12:00 am' )  2026-10-03 00:00
```

A `false` that falls through to `date()` prints today's date, which looks like real data. Other forms of the same mistake: mapping a PHP format string with escaped characters (`\T`, `\a\t`) to JavaScript tokens by hand; saving a date-and-time value into a date-only field and losing the time; formatting one value in two places with two different locales.

**The correct approach.**

- Parse with the declared format: `DateTimeImmutable::createFromFormat( '!d/m/Y', $value, $zone )`. The `!` resets unparsed parts to zero instead of filling them from now.
- Check the result. `createFromFormat()` returns `false` on failure, and `DateTimeImmutable::getLastErrors()` reports values that parsed but overflowed (February 30).
- For Gravity Forms Date fields, read `$field->dateFormat` (default `mdy`) or call `GFCommon::parse_date( $value, $format )`.
- For Time fields, accept both `hh:mm am` and `HH:MM`.
- Convert PHP format strings to JavaScript in one helper with tests, including escaped characters.
- Keep date fields and date-time fields separate types in your code.
- Wrap `new DateTime( $text )` in `try`/`catch`: it throws on text it cannot read.

**Test.** `d/m/Y`, `m/d/Y`, `Y-m-d`, 12-hour and 24-hour times, `12:00 am`, `00:00`, `24:00`, and a format with an escaped literal such as `j \d\e F`.

## 10. Zone names, offsets and bad input

**The mistake.** Assuming every stored zone is a valid IANA name. WordPress lets a site choose a manual offset (`UTC+5:30`) instead of a city. Add-ons store their own forms. PHP rejects many of them, and an uncaught exception blanks the page or breaks a feed:

```text
new DateTimeZone( '+5.5' )                     Unknown or bad timezone (+5.5)
new DateTimeZone( 'UTC+5' )                    Unknown or bad timezone (UTC+5)
new DateTimeZone( 'W. Europe Standard Time' )  Unknown or bad timezone (W. Europe Standard Time)
new DateTimeZone( '+05:30' )                   works
Etc/GMT+5 offset                               -05:00
```

`Etc/GMT+5` is five hours **behind** UTC. The sign is the opposite of what it looks like.

**The correct approach.**

- For the site, always use `wp_timezone()`. It already turns a manual offset into `+05:30` form.
- For stored values, normalize offsets to `+HH:MM` (`UTC+5.5`, `+5.5` and `UTC+05:30` all become `+05:30`), trim spaces, then try `new DateTimeZone()` inside `try`/`catch`. On failure, fall back to the site zone and log it once.
- When editing an entry whose stored zone you do not recognize, keep the stored value. Do not silently replace it with the site's zone on save.
- A fixed offset has no daylight saving. A named zone does. Prefer names.

```php
function gk_zone_or_site( $raw ) {
	$raw = trim( (string) $raw );
	if ( preg_match( '/^(?:UTC|GMT)?\s*([+-])(\d{1,2})(?:([:.])(\d{1,2}))?$/i', $raw, $m ) ) {
		$minutes = 0;
		if ( isset( $m[4] ) ) {
			// '5.75' (WordPress decimal hours) is 5:45; '5:45' is already minutes.
			$minutes = ( '.' === $m[3] ) ? (int) round( (float) ( '0.' . $m[4] ) * 60 ) : (int) $m[4];
		}
		$raw = sprintf( '%s%02d:%02d', $m[1], $m[2], $minutes );
	}
	try {
		return new DateTimeZone( '' === $raw ? wp_timezone_string() : $raw );
	} catch ( Exception $e ) {
		return wp_timezone();
	}
}
```

```text
'UTC+5:30'      -> +05:30
'+5.5'          -> +05:30
'UTC+5.75'      -> +05:45
'-4'            -> -04:00
' Europe/Berlin ' -> Europe/Berlin
'Mars/Olympus'  -> site zone
''              -> site zone
```

**Test.** A site on `UTC+5:30`, a site on `UTC-4`, a site on a named zone, and an entry whose stored zone is junk (`'  '`, `'Mars/Olympus'`).

## 11. Entries with their own time zone

When a field stores a zone per entry (an event in Berlin on a New York site), you have to decide which clock each output shows. There are two valid answers, and they suit different sites:

- **The event's own clock.** A festival held in another city each year wants "7:00 pm" to read as 7:00 pm for everyone, because that is when the doors open where the festival is. This is also what the entry, notifications and `{all_fields}` show, since they print the stored time and zone as typed.
- **The site's clock.** A calendar of webinars from around the world wants every event placed on one real time axis, so that two events at the same moment line up.

Rules that hold either way:

- Make it a setting when both cases are real. Do not switch an existing site from one to the other in an update.
- When an event's zone differs from the site's, show the zone next to the time ("7:00 PM PDT"). Equal positions on a calendar should not be read as equal moments unless they are.
- Anything that measures time (overlap checks, reminders, "starts in 2 hours") uses the real moment, whatever the display setting.
- An `.ics` file always holds the real moment. Each subscriber's calendar app shows it in that person's own zone.
- Convert **each occurrence** of a repeating event on its own. Berlin and New York change clocks on different dates, so a weekly 10:00 Berlin session is 04:00 in New York most of the year and 05:00 for three weeks in March:

```text
Berlin 10:00 2026-03-01 in NY: 04:00
Berlin 10:00 2026-03-08 in NY: 05:00
Berlin 10:00 2026-03-15 in NY: 05:00
Berlin 10:00 2026-03-22 in NY: 05:00
Berlin 10:00 2026-03-29 in NY: 04:00
```

Converting the whole series with the first occurrence's offset puts three weeks an hour off.

- If a drag or an edit writes a time back, convert it back to the entry's zone before saving, and keep the stored zone.

## 12. Daylight saving

**The mistake.** Assuming every day has 24 hours and every clock time exists once. On the spring change a day has 23 hours and a range of clock times does not exist. On the autumn change a day has 25 hours and an hour happens twice.

```text
hours on 2026-03-08 (New York): 23
hours on 2026-11-01 (New York): 25
skipped 02:30 on 2026-03-08: 2026-03-08T03:30:00-04:00
repeated 01:30 on 2026-11-01: 2026-11-01T01:30:00-04:00   (the first one)
```

"Tomorrow at the same time" is not 86,400 seconds later:

```text
2026-03-07 12:00 EST + 86400 s  ->  2026-03-08 13:00 EDT
2026-03-07 12:00 EST +1 day     ->  2026-03-08 12:00 EDT
```

**The correct approach.**

- Parse with a named zone and let PHP's zone rules (or `Intl` in the browser) work out the offset for each date.
- Add days, weeks and months with `DateTimeImmutable::modify( '+1 day' )` in the right zone. Add hours and minutes to timestamps.
- Gravity Forms stores wall-clock times with no offset, so a stored `01:30` on the autumn night cannot say which `01:30` it was. PHP reads it as the first (daylight time), the same rule RFC 5545 uses. A time inside the spring gap moves forward (`02:30` becomes `03:30`). Document this; you cannot fix it without storing an offset.
- An entry that runs across the change has a wall-clock length different from its real length: 23:00 to 02:00 on the autumn night is 3 hours on the clock and 4 real hours. Decide which one your feature means. Drawing on a wall-clock axis uses the clock length; a reminder or an overlap check uses real time.
- In JavaScript, never build day axes with `new Date( y, m, d, h )` in the browser's zone. Work in minutes since midnight, taken from UTC getters on values you created in UTC.

**Test.** Fixtures on both sides of a spring and an autumn change, including an entry inside the skipped hour, one in the repeated hour, and one that spans the change. Use one zone in each hemisphere. 2026 dates:

| Zone | Spring forward | Fall back |
|---|---|---|
| `America/New_York` | 2026-03-08 | 2026-11-01 |
| `Europe/Berlin` | 2026-03-29 | 2026-10-25 |
| `Pacific/Auckland` | 2026-09-27 | 2026-04-05 |
| `Australia/Lord_Howe` (30-minute change) | 2026-10-04 | 2026-04-05 |

## 13. Overnight entries, all-day entries and end dates

### Inclusive and exclusive ends

People enter the last day they use: a conference from October 3 to October 5 "ends" on the 5th. FullCalendar and iCalendar both treat an all-day end as **exclusive**: the event ends at the start of October 6. Passing the person's end date straight through draws the event a day short. This is where the "+1 day" comes from.

A hotel or rental is the other way round: a stay from October 3 to October 5 uses the nights of the 3rd and 4th, and the 5th is free for the next guest.

**The correct approach.**

- State the rule once: the end date means "the last day used" or "the first free day". Make it a setting if your users need both.
- Convert to the exclusive form in one place, right before handing it to the calendar library or the `.ics` writer, and convert back when you read it. Nowhere else should add or remove a day.
- A same-day check-in and check-out covers zero nights. Moving it should keep zero nights.

### End of day in searches

A search "to October 5" must include all of October 5. Use `23:59:59` for a date-time column, or better, `< October 6 00:00:00`. `GF_Query` does the first for you when `end_date` has no time.

### Overlap

A range check that asks "does the event start inside the range?" misses an event that started before the range and is still running. Use overlap:

```php
$overlaps = $event_start < $range_end && $event_end > $range_start; // ends are exclusive
```

An entry that ends exactly at the range start does not overlap; one that ends a minute later does. Long events that started weeks before the visible range must still be loaded, so do not trim by start date alone.

### Missing, equal and reversed ends

- No end time: decide on a default length (an hour is common) and use it everywhere: calendar, `.ics`, overlap checks.
- End time before start time with no end date (22:00 to 06:00): the entry runs overnight and ends the next day.
- A 24-hour Time field can hold `24:00`, which means midnight at the close of that day (PHP reads it as 00:00 the next day).

### Relative windows

"Due in the next week" means the next seven calendar days from the site's today. Build it from calendar days, not from `now + 7 * 86400`, or the window shrinks through the day and shifts across daylight saving.

**Test.** One-day and multi-day all-day events, a same-day check-out, an entry ending exactly on the range start, an entry ending on the last day of the range, an overnight entry on the first visible day, and a long entry that started before the range.

## 14. Repeating events

**The mistake.** Reading the weekday or day of month from a timestamp in the wrong zone, so a series starts on the wrong day for events near midnight. Stepping monthly with `+1 month`, which overflows: January 31 plus one month is March 3, and every later step keeps the drift. Giving every occurrence the same identifier.

```text
Jan 31 +1 month: 2026-03-03
Jan 31 +1 month +1 month: 2026-04-03
last day of next month: 2026-02-28
Feb 29 2028 +1 year: 2029-03-01
```

**The correct approach.**

- Compute weekday and day of month in the event's zone (or the site's), for example `wp_date( 'N', $ts, $zone )`.
- Compute each occurrence from the series start (start plus *n* months), not from the previous occurrence. Then either clamp to the month's last day or skip short months; RFC 5545 skips them. Pick one and document it.
- Step days, weeks and months in the event's zone so a 10:00 event stays at 10:00 across daylight saving. Then convert each occurrence on its own (section 11).
- Load occurrences by overlap with the requested range, and respect the series' end date or count.
- Give every occurrence a stable, unique ID, for example the entry ID plus the occurrence's original start date. Calendar apps keep one event per `UID`, so a series exported with one `UID` shows as a single event.

**Test.** A monthly series from January 31; a yearly series from February 29; weekly events near midnight in a zone ahead of the server and one behind it; a series that crosses a daylight saving change; an export, then an import of the exported file into a calendar app, counting occurrences.

## 15. External calendar feeds (.ics)

**The mistake.** Reading `DTSTART;TZID=Europe/Berlin:20261003T100000` and drawing 10:00 on the page, ignoring the zone. Or converting a UTC time (`...Z`) to the visitor's clock when the rest of the page is on the site's clock.

An iCalendar time comes in four forms:

| Form | Example | Meaning |
|---|---|---|
| UTC | `DTSTART:20261003T080000Z` | A moment |
| With a zone | `DTSTART;TZID=Europe/Berlin:20261003T100000` | Wall clock in that zone |
| Floating | `DTSTART:20261003T100000` | Wall clock in whatever zone the reader is in |
| Date | `DTSTART;VALUE=DATE:20261003` | A calendar day |

**The correct approach.**

1. Resolve a `TZID` against the `VTIMEZONE` block in the same file first. RFC 5545 requires one for every `TZID` used, and it holds the offsets the publisher meant.
2. If there is no matching `VTIMEZONE`, try the `TZID` as an IANA name (`new DateTimeZone()` in PHP, `Intl.DateTimeFormat` in JavaScript, both inside `try`/`catch`).
3. Exchange and Outlook feeds often use Windows zone names (`W. Europe Standard Time`, `Eastern Standard Time`). Neither PHP nor `Intl` knows them; map them to IANA names with the Unicode CLDR `windowsZones.xml` table.
4. Convert the moment to the one clock your page uses (usually the site's).
5. Pass floating times and dates through unchanged. They have no zone to convert from.
6. If nothing resolves, show the time unconverted and log it, rather than failing the whole feed.

**Test.** A fixture feed with a `VTIMEZONE` zone, a Windows zone name, an IANA zone with no `VTIMEZONE`, a UTC time, a floating time and an all-day date. View it from two browser zones and compare with the site's clock.

## 16. Output: ISO 8601, structured data and .ics

When you write dates for another program, write them so they cannot be misread.

- **Moments:** ISO 8601 with an offset, for example `2026-10-15T19:30:00-04:00` (`DATE_ATOM` or `'c'` in PHP). For an `.ics` timed event, UTC is the simplest correct form: `20261015T233000Z`.
- **Wall-clock values from Date and Time fields:** parse in `wp_timezone()` (or the entry's zone), then format with an offset. PHP picks the right offset for each date.

```php
$moment = new DateTimeImmutable( '2026-10-15 19:30', wp_timezone() );
$moment->format( DATE_ATOM );                                                    // 2026-10-15T19:30:00-04:00
$moment->setTimezone( new DateTimeZone( 'UTC' ) )->format( 'Ymd\THis\Z' );     // 20261015T233000Z
```

- **Never** `strtotime()` a wall-clock value and then convert it to the site zone. Under WordPress, `strtotime()` reads it as UTC, so the output is off by the site's offset (`2026-10-15 19:30` comes out as `2026-10-15T15:30:00-04:00` in New York).
- **A value that already has an offset** keeps it. Do not parse and re-zone it.
- **Date only:** write the date only (`2026-10-15`). Do not add `T00:00:00`.
- **All-day end in schema.org:** `endDate` is the last day of the event, so subtract a day from an exclusive end. If it equals `startDate`, leave `endDate` out.
- **All-day in `.ics`:** `DTSTART;VALUE=DATE:20261003` and an **exclusive** `DTEND;VALUE=DATE:20261006` for an event on October 3 to 5.
- **An end at or before the start** after conversion: leave the end out rather than write one that readers reject.
- **Repeating events in `.ics`:** either one `VEVENT` with an `RRULE` and a `TZID` (so the reader applies daylight saving), or one `VEVENT` per occurrence, each with its own `UID`.

## 17. Front-end JavaScript

**The mistake.** Letting the browser's zone into a value that belongs to another clock. `new Date()`, `getHours()`, `getDate()` and `toLocaleString()` with no `timeZone` all use the viewer's zone. A 7:30 pm Denver event shows at 3:30 am the next day in Rome. A drag sends back the browser's clock instead of the one the calendar drew. "Today" is highlighted on the browser's date, not the site's.

**The correct approach.**

- Decide whose clock each value is on before it reaches the page, and pass the zone to the page explicitly (for example, `wp_timezone_string()` in a localized script).
- Compute the site's "today" and "now" with `Intl`, not with `new Date()`:

```js
function siteToday( timeZone ) {
	// en-CA formats as YYYY-MM-DD.
	return new Intl.DateTimeFormat( 'en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' } )
		.format( new Date() );
}
```

At 23:30 UTC on October 14, `siteToday( 'Pacific/Auckland' )` returns `2026-10-15` in every browser zone, while the browser's own `toDateString()` says October 14 in New York and UTC.

- **FullCalendar's `timeZone` option** defaults to `'local'`, which converts any time with an offset or `Z` to the viewer's zone and draws times with no offset as written. `'UTC'` draws everything in UTC. A named zone (`'America/New_York'`) only works with a time zone plugin (FullCalendar ships Luxon and Moment Timezone plugins); without one, FullCalendar cannot compute that zone's offsets. Two safe setups:
  - Send site wall-clock strings with no offset (`2026-10-15T19:30:00`) and leave `timeZone` on `'local'`. Every viewer sees the site's clock.
  - Send real moments with offsets, set `timeZone` to the site's zone, and load a time zone plugin.
- When a drag or resize sends a time back, send the wall-clock time the calendar drew, in the same form you sent it. Do not serialize a `Date` through the browser zone.
- Use `Intl.DateTimeFormat( locale, { timeZone, timeZoneName: 'short' } )` to show a zone label.

**Test.** Run browser tests with a zone different from the site's. In Playwright, set `timezoneId` on the browser context (`test.use( { timezoneId: 'Europe/Rome' } )`) and compare what the page shows with the site's clock.

## 18. Testing

Date bugs hide in CI because CI usually runs in UTC, where a double offset is zero. Build the suite so a wrong zone or a wrong clock fails.

### Clock independence

- **Freeze or inject the clock.** Pass "now" into the code under test, or stub it. Tests that read the real clock fail when a run crosses midnight.
- **Do not compute expected values before the suite runs.** An expected "today" computed at load time is yesterday by the time a long run reaches the test.
- **Bracket "now" assertions.** Take `$before = time()` before the call and `$after = time()` after, and assert the result is between them, instead of comparing with a second `time()` call.
- **Give date-dependent tests their own dates.** A test that needs "an event next Tuesday" should build next Tuesday from a fixed date, not from the server's today.

### Zone independence

- **Set and restore the site zone in every test** that depends on it (`update_option( 'timezone_string', 'America/New_York' )` in set up, restore in tear down). PHP under WordPress always runs in UTC, so the server's `TZ` does not test anything; the site option and the browser zone do.
- **Run at least one job with a non-UTC site zone**, preferably one far from UTC and in the southern hemisphere.
- **Run JavaScript unit tests under several `TZ` values.** Node honors `TZ`: `TZ=Pacific/Auckland npm test`.
- **Watch for parallel tests that change the site zone.** End-to-end tests often share one site. One spec that sets `Asia/Tokyo` makes the "server today" already tomorrow for another spec running at the same time. Run zone-changing specs serially, or give each its own site.
- **Compute expected values a different way from the code.** If the code uses `wp_date()`, write the expected value as a literal string.

### Fixtures to keep

- A site zone far ahead of UTC (`Pacific/Auckland`) and one far behind (`America/Los_Angeles`).
- A manual offset site (`UTC+5:30`).
- Entries at 23:30 and 00:30 site time.
- The spring and autumn change days in both hemispheres (table in section 12), including a skipped and a repeated time.
- February 29, 2028, and January 31 for monthly steps.
- An overnight entry (22:00 to 06:00), an entry with no end time, and a `24:00` end.
- A multi-day all-day event and a same-day check-out.
- An external feed with each `DTSTART` form from section 15.

### Positive controls

A test that passes on broken code proves nothing. After adding a date test, put the bug back (apply the offset twice, parse with `strtotime()`, drop the `timeZone` option) and confirm the test fails. Then remove it again.

## Checklist

Use this before you merge any change that touches a date.

- [ ] Every date variable says its clock (`_utc`, `_site`, `_ts`, `_day`).
- [ ] UTC columns are converted once, at display.
- [ ] Date and Time field values are never offset.
- [ ] Query bounds are in the column's zone, and only one layer converts them.
- [ ] Date-only values are compared as `YYYY-MM-DD` text, never parsed as midnight.
- [ ] Typed values are parsed with their declared format, and failures are handled.
- [ ] Stored zones are normalized and fall back to the site zone without a fatal error.
- [ ] Days are added with `modify()` in a zone, not with 86,400 seconds.
- [ ] The end-date rule is stated once and converted in one place; range checks use overlap.
- [ ] Repeating events step from the series start, in the event's zone, with a unique ID per occurrence.
- [ ] External feed times are resolved with their `TZID` and `VTIMEZONE`.
- [ ] Output for other programs is ISO 8601 with an offset, or a bare date.
- [ ] Front-end code passes the zone explicitly and never uses the browser's zone for site values.
- [ ] Tests run under a non-UTC site zone and a different browser zone, with a frozen clock, DST fixtures, and a positive control.
