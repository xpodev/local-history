import { TextEncoder } from "util";

export function encode(str: string | undefined): Uint8Array {
    return (new TextEncoder()).encode(str);
}