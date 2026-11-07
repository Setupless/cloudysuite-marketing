// Fills the .mbox and .ics fixtures with dates relative to the run, in the
// studio's time zone, so every run shows a current week and a fresh inbox.
//
//   {{date:N}}    RFC 2822 date, N working minutes before now
//   {{mbox:N}}    mbox separator date for the same moment
//   {{at:D@H:M}}  iCalendar wall time, D days after this week's Monday
//   {{tz}}        the studio's time zone, for TZID
//   {{day:D}}     iCalendar date, D days after this week's Monday
//   {{stamp}}     UTC iCalendar time of the run
//   {{file:NAME}} a generated file, base64 in 76-character lines
//   {{ics:NAME}}  another fixture, filled the same way
import { readFileSync } from "node:fs";
import { join } from "node:path";

type LocalDate = { year: number; month: number; day: number };

// Working hours for mail. Messages land only inside them, so a run at night
// or at the weekend shows the last working day rather than mail at 3 am.
const DAY_START = { hour: 8, minute: 40 };
const DAY_END = { hour: 17, minute: 50 };

const pad = (value: number, width = 2) => String(value).padStart(width, "0");

function localParts(instant: number, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      weekday: "short",
    })
      .formatToParts(instant)
      .map(({ type, value }) => [type, value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday!),
  };
}

function offsetMinutes(instant: number, timeZone: string): number {
  const p = localParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(instant / 1000) * 1000) / 60_000);
}

function zonedTime(date: LocalDate, hour: number, minute: number, timeZone: string): number {
  const guess = Date.UTC(date.year, date.month - 1, date.day, hour, minute);
  const first = guess - offsetMinutes(guess, timeZone) * 60_000;
  return guess - offsetMinutes(first, timeZone) * 60_000;
}

function addDays(date: LocalDate, days: number): LocalDate {
  const moved = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: moved.getUTCFullYear(), month: moved.getUTCMonth() + 1, day: moved.getUTCDate() };
}

export class RunClock {
  readonly monday: LocalDate;

  constructor(
    readonly now: number,
    readonly timeZone: string,
  ) {
    const today = localParts(now, timeZone);
    this.monday = addDays(today, -today.weekday);
  }

  workingMinutesAgo(minutes: number): number {
    let remaining = minutes;
    let cursor = this.now;
    for (let guard = 0; guard < 400; guard += 1) {
      const local = localParts(cursor, this.timeZone);
      const date = { year: local.year, month: local.month, day: local.day };
      if (local.weekday < 5) {
        const start = zonedTime(date, DAY_START.hour, DAY_START.minute, this.timeZone);
        const end = Math.min(cursor, zonedTime(date, DAY_END.hour, DAY_END.minute, this.timeZone));
        const available = Math.max(0, (end - start) / 60_000);
        if (remaining <= available) return end - remaining * 60_000;
        remaining -= available;
      }
      cursor = zonedTime(addDays(date, -1), 23, 59, this.timeZone);
    }
    throw new Error(`No working time found ${minutes} minutes back`);
  }

  weekDate(day: number): LocalDate {
    return addDays(this.monday, day);
  }

  rfc2822(instant: number): string {
    const p = localParts(instant, this.timeZone);
    const offset = offsetMinutes(instant, this.timeZone);
    const sign = offset < 0 ? "-" : "+";
    const zone = `${sign}${pad(Math.floor(Math.abs(offset) / 60))}${pad(Math.abs(offset) % 60)}`;
    const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][p.weekday];
    const month = new Date(Date.UTC(2000, p.month - 1)).toLocaleString("en-US", { month: "short", timeZone: "UTC" });
    return `${weekday}, ${pad(p.day)} ${month} ${p.year} ${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)} ${zone}`;
  }
}

const icsUtc = (instant: number) => new Date(instant).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

// asctime() in UTC, the form most mbox writers use after "From sender".
function mboxDate(instant: number): string {
  const [weekday, day, month, year, time] = new Date(instant).toUTCString().replace(",", "").split(" ") as string[];
  return `${weekday} ${month} ${String(Number(day)).padStart(2, " ")} ${time} ${year}`;
}

export function fillTemplate(
  name: string,
  { clock, fixtures, files }: { clock: RunClock; fixtures: string; files: Record<string, string> },
): string {
  const text = readFileSync(join(fixtures, name), "utf8");
  return text.replace(/\{\{(\w+)(?::([^}]+))?\}\}/g, (_, kind: string, argument = "") => {
    switch (kind) {
      case "date":
        return clock.rfc2822(clock.workingMinutesAgo(Number(argument)));
      case "mbox":
        return mboxDate(clock.workingMinutesAgo(Number(argument)));
      case "at": {
        const [day, time] = argument.split("@") as [string, string];
        const [hour, minute] = time.split(":") as [string, string];
        const date = clock.weekDate(Number(day));
        return `${date.year}${pad(date.month)}${pad(date.day)}T${pad(Number(hour))}${pad(Number(minute))}00`;
      }
      case "tz":
        return clock.timeZone;
      case "day": {
        const date = clock.weekDate(Number(argument));
        return `${date.year}${pad(date.month)}${pad(date.day)}`;
      }
      case "stamp":
        return icsUtc(clock.now);
      case "file": {
        const path = files[argument];
        if (!path) throw new Error(`${name} names a file that wasn't made: ${argument}`);
        return readFileSync(path).toString("base64").replace(/.{76}/g, "$&\n").trimEnd();
      }
      case "ics":
        return fillTemplate(argument, { clock, fixtures, files }).trimEnd();
      default:
        throw new Error(`${name} has an unknown placeholder: ${kind}`);
    }
  });
}
