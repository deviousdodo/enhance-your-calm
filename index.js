module.exports = function(redis) {
  if (typeof redis !== "object" || typeof redis.defineCommand !== "function")
    throw new TypeError("You must provide a valid ioredis client!");

  redis.defineCommand("__enhanceYourCalm__checkRateLimit", {
    numberOfKeys: 1,
    lua: `
local key = KEYS[1]
local max = tonumber(ARGV[1], 10)
local sec = tonumber(ARGV[2], 10)
local now = tonumber(ARGV[3], 10)

if redis.call('LLEN', key) >= max then
  local lastTime = redis.call('LINDEX', key, -1)
  if now - lastTime < sec then
    return 0
  else
    redis.call('RPOP', key)
  end
end
redis.call('LPUSH', key, now)
redis.call('EXPIRE', key, sec)
return 1
`
  });

  function keyname({ name, seconds }) {
    return `__enhanceYourCalm__:${name}:${seconds}`;
  }

  function check(opts = {}) {
    // using the Bluebird promise from ioredis.
    return redis.constructor.Promise.try(function() {
      if (typeof opts !== "object")
        throw new TypeError("You must provide an object as a parameter");
      const { name, max, seconds } = opts;
      if (typeof name !== "string")
        throw new TypeError("name must be a string");
      if (typeof max !== "number" || max < 0)
        throw new TypeError("max must be a positive integer");
      if (typeof seconds !== "number" || seconds < 0)
        throw new TypeError("seconds must be a positive integer");
      // we don't need to hit redis for trivial case.
      if (max === 0 || seconds === 0) return false;
      const now = Math.floor(Date.now() / 1000);
      return redis
        .__enhanceYourCalm__checkRateLimit(
          keyname({ name, seconds }),
          max,
          seconds,
          now
        )
        .then(v => !!v);
    });
  }

  return { check, keyname };
};
