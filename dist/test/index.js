"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var test = require("blue-tape");
var methods = require("methods");
var FormData = require("form-data");
var fs_1 = require("fs");
var path_1 = require("path");
var popsicle = require("../common");
var SHORTHAND_METHODS = [
    'get',
    'post',
    'put',
    'patch',
    'del'
];
var SUPPORTED_METHODS = typeof window === 'object' ? [
    'get',
    'post',
    'put',
    'patch',
    'delete'
] : methods.filter(function (method) { return method !== 'connect'; });
var METHODS_WITHOUT_BODY = ['connect', 'head', 'options'];
var REMOTE_URL = 'http://localhost:' + process.env.PORT;
var REMOTE_HTTPS_URL = 'https://localhost:' + process.env.HTTPS_PORT;
var EXAMPLE_BODY = {
    username: 'blakeembrey',
    password: 'hunter2'
};
var BOUNDARY_REGEXP = /^multipart\/form-data; boundary=([^;]+)/;
var MULTIPART_SEP = '\r\n';
var supportsStatusText = parseFloat(process.version.replace(/^v/, '')) >= 0.12;
test('should expose default functions', function (t) {
    t.equal(typeof popsicle, 'object');
    t.equal(typeof popsicle.Request, 'function');
    t.equal(typeof popsicle.Response, 'function');
    t.equal(typeof popsicle.form, 'function');
    t.equal(typeof popsicle.jar, 'function');
    SHORTHAND_METHODS.forEach(function (method) {
        t.equal(typeof popsicle[method], 'function');
    });
    t.end();
});
test('throw an error when no options are provided', function (t) {
    t.throws(function () { return popsicle.request({}); }, /url must be a string/i);
    t.end();
});
test('create a popsicle#Request instance', function (t) {
    var req = popsicle.request('/');
    t.ok(req instanceof popsicle.Request);
    req.set('Test', 'Test');
    t.equal(req.rawHeaders.length, 2);
    req.remove('Test');
    t.equal(req.rawHeaders.length, 0);
    return req.then(null, function () { return undefined; });
});
test('use the same response in promise chains', function (t) {
    var req = popsicle.get(REMOTE_URL + '/echo');
    t.plan(13);
    return req
        .then(function (res) {
        t.ok(res instanceof popsicle.Response);
        t.ok(typeof res.url === 'string' || res.url == null);
        t.ok(Array.isArray(res.rawHeaders));
        t.equal(typeof res.headers, 'object');
        t.equal(typeof res.status, 'number');
        t.equal(typeof res.get, 'function');
        t.equal(typeof res.name, 'function');
        t.equal(typeof res.type, 'function');
        t.equal(typeof res.statusType, 'function');
        t.equal(typeof res.toJSON, 'function');
        t.deepEqual(Object.keys(req.toJSON()), ['url', 'method', 'headers', 'body', 'timeout']);
        t.deepEqual(Object.keys(res.toJSON()), ['url', 'headers', 'body', 'status', 'statusText']);
        return req
            .then(function (res2) {
            t.equal(res, res2);
        });
    });
});
test('clone a request instance', function (t) {
    var req = popsicle.get(REMOTE_URL + '/echo/header/x-example');
    req.use(function (self, next) {
        self.set('X-Example', 'foobar');
        return next();
    });
    return Promise.all([req, req.clone()])
        .then(function (res) {
        t.notEqual(res[0], res[1]);
        t.equal(res[0].body, 'foobar');
        t.equal(res[0].body, res[1].body);
    });
});
test('methods', function (t) {
    t.test('use node-style callbacks', function (t) {
        t.plan(1);
        return popsicle.request(REMOTE_URL + '/echo')
            .exec(function (err, res) {
            t.ok(res instanceof popsicle.Response);
            t.end(err);
        });
    });
    t.test('allow methods to be passed in', function (t) {
        return Promise.all(SUPPORTED_METHODS.map(function (method) {
            return popsicle.request({
                url: REMOTE_URL + '/echo/method',
                method: method
            })
                .then(function (res) {
                t.equal(res.status, 200);
                t.equal(res.body, METHODS_WITHOUT_BODY.indexOf(method) === -1 ? method.toUpperCase() : '');
            });
        }));
    });
});
test('allow usage of method shorthands', function (t) {
    return Promise.all(SHORTHAND_METHODS.map(function (method) {
        return popsicle[method](REMOTE_URL + '/echo/method')
            .then(function (res) {
            t.equal(res.status, 200);
            t.equal(res.body, method === 'del' ? 'DELETE' : method.toUpperCase());
        });
    }));
});
test('response status', function (t) {
    t.test('5xx', function (t) {
        return popsicle.request(REMOTE_URL + '/error')
            .then(function (res) {
            t.equal(res.status, 500);
            t.equal(res.statusType(), 5);
            if (supportsStatusText) {
                t.equal(res.statusText, 'Internal Server Error');
            }
        });
    });
    t.test('4xx', function (t) {
        return popsicle.request(REMOTE_URL + '/not-found')
            .then(function (res) {
            t.equal(res.status, 404);
            t.equal(res.statusType(), 4);
            if (supportsStatusText) {
                t.equal(res.statusText, 'Not Found');
            }
        });
    });
    t.test('2xx', function (t) {
        return popsicle.request(REMOTE_URL + '/no-content')
            .then(function (res) {
            t.equal(res.status, 204);
            t.equal(res.statusType(), 2);
            if (supportsStatusText) {
                t.equal(res.statusText, 'No Content');
            }
        });
    });
});
test('request headers', function (t) {
    t.test('always send user agent', function (t) {
        return popsicle.request(REMOTE_URL + '/echo/header/user-agent')
            .then(function (res) {
            var regexp = process.browser ?
                /^Mozilla\/.+$/ :
                /^Popsicle \(https:\/\/github\.com\/blakeembrey\/popsicle\)$/;
            t.ok(regexp.test(res.body));
        });
    });
    if (!process.browser) {
        t.test('send a custom user agent header', function (t) {
            return popsicle.request({
                url: REMOTE_URL + '/echo/header/user-agent',
                headers: {
                    'User-Agent': 'foobar'
                }
            })
                .then(function (res) {
                t.equal(res.body, 'foobar');
            });
        });
        if (!/^v0\.10/.test(process.version)) {
            t.test('case sensitive headers', function (t) {
                return popsicle.get({
                    url: REMOTE_URL + '/raw-headers',
                    headers: {
                        'Raw-Header': 'test'
                    }
                })
                    .then(function (res) {
                    t.ok(res.body.indexOf('Raw-Header') > -1, 'raw headers sent with original casing');
                });
            });
        }
    }
});
test('response headers', function (t) {
    t.test('parse', function (t) {
        return popsicle.request(REMOTE_URL + '/notfound')
            .then(function (res) {
            t.equal(res.type(), 'text/html');
            t.equal(res.get('Content-Type'), 'text/html; charset=utf-8');
        });
    });
});
test('request body', function (t) {
    t.test('send post data', function (t) {
        return popsicle.request({
            url: REMOTE_URL + '/echo',
            method: 'POST',
            body: 'example data',
            headers: {
                'content-type': 'application/octet-stream'
            }
        })
            .then(function (res) {
            t.equal(res.body, 'example data');
            t.equal(res.status, 200);
            t.equal(res.type(), 'application/octet-stream');
            if (supportsStatusText) {
                t.equal(res.statusText, 'OK');
            }
        });
    });
    t.test('should automatically send objects as json', function (t) {
        return popsicle.request({
            url: REMOTE_URL + '/echo',
            method: 'POST',
            body: EXAMPLE_BODY
        })
            .use(popsicle.plugins.parse('json'))
            .then(function (res) {
            t.deepEqual(res.body, EXAMPLE_BODY);
            t.equal(res.type(), 'application/json');
        });
    });
    t.test('should send as form encoded when header is set', function (t) {
        return popsicle.request({
            url: REMOTE_URL + '/echo',
            method: 'POST',
            body: EXAMPLE_BODY,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        })
            .use(popsicle.plugins.parse('urlencoded'))
            .then(function (res) {
            t.deepEqual(res.body, EXAMPLE_BODY);
            t.equal(res.name('Content-Type'), 'content-type');
            t.equal(res.type(), 'application/x-www-form-urlencoded');
        });
    });
    t.test('host objects', function (t) {
        t.test('form data', function (t) {
            function validateResponse(res) {
                var boundary = BOUNDARY_REGEXP.exec(res.headers['content-type'])[1];
                var body = [
                    '--' + boundary,
                    'Content-Disposition: form-data; name="username"',
                    '',
                    EXAMPLE_BODY.username,
                    '--' + boundary,
                    'Content-Disposition: form-data; name="password"',
                    '',
                    EXAMPLE_BODY.password,
                    '--' + boundary + '--'
                ].join(MULTIPART_SEP) + MULTIPART_SEP;
                t.equal(res.body, body);
            }
            t.test('should create form data instance', function (t) {
                var form = popsicle.form(EXAMPLE_BODY);
                t.ok(form instanceof FormData);
                return popsicle.request({
                    url: REMOTE_URL + '/echo',
                    method: 'POST',
                    body: form
                }).then(validateResponse);
            });
            t.test('should stringify to form data when set as multipart', function () {
                return popsicle.request({
                    url: REMOTE_URL + '/echo',
                    method: 'POST',
                    body: EXAMPLE_BODY,
                    headers: {
                        'Content-Type': 'multipart/form-data'
                    }
                }).then(validateResponse);
            });
        });
    });
});
test('query', function (t) {
    t.test('should stringify and send query parameters', function (t) {
        return popsicle.request({
            url: REMOTE_URL + '/echo/query',
            query: EXAMPLE_BODY
        })
            .use(popsicle.plugins.parse('json'))
            .then(function (res) {
            t.deepEqual(res.body, EXAMPLE_BODY);
        });
    });
    t.test('should stringify and append to query object', function (t) {
        var req = popsicle.request({
            url: REMOTE_URL + '/echo/query?query=true',
            query: EXAMPLE_BODY
        });
        var query = {
            query: 'true',
            username: 'blakeembrey',
            password: 'hunter2'
        };
        var fullUrl = REMOTE_URL + '/echo/query?query=true&username=blakeembrey&password=hunter2';
        t.equal(req.url, fullUrl);
        t.deepEqual(req.query, query);
        return req
            .use(popsicle.plugins.parse('json'))
            .then(function (res) {
            if (typeof window === 'undefined') {
                t.equal(res.url, fullUrl);
            }
            t.deepEqual(res.body, query);
        });
    });
    t.test('should accept query as a string', function (t) {
        var req = popsicle.request({
            url: REMOTE_URL + '/echo/query',
            query: 'query=true'
        });
        t.equal(req.url, REMOTE_URL + '/echo/query?query=true');
        t.deepEqual(req.query, { query: 'true' });
        return req
            .use(popsicle.plugins.parse('json'))
            .then(function (res) {
            t.deepEqual(res.body, { query: 'true' });
        });
    });
});
test('timeout', function (t) {
    t.test('should timeout the request when set', function (t) {
        t.plan(3);
        return popsicle.request({
            url: REMOTE_URL + '/delay/1500',
            timeout: 500
        })
            .catch(function (err) {
            t.equal(err.message, 'Timeout of 500ms exceeded');
            t.equal(err.code, 'ETIMEOUT');
            t.ok(err.popsicle instanceof popsicle.Request);
        });
    });
});
test('abort', function (t) {
    t.test('abort before it starts', function (t) {
        var req = popsicle.request(REMOTE_URL + '/echo');
        req.abort();
        t.plan(3);
        return req
            .catch(function (err) {
            t.equal(err.message, 'Request aborted');
            t.equal(err.code, 'EABORT');
            t.ok(err.popsicle instanceof popsicle.Request);
        });
    });
    t.test('abort mid-request', function (t) {
        var req = popsicle.request(REMOTE_URL + '/download');
        t.plan(1);
        setTimeout(function () { return req.abort(); }, 100);
        return req
            .catch(function (err) {
            t.equal(err.code, 'EABORT');
        });
    });
    t.test('no side effects of aborting twice', function (t) {
        var req = popsicle.request(REMOTE_URL + '/download');
        t.plan(3);
        req.abort();
        req.abort();
        return req
            .catch(function (err) {
            t.equal(err.message, 'Request aborted');
            t.equal(err.code, 'EABORT');
            t.ok(err.popsicle instanceof popsicle.Request);
        });
    });
    t.test('abort cloned requests', function (t) {
        var req = popsicle.request(REMOTE_URL + '/download');
        var req2 = req.clone();
        t.plan(2);
        req.abort();
        return Promise.all([
            req.catch(function (err) { return t.equal(err.code, 'EABORT'); }),
            req2.catch(function (err) { return t.equal(err.code, 'EABORT'); })
        ]);
    });
});
test('progress', function (t) {
    t.test('download', function (t) {
        t.test('download progress', function (t) {
            var req = popsicle.request(REMOTE_URL + '/download');
            t.plan(typeof window === 'undefined' ? 3 : 2);
            t.equal(req.downloaded, 0);
            if (typeof window === 'undefined') {
                setTimeout(function () {
                    t.equal(req.downloaded, 0.5);
                }, 100);
            }
            return req
                .then(function () {
                t.equal(req.downloaded, 1);
            });
        });
    });
    t.test('event', function (t) {
        t.test('emit progress events', function (t) {
            var req = popsicle.request({
                url: REMOTE_URL + '/echo',
                body: EXAMPLE_BODY,
                method: 'POST'
            });
            t.plan(3);
            var expected = 0;
            req.on('progress', function () {
                expected += 0.5;
                t.equal(this.completed, expected);
            });
            return req
                .use(popsicle.plugins.parse('json'))
                .then(function (res) {
                t.deepEqual(res.body, EXAMPLE_BODY);
            });
        });
    });
});
test('response body', function (t) {
    t.test('parse json responses', function (t) {
        return popsicle.request(REMOTE_URL + '/json')
            .use(popsicle.plugins.parse('json'))
            .then(function (res) {
            t.equal(res.type(), 'application/json');
            t.deepEqual(res.body, { username: 'blakeembrey' });
        });
    });
    t.test('parse form encoded responses', function (t) {
        return popsicle.request(REMOTE_URL + '/foo')
            .use(popsicle.plugins.parse('urlencoded'))
            .then(function (res) {
            t.equal(res.type(), 'application/x-www-form-urlencoded');
            t.deepEqual(res.body, { foo: 'bar' });
        });
    });
    t.test('string response by default', function (t) {
        return popsicle.request({
            url: REMOTE_URL + '/json'
        })
            .then(function (res) {
            t.equal(res.type(), 'application/json');
            t.equal(res.body, '{"username":"blakeembrey"}');
        });
    });
    t.test('empty response bodies', function (t) {
        return popsicle.request({
            url: REMOTE_URL + '/echo',
            method: 'post'
        })
            .then(function (res) {
            t.equal(res.body, '');
        });
    });
    t.test('empty response body with json', function (t) {
        return popsicle.request({
            url: REMOTE_URL + '/echo',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        })
            .use(popsicle.plugins.parse('json'))
            .then(function (res) {
            t.equal(res.body, null);
            t.equal(res.type(), 'application/json');
        });
    });
    t.test('throw on unsupported type', function (t) {
        t.plan(2);
        return popsicle.request({
            url: REMOTE_URL + '/text',
            transport: popsicle.createTransport({ type: 'foobar' })
        })
            .catch(function (err) {
            t.equal(err.message, 'Unsupported type: foobar');
            t.equal(err.code, 'ETYPE');
        });
    });
    if (!process.browser) {
        var fs_2 = require('fs');
        var concat_1 = require('concat-stream');
        var filename_1 = require('path').join(__dirname, '../../scripts/server.js');
        var filecontents_1 = fs_2.readFileSync(filename_1, 'utf-8');
        t.test('stream the response body', function (t) {
            return popsicle.request({
                url: REMOTE_URL + '/json',
                transport: popsicle.createTransport({ type: 'stream' })
            })
                .then(function (res) {
                t.equal(typeof res.body, 'object');
                return new Promise(function (resolve) {
                    res.body.pipe(concat_1(function (data) {
                        t.equal(data.toString(), '{"username":"blakeembrey"}');
                        return resolve();
                    }));
                });
            });
        });
        t.test('should break when response body is bigger than buffer size', function (t) {
            t.plan(1);
            return popsicle.request(REMOTE_URL + '/urandom')
                .catch(function (err) {
                t.equal(err.code, 'ETOOLARGE');
            });
        });
        t.test('pipe streams', function (t) {
            return popsicle.request({
                url: REMOTE_URL + '/echo',
                body: fs_2.createReadStream(filename_1)
            })
                .then(function (res) {
                t.equal(res.body, filecontents_1);
            });
        });
        t.test('pipe streams into forms', function (t) {
            return popsicle.request({
                url: REMOTE_URL + '/echo',
                body: popsicle.form({
                    file: fs_2.createReadStream(filename_1)
                })
            })
                .then(function (res) {
                var boundary = BOUNDARY_REGEXP.exec(res.get('content-type'))[1];
                t.equal(res.body, [
                    '--' + boundary,
                    'Content-Disposition: form-data; name="file"; filename="server.js"',
                    'Content-Type: application/javascript',
                    '',
                    filecontents_1,
                    '--' + boundary + '--'
                ].join(MULTIPART_SEP) + MULTIPART_SEP);
            });
        });
        t.test('unzip contents', function (t) {
            return popsicle.request({
                url: REMOTE_URL + '/echo/zip',
                body: fs_2.createReadStream(filename_1)
            })
                .then(function (res) {
                t.equal(res.get('Content-Encoding'), 'deflate');
                t.equal(res.body, filecontents_1);
            });
        });
        t.test('unzip with gzip encoding', function (t) {
            return popsicle.request({
                url: REMOTE_URL + '/echo/zip',
                body: fs_2.createReadStream(filename_1),
                headers: {
                    'Accept-Encoding': 'gzip'
                }
            })
                .then(function (res) {
                t.equal(res.get('Content-Encoding'), 'gzip');
                t.equal(res.body, filecontents_1);
            });
        });
    }
    else {
        t.test('browser response type', function (t) {
            return popsicle.request({
                url: REMOTE_URL + '/text',
                transport: popsicle.createTransport({ type: 'arraybuffer' })
            })
                .then(function (res) {
                t.ok(res.body instanceof ArrayBuffer);
            });
        });
    }
});
test('request errors', function (t) {
    t.test('error when requesting an unknown domain', function (t) {
        t.plan(3);
        return popsicle.request('http://fdahkfjhuehfakjbvdahjfds.fdsa')
            .catch(function (err) {
            t.ok(/Unable to connect/i.exec(err.message));
            t.equal(err.code, 'EUNAVAILABLE');
            t.ok(err.popsicle instanceof popsicle.Request);
        });
    });
    t.test('give a parse error on invalid json response', function (t) {
        t.plan(3);
        return popsicle.request({
            url: REMOTE_URL + '/echo',
            method: 'POST',
            body: 'username=blakeembrey&password=hunter2',
            headers: {
                'Content-Type': 'application/json'
            }
        })
            .use(popsicle.plugins.parse('json'))
            .catch(function (err) {
            t.ok(/Unable to parse response body/i.test(err.message));
            t.equal(err.code, 'EPARSE');
            t.ok(err.popsicle instanceof popsicle.Request);
        });
    });
    t.test('give a parse error on invalid response type', function (t) {
        t.plan(3);
        return popsicle.request({
            url: REMOTE_URL + '/echo',
            method: 'POST',
            body: 'hello world',
            headers: {
                'Content-Type': 'foo/bar'
            }
        })
            .use(popsicle.plugins.parse('json'))
            .catch(function (err) {
            t.equal(err.message, 'Unhandled response type: foo/bar');
            t.equal(err.code, 'EPARSE');
            t.ok(err.popsicle instanceof popsicle.Request);
        });
    });
    t.test('give a stringify error on invalid request body', function (t) {
        var obj = {};
        t.plan(3);
        obj.obj = obj;
        return popsicle.request({
            url: REMOTE_URL + '/echo',
            method: 'POST',
            body: obj
        })
            .catch(function (err) {
            t.ok(/Unable to stringify request body/i.test(err.message));
            t.equal(err.code, 'ESTRINGIFY');
            t.ok(err.popsicle instanceof popsicle.Request);
        });
    });
});
test('plugins', function (t) {
    t.test('modify the request', function (t) {
        var req = popsicle.request(REMOTE_URL + '/echo');
        t.plan(1);
        req.use(function (self, next) {
            t.equal(self, req);
            return next();
        });
        return req;
    });
});
test('request flow', function (t) {
    t.test('before', function (t) {
        t.test('run a function before opening the request', function (t) {
            var req = popsicle.request(REMOTE_URL + '/echo');
            t.plan(2);
            req.use(function (self, next) {
                t.equal(self, req);
                t.equal(typeof next, 'function');
                return next();
            });
            return req;
        });
        t.test('fail the request before starting', function (t) {
            var req = popsicle.request(REMOTE_URL + '/echo');
            t.plan(1);
            req.use(function () {
                throw new Error('Hello world!');
            });
            return req
                .catch(function (err) {
                t.equal(err.message, 'Hello world!');
            });
        });
        t.test('accept a promise to delay the request', function (t) {
            var req = popsicle.request({
                url: REMOTE_URL + '/echo',
                method: 'POST',
                body: 'success'
            });
            t.plan(2);
            req.use(function (self, next) {
                return new Promise(function (resolve) {
                    setTimeout(function () {
                        t.equal(self, req);
                        resolve();
                    }, 10);
                }).then(next);
            });
            return req
                .then(function (res) {
                t.equal(res.body, 'success');
            });
        });
    });
    test('after', function (t) {
        t.test('run after the response', function (t) {
            var req = popsicle.request(REMOTE_URL + '/echo');
            t.plan(1);
            req.use(function (_, next) {
                return next()
                    .then(function (res) {
                    t.ok(res instanceof popsicle.Response);
                    return res;
                });
            });
            return req;
        });
    });
});
if (!process.browser) {
    test('cookie jar', function (t) {
        t.test('should work with a cookie jar', function (t) {
            var cookie;
            var instance = popsicle.defaults({
                transport: popsicle.createTransport({
                    jar: popsicle.jar()
                })
            });
            return instance(REMOTE_URL + '/cookie')
                .then(function (res) {
                t.notOk(res.get('Cookie'));
                t.ok(res.get('Set-Cookie'));
                cookie = res.get('Set-Cookie').split(/ *; */, 1)[0];
                return instance(REMOTE_URL + '/echo');
            })
                .then(function (res) {
                t.equal(res.get('Cookie'), cookie);
                t.notOk(res.get('Set-Cookie'));
            });
        });
        t.test('should update over redirects', function (t) {
            var instance = popsicle.defaults({
                transport: popsicle.createTransport({
                    jar: popsicle.jar()
                })
            });
            return instance(REMOTE_URL + '/cookie/redirect')
                .then(function (res) {
                t.ok(/^new=cookie/.test(res.body));
            });
        });
    });
}
test('override request mechanism', function (t) {
    return popsicle.request({
        url: '/foo',
        transport: {
            open: function () {
                return Promise.resolve({
                    url: '/foo',
                    body: 'testing',
                    headers: {},
                    status: 200,
                    statusText: 'OK'
                });
            }
        }
    })
        .then(function (res) {
        t.equal(res.body, 'testing');
    });
});
if (!process.browser) {
    test('redirect', function (t) {
        t.test('should follow 302 redirect with get', function (t) {
            return popsicle.request(REMOTE_URL + '/redirect')
                .then(function (res) {
                t.equal(res.body, 'welcome get');
                t.equal(res.status, 200);
                t.ok(/\/destination$/.test(res.url));
            });
        });
        t.test('should follow 301 redirect with post', function (t) {
            return popsicle.post(REMOTE_URL + '/redirect/code/301')
                .then(function (res) {
                t.equal(res.body, 'welcome get');
                t.equal(res.status, 200);
                t.ok(/\/destination$/.test(res.url));
            });
        });
        t.test('should follow 303 redirect with post', function (t) {
            return popsicle.post({
                url: REMOTE_URL + '/redirect/code/303',
                body: { foo: 'bar' }
            })
                .then(function (res) {
                t.equal(res.body, 'welcome get');
                t.equal(res.status, 200);
                t.ok(/\/destination$/.test(res.url));
            });
        });
        t.test('disable following redirects', function (t) {
            return popsicle.request({
                url: REMOTE_URL + '/redirect',
                transport: popsicle.createTransport({
                    followRedirects: false
                })
            })
                .then(function (res) {
                t.equal(res.status, 302);
                t.ok(/\/redirect$/.test(res.url));
            });
        });
        t.test('default maximum redirects of 5', function (t) {
            t.plan(2);
            return popsicle.request(REMOTE_URL + '/redirect/6')
                .catch(function (err) {
                t.equal(err.message, 'Exceeded maximum of 5 redirects');
                t.equal(err.code, 'EMAXREDIRECTS');
            });
        });
        t.test('change maximum redirects', function (t) {
            return popsicle.request({
                url: REMOTE_URL + '/redirect/6',
                transport: popsicle.createTransport({
                    maxRedirects: 10
                })
            })
                .then(function (res) {
                t.equal(res.body, 'welcome get');
                t.equal(res.status, 200);
                t.ok(/\/destination$/.test(res.url));
            });
        });
        t.test('support head redirects with 307', function (t) {
            return popsicle.head(REMOTE_URL + '/redirect/code/307')
                .then(function (res) {
                t.equal(res.body, '');
                t.equal(res.status, 200);
                t.ok(/\/destination$/.test(res.url));
            });
        });
        t.test('block 307/308 redirects by default', function (t) {
            return popsicle.post(REMOTE_URL + '/redirect/code/307')
                .then(function (res) {
                t.equal(res.status, 307);
                t.ok(/\/redirect\/code\/307$/.test(res.url));
            });
        });
        t.test('support user confirmed redirects with 308', function (t) {
            return popsicle.post({
                url: REMOTE_URL + '/redirect/code/308',
                transport: popsicle.createTransport({
                    confirmRedirect: function () {
                        return true;
                    }
                })
            })
                .then(function (res) {
                t.equal(res.body, 'welcome post');
                t.equal(res.status, 200);
                t.ok(/\/destination$/.test(res.url));
            });
        });
    });
}
if (!process.browser) {
    test('https reject unauthorized', function (t) {
        t.plan(1);
        return popsicle.get({
            url: "" + REMOTE_HTTPS_URL
        })
            .catch(function (err) {
            t.equal(err.code, 'EUNAVAILABLE');
        });
    });
    test('https ca option', function (t) {
        return popsicle.get({
            url: "" + REMOTE_HTTPS_URL,
            transport: popsicle.createTransport({
                ca: fs_1.readFileSync(path_1.join(__dirname, '../../scripts/support/ca-crt.pem'))
            })
        })
            .then(function (res) {
            t.equal(res.body, 'Success');
        });
    });
    test('https disable reject unauthorized', function (t) {
        return popsicle.get({
            url: "" + REMOTE_HTTPS_URL,
            transport: popsicle.createTransport({
                rejectUnauthorized: false
            })
        })
            .then(function (res) {
            t.equal(res.body, 'Success');
        });
    });
}
//# sourceMappingURL=index.js.map