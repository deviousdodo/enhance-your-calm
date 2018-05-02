const Redis = require("ioredis");
const redis = new Redis();
const initLimiter = require("../index");
const { check, keyname } = initLimiter(redis);

// quick-and-dirty mock of Date.now so that I don't add a new dependency.
const clock = {
  install: function() {
    this._now = Date.now();
    this._realNow = Date.now;
    Date.now = () => {
      return this._now;
    };
  },
  tick: function(seconds) {
    this._now += seconds * 1000;
  },
  uninstall: function() {
    Date.now = this._realNow;
  }
};

afterAll(function() {
  redis.quit();
});

describe("init", function() {
  test("throws an error if called with no arguments", function() {
    expect(function() {
      initLimiter();
    }).toThrow(TypeError);
  });

  test("throws an error if passed object is not an ioredis client", function() {
    expect(function() {
      initLimiter({});
    }).toThrow(TypeError);
  });
});

describe("check", function() {
  describe("argument validations", function() {
    test("throws if invoked with no args", async function() {
      await expect(check()).rejects.toThrow(TypeError);
    });

    test("throws if invoked with only one argument", async function() {
      await expect(check("example")).rejects.toThrow(TypeError);
    });

    test("throws if first argument is not a string", async function() {
      await expect(
        check({ foo: "bar" }, { max: 10, seconds: 100 })
      ).rejects.toThrow(TypeError);
    });

    test("throws if second argument is not an object or array of objects", async function() {
      await expect(check("foo", "bar")).rejects.toThrow(TypeError);
    });

    test("throws if second argument is an empty array", async function() {
      await expect(check("foo", [])).rejects.toThrow(TypeError);
    });

    test("throws an error if invoked without max", async function() {
      await expect(check("key", { seconds: 10 })).rejects.toThrow(TypeError);
      await expect(check("key", [{ seconds: 10 }])).rejects.toThrow(TypeError);
    });

    test("throws an error if invoked without seconds", async function() {
      await expect(check("key", { max: 10 })).rejects.toThrow(TypeError);
      await expect(check("key", [{ max: 10 }])).rejects.toThrow(TypeError);
    });

    test("throws an error if max is not a number", async function() {
      await expect(check("key", { max: "foo", seconds: 10 })).rejects.toThrow(
        TypeError
      );
      await expect(check("key", [{ max: "foo", seconds: 10 }])).rejects.toThrow(
        TypeError
      );
    });

    test("throws an error if max is negative", async function() {
      await expect(check("key", { max: -1, seconds: 10 })).rejects.toThrow(
        TypeError
      );
      await expect(check("key", [{ max: -1, seconds: 10 }])).rejects.toThrow(
        TypeError
      );
    });

    test("throws an error if max is a float", async function() {
      await expect(check("key", { max: 1.1, seconds: 10 })).rejects.toThrow(
        TypeError
      );
      await expect(check("key", [{ max: 1.1, seconds: 10 }])).rejects.toThrow(
        TypeError
      );
    });

    test("throws an error if seconds is not a number", async function() {
      await expect(check("key", { max: 10, seconds: "foo" })).rejects.toThrow(
        TypeError
      );
      await expect(check("key", [{ max: 10, seconds: "foo" }])).rejects.toThrow(
        TypeError
      );
    });

    test("throws an error if seconds is negative", async function() {
      await expect(check("key", { max: 10, seconds: -1 })).rejects.toThrow(
        TypeError
      );
      await expect(check("key", [{ max: 10, seconds: -1 }])).rejects.toThrow(
        TypeError
      );
    });

    test("throws an error if seconds is a float", async function() {
      await expect(check("key", { max: 10, seconds: 1.1 })).rejects.toThrow(
        TypeError
      );
      await expect(check("key", [{ max: 10, seconds: 1.1 }])).rejects.toThrow(
        TypeError
      );
    });
  });

  test("returns false if max is 0", async function() {
    await expect(check("key", { max: 0, seconds: 10 })).resolves.toBe(false);
    await expect(check("key", [{ max: 0, seconds: 10 }])).resolves.toBe(false);
  });

  test("returns false if seconds is 0", async function() {
    await expect(check("key", { max: 10, seconds: 0 })).resolves.toBe(false);
    await expect(check("key", [{ max: 10, seconds: 0 }])).resolves.toBe(false);
  });

  test("returns true for max times within the given period", async function() {
    await redis.del(keyname("maxtimes", 10));
    const promises = Array(10)
      .fill(0)
      .map(() => check("maxtimes", { max: 10, seconds: 10 }));
    await expect(Promise.all(promises)).resolves.toEqual(Array(10).fill(true));
  });

  test("returns false for all invocations after max", async function() {
    await redis.del(keyname("exceedmaxtest", 10));
    const promises = Array(20)
      .fill(0)
      .map(() => check("exceedmaxtest", { max: 10, seconds: 10 }));
    const results = await Promise.all(promises);
    expect(results.slice(10)).toEqual(Array(10).fill(false));
  });

  test("requests get freed up after interval", async function() {
    clock.install();
    await redis.del(keyname("slide1", 10));
    const fn = () => check("slide1", { max: 1, seconds: 10 });
    await expect(fn()).resolves.toBe(true);
    clock.tick(9);
    await expect(fn()).resolves.toBe(false);
    clock.tick(1);
    await expect(fn()).resolves.toBe(true);
    clock.uninstall();
  });

  test("requests are freed independently of each other", async function() {
    clock.install();
    await redis.del(keyname("slidemany", 300));
    const fn = () => check("slidemany", { max: 9, seconds: 300 });
    for (let i = 0; i < 9; i++) {
      await fn();
      clock.tick(30);
    }
    // 30s away from the interval end we have used up all available requests.
    await expect(fn()).resolves.toBe(false);
    // now as we advance in time we should be allowed to make only one request, as the ones from the
    // previous loop expire.
    for (let i = 0; i < 9; i++) {
      clock.tick(30);
      // the i is just to aid debugging.
      await expect(Promise.all([fn(), fn(), i])).resolves.toEqual([
        true,
        false,
        i
      ]);
    }
    clock.uninstall();
  });

  test("the key is set to expire after the interval", async function() {
    const key = keyname("expiretest", 10);
    await redis.del(key);
    await check("expiretest", { max: 10, seconds: 10 });
    await expect(redis.ttl(key)).resolves.toBe(10);
  });

  describe("multiple intervals", function() {
    test("returns false if any of the limits are exceeded", async function() {
      clock.install();
      await redis.del(keyname("falseforany", 10));
      await redis.del(keyname("falseforany", 3600));
      const isAllowed = () =>
        check("falseforany", [
          { max: 2, seconds: 10 },
          { max: 10, seconds: 3600 }
        ]);

      // first 2 calls will pass and be considered "hits" for both buckets.
      await expect(
        Promise.all([isAllowed(), isAllowed(), isAllowed()])
      ).resolves.toEqual([true, true, false]);

      // so we have 8 more available after 10 seconds
      for (let i = 0; i < 10; i++) {
        clock.tick(20);
        await expect(isAllowed()).resolves.toBe(i < 8);
      }

      clock.uninstall();
    });

    test("when one check fails the request is not added to any of the buckets", async function() {
      await redis.del(keyname("dontoverpenalize", 10));
      await redis.del(keyname("dontoverpenalize", 3600));
      const isAllowed = () =>
        check("dontoverpenalize", [
          { max: 2, seconds: 10 },
          { max: 10, seconds: 3600 }
        ]);

      await Promise.all([isAllowed(), isAllowed(), isAllowed()]);

      const bucket10 = await redis.lrange(
        keyname("dontoverpenalize", 10),
        0,
        -1
      );
      const bucket3600 = await redis.lrange(
        keyname("dontoverpenalize", 3600),
        0,
        -1
      );

      expect(bucket10.length).toBe(2);
      expect(bucket3600.length).toBe(2);
    });
  });
});

describe("keyname", function() {
  test("returns a string containing both the key and interval", function() {
    const key = keyname("mykey", 12345);
    expect(key.indexOf("mykey")).toBeGreaterThan(-1);
    expect(key.indexOf("12345")).toBeGreaterThan(-1);
  });
  test("returns the same key for the same args", function() {
    expect(keyname("example", 568291)).toEqual(keyname("example", 568291));
  });
});

describe("internal", function() {
  test("clock test", async function() {
    const now = Date.now();
    clock.install();
    const newNow = Date.now();
    expect(newNow - now).toBeLessThan(10);
    clock.tick(10);
    expect(Date.now() - newNow).toBe(10000);
    clock.uninstall();
    expect(Date.now() - now).toBeLessThan(10);
  });
});
