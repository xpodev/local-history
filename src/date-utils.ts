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

export class DateLH extends Date{
    public static readonly SECOND = 1000;
    public static readonly MINUTE = 60 * DateLH.SECOND;
    public static readonly HOUR = 60 * DateLH.MINUTE;
    public static readonly DAY = 24 * DateLH.HOUR;
    public static readonly MONTH = 30 * DateLH.DAY;
    public static readonly YEAR = 12 * DateLH.MONTH;

    constructor(value: string);
    constructor(value: number);
    constructor(value: Date);
    constructor();
    constructor(value?: string | number| Date) {
        if(!value) {
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
            miliseconds = this.getMilliseconds(),
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
            .replace('S', miliseconds.toString())
            .replace('dd', dd.toString()).replace('d', day.toString())
            .replace('MMMM', MMMM).replace('MMM', MMM).replace('MM', MM.toString()).replace('M', M.toString())
            .replace('EEEE', EEEE).replace('EEE', EEE)
            .replace('yyyy', yyyy)
            .replace('yy', yy)
            ;
    }

    represent() {
        const now = Date.now();
        // '+' sign casting the date to a number.
        const timeDiff = now - +this;
        if (timeDiff >= config.lastDateAgo) {
            return this.format( `${config.dateFormat} hh:mm`);
        }
        if (timeDiff >= DateLH.SECOND) {
            if (timeDiff >= DateLH.MINUTE) {
                if (timeDiff >= DateLH.HOUR) {
                    if (timeDiff >= DateLH.DAY) {
                        if (timeDiff >= DateLH.MONTH) {
                            if (timeDiff >= DateLH.YEAR) {
                                const timeAgo = Math.floor(timeDiff / DateLH.YEAR);
                                return `${timeAgo} year${timeAgo > 1 ? "s" : ""} ago`;
                            } else {
                                const timeAgo = Math.floor(timeDiff / DateLH.MONTH);
                                return `${timeAgo} month${timeAgo > 1 ? "s" : ""} ago`;
                            }
                        } else {
                            const timeAgo = Math.floor(timeDiff / DateLH.DAY);
                            return `${timeAgo} day${timeAgo > 1 ? "s" : ""} ago`;
                        }
                    } else {
                        const timeAgo = Math.floor(timeDiff / DateLH.HOUR);
                        return `${timeAgo} hour${timeAgo > 1 ? "s" : ""} ago`;
                    }
                } else {
                    const timeAgo = Math.floor(timeDiff / DateLH.MINUTE);
                    return `${timeAgo} minute${timeAgo > 1 ? "s" : ""} ago`;
                }
            } else {
                const timeAgo = Math.floor(timeDiff / DateLH.SECOND);
                return `${timeAgo} second${timeAgo > 1 ? "s" : ""} ago`;
            }
        } else {
            return "Now";
        }
    }
}