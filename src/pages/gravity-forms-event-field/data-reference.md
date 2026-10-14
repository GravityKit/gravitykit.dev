---
title: "Event field data reference"
sidebar_label: "Event field data reference"
description: "How the GravityKit Event field for Gravity Forms stores dates, times, time zones and repeat rules in each entry, how GravityCalendar turns them into moments, and PHP code to read them."
---

# Event field data reference

The Event field (from the **Gravity Forms Event Field** add-on, field type `event`) puts a whole event into one field: dates, times, an all-day switch, a time zone and a repeat rule. This page describes Event Field 1.9.0. For the general rules (which clock a value is on, when to convert, daylight saving, all-day ranges), see the [dates and time zones guide](/working-with-dates-and-time-zones/).

Each part is its own input, stored as its own entry value under `{field ID}.{input ID}`. For an Event field with ID 5, the start date is `$entry['5.1']`.

## Inputs and stored values

| Input | Key in code | Label | Stored as | Empty when |
|---|---|---|---|---|
| `.1` | `start_date` | Start Date | `Y-m-d`, whatever the field's date format | The field was left blank (not required) |
| `.2` | `end_date` | End Date | `Y-m-d` | Rarely. When the End Date input is turned off, the plugin saves the start date here. Entries made by import or the API can still have it blank. |
| `.3` | `event_duration` | All Day Event | `on` | The event is not all day |
| `.4` | `start_time` | Start Time | The time as typed, in the site's **Time Format** at the moment of saving: `2:30 pm`, `14:30` | The event is all day, or no time was entered |
| `.5` | `end_time` | End Time | Same as `.4` | Same as `.4` |
| `.6` | `timezone` | Timezone | A value from WordPress's time zone list: an IANA name (`Europe/Berlin`), `UTC`, or a fixed offset (`UTC+5.5`, `UTC-1`) | Entries made by import or the API |
| `.7` | `repeat` | Repeat Frequency | A five-part cron string (below) | The event does not repeat |
| `.8` | `repeat_ends` | Repeat Ends | `on_date` or `number_of_occurrences` | The event does not repeat |
| `.9` | `occurrences` | Number of Occurrences | The number typed, counting the first date | The series ends on a date |
| `.10` | `repeat_ends_date` | On a Date | `Y-m-d` | The event does not repeat. See below. |
| `.11` | `show_as` | Show As | `free` or `busy` | No status was chosen |

The labels can be renamed in the form editor. The input IDs and keys never change, so code should use those. `EventField::get_field_key_id_map()` returns the key-to-ID map.

