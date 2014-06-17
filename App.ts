///<reference path="Query.ts"/>

console.log( Query.fromArray( [1, 2, 3] ).sum() );

console.log( Query.fromArray( [1, 2, 3] ).toList().where(n => n > 1).toList() );

console.log( Query.fromArray( ['t', 'e', 's', 't'] ).aggregate( ( c, n ) => c + n, '' ) );

console.log( Query.fromArray( ['t', 'e', 's', 't'] ).skip( 1 ).aggregate( ( c, n ) => c + n, '' ) );

enum Sex {
    Male,
    Female
}

class Person {
    constructor(public name: string, public age: number, public sex: Sex) {}
}

var persons = [
    new Person( 'Thomas', 26, Sex.Male ),
    new Person( 'Lasse', 22, Sex.Male ),
    new Person( 'Caroline', 24, Sex.Female )
];

Query.fromArray(persons).groupBy(p => p.sex).toList().each(g => g.orderByAscending(p2 => p2.age).toList().each(p => console.log(p.name)));