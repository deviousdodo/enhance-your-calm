# enhance-your-calm

[![NPM Version](https://img.shields.io/npm/v/enhance-your-calm.svg)](https://www.npmjs.com/package/enhance-your-calm)
[![Build Status](https://travis-ci.org/deviousdodo/enhance-your-calm.svg?branch=master)](https://travis-ci.org/deviousdodo/enhance-your-calm)
[![Test Coverage](https://img.shields.io/codecov/c/github/deviousdodo/enhance-your-calm/master.svg)](https://codecov.io/github/deviousdodo/enhance-your-calm/)

Sliding window rate limiter based on redis lists. It requires [ioredis](https://github.com/luin/ioredis).

## Features

* does not over-penalize clients.
* worst case requires 4 O(1) operations (+ 1 EXPIRE).
* uses a single list of numbers that auto-expires for each combination of key-interval.
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
limiter.check({ name: "listUsers", max: 3, seconds: 300 }).then(v => console.log(v)); // logs true
limiter.check({ name: "listUsers", max: 3, seconds: 300 }).then(v => console.log(v)); // logs true
limiter.check({ name: "listUsers", max: 3, seconds: 300 }).then(v => console.log(v)); // logs true
limiter.check({ name: "listUsers", max: 3, seconds: 300 }).then(v => console.log(v)); // logs false

// if you want to know the Redis key name used by the lib:
limiter.keyname({ name: "listusers", seconds: 300 });
```

Based on [@luin](https://github.com/luin)'s [StackOverflow answer](https://stackoverflow.com/questions/13175050/how-to-implement-rate-limiting-using-redis)

## License

MIT
