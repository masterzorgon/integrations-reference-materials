import { Signal } from '@soncodi/signal';
export interface EntryView<K, V> {
    key: K;
    val: V;
}
export interface Clock {
    now: () => number;
    [_: string]: any;
}
export declare const MIN_SIZE = 1;
declare const def: {
    ttl: number;
    max: number;
    clock: Clock;
};
export declare type Opts = typeof def;
export declare class TTLCache<K = any, V = any> {
    readonly empty: Signal<void>;
    readonly full: Signal<void>;
    readonly evict: Signal<EntryView<K, V>>;
    private readonly cache;
    private oldest;
    private newest;
    private readonly ttl;
    private max;
    private readonly clock;
    constructor(opt?: Partial<Opts>);
    get size(): number;
    keys(): Generator<K, void, unknown>;
    values(): Generator<V, void, unknown>;
    entries(): Generator<EntryView<K, V>, void, unknown>;
    has(key: K): boolean;
    get(key: K): V | undefined;
    set(key: K, val: V): void;
    delete(key: K): V | undefined;
    cleanup(opts?: {
        emit: boolean;
    }): void;
    resize(max: number, opts?: {
        emit: boolean;
    }): void;
    clear(): void;
    private bumpAge;
    private unlink;
    private getIterator;
    private isExpired;
}
export {};