The date inputs use `GFFormsModel::prepare_date()`, the same as the Date field ([how Gravity Forms stores dates](/working-with-dates-and-time-zones/#2-how-gravity-forms-stores-dates)). The field's display format changes only what the visitor sees.

Some inputs keep a value the event no longer uses. The page script clears the times when **All Day Event** is checked, and editing an entry in the admin clears what the repeat settings make unused. A form submitted another way can still hold them. Read the switch before the value: check `.3` before `.4` and `.5`, and `.8` before `.9` and `.10`.

## Times

Times are stored as text in the site's Time Format **at the moment of saving**, and they are never rewritten. Change **Settings > General > Time Format** from `g:i a` to `H:i`, and the same field holds `2:30 pm` in older entries and `14:30` in newer ones. Some formats PHP cannot read at all:

```text
new DateTime( '2026-10-15 2:30 PM' )           -> 14:30
DateTime::createFromFormat( 'H:i', '2:30 pm' ) -> false
new DateTime( '2026-10-15 14h30' )             -> exception: Unexpected character
```

A time has no zone of its own. It is a wall-clock time in the entry's time zone (`.6`).

## Time zone

The `.6` select lists WordPress's time zones (`wp_timezone_choice()`). Its stored value is the option's value, not its label:

| The visitor picks | Stored | Zone to use |
|---|---|---|
| Berlin | `Europe/Berlin` | `Europe/Berlin` |
| UTC | `UTC` | `+00:00` |
| UTC+5:30 | `UTC+5.5` | `+05:30` |
| UTC-1 | `UTC-1` | `-01:00` |

`UTC+5.5` is not a zone name PHP knows. The plugin turns the number after `UTC` into an offset with `GravityKit\EventField\format_timezone_offset()`:

```text
UTC+5.5  -> +05:30
UTC+5.75 -> +05:45
UTC-9.5  -> -09:30
UTC      -> +00:00
```

The select starts on the site's zone: the `timezone_string` option, or `UTC+N` built from the `gmt_offset` option when the site uses a fixed offset. When the Timezone input is turned off, it is hidden but still sent, so the entry stores the site's zone at the time of submission.

The plugin's own rules when it reads `.6`: blank means the site's zone; a value PHP rejects is tried again without surrounding spaces, then falls back to the site's zone (and the plugin logs the entry IDs).

## Repeat rule

`.7` holds a cron string: `minute hour day-of-month month day-of-week`. The plugin builds it when the entry is saved, from the frequency the visitor chose and the start date and time. For an event starting Wednesday, October 14, 2026 at 2:30 pm:

| Frequency | Stored in `.7` | Interval |
|---|---|---|
| Every Day | `30 14 * * *` | `P1D` |
| Every Week | `30 14 * * 3` | `P1W` |
| Every Month | `30 14 14 * *` | `P1M` |
| Every Year | `30 14 14 10 *` | `P1Y` |

- Day of month has no leading zero (`1` to `31`). Month has two digits (`01` to `12`). Day of week is `0` to `6`, with Sunday as `0`.
- An all-day event, or a timed event with no start time, stores `00 09` as the minute and hour. Use `.4`, not the cron string, for the time.
- The cron string says only how often. The series starts on `.1` at `.4`.
- `EventField::date_interval_from_cron( $cron )` turns the string into a `DateInterval` spec by counting the `*` parts. A pattern with steps or lists (`*/2`, `1,15`) changes that count and the interval with it. The `gk/field-event/cron-value` filter can change the parts before they are stored; keep each part a number or `*`.
- In the admin, the Repeat Frequency select is rebuilt from the cron string (`EventAddon::convert_cron_expression_to_select_value()`).

A series ends one of two ways, chosen in `.8`:

- **`on_date`**: `.10` is the date the visitor picked. The date of the last possible occurrence counts.
- **`number_of_occurrences`**: `.9` is the total count, including the first date. When the entry is saved, the plugin also works out the date of the last occurrence and stores it in `.10`, so a calendar can search for repeating entries by their end date. Entries saved before Event Field 1.8.0 have no `.10`, and entries edited in the admin can lose it. When it is blank, work it out from `.9`.

An entry holds the whole series. Gravity Forms has one entry; the occurrences exist only where something builds them at display time.

## How the plugin turns values into moments

The plugin itself only stores values. GravityCalendar (with the Event field mapped as the feed's start and end) turns them into events:

1. GravityCalendar joins `.1` and `.4` into `2026-10-15T19:30:00` with no zone, and `.2` and `.5` the same way. An entry with no start and end time becomes an all-day event (`2026-10-15`). It decides this from the times, not from `.3`.
2. The Event Field add-on (on the `gravityview/calendar/events` filter) reads each entry's `.6`, parses the start and end in that zone, and writes them with `format( 'c' )`. That gives real moments:

```text
2026-10-15T19:30 in Europe/Berlin -> 2026-10-15T19:30:00+02:00
2026-10-15T19:30 in UTC+5.5       -> 2026-10-15T19:30:00+05:30
2026-10-15 (all day) in Berlin    -> 2026-10-15T00:00:00+02:00
```

3. For a repeating entry, it adds one event per occurrence, each written the same way.

What GravityCalendar does next:

- **On the calendar page** (GravityCalendar 2.24.0 and later), it drops the offset again before the browser sees it, so `2026-10-15T19:30:00+02:00` becomes `2026-10-15T19:30:00`. Every visitor sees the time as it was entered, whatever the event's zone or their own (the "event's own clock" in [section 11 of the guide](/working-with-dates-and-time-zones/#11-entries-with-their-own-time-zone)). A Berlin event at 7:30 pm and a New York event at 7:30 pm sit side by side.
- **In the `.ics` subscription feed**, it keeps the offset, so calendar apps get the real moment and show it in each subscriber's zone.
- A per-feed choice between these two is planned.

All-day events come out of step 2 as midnight with an offset. The `allDay` flag on the event is what marks them, so check that flag, not the time.

## Repeating events

The add-on builds each occurrence by stepping from the first one:

- **Daylight saving.** GravityCalendar passes each start to the add-on as a wall-clock time with no offset (`2026-03-22T10:00:00`). The add-on reads it in the entry's zone (`.6`) and steps from there, so a weekly 10:00 Berlin event stays at 10:00 Berlin time after the March change, with `+01:00` before it and `+02:00` after. A `UTC±N` zone never follows daylight saving, which is correct for a fixed offset and a reason to prefer a city.

  The trap is a start that already carries an offset. PHP keeps the offset written in the string and ignores the zone passed beside it, so stepping from it stays on that fixed offset:

```text
weekly, 10:00 Europe/Berlin       stepped from                Berlin clock
'2026-03-22T10:00:00+01:00'       2026-03-29T10:00:00+01:00   11:00 (wrong)
'2026-03-22T10:00:00' in Berlin   2026-03-29T10:00:00+02:00   10:00
```

  `new DateTime( '2026-03-22T10:00:00+01:00', new DateTimeZone( 'Europe/Berlin' ) )` has the zone `+01:00`, not `Europe/Berlin`. Parse wall-clock text in the named zone, or call `setTimezone()` with the named zone before stepping, as the example below does.

- **Monthly and yearly** occurrences in 1.9.0 add one month (or year) to the occurrence before, so a series from January 31 drifts: March 3, April 3, May 3. The same stepping works out the stored `.10` for count-ended series.
- **Ended on a date**: in 1.9.0 the count of occurrences to `.10` comes from the parts of a date difference (`%m`, `%y`), which drops whole years. A monthly series from January 15, 2026 to March 15, 2027 counts 2 occurrences after the first instead of 14. A series whose end date has passed shows only its first date.

A fix in progress changes these. Each occurrence will be computed from the series start and clamped to the month's last day (January 31, February 28, March 31, April 30; February 29 becomes February 28 in other years), the count will step forward to the end date and include it, finished series will show every date, and each occurrence will keep the first one's length. It adds two public methods: `EventField::get_occurrence_start( $start, $interval, $n )` and `EventField::get_last_occurrence_date( $entry )`. Until it ships, compute occurrences yourself as in the example below.

## Merge tags and the entry screen

- **Entry detail and `{all_fields}`** show one line per input: dates in the field's date format, times as stored, the time zone value as stored (`UTC+5.5`), All Day as Yes or No, and the repeat rule in words built from the cron string ("Every Wednesday at 14:30"). That text is always in 24-hour time, and only the day name is translated.
- **A merge tag for one input**, such as `{Event:5.1}` or `{Event:5.4}`, prints the stored value: `2026-10-15`, `2:30 pm`.
- **The Event field adds no merge tag modifiers of its own.** With GravityView 2.33 or later active, the `:format` modifier works on its date and time inputs: `{Event:5.1:format:l\, F j}`, `{Event:5.4:format:H\:i}`. On a date input the add-on adds `no_tz_offset`, so the date is not moved by the site's offset. On a time input it reads the stored text with `new DateTime()`, so a time PHP cannot read (`14h30`) cannot be formatted.
- Nothing converts an Event field time to another zone for display. A notification shows the time and the zone the visitor entered.

## Reading Event field values in PHP

There are no Event-specific functions for reading values. Read the entry with `rgar()`, by input ID. Avoid `EventField::get_input_value_by_key()` for this: it runs the value through `esc_attr()`, which is for HTML output.

Find the field with `GFAPI::get_fields_by_type( $form, 'event' )`. The class is `GravityKit\EventField\EventField`.

This example turns an entry into its first occurrence as real moments:

```php
use GravityKit\EventField\EventField;
use function GravityKit\EventField\format_timezone_offset;

/**
 * Returns the zone an Event field entry's times are in. Same rules as the plugin: blank means the
 * site's zone, "UTC+5.5" means a fixed offset, and an unknown name falls back to the site's zone.
 */
function my_event_zone( string $stored ): DateTimeZone {
	$stored = trim( $stored );

	if ( '' === $stored ) {
		return wp_timezone();
	}

	if ( 0 === strpos( $stored, 'UTC' ) ) {
		$stored = format_timezone_offset( substr( $stored, 3 ) ); // "UTC+5.5" -> "+05:30"
	}

	try {
		return new DateTimeZone( $stored );
	} catch ( Exception $e ) {
		return wp_timezone();
	}
}

/**
 * Reads a stored time. Times are saved as typed, in the site's Time Format at that moment.
 */
function my_event_time( string $date, string $time, DateTimeZone $zone ): ?DateTimeImmutable {
	$parsed = DateTimeImmutable::createFromFormat( '!Y-m-d ' . get_option( 'time_format' ), "$date $time", $zone );

	if ( ! $parsed ) {
		try {
			$parsed = new DateTimeImmutable( "$date $time", $zone ); // "2:30 pm", "14:30"
		} catch ( Exception $e ) {
			return null; // "14h30" after the Time Format changed, for example.
		}
	}

	return $parsed;
}

/**
 * Returns the first occurrence of an Event field entry: real moments in the event's zone.
 * An all-day end is exclusive (the start of the day after the last day).
 */
function my_event_first_occurrence( array $entry, EventField $field ): ?array {
	$ids = $field->get_field_key_id_map(); // [ 'start_date' => 1, 'end_date' => 2, ... ]
	$get = static function ( string $key ) use ( $entry, $field, $ids ): string {
		return trim( (string) rgar( $entry, $field->id . '.' . $ids[ $key ] ) );
	};

	$start_date = $get( 'start_date' ); // Y-m-d
	$end_date   = $get( 'end_date' ) ?: $start_date;

	if ( '' === $start_date ) {
		return null;
	}

	$zone       = my_event_zone( $get( 'timezone' ) );
	$start_time = $get( 'start_time' );
	$end_time   = $get( 'end_time' ) ?: $start_time;
	$all_day    = 'on' === $get( 'event_duration' ) || '' === $start_time;

	if ( $all_day ) {
		return [
			'start'   => new DateTimeImmutable( $start_date, $zone ),
			'end'     => ( new DateTimeImmutable( $end_date, $zone ) )->modify( '+1 day' ),
			'all_day' => true,
		];
	}

	$start = my_event_time( $start_date, $start_time, $zone );
	$end   = my_event_time( $end_date, $end_time, $zone );

	if ( ! $start || ! $end ) {
		return null;
	}

	return [ 'start' => $start, 'end' => $end, 'all_day' => false ];
}
```

Output for a few entries, on a New York site with Time Format `g:i a`:

```text
7:30 pm to 9:00 pm, Europe/Berlin    2026-10-15T19:30:00+02:00 -> 2026-10-15T21:00:00+02:00
19:30 to 21:00 (older format)        2026-10-15T19:30:00+02:00 -> 2026-10-15T21:00:00+02:00
7:30 pm to 9:00 pm, UTC+5.5          2026-10-15T19:30:00+05:30 -> 2026-10-15T21:00:00+05:30
All day Oct 3 to 5, zone blank       2026-10-03T00:00:00-04:00 -> 2026-10-06T00:00:00-04:00
```

This one lists the occurrences of a series that overlap a range. It computes each occurrence from the series start and clamps short months, which is how the fix in progress will work:

```php
/**
 * Returns the start of the nth occurrence after the first. Months are counted from the series
 * start and clamped to the month's last day: Jan 31, Feb 28, Mar 31, Apr 30.
 */
function my_nth_start( DateTimeImmutable $start, string $interval, int $n ): DateTimeImmutable {
	$months = [ 'P1M' => 1, 'P1Y' => 12 ][ $interval ] ?? 0;

	if ( ! $months ) {
		$days = 'P1W' === $interval ? 7 * $n : $n;

		return $start->modify( "+{$days} days" ); // Keeps the wall-clock time in a named zone.
	}

	$index    = (int) $start->format( 'Y' ) * 12 + (int) $start->format( 'n' ) - 1 + $months * $n;
	$year     = intdiv( $index, 12 );
	$month    = $index % 12 + 1;
	$last_day = (int) $start->setDate( $year, $month, 1 )->format( 't' );

	return $start->setDate( $year, $month, min( (int) $start->format( 'j' ), $last_day ) );
}

/**
 * Lists the occurrences of one Event field entry that overlap [ $from, $to ).
 */
function my_event_occurrences( array $entry, EventField $field, DateTimeImmutable $from, DateTimeImmutable $to ): array {
	$first = my_event_first_occurrence( $entry, $field );

	if ( ! $first ) {
		return [];
	}

	$ids  = $field->get_field_key_id_map();
	$get  = static function ( string $key ) use ( $entry, $field, $ids ): string {
		return trim( (string) rgar( $entry, $field->id . '.' . $ids[ $key ] ) );
	};
	$cron = $get( 'repeat' ); // "30 14 * * 3", or empty for a one-time event.

	$interval = '' === $cron ? '' : EventField::date_interval_from_cron( $cron ); // P1D, P1W, P1M, P1Y
	$length   = $first['start']->diff( $first['end'] );
	$count    = PHP_INT_MAX;
	$last_day = null; // Y-m-d, inclusive.

	if ( '' === $interval ) {
		$count = 1;
	} elseif ( 'number_of_occurrences' === $get( 'repeat_ends' ) ) {
		$count = max( 1, (int) $get( 'occurrences' ) );
	} elseif ( 'on_date' === $get( 'repeat_ends' ) ) {
		$last_day = $get( 'repeat_ends_date' ) ?: null;
	}

	$occurrences = [];

	for ( $n = 0; $n < $count; $n++ ) {
		$start = 0 === $n ? $first['start'] : my_nth_start( $first['start'], $interval, $n );

		if ( $start >= $to || ( $last_day && $start->format( 'Y-m-d' ) > $last_day ) ) {
			break;
		}

		$end = $start->add( $length );

		if ( $end > $from ) {
			$occurrences[] = [ 'start' => $start, 'end' => $end, 'all_day' => $first['all_day'] ];
		}
	}

	return $occurrences;
}
```

```text
Monthly from Jan 31, 10:00 Berlin, 5 times:
  2026-01-31T10:00:00+01:00
  2026-02-28T10:00:00+01:00
  2026-03-31T10:00:00+02:00
  2026-04-30T10:00:00+02:00
  2026-05-31T10:00:00+02:00

Weekly Sundays 10:00 Berlin from Mar 15, ends on Apr 5:
  2026-03-15T10:00:00+01:00
  2026-03-22T10:00:00+01:00
  2026-03-29T10:00:00+02:00   (still 10:00 after the change)
  2026-04-05T10:00:00+02:00   (the end date counts)
```

The results are real moments. Show them in the event's zone (they already are), or call `setTimezone( wp_timezone() )` to place every event on the site's clock ([section 11 of the guide](/working-with-dates-and-time-zones/#11-entries-with-their-own-time-zone)).

## Hooks and functions

| Name | Kind | Use |
|---|---|---|
| `GravityKit\EventField\EventField` | Class | The field. `get_field_inputs()` returns each input's ID and settings by key; `get_field_key_id_map()` returns key to input ID. |
| `EventField::date_interval_from_cron()` | Static method | Cron string to `P1D`, `P1W`, `P1M` or `P1Y` |
| `EventField::get_date_in_standard_format()` | Method | A date in the field's display format to `Y-m-d` |
| `GravityKit\EventField\format_timezone_offset()` | Function | The number after `UTC` to `+05:30` |
| `gk/field-event/cron-value` | Filter | Change the cron parts before they are stored |
| `gk/field-event/inputs` | Filter | Change an input's settings before it renders |
| `gk/field-event/input-name` | Filter | Change the name an input posts under |
| `gk/field-event/input-wrapper-classes` | Filter | Change an input wrapper's CSS classes |
| `gk/field-event/inputs/repeat-input` | Filter | Change the repeat input |
| `gravityview/calendar/events` | Filter (GravityCalendar) | Where the add-on adds offsets and occurrences, at priority 10. Run later to see its output. |

The pending fix adds `EventField::get_occurrence_start()` and `EventField::get_last_occurrence_date()`.

## Searching and filtering

- **GravityView search.** The add-on offers the Event field's Start Date, End Date and Timezone in the search bar. A start date search finds entries whose `.1` is on or after the date; an end date search finds entries whose `.2` is on or before it; the time zone must match exactly.
- **Repeating series match on their first date only, today.** The search compares the stored `.1` and `.2`, which belong to the first occurrence. A weekly series that started in September does not show up in a search for October, even though it has dates in October.
- **Gravity Forms entry filters** offer the date inputs with `is`, `>` and `<`, written as `yyyy-mm-dd`. The time zone input, and inputs turned off in the form editor, are not offered.
- **In your own `GF_Query`**, compare `.1`, `.2` and `.10` with `Y-m-d` strings. They are calendar days in the event's zone, not UTC. A query for series still running after a date uses `.10 >= date`, which is what GravityCalendar's range requests do, and so misses count-ended entries whose `.10` is blank.
- Times cannot be searched or sorted as stored: `2:30 pm` sorts before `9:00 am`.

## Event field pitfalls

| Mistake | Section |
|---|---|
| Converting a stored time to the site's or viewer's zone before showing it as the event's time. The value is a wall-clock time in `.6`. | [5. Leave wall-clock values alone](/working-with-dates-and-time-zones/#5-leave-wall-clock-values-alone) |
| Parsing `.4` and `.5` with today's Time Format. Older entries were saved with the format of their day. GravityCalendar's time pattern also reads `2:30pm` (no space) as `2:30` (morning) and treats `14h30` as no time at all, which makes the event all day. | [9. Parse with the format the value was written in](/working-with-dates-and-time-zones/#9-parse-with-the-format-the-value-was-written-in) |
| Passing `.6` to `new DateTimeZone()` directly. `UTC+5.5` throws. Convert it, trim it, and fall back to the site's zone. | [10. Zone names, offsets and bad input](/working-with-dates-and-time-zones/#10-zone-names-offsets-and-bad-input) |
| Reading every Event field entry in the site's zone because the Timezone input is turned off. Turning it off does not empty older entries' zones. | [11. Entries with their own time zone](/working-with-dates-and-time-zones/#11-entries-with-their-own-time-zone) |
| Stepping occurrences on a value parsed from an ISO string with an offset. PHP keeps the offset, not the named zone, so later dates miss the change. Also, expecting a `UTC±N` event to follow daylight saving: only a named zone does. | [12. Daylight saving](/working-with-dates-and-time-zones/#12-daylight-saving) |
| Treating the midnight-with-offset start of an all-day event as a timed event, or passing `.2` as an exclusive end. `.2` is the last day used. | [8. A date with no time is a day](/working-with-dates-and-time-zones/#8-a-date-with-no-time-is-a-day-not-midnight), [13. Overnight entries, all-day entries and end dates](/working-with-dates-and-time-zones/#13-overnight-entries-all-day-entries-and-end-dates) |
| Reading `.9` or `.10` without checking `.8`, or trusting `.10` to be filled for a count-ended series. | [14. Repeating events](/working-with-dates-and-time-zones/#14-repeating-events) |
| Stepping months from the previous occurrence, or searching a series by its first date. | [14. Repeating events](/working-with-dates-and-time-zones/#14-repeating-events) |
| Comparing `.1`, `.2` or `.10` with a UTC date. They are days in the event's zone. | [7. Build query ranges in the stored zone](/working-with-dates-and-time-zones/#7-build-query-ranges-in-the-stored-zone) |

**Test.** An Event field entry in a zone ahead of the site and one behind it; one with `UTC+5.5`; one with a blank zone; times saved under two Time Formats; an all-day multi-day event; a weekly series across a daylight saving change in a named zone and in a fixed offset; a monthly series from January 31; one series ending after a number of times and one ending on a past date.
