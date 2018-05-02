function invalidLimit(n) {
  return !Number.isInteger(n) || n < 0;
}

function intervalToArray(acc, { max, seconds }) {
  return acc.concat([max, seconds]);
}

function keyname(name, seconds) {
  return `__enhanceYourCalm__:${name}:${seconds}`;
}

const lua = `
local now = tonumber(ARGV[1], 10)

for i, key in pairs(KEYS) do
  local max = tonumber(ARGV[2*i], 10)
  local sec = tonumber(ARGV[2*i+1], 10)

  if redis.call('LLEN', key) >= max then
    local lastTime = redis.call('LINDEX', key, -1)
    if now - lastTime < sec then
      return 0
    else
      redis.call('RPOP', key)
    end
  end
end

for i, key in pairs(KEYS) do
  local sec = tonumber(ARGV[2*i+1], 10)

  redis.call('LPUSH', key, now)
  redis.call('EXPIRE', key, sec)
end

return 1
`;

module.exports = function(redis) {
  // I use .defineCommand as a crude way to check if the object is an ioredis instance.
  if (typeof redis !== "object" || typeof redis.defineCommand !== "function")
    throw new TypeError("You must provide a valid ioredis client");

  redis.defineCommand("__enhanceYourCalm__checkRateLimit", { lua });

  function check(name, intervals) {
    // using the Bluebird promise from ioredis.
    return redis.constructor.Promise.try(function() {
      if (typeof name !== "string") {
        throw new TypeError("You must provide a string as the first argument");
      }
      if (!intervals || typeof intervals !== "object") {
        throw new TypeError(
          "You must provide an object or array of objects as the second argument"
        );
      }

      const limits = Array.isArray(intervals) ? intervals : [intervals];
      const limitsList = limits.reduce(intervalToArray, []);

      if (!limitsList.length) {
        throw new TypeError(
          "You must provide at least one rate limit interval"
        );
      }

      if (limitsList.some(invalidLimit)) {
        throw new TypeError("max and seconds must be positive integers");
      }

      // We don't need to hit redis for the trivial case: in case any of the options have a 0 for
      // either max or seconds, then the result can only be false.
      if (limitsList.indexOf(0) > -1) {
        return Promise.resolve(false);
      }

      const keys = limits.map(interval => keyname(name, interval.seconds));

      const now = Math.floor(Date.now() / 1000);

      return redis
        .__enhanceYourCalm__checkRateLimit(
          keys.length,
          ...keys,
          now,
          ...limitsList
        )
        .then(v => !!v);
    });
  }

  return { check, keyname };
};
