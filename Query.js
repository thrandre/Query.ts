var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var Query;
(function (Query) {
    function fromArray(arr) {
        return Enumerable.fromArray(arr);
    }
    Query.fromArray = fromArray;

    function fromObject(obj) {
        return Enumerable.fromObject(obj);
    }
    Query.fromObject = fromObject;

    var Enumerable = (function () {
        function Enumerable() {
        }
        Enumerable.fromArray = function (arr) {
            return new EnumerableCore(arr);
        };

        Enumerable.fromObject = function (obj) {
            var pairs = [];
            for (var key in obj) {
                if (obj.hasOwnProperty(key)) {
                    pairs.push(new KeyValuePair(key, obj[key]));
                }
            }
            return new EnumerableCore(pairs);
        };
        return Enumerable;
    })();
    Query.Enumerable = Enumerable;

    (function (SortOrder) {
        SortOrder[SortOrder["Ascending"] = 0] = "Ascending";
        SortOrder[SortOrder["Descending"] = 1] = "Descending";
    })(Query.SortOrder || (Query.SortOrder = {}));
    var SortOrder = Query.SortOrder;

    var IterationResult = (function () {
        function IterationResult(result, shouldBreak) {
            this.result = result;
            this.shouldBreak = shouldBreak;
        }
        return IterationResult;
    })();

    var FilterAggregator = (function () {
        function FilterAggregator() {
            this._storage = [];
        }
        FilterAggregator.prototype.aggregate = function (item) {
            this._storage.push(item);
        };

        FilterAggregator.prototype.getResult = function () {
            return Enumerable.fromArray(this._storage);
        };
        return FilterAggregator;
    })();

    var AggregationAggregator = (function () {
        function AggregationAggregator(_selector, _aggregatorFunction) {
            this._selector = _selector;
            this._aggregatorFunction = _aggregatorFunction;
        }
        AggregationAggregator.prototype.aggregate = function (item) {
            this._storage = this._aggregatorFunction(this._storage, this._selector(item));
        };

        AggregationAggregator.prototype.getResult = function () {
            return this._storage;
        };
        return AggregationAggregator;
    })();

    var GroupingAggregator = (function () {
        function GroupingAggregator(_selector) {
            this._selector = _selector;
            this._storage = [];
        }
        GroupingAggregator.prototype.bucket = function (item) {
            var key = this._selector(item);
            var bucket = Enumerable.fromArray(this._storage).firstOrDefault(function (b) {
                return b.key === key;
            });

            if (!bucket) {
                bucket = new Grouping(key);
                this._storage.push(bucket);
            }

            bucket.add(item);
        };

        GroupingAggregator.prototype.aggregate = function (item) {
            this.bucket(item);
        };

        GroupingAggregator.prototype.getResult = function () {
            return Enumerable.fromArray(this._storage);
        };
        return GroupingAggregator;
    })();

    var SortingAggregator = (function () {
        function SortingAggregator(_selector, _sortOrder) {
            this._selector = _selector;
            this._sortOrder = _sortOrder;
            this._storage = [];
        }
        SortingAggregator.prototype.getComparer = function () {
            return this._sortOrder === 0 /* Ascending */ ? function (i1, i2) {
                return i1 > i2;
            } : function (i1, i2) {
                return i2 > i1;
            };
        };

        SortingAggregator.prototype.getInsertionPosition = function (item1) {
            var _this = this;
            var comparer = this.getComparer();
            var pos = 0;

            Enumerable.fromArray(this._storage).firstOrDefault(function (item2) {
                if (comparer(_this._selector(item1), _this._selector(item2))) {
                    pos++;
                    return false;
                }
                return true;
            });

            return pos;
        };

        SortingAggregator.prototype.aggregate = function (item) {
            this._storage.splice(this.getInsertionPosition(item), 0, item);
        };

        SortingAggregator.prototype.getResult = function () {
            return Enumerable.fromArray(this._storage);
        };
        return SortingAggregator;
    })();

    var Iterator = (function () {
        function Iterator(_enumerator) {
            this._enumerator = _enumerator;
        }
        Iterator.prototype.iterate = function (iterator, aggregator) {
            var i = 0;
            var currentItem;

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
        };

        Iterator.prototype.filter = function (iterator, aggregator) {
            return this.iterate(iterator, aggregator);
        };

        Iterator.prototype.aggregate = function (iterator, aggregator) {
            return this.iterate(iterator, aggregator);
        };
        return Iterator;
    })();

    var EnumerableCore = (function () {
        function EnumerableCore(arr) {
            this.storage = arr ? arr : new Array();
        }
        EnumerableCore.prototype.getEnumerator = function () {
            var _this = this;
            return new ArrayEnumerator(function (i) {
                return _this.storage[i];
            });
        };

        EnumerableCore.prototype.aggregate = function (selector, aggFunc) {
            return new Iterator(this.getEnumerator()).aggregate(function (i) {
                return new IterationResult(i, false);
            }, new AggregationAggregator(selector, aggFunc));
        };

        EnumerableCore.prototype.iterate = function (iterator, aggregator) {
            return new Iterator(this.getEnumerator()).filter(iterator, aggregator);
        };

        EnumerableCore.prototype.group = function (iterator, aggregator) {
            return new Iterator(this.getEnumerator()).filter(iterator, aggregator);
        };

        EnumerableCore.prototype.filter = function (iterator) {
            return this.iterate(iterator, new FilterAggregator());
        };

        EnumerableCore.prototype.sort = function (selector, order) {
            return this.iterate(function (i) {
                return new IterationResult(i, false);
            }, new SortingAggregator(selector, order));
        };

        EnumerableCore.prototype.item = function (index) {
            return this.storage[index];
        };

        EnumerableCore.prototype.count = function (predicate) {
            return predicate ? this.where(predicate).count() : this.storage.length;
        };

        EnumerableCore.prototype.where = function (predicate) {
            return this.filter(function (item) {
                if (predicate(item)) {
                    return new IterationResult(item, false);
                }
                return new IterationResult(null, false);
            });
        };

        EnumerableCore.prototype.firstOrDefault = function (predicate) {
            if (!predicate) {
                return this.item(0);
            }

            var result = this.filter(function (item, i) {
                if (predicate(item, i)) {
                    return new IterationResult(item, true);
                }
                return new IterationResult(null, false);
            });

            return result.count() > 0 ? result.firstOrDefault() : null;
        };

        EnumerableCore.prototype.select = function (selector) {
            return this.filter(function (item) {
                return new IterationResult(selector(item), false);
            });
        };

        EnumerableCore.prototype.orderByAscending = function (selector) {
            return this.sort(selector, 0 /* Ascending */);
        };

        EnumerableCore.prototype.orderByDescending = function (selector) {
            return this.sort(selector, 1 /* Descending */);
        };

        EnumerableCore.prototype.aggr = function (selector, aggFunc) {
            return this.aggregate(selector, function (sum, next) {
                return typeof sum === "undefined" ? next : aggFunc(sum, next);
            });
        };

        EnumerableCore.prototype.sum = function (selector) {
            if (!selector)
                selector = function (i) {
                    return i;
                };
            return this.aggr(selector, function (sum, next) {
                return sum + next;
            });
        };

        EnumerableCore.prototype.groupBy = function (selector) {
            return this.group(function (i) {
                return new IterationResult(i, false);
            }, new GroupingAggregator(selector));
        };

        EnumerableCore.prototype.toArray = function () {
            return this.storage.slice(0);
        };

        EnumerableCore.prototype.toList = function () {
            return new List(this.toArray());
        };
        return EnumerableCore;
    })();
    Query.EnumerableCore = EnumerableCore;

    var List = (function (_super) {
        __extends(List, _super);
        function List(arr) {
            _super.call(this, arr);
        }
        List.prototype.add = function (item) {
            this.storage.push(item);
        };

        List.prototype.remove = function (index) {
            this.storage.splice(index, 1);
        };

        List.prototype.each = function (action) {
            this.filter(function (item) {
                action(item);
                return new IterationResult(null, false);
            });
        };
        return List;
    })(EnumerableCore);
    Query.List = List;

    var Grouping = (function (_super) {
        __extends(Grouping, _super);
        function Grouping(key) {
            _super.call(this);
            this.key = key;
        }
        return Grouping;
    })(List);
    Query.Grouping = Grouping;

    var KeyValuePair = (function () {
        function KeyValuePair(key, value) {
            this.key = key;
            this.value = value;
        }
        return KeyValuePair;
    })();

    var ArrayEnumerator = (function () {
        function ArrayEnumerator(_accessor) {
            this._accessor = _accessor;
            this._currentIndex = 0;
        }
        Object.defineProperty(ArrayEnumerator.prototype, "current", {
            get: function () {
                return this._accessor(this._currentIndex);
            },
            enumerable: true,
            configurable: true
        });

        ArrayEnumerator.prototype.next = function () {
            var next = this.current;

            if (next) {
                this._currentIndex++;
                return next;
            }

            return null;
        };

        ArrayEnumerator.prototype.reset = function () {
            this._currentIndex = 0;
        };
        return ArrayEnumerator;
    })();
})(Query || (Query = {}));
//# sourceMappingURL=Query.js.map
