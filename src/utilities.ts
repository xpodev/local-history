import * as vscode from 'vscode';
import * as fs from 'fs';
import { TextEncoder } from 'util';

export function encode(str?: string): Uint8Array {
    return (new TextEncoder()).encode(str);
}

export module DateUtils {

    enum TimeAgo {
        '1 Hour' = 1 * 60 * 60 * 1000,
        '2 Hours' = TimeAgo['1 Hour'] * 2,
        '4 Hours' = TimeAgo['1 Hour'] * 4,
        '8 Hours' = TimeAgo['1 Hour'] * 8,
        '1 Day' = TimeAgo['1 Hour'] * 24,
        '7 Days' = TimeAgo['1 Day'] * 7,
        '30 Days' = TimeAgo['1 Day'] * 30,
        'Never' = Infinity
    }

    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June', 'July',
        'August', 'September', 'October', 'November', 'December'
    ];

    const dayOfWeekNames = [
        'Sunday', 'Monday', 'Tuesday',
        'Wednesday', 'Thursday', 'Friday', 'Saturday'
    ];

    function twoDigitPad(num: number) {
        return num < 10 ? '0' + num : num;
    }

    export class DateExt extends Date {
        public static readonly timeStep: TimeStep = {
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
            this._dateFormat = vscode.workspace.getConfiguration('local-history').get<string>('date.dateFormat');
            this._timeAgo = vscode.workspace.getConfiguration('local-history').get('date.dateRepresentation')!;
        }

        private _dateFormat;
        private _timeAgo: keyof typeof TimeAgo;

        format(formatStr?: string) {
            if (formatStr) {
                this._dateFormat = formatStr;
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
                EEE = EEEE.slice(0, 3),
                DD = twoDigitPad(day),
                M = month + 1,
                MM = twoDigitPad(M),
                MMMM = monthNames[month],
                MMM = MMMM.slice(0, 3),
                YYYY = year + '',
                YY = YYYY.slice(2, 2)
                ;
            return this._dateFormat!
                .replace('hh', hh.toString()).replace('h', hour.toString())
                .replace('mm', mm.toString()).replace('m', minute.toString())
                .replace('ss', ss.toString()).replace('s', second.toString())
                .replace('S', milliseconds.toString())
                .replace('DD', DD.toString()).replace('D', day.toString())
                .replace('MMMM', MMMM).replace('MMM', MMM).replace('MM', MM.toString()).replace('M', M.toString())
                .replace('EEEE', EEEE).replace('EEE', EEE)
                .replace('YYYY', YYYY)
                .replace('YY', YY)
                ;
        }

        represent(): string {
            const now = Date.now();
            const timeDiff = now - +this;
            const f = TimeAgo[this._timeAgo];
            if (timeDiff >= f) {
                return this.format(`${this._dateFormat}`);
            }
            let timeAgo = 0;
            let timeStr = 'Now';
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

    type TimeStep = {
        [key: string]: number
    };
}

export module FileSystemUtils {
    export async function writeFile(filePath: vscode.Uri, data?: string): Promise<void> {
        if (!(await fileExists(filePath))) {
            await vscode.workspace.fs.createDirectory(parentFolder(filePath));
        }
        await vscode.workspace.fs.writeFile(filePath, encode(data));
    }

    export async function readFile(filePath: vscode.Uri): Promise<string> {
        return (await vscode.workspace.fs.readFile(filePath)).toString();
    }

    export async function fileExists(filePath: vscode.Uri): Promise<boolean> {
        try {
            const temp = await vscode.workspace.fs.stat(filePath);
        } catch {
            return false;
        }
        return true;
    }

    export function parentFolder(uriPath: vscode.Uri): vscode.Uri {
        return vscode.Uri.joinPath(uriPath, '..');
    }

    export function realPath(uriPath: vscode.Uri): vscode.Uri {
        const path = fs.readlinkSync(uriPath.fsPath).split('\\').join('/');
        return vscode.Uri.parse(`${uriPath.scheme}:${path}`, true);
    }

    export function filename(uriPath: vscode.Uri): string {
        return uriPath.path.split('/').pop()!;
    }
}