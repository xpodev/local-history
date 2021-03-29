import { TextEncoder } from "util";

const monthNames = [
    "January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"
];

const dayOfWeekNames = [
    "Sunday", "Monday", "Tuesday",
    "Wednesday", "Thursday", "Friday", "Saturday"
];

export function formatDate(date: Date, formatStr?: string) {
    if (!formatStr) {
        formatStr = 'dd/MM/yyyy';
    }
    const day = date.getDate(),
        month = date.getMonth(),
        year = date.getFullYear(),
        hour = date.getHours(),
        minute = date.getMinutes(),
        second = date.getSeconds(),
        miliseconds = date.getMilliseconds(),
        hh = twoDigitPad(hour),
        mm = twoDigitPad(minute),
        ss = twoDigitPad(second),
        EEEE = dayOfWeekNames[date.getDay()],
        EEE = EEEE.substr(0, 3),
        dd = twoDigitPad(day),
        M = month + 1,
        MM = twoDigitPad(M),
        MMMM = monthNames[month],
        MMM = MMMM.substr(0, 3),
        yyyy = year + "",
        yy = yyyy.substr(2, 2)
        ;
    return formatStr
        .replace('hh', hh.toString()).replace('h', hour.toString())
        .replace('mm', mm.toString()).replace('m', minute.toString())
        .replace('ss', ss.toString()).replace('s', second.toString())
        .replace('S', miliseconds.toString())
        .replace('dd', dd.toString()).replace('d', day.toString())
        .replace('MMMM', MMMM).replace('MMM', MMM).replace('MM', MM.toString()).replace('M', M.toString())
        .replace('EEEE', EEEE).replace('EEE', EEE)
        .replace('yyyy', yyyy)
        .replace('yy', yy)
        ;
}

export function encode(str: string | undefined): Uint8Array {
    return (new TextEncoder()).encode(str);
}

function twoDigitPad(num: number) {
    return num < 10 ? "0" + num : num;
}