"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TTLCache = exports.MIN_SIZE = void 0;
const signal_1 = require("@soncodi/signal");
exports.MIN_SIZE = 1;
const def = {
    ttl: 1000,
    max: Infinity,
    clock: Date // cache-relative clock
};
class TTLCache {
    constructor(opt) {
        this.empty = new signal_1.Signal();
        this.full = new signal_1.Signal();
        this.evict = new signal_1.Signal();
        this.cache = new Map();
        this.oldest = null;
        this.newest = null;
        const { ttl, max, clock } = Object.assign(Object.assign({}, def), opt);
        if (ttl !== 0 && !(ttl > 0)) {
            throw new Error(`invalid TTL (${ttl})`);
        }
        else if (!(max >= exports.MIN_SIZE)) {
            throw new Error(`invalid max (${max})`);
        }
        else if (!clock || typeof clock.now !== 'function') {
            throw new Error('invalid clock');
        }
        this.ttl = ttl;
        this.max = max;
        this.clock = clock;
    }
    get size() {
        // includes expired
        return this.cache.size;
    }
    *keys() {
        for (const entry of this.getIterator()) {
            yield entry.key;
        }
    }
    *values() {
        for (const entry of this.getIterator()) {
            yield entry.val;
        }
    }
    *entries() {
        for (const entry of this.getIterator()) {
            const view = {
                key: entry.key,
                val: entry.val
            };
            yield view;
        }
    }
    has(key) {
        return this.cache.has(key);
    }
    get(key) {
        const entry = this.cache.get(key);
        if (!entry) {
            return undefined;
        }
        else if (this.isExpired(entry)) {
            const unlinked = this.unlink(entry);
            this.evict.emit({
                key: unlinked.key,
                val: unlinked.val
            });
            if (this.cache.size === 0) {
                this.empty.emit();
            }
            return undefined;
        }
        else {
            this.bumpAge(entry);
            return entry.val;
        }
    }
    set(key, val) {
        const existing = this.cache.get(key);
        if (existing) {
            existing.val = val;
            this.bumpAge(existing);
            return;
        }
        const entry = {
            key,
            val,
            exp: this.clock.now() + this.ttl,
            prev: this.newest,
            next: null
        };
        this.cache.set(entry.key, entry);
        if (this.newest) {
            this.newest.next = entry;
        }
        else {
            this.oldest = entry;
        }
        this.newest = entry;
        if (this.oldest && this.cache.size > this.max) {
            const unlinked = this.unlink(this.oldest);
            this.evict.emit({
                key: unlinked.key,
                val: unlinked.val
            });
        }
        if (this.cache.size === this.max) {
            this.full.emit();
        }
    }
    delete(key) {
        const entry = this.cache.get(key);
        if (!entry) {
            return undefined;
        }
        const unlinked = this.unlink(entry);
        if (this.cache.size === 0) {
            this.empty.emit();
        }
        return unlinked.val;
    }
    cleanup(opts = { emit: true }) {
        while (this.oldest && this.isExpired(this.oldest)) {
            const unlinked = this.unlink(this.oldest);
            if (opts.emit) {
                this.evict.emit({
                    key: unlinked.key,
                    val: unlinked.val
                });
            }
        }
        if (this.cache.size === 0) {
            this.empty.emit();
        }
    }
    resize(max, opts = { emit: true }) {
        if (!(max >= exports.MIN_SIZE)) {
            throw new Error(`invalid max (${max})`);
        }
        else if (max === this.max) {
            return;
        }
        this.max = max;
        while (this.oldest && this.cache.size > this.max) {
            const unlinked = this.unlink(this.oldest);
            if (opts.emit) {
                this.evict.emit({
                    key: unlinked.key,
                    val: unlinked.val
                });
            }
        }
    }
    clear() {
        this.cache.clear();
        this.oldest = null;
        this.newest = null;
    }
    bumpAge(entry) {
        entry.exp = this.clock.now() + this.ttl;
        if (!entry.next) {
            // already newest
            return;
        }
        if (entry.prev) {
            entry.prev.next = entry.next;
        }
        else {
            this.oldest = entry.next;
        }
        entry.next.prev = entry.prev; // maybe null
        entry.prev = this.newest;
        entry.next = null;
        this.newest.next = entry;
        this.newest = entry;
    }
    unlink(entry) {
        this.cache.delete(entry.key);
        if (entry.prev) {
            entry.prev.next = entry.next; // maybe null
        }
        else {
            this.oldest = entry.next; // maybe null
        }
        if (entry.next) {
            entry.next.prev = entry.prev; // maybe null
        }
        else {
            this.newest = entry.prev; // maybe null
        }
        return entry;
    }
    *getIterator() {
        let current = this.newest;
        while (current && !this.isExpired(current)) {
            const entry = current;
            current = current.prev;
            yield entry;
        }
    }
    isExpired(entry) {
        // entry is valid during same ms
        return entry.exp < this.clock.now();
    }
}
exports.TTLCache = TTLCache;
