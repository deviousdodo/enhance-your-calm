# enhance-your-calm

[![NPM Version](https://img.shields.io/npm/v/enhance-your-calm.svg)](https://www.npmjs.com/package/enhance-your-calm)
[![Build Status](https://travis-ci.org/deviousdodo/enhance-your-calm.svg?branch=master)](https://travis-ci.org/deviousdodo/enhance-your-calm)
[![Test Coverage](https://img.shields.io/codecov/c/github/deviousdodo/enhance-your-calm/master.svg)](https://codecov.io/github/deviousdodo/enhance-your-calm/)

Sliding window rate limiter based on redis lists. It requires [ioredis v3](https://github.com/luin/ioredis). **Using latest ioredis (v4) will not work!**

## Features

* does not over-penalize clients.
* allows multiple intervals for the same key.
* worst case requires 4 O(1) operations (+ 1 EXPIRE) for each key-interval pair.
* uses a single list of numbers that auto-expires for each key-interval pair.
* max memory cost: an int * number of max allowed calls

## Installation

```shell
yarn add enhance-your-calm
```
or
```shell
npm install enhance-your-calm
```

## Usage

```js
const Redis = require("ioredis");
const redis = new Redis();

const limiter = require("enhance-your-calm")(redis);

// allow 10 calls per 5 minutes.
const canList = () => limiter.check("list", { max: 10, seconds: 300 });

let listCalls = [];
for (let i = 0; i < 3; i++) {
  listCalls.push(canList());
}
Promise.all(listCalls).then(v => console.log(v)); // outputs [true, true, false]

// allow 1 call per minute and 100 per day.
const canCreate = () => limiter.check(
  "create",
  [{ max: 1, seconds: 60 }, { max: 100, seconds: 24 * 3600 }]
);

let createCalls = [];
createCalls.push(canCreate());
createCalls.push(canCreate());
for (let i = 0; i < 100; i++) {
  createCalls.push(delay(canCreate, 61));
}
Promise.all(createCalls).then(v => console.log(v)); // outputs [true, false, true, true, ..., false]

// if you want to know the generated Redis key name you need to provide the name & interval:
limiter.keyname("listusers", 24 * 3600);
```

## Attribution

Lua code was inspired by [@luin](https://github.com/luin)'s [StackOverflow answer](https://stackoverflow.com/questions/13175050/how-to-implement-rate-limiting-using-redis)

Package name was taken from Twitter's 420 HTTP Status text :)

## License

MIT
