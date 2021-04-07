import { time, timeStamp } from "node:console";
import { config } from "./extension";

const monthNames = [
    "January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"
];

const dayOfWeekNames = [
    "Sunday", "Monday", "Tuesday",
    "Wednesday", "Thursday", "Friday", "Saturday"
];

function twoDigitPad(num: number) {
    return num < 10 ? "0" + num : num;
}

export class DateExt extends Date {
    public static readonly timeStep: timestep = {
        millisecond: 1,
        second: 1000,
        minute: 60000,
        hour: 3600000,
        day: 8.64e7,
        month: 2.592e9,
        year: 3.1104e10
    };

    constructor(value: string);
    constructor(value: number);
    constructor(value: Date);
    constructor();
    constructor(value?: string | number | Date) {
        if (!value) {
            value = Date.now();
        }
        super(value);
    }

    format(formatStr?: string) {
        if (!formatStr) {
            formatStr = config.dateFormat;
        }
        const day = this.getDate(),
            month = this.getMonth(),
            year = this.getFullYear(),
            hour = this.getHours(),
            minute = this.getMinutes(),
            second = this.getSeconds(),
            milliseconds = this.getMilliseconds(),
            hh = twoDigitPad(hour),
            mm = twoDigitPad(minute),
            ss = twoDigitPad(second),
            EEEE = dayOfWeekNames[this.getDay()],
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
            .replace('S', milliseconds.toString())
            .replace('dd', dd.toString()).replace('d', day.toString())
            .replace('MMMM', MMMM).replace('MMM', MMM).replace('MM', MM.toString()).replace('M', M.toString())
            .replace('EEEE', EEEE).replace('EEE', EEE)
            .replace('yyyy', yyyy)
            .replace('yy', yy)
            ;
    }

    represent(): string {
        const now = Date.now();
        const timeDiff = now - +this;
        if (timeDiff >= config.lastDateAgo) {
            return this.format(`${config.dateFormat} hh:mm`);
        }
        let timeAgo = 0;
        let timeStr = "Now";
        for (const step in DateExt.timeStep) {
            if (timeDiff >= DateExt.timeStep[step]) {
                timeAgo = Math.floor(timeDiff / DateExt.timeStep[step]);
                timeStr = `${timeAgo} ${step}${timeAgo > 1 ? 's' : ''} ago`;
            } else {
                break;
            }
        }
        return timeStr;
    }
}

type timestep = {
    [key: string]: number
}