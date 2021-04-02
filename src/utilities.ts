import { TextEncoder } from "util";

// CR Elazar: move all date related into it's own module, e.g. "date utils" or something
// CR Neriya: Moved

export function encode(str: string | undefined): Uint8Array {
    return (new TextEncoder()).encode(str);
}