export const APP_TIME_ZONE = "Asia/Shanghai";
export const MIN_ALLOWED_DATE = "1900-01-01";
export const MAX_ALLOWED_DATE = "2100-12-31";
export const MAX_DATE_SPAN_DAYS = 36600;

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function getUtcDate(year, month, day) {
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date;
}

export function isValidDateString(value) {
  if (typeof value !== "string") {
    return false;
  }

  const match = DATE_PATTERN.exec(value);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = getUtcDate(year, month, day);

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function isAllowedDateString(value) {
  return isValidDateString(value) && value >= MIN_ALLOWED_DATE && value <= MAX_ALLOWED_DATE;
}

export function dateToDayNumber(dateString) {
  if (!isValidDateString(dateString)) {
    throw new RangeError("无效日期");
  }

  const [year, month, day] = dateString.split("-").map(Number);
  return Math.floor(getUtcDate(year, month, day).getTime() / DAY_MS);
}

export function dayNumberToDateString(dayNumber) {
  if (!Number.isInteger(dayNumber)) {
    throw new RangeError("无效日期序号");
  }

  const date = new Date(dayNumber * DAY_MS);
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getTodayDateString(timeZone = APP_TIME_ZONE, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function addDays(dateString, dayDelta) {
  if (!Number.isInteger(dayDelta)) {
    throw new RangeError("日期增量必须是整数");
  }

  return dayNumberToDateString(dateToDayNumber(dateString) + dayDelta);
}

export function getDayOfWeek(dateString) {
  const dayNumber = dateToDayNumber(dateString);
  return ((dayNumber + 4) % 7 + 7) % 7;
}

export function isWeekend(dateString) {
  const day = getDayOfWeek(dateString);
  return day === 0 || day === 6;
}

export function isIncludedDate(dateString, excludeWeekends) {
  return !excludeWeekends || !isWeekend(dateString);
}

export function getInclusiveDays(startDate, endDate) {
  return dateToDayNumber(endDate) - dateToDayNumber(startDate) + 1;
}

export function getUsageDays(startDate, endDate, excludeWeekends = false) {
  const totalDays = getInclusiveDays(startDate, endDate);

  if (totalDays <= 0) {
    return 0;
  }

  if (!excludeWeekends) {
    return totalDays;
  }

  const fullWeeks = Math.floor(totalDays / 7);
  const remainingDays = totalDays % 7;
  const startDay = getDayOfWeek(startDate);
  let includedDays = fullWeeks * 5;

  for (let offset = 0; offset < remainingDays; offset += 1) {
    const day = (startDay + offset) % 7;
    if (day !== 0 && day !== 6) {
      includedDays += 1;
    }
  }

  return includedDays;
}

export function getEndDateFromUsageDays(startDate, plannedDays, excludeWeekends = false) {
  if (!Number.isInteger(plannedDays) || plannedDays <= 0 || plannedDays > MAX_DATE_SPAN_DAYS) {
    throw new RangeError("使用天数超出允许范围");
  }

  if (!excludeWeekends) {
    return addDays(startDate, plannedDays - 1);
  }

  let firstIncludedDay = dateToDayNumber(startDate);
  while (isWeekend(dayNumberToDateString(firstIncludedDay))) {
    firstIncludedDay += 1;
  }

  const remainingUsageDays = plannedDays - 1;
  let endDay = firstIncludedDay + Math.floor(remainingUsageDays / 5) * 7;
  let remainder = remainingUsageDays % 5;

  while (remainder > 0) {
    endDay += 1;
    if (!isWeekend(dayNumberToDateString(endDay))) {
      remainder -= 1;
    }
  }

  return dayNumberToDateString(endDay);
}

export function addUsageDays(dateString, dayDelta, excludeWeekends = false) {
  if (!Number.isInteger(dayDelta)) {
    throw new RangeError("使用日增量必须是整数");
  }

  let nextDate = dateString;
  let remainingDays = Math.abs(dayDelta);
  const step = dayDelta >= 0 ? 1 : -1;

  while (remainingDays > 0) {
    nextDate = addDays(nextDate, step);
    if (isIncludedDate(nextDate, excludeWeekends)) {
      remainingDays -= 1;
    }
  }

  return nextDate;
}

export function getNaturalWeekRange(dateString, excludeWeekends = false) {
  const day = getDayOfWeek(dateString);
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const startDate = addDays(dateString, mondayOffset);
  const endDate = addDays(startDate, excludeWeekends ? 4 : 6);
  return { startDate, endDate };
}
