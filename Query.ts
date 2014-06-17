module Query {

    export interface IEnumerableFactory {
        fromArray<T>(arr: T[]): IEnumerable<T>;
        fromObject<TVal>(obj: { [id: string]: TVal }): IEnumerable<IKeyValuePair<string, TVal>>;
    }

    export interface IEnumerable<TIn> {
        getEnumerator: () => IEnumerator<TIn>;
        count: (predicate?: IPredicate<TIn>) => number;
        where: (predicate: IPredicate<TIn>) => IEnumerable<TIn>;
        firstOrDefault: (predicate?: IPredicate<TIn>) => TIn;
        select: <TOut>(selector: ISelector<TIn, TOut>) => IEnumerable<TOut>;
        orderByAscending: <TOut>(selector: ISelector<TIn, TOut>) => IEnumerable<TIn>;
        orderByDescending: <TOut>(selector: ISelector<TIn, TOut>) => IEnumerable<TIn>;
        groupBy: <TOut>(selector: ISelector<TIn, TOut>) => IEnumerable<Grouping<TIn, TOut>>;

        aggregate: <TOut>(aggFunc: IAggregatorFunction<TIn, TOut>, seed: TOut) => TOut;
        sum: ( selector?: ISelector<TIn, number> ) => number;

        take: ( count: number ) => IEnumerable<TIn>;
        skip: ( count: number ) => IEnumerable<TIn>;

        toArray: () => TIn[];
        toList: () => IList<TIn>;
    }

    export interface IPredicate<TIn> {
        (item: TIn, i?: number): boolean;
    }

    export interface IAction<TIn> {
        (item: TIn, i?: number);
    }

    export interface ISelector<TIn, TOut> {
        (item: TIn, i?: number): TOut;
    }

    export interface IAggregatorFunction<TIn, TOut> {
        (agg: TOut, next:TIn): TOut;
    }

    export interface IComparerFunction<TIn> {
        (item1: TIn, item2: TIn): boolean;
    }

    export interface IIteratorKernel<TIn, TOut> {
        (item: TIn, i: number): IIterationResult<TOut>
    }

    export interface IIterationResult<TIn> {
        result: TIn;
        shouldBreak: boolean;
    }

    export interface IAggregator<TIn, TOut> {
        aggregate(item: TIn);
        getResult(): TOut;
    }

    export interface IList<TIn> extends IEnumerable<TIn> {
        add: (item: TIn) => void;
        item: (index: number) => TIn;
        remove: (index: number) => void;

        each: (action: IAction<TIn>) => void;
    }

    export interface IKeyValuePair<TKey, TVal> {
        key: TKey;
        value: TVal;
    }

    export interface IEnumerator<TIn> {
        current: TIn;
        next: () => TIn;
        reset: () => void;
    }

    export interface IPromise<TOut> {
        
    }

    export function fromArray<T>(arr: T[]): IEnumerable <T> {
        return Enumerable.fromArray( arr );
    }
    
    export function fromObject<TVal>( obj: { [id: string]: TVal }): IEnumerable<IKeyValuePair<string, TVal>> {
        return Enumerable.fromObject( obj );
    }

    export class Enumerable {
        static fromArray<T>(arr: T[]): IEnumerable<T> {
            return new EnumerableCore( arr );
        }

        static fromObject<TVal>(obj: { [id: string]: TVal }): IEnumerable<IKeyValuePair<string, TVal>> {
            var pairs: KeyValuePair<string, TVal>[] = [];
            for (var key in obj) {
                if (obj.hasOwnProperty(key)) {
                    pairs.push(new KeyValuePair(key, obj[key]));
                }
            }
            return new EnumerableCore(pairs);
        }
    }

    export enum SortOrder {
        Ascending,
        Descending
    }

    class IterationResult<TIn> implements IIterationResult<TIn> {
        constructor(public result: TIn, public shouldBreak: boolean) {}
    }

    class FilterAggregator<TIn> implements IAggregator<TIn, IEnumerable<TIn>> {
        private _storage: TIn[] = [];

        aggregate(item: TIn) {
            this._storage.push(item);
        }

        getResult(): IEnumerable<TIn> {
            return Enumerable.fromArray(this._storage);
        }
    }

    class AggregationAggregator<TIn, TOut> implements IAggregator<TIn, TOut> {
        private _storage: TOut;

        aggregate(item: TIn) {
            this._storage = this._aggregatorFunction(this._storage, item);
        }

        getResult(): TOut {
            return this._storage;
        }

        constructor(
            private _aggregatorFunction: IAggregatorFunction<TIn, TOut>) {}
    }

    class GroupingAggregator<TIn, TOut> implements IAggregator<TIn, IEnumerable<Grouping<TIn, TOut>>> {
        private _storage: Grouping<TIn, TOut>[] = [];

        private bucket(item: TIn) {
            var key = this._selector(item);
            var bucket = Enumerable.fromArray(this._storage).firstOrDefault(b => b.key === key);

            if (!bucket) {
                bucket = new Grouping<TIn, TOut>(key);
                this._storage.push(bucket);
            }

            bucket.add(item);
        }

        aggregate(item: TIn) {
            this.bucket(item);
        }

        getResult(): IEnumerable<Grouping<TIn, TOut>> {
            return Enumerable.fromArray(this._storage);
        }

        constructor(private _selector: ISelector<TIn, TOut>) {}
    }

    class SortingAggregator<TIn, TOut> implements IAggregator<TIn, IEnumerable<TIn>> {
        private _storage: TIn[] = [];

        private getComparer(): IComparerFunction<TOut> {
            return this._sortOrder === SortOrder.Ascending
                ? (i1, i2) => i1 > i2
                : (i1, i2) => i2 > i1;
        }

        private getInsertionPosition(item1: TIn): number {
            var comparer = this.getComparer();
            var pos = 0;

            Enumerable.fromArray(this._storage).firstOrDefault(item2 => {
                if (comparer(this._selector(item1), this._selector(item2))) {
                    pos++;
                    return false;
                }
                return true;
            });

            return pos;
        }

        aggregate(item: TIn) {
            this._storage.splice(this.getInsertionPosition(item), 0, item);
        }

        getResult(): IEnumerable<TIn> {
            return Enumerable.fromArray(this._storage);
        }

        constructor(
            private _selector: ISelector<TIn, TOut>,
            private _sortOrder: SortOrder) {}
    }

    class Iterator<TIn> {
        private iterate<TOut, TOut2>(iterator: IIteratorKernel<TIn, TOut>, aggregator: IAggregator<TOut, TOut2>): TOut2 {
            var i = 0;
            var currentItem: TIn;

            while ((currentItem = this._enumerator.next()) !== null) {
                var iteration = iterator(currentItem, i);

                if (iteration.result !== null) {
                    aggregator.aggregate(iteration.result);
                }

                if (iteration.shouldBreak) {
                    break;
                }

                i++;
            }

            return aggregator.getResult();
        }

        filter<TOut, TOut2>(iterator: IIteratorKernel<TIn, TOut>, aggregator: IAggregator<TOut, TOut2>): TOut2 {
            return this.iterate(iterator, aggregator);
        }

        aggregate<TOut, TOut2>(iterator: IIteratorKernel<TIn, TOut>, aggregator: IAggregator<TOut, TOut2>): TOut2 {
            return this.iterate(iterator, aggregator);
        }

        constructor(private _enumerator: IEnumerator<TIn>) {}
    }

    export class EnumerableCore<TIn> implements IEnumerable<TIn> {
        storage: TIn[];

        getEnumerator(): IEnumerator<TIn> {
            return new ArrayEnumerator((i) => this.storage[i]);
        }

        aggr<TOut>(aggFunc: IAggregatorFunction<TIn, TOut>): TOut {
            return new Iterator(this.getEnumerator()).aggregate(i => new IterationResult(i, false), new AggregationAggregator(aggFunc));
        }

        iterate<TOut>(iterator: IIteratorKernel<TIn, TOut>, aggregator: IAggregator<TOut, IEnumerable<TOut>>): IEnumerable<TOut> {
            return new Iterator(this.getEnumerator()).filter(iterator, aggregator);
        }

        group<TOut, TOut2>(iterator: IIteratorKernel<TIn, TOut>, aggregator: IAggregator<TOut, IEnumerable<Grouping<TIn, TOut2>>>): IEnumerable<Grouping<TIn, TOut2>> {
            return new Iterator(this.getEnumerator()).filter(iterator, aggregator);
        }

        filter<TOut>(iterator: IIteratorKernel<TIn, TOut>): IEnumerable<TOut> {
            return this.iterate(iterator, new FilterAggregator<TOut>());
        }

        sort<TOut>(selector: ISelector<TIn, TOut>, order: SortOrder): IEnumerable<TIn> {
            return this.iterate(i => new IterationResult(i, false), new SortingAggregator(selector, order));
        }

        item(index: number): TIn {
            return this.storage[index];
        }

        count(predicate?: IPredicate<TIn>): number {
            return predicate ? this.where(predicate).count() : this.storage.length;
        }

        where(predicate: IPredicate<TIn>): IEnumerable<TIn> {
            return this.filter(item => {
                if (predicate(item)) {
                    return new IterationResult(item, false);
                }
                return new IterationResult(null, false);
            });
        }

        firstOrDefault(predicate?: IPredicate<TIn>): TIn {
            if (!predicate) {
                return this.item(0);
            }

            var result = this.filter((item, i) => {
                if (predicate(item, i)) {
                    return new IterationResult(item, true);
                }
                return new IterationResult(null, false);
            });

            return result.count() > 0 ? result.firstOrDefault() : null;
        }

        select<TOut>(selector: ISelector<TIn, TOut>): IEnumerable<TOut> {
            return this.filter(item => {
                return new IterationResult(selector(item), false);
            });
        }

        orderByAscending<TOut>(selector: ISelector<TIn, TOut>): IEnumerable<TIn> {
            return this.sort(selector, SortOrder.Ascending);
        }

        orderByDescending<TOut>(selector: ISelector<TIn, TOut>): IEnumerable<TIn> {
            return this.sort(selector, SortOrder.Descending);
        }

        aggregate<TOut>(aggFunc: IAggregatorFunction<TIn, TOut>, seed: TOut): TOut {
            return this.aggr<TOut>((sum, next) => {
                return aggFunc(sum === undefined ? seed : sum, next);
            });
        }

        sum(selector?: ISelector<TIn, number>): number {
            if (!selector) {
                selector = (i) => <number><any>i;
            }
            return this.aggregate<number>((sum, next) => sum + selector(next), 0);
        }

        take( count: number ): IEnumerable<TIn> {
            var taken = 0;
            return this.filter(i => {
                if (taken < count) {
                    taken++;
                    return new IterationResult( i, false );
                }
                return new IterationResult(null, true);
            });
        }

        skip( count: number ): IEnumerable<TIn> {
            var skipped = 0;
            return this.filter( i => {
                if ( skipped < count ) {
                    skipped++;
                    return new IterationResult( null, false );
                }
                return new IterationResult( i, false );
            });
        }

        groupBy<TOut>(selector: ISelector<TIn, TOut>): IEnumerable<Grouping<TIn, TOut>> {
            return this.group(i => new IterationResult(i, false), new GroupingAggregator(selector));
        }

        toArray(): TIn[] {
            return this.storage.slice(0);
        }

        toList(): IList<TIn> {
            return new List(this.toArray());
        }

        constructor(arr?: TIn[]) {
            this.storage = arr ? arr : new Array<TIn>();
        }
    }

    export class List<TIn> extends EnumerableCore<TIn> implements IList<TIn> {
        add(item: TIn) {
            this.storage.push(item);
        }

        remove(index: number) {
            this.storage.splice(index, 1);
        }

        each(action: IAction<TIn>) {
            this.filter(item => {
                action(item);
                return new IterationResult(null, false);
            });
        }

        constructor(arr?: TIn[]) { super(arr); }
    }

    export class Grouping<TIn, TOut> extends List<TIn> {
        constructor(public key: TOut) {
            super();
        }
    }

    class KeyValuePair<TKey, TVal> implements IKeyValuePair<TKey, TVal> {
        constructor(public key: TKey, public value: TVal) {}
    }

    class ArrayEnumerator<TIn> implements IEnumerator<TIn> {
        private _currentIndex: number = 0;

        get current(): TIn {
            return this._accessor(this._currentIndex);
        }

        next(): TIn {
            var next = this.current;

            if (next) {
                this._currentIndex++;
                return next;
            }

            return null;
        }

        reset() {
            this._currentIndex = 0;
        }

        constructor(private _accessor: (index: number) => TIn) {}
    }

}