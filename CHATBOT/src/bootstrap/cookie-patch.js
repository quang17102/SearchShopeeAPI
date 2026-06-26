try {
    const tough = require(require.resolve("tough-cookie"));
    const originalSetCookie = tough.CookieJar.prototype.setCookie;
    tough.CookieJar.prototype.setCookie = function (cookie, url, options, cb) {
        if (typeof options === "function") {
            cb = options;
            options = {};
        }
        options = options || {};
        options.ignoreError = true;
        options.loose = true;
        if (cb) {
            return originalSetCookie.call(this, cookie, url, options, (err, res) => cb(null, res));
        }
        return originalSetCookie.call(this, cookie, url, options).catch(() => null);
    };
} catch (_) {}
